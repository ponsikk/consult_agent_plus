import asyncio
import base64
import io
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from functools import partial
from typing import Any, Dict, List, Optional

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
    async def analyze_photo(image_bytes: bytes) -> Dict[str, Any]:  # type: ignore[misc]
        return {}


# ---------------------------------------------------------------------------
# Синхронные CPU-intensive функции (выполняются в ThreadPoolExecutor)
# ---------------------------------------------------------------------------

def _draw_bounding_boxes_sync(image_bytes: bytes, defects_data: List[Dict[str, Any]]) -> bytes:
    """Рисует bounding boxes на изображении. Запускается в executor."""
    from PIL import Image, ImageDraw

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = img.size
    draw = ImageDraw.Draw(img)

    for defect in defects_data:
        bbox: Dict[str, float] = defect.get("bbox", {})
        x0 = bbox.get("x", 0.0) * width
        y0 = bbox.get("y", 0.0) * height
        x1 = (bbox.get("x", 0.0) + bbox.get("w", 0.0)) * width
        y1 = (bbox.get("y", 0.0) + bbox.get("h", 0.0)) * height

        criticality: str = defect.get("criticality", "minor")
        if criticality == "critical":
            color = (239, 68, 68)
        elif criticality == "significant":
            color = (249, 115, 22)
        else:
            color = (234, 179, 8)

        draw.rectangle([x0, y0, x1, y1], outline=color, width=3)
        label: str = defect.get("defect_type", defect.get("code", defect.get("defect_type_code", "")))
        if label:
            draw.text((x0 + 4, y0 + 4), label, fill=color)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _generate_pdf_sync(
    object_name: str,
    shot_date_str: str,
    photo_parts: List[Dict[str, Any]],
    total: int,
    critical: int,
    significant: int,
    minor: int,
) -> bytes:
    """Генерирует PDF через WeasyPrint. Запускается в executor."""
    from weasyprint import HTML

    photo_html_parts = []
    for p in photo_parts:
        img_tag = (
            f'<img src="data:image/jpeg;base64,{p["img_b64"]}" style="max-width:100%;height:auto;" />'
            if p.get("img_b64")
            else "<p>[Изображение недоступно]</p>"
        )
        defect_rows = "".join(
            f"<tr><td>{d['criticality']}</td><td>{d['description']}</td>"
            f"<td>{d['norm_refs']}</td><td>{d['recommendations']}</td></tr>"
            for d in p["defects"]
        )
        defect_table = (
            f"""<table border="1" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse;">
            <thead><tr><th>Критичность</th><th>Описание</th><th>Нормативы</th><th>Рекомендации</th></tr></thead>
            <tbody>{defect_rows}</tbody></table>"""
            if p["defects"]
            else "<p>Дефекты не обнаружены</p>"
        )
        photo_html_parts.append(
            f'<div style="margin-bottom:30px;"><h3>Фото {p["order_index"] + 1}</h3>'
            f"{img_tag}{defect_table}</div>"
        )

    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Отчёт об инспекции</title>
