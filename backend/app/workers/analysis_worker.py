import asyncio
import io
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional
from functools import partial

from arq.connections import RedisSettings
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.analysis import Analysis, AnalysisPhoto, Defect, DefectType
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

# Глобальный пул потоков для CPU-intensive задач
_executor = ThreadPoolExecutor(max_workers=4)

try:
    from app.services.ai_service import analyze_photo
except ImportError:
    async def analyze_photo(image_bytes: bytes) -> Dict[str, Any]:
        return {}

def _draw_bounding_boxes_sync(image_bytes: bytes, defects_data: List[Dict[str, Any]]) -> bytes:
    from PIL import Image, ImageDraw
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = img.size
    draw = ImageDraw.Draw(img)
    for defect in defects_data:
        bbox = defect.get("bbox", {})
        x0, y0 = bbox.get("x", 0.0) * width, bbox.get("y", 0.0) * height
        x1 = (bbox.get("x", 0.0) + bbox.get("w", 0.0)) * width
        y1 = (bbox.get("y", 0.0) + bbox.get("h", 0.0)) * height
        draw.rectangle([x0, y0, x1, y1], outline="red", width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def _set_analysis_status(analysis_id: str, status: str, error_message: str | None = None) -> None:
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(Analysis).where(Analysis.id == analysis_id))
        analysis = res.scalar_one_or_none()
        if analysis:
            analysis.status = status
            if error_message is not None:
                analysis.error_message = error_message
            if status == "done":
                analysis.completed_at = datetime.utcnow()
            await session.commit()


async def process_analysis(ctx: Dict[str, Any], analysis_id: str) -> None:
    logger.info(f"Starting analysis {analysis_id}")
    loop = asyncio.get_running_loop()

    try:
        # 1. Помечаем анализ как "processing"
        await _set_analysis_status(analysis_id, "processing")

        # 2. Кэшируем типы дефектов
        async with AsyncSessionLocal() as session:
            dt_res = await session.execute(select(DefectType))
            defect_types = {dt.code.lower().strip(): dt.id for dt in dt_res.scalars().all()}

        # 3. Загружаем ID и ключи фото — plain tuples, без ORM-объектов (не подвержены expiry)
        async with AsyncSessionLocal() as session:
            p_res = await session.execute(
                select(AnalysisPhoto.id, AnalysisPhoto.original_key)
                .where(AnalysisPhoto.analysis_id == analysis_id)
                .order_by(AnalysisPhoto.order_index)
            )
            photo_rows = p_res.all()

        # 4. Обрабатываем каждое фото в отдельной сессии
        for photo_id, original_key in photo_rows:
            try:
                image_bytes = await storage_service.download_file(original_key)
                ai_result = await analyze_photo(image_bytes)
                defects = ai_result.get("defects", []) if isinstance(ai_result, dict) else []

                async with AsyncSessionLocal() as session:
                    photo_obj = await session.get(AnalysisPhoto, photo_id)
                    if photo_obj is None:
                        logger.error(f"Photo {photo_id} not found in DB, skipping")
                        continue

                    if defects:
                        annotated_bytes = await loop.run_in_executor(
                            _executor,
                            partial(_draw_bounding_boxes_sync, image_bytes, defects)
                        )
                        annotated_key = f"photos/{analysis_id}/{photo_id}_annotated.jpg"
                        await storage_service.upload_file(annotated_key, annotated_bytes, "image/jpeg")
                        photo_obj.annotated_key = annotated_key

                    for d in defects:
                        d_code = str(d.get("defect_type", d.get("code", ""))).strip().lower()
                        session.add(Defect(
                            photo_id=photo_id,
                            defect_type_id=defect_types.get(d_code),
                            criticality=d.get("criticality", "minor"),
                            bbox_x=float(d.get("bbox", {}).get("x", 0.0)),
                            bbox_y=float(d.get("bbox", {}).get("y", 0.0)),
                            bbox_w=float(d.get("bbox", {}).get("w", 0.0)),
                            bbox_h=float(d.get("bbox", {}).get("h", 0.0)),
                            description=d.get("description", ""),
                            consequences=d.get("consequences", ""),
                            recommendations=d.get("recommendations", ""),
                            norm_references=d.get("norm_references", []),
                        ))
                    await session.commit()
                    logger.info(f"Photo {photo_id} processed: {len(defects)} defects")

            except Exception as e:
                logger.error(f"Error processing photo {photo_id}: {type(e).__name__}: {e}", exc_info=True)

        # 5. Финализация — ставим "done" (именно это ждёт фронт)
        await _set_analysis_status(analysis_id, "done")
        logger.info(f"Analysis {analysis_id} finished successfully")

    except Exception as e:
        logger.error(f"Fatal error in process_analysis {analysis_id}: {type(e).__name__}: {e}", exc_info=True)
        await _set_analysis_status(analysis_id, "error", f"{type(e).__name__}: {e}")
        raise  # пусть ARQ знает что задача упала


class WorkerSettings:
    functions = [process_analysis]
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