<style>body{{font-family:Arial,sans-serif;margin:20px;}}h1{{color:#333;}}h2{{color:#555;}}
table{{border-collapse:collapse;width:100%;}}th,td{{border:1px solid #ccc;padding:6px;text-align:left;}}
th{{background-color:#f0f0f0;}}.summary{{background:#f9f9f9;padding:15px;border-radius:4px;margin-top:20px;}}</style>
</head><body>
<h1>Отчёт об инспекции</h1>
<h2>Объект: {object_name}</h2>
<p>Дата съёмки: {shot_date_str}</p>
{"".join(photo_html_parts)}
<div class="summary"><h2>Итоговое резюме</h2>
<p>Всего дефектов: <strong>{total}</strong></p>
<p>Критических: <strong>{critical}</strong></p>
<p>Значительных: <strong>{significant}</strong></p>
<p>Незначительных: <strong>{minor}</strong></p>
</div></body></html>"""

    result: bytes = HTML(string=html_content).write_pdf()
    return result


def _generate_excel_sync(
    object_name: str,
    shot_date_str: str,
    photo_parts: List[Dict[str, Any]],
    total: int,
    critical: int,
    significant: int,
    minor: int,
) -> bytes:
    """Генерирует Excel через openpyxl. Запускается в executor."""
    import openpyxl

    wb = openpyxl.Workbook()
    ws1 = wb.active
    ws1.title = "Сводная"
    ws1.append(["Объект", object_name])
    ws1.append(["Дата", shot_date_str])
    ws1.append(["Всего дефектов", total])
    ws1.append(["Критических", critical])
    ws1.append(["Значительных", significant])
    ws1.append(["Незначительных", minor])

    ws2 = wb.create_sheet(title="Дефекты")
    ws2.append(["Фото №", "Тип дефекта", "Критичность", "Нормативы", "Рекомендации"])
    for p in photo_parts:
        for d in p["defects"]:
            ws2.append([
                p["order_index"] + 1,
                d["description"],
                d["criticality"],
                d["norm_refs"],
                d["recommendations"],
            ])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# ARQ task
# ---------------------------------------------------------------------------

async def process_analysis(ctx: Dict[str, Any], analysis_id: str) -> None:
    """ARQ task: обрабатывает анализ — AI, bounding boxes, PDF, Excel."""
    loop = asyncio.get_event_loop()
    logger.info(f"Starting analysis {analysis_id}")

    try:
        async with AsyncSessionLocal() as session:
            # 1. Статус → processing
            result = await session.execute(
                select(Analysis).where(Analysis.id == analysis_id)
            )
            analysis: Optional[Analysis] = result.scalar_one_or_none()
            if not analysis:
                logger.error(f"Analysis {analysis_id} not found")
                return

            analysis.status = "processing"
            await session.commit()

            # 2. Загружаем фото
            photos_result = await session.execute(
                select(AnalysisPhoto)
                .where(AnalysisPhoto.analysis_id == analysis_id)
                .order_by(AnalysisPhoto.order_index)
            )
            photos = photos_result.scalars().all()

            import asyncio
            for idx, photo in enumerate(photos):
                if idx > 0:
                    logger.info("Sleeping for 5s to avoid rate limit...")
                    await asyncio.sleep(5)
                # a. Скачиваем из MinIO
                image_bytes = await storage_service.download_file(photo.original_key)

                # b. AI анализ (async I/O — не блокирует)
                ai_result = await analyze_photo(image_bytes)
                defects_data: List[Dict[str, Any]] = (
                    ai_result.get("defects", []) if isinstance(ai_result, dict) else []
                )

                # c. Bounding boxes — CPU → executor
                if defects_data:
                    annotated_bytes = await loop.run_in_executor(
                        _executor,
                        partial(_draw_bounding_boxes_sync, image_bytes, defects_data),
                    )
                    annotated_key = f"photos/{analysis_id}/{photo.id}_annotated.jpg"
                    await storage_service.upload_file(annotated_key, annotated_bytes, "image/jpeg")
                    photo.annotated_key = annotated_key
                    await session.commit()

                # d. Сохраняем дефекты в БД
                for defect in defects_data:
                    bbox: Dict[str, float] = defect.get("bbox", {})
                    defect_code: str = defect.get("defect_type", defect.get("code", defect.get("defect_type_code", "")))
                    dt_result = await session.execute(
                        select(DefectType).where(DefectType.code == defect_code)
                    )
                    defect_type: Optional[DefectType] = dt_result.scalar_one_or_none()

                    session.add(Defect(
                        photo_id=photo.id,
                        defect_type_id=defect_type.id if defect_type else None,
                        criticality=defect.get("criticality", "minor"),
                        bbox_x=float(bbox.get("x", 0.0)),
                        bbox_y=float(bbox.get("y", 0.0)),
                        bbox_w=float(bbox.get("w", 0.0)),
                        bbox_h=float(bbox.get("h", 0.0)),
                        description=defect.get("description", ""),
                        consequences=defect.get("consequences", ""),
                        norm_references=defect.get("norm_references", []),
                        recommendations=defect.get("recommendations", ""),
                    ))

                await session.commit()

            # 3. Перезагружаем для отчётов
            photos_result = await session.execute(
                select(AnalysisPhoto)
                .where(AnalysisPhoto.analysis_id == analysis_id)
                .order_by(AnalysisPhoto.order_index)
            )
            photos = photos_result.scalars().all()

            defects_by_photo: Dict[Any, Any] = {}
            for photo in photos:
                dr = await session.execute(select(Defect).where(Defect.photo_id == photo.id))
                defects_by_photo[photo.id] = dr.scalars().all()

            all_db_defects: List[Defect] = [d for dl in defects_by_photo.values() for d in dl]
            total = len(all_db_defects)
            critical = sum(1 for d in all_db_defects if d.criticality == "critical")
            significant = sum(1 for d in all_db_defects if d.criticality == "significant")
            minor = sum(1 for d in all_db_defects if d.criticality == "minor")
            shot_date_str = analysis.shot_date.strftime("%d.%m.%Y") if analysis.shot_date else ""

            # Собираем данные для отчётов (загружаем изображения async)
            photo_parts: List[Dict[str, Any]] = []
            for photo in photos:
                img_key: str = photo.annotated_key or photo.original_key
                try:
                    img_bytes = await storage_service.download_file(img_key)
                    img_b64: str = base64.b64encode(img_bytes).decode("utf-8")
                except Exception:
                    img_b64 = ""

                defects_list: List[Dict[str, str]] = [
                    {
                        "criticality": {"critical": "Критический", "significant": "Значительный", "minor": "Незначительный"}.get(d.criticality, d.criticality),
                        "description": d.description,
                        "norm_refs": ", ".join(d.norm_references) if d.norm_references else "",
                        "recommendations": d.recommendations,
                    }
                    for d in defects_by_photo.get(photo.id, [])
                ]
                photo_parts.append({
                    "order_index": photo.order_index,
                    "img_b64": img_b64,
                    "defects": defects_list,
                })

            # 4. PDF — CPU → executor
            pdf_bytes: bytes = await loop.run_in_executor(
                _executor,
                partial(
                    _generate_pdf_sync,
                    analysis.object_name,
                    shot_date_str,
                    photo_parts,
                    total,
                    critical,
                    significant,
                    minor,
                ),
            )
            await storage_service.upload_file(
                f"reports/{analysis_id}/report.pdf", pdf_bytes, "application/pdf"
            )

            # 5. Excel — CPU → executor
            excel_bytes: bytes = await loop.run_in_executor(
                _executor,
                partial(
                    _generate_excel_sync,
                    analysis.object_name,
                    shot_date_str,
                    photo_parts,
                    total,
                    critical,
                    significant,
                    minor,
                ),
            )
            await storage_service.upload_file(
                f"reports/{analysis_id}/report.xlsx",
                excel_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

            # 6. Статус → done
            result = await session.execute(
                select(Analysis).where(Analysis.id == analysis_id)
            )
            analysis = result.scalar_one_or_none()
            if analysis:
                analysis.status = "done"
                analysis.completed_at = datetime.utcnow()
                await session.commit()

            logger.info(f"Analysis {analysis_id} completed successfully")

    except Exception as e:
        logger.error(f"Analysis {analysis_id} failed: {e}", exc_info=True)
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(Analysis).where(Analysis.id == analysis_id)
                )
                analysis = result.scalar_one_or_none()
                if analysis:
                    analysis.status = "error"
                    analysis.error_message = str(e)
                    await session.commit()
        except Exception:
            pass
        raise


async def startup(ctx: Dict[str, Any]) -> None:
    logger.info("ARQ worker started")


async def shutdown(ctx: Dict[str, Any]) -> None:
    _executor.shutdown(wait=False)
    logger.info("ARQ worker shutting down")


class WorkerSettings:
    functions = [process_analysis]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
