import base64
import io
from datetime import datetime
from typing import Any

from arq.connections import RedisSettings
from PIL import Image, ImageDraw
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.analysis import Analysis, AnalysisPhoto, Defect, DefectType
from app.services.storage_service import storage_service

try:
    from app.services.ai_service import analyze_photo
except ImportError:
    async def analyze_photo(image_bytes: bytes):
        return []


async def process_analysis(ctx: dict[str, Any], analysis_id: str):
    try:
        async with AsyncSessionLocal() as session:
            # 1. Находим Analysis и устанавливаем status="processing"
            result = await session.execute(
                select(Analysis).where(Analysis.id == analysis_id)
            )
            analysis = result.scalar_one_or_none()
            if not analysis:
                return

            analysis.status = "processing"
            await session.commit()

            # 2. Обрабатываем каждое фото
            photos_result = await session.execute(
                select(AnalysisPhoto)
                .where(AnalysisPhoto.analysis_id == analysis_id)
                .order_by(AnalysisPhoto.order_index)
            )
            photos = photos_result.scalars().all()

            all_defects = []

            for photo in photos:
                # a. Скачиваем оригинальное фото из MinIO
                image_bytes = await storage_service.download_file(photo.original_key)

                # b. Вызываем AI-сервис
                defects_data = await analyze_photo(image_bytes)

                # c. Если есть дефекты — рисуем bounding boxes
                if defects_data:
                    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                    width, height = img.size
                    draw = ImageDraw.Draw(img)

                    for defect in defects_data:
                        bbox = defect.get("bbox", {})
                        x0 = bbox.get("x", 0) * width
                        y0 = bbox.get("y", 0) * height
                        x1 = (bbox.get("x", 0) + bbox.get("w", 0)) * width
                        y1 = (bbox.get("y", 0) + bbox.get("h", 0)) * height

                        criticality = defect.get("criticality", "minor")
                        if criticality == "critical":
                            color = (239, 68, 68)
                        elif criticality == "significant":
                            color = (249, 115, 22)
                        else:
                            color = (234, 179, 8)

                        draw.rectangle([x0, y0, x1, y1], outline=color, width=3)
                        draw.text((x0 + 4, y0 + 4), defect.get("defect_type_code", ""), fill=color)

                    # Сохраняем аннотированное фото в MinIO
                    annotated_buffer = io.BytesIO()
                    img.save(annotated_buffer, format="JPEG")
                    annotated_bytes = annotated_buffer.getvalue()

                    annotated_key = f"photos/{analysis_id}/{photo.id}_annotated.jpg"
                    await storage_service.upload_file(annotated_key, annotated_bytes, "image/jpeg")
                    photo.annotated_key = annotated_key
                    await session.commit()

                # d. Создаём Defect записи в БД
                for defect in defects_data:
                    bbox = defect.get("bbox", {})

                    # Находим DefectType по code
                    dt_result = await session.execute(
                        select(DefectType).where(DefectType.code == defect.get("defect_type_code"))
                    )
                    defect_type = dt_result.scalar_one_or_none()

                    db_defect = Defect(
                        photo_id=photo.id,
                        defect_type_id=defect_type.id if defect_type else None,
                        criticality=defect.get("criticality", "minor"),
                        bbox_x=bbox.get("x", 0.0),
                        bbox_y=bbox.get("y", 0.0),
                        bbox_w=bbox.get("w", 0.0),
                        bbox_h=bbox.get("h", 0.0),
                        description=defect.get("description", ""),
                        consequences=defect.get("consequences", ""),
                        norm_references=defect.get("norm_references", []),
                        recommendations=defect.get("recommendations", ""),
                    )
                    session.add(db_defect)
                    all_defects.append({"defect": defect, "photo_index": photo.order_index + 1})

                await session.commit()

            # 3. Перезагружаем фото с дефектами для отчётов
            photos_result = await session.execute(
                select(AnalysisPhoto)
                .where(AnalysisPhoto.analysis_id == analysis_id)
                .order_by(AnalysisPhoto.order_index)
            )
            photos = photos_result.scalars().all()

            defects_by_photo = {}
            for photo in photos:
                defects_result = await session.execute(
                    select(Defect).where(Defect.photo_id == photo.id)
                )
                defects_by_photo[photo.id] = defects_result.scalars().all()

            # Подсчёт статистики
            all_db_defects = [d for defects in defects_by_photo.values() for d in defects]
            total_defects = len(all_db_defects)
            critical_count = sum(1 for d in all_db_defects if d.criticality == "critical")
            significant_count = sum(1 for d in all_db_defects if d.criticality == "significant")
            minor_count = sum(1 for d in all_db_defects if d.criticality == "minor")

            # 4. Генерируем PDF через WeasyPrint
            photo_html_parts = []
            for photo in photos:
                photo_defects = defects_by_photo.get(photo.id, [])

                # Загружаем фото для встраивания в HTML
                img_key = photo.annotated_key if photo.annotated_key else photo.original_key
                try:
                    img_bytes = await storage_service.download_file(img_key)
                    img_b64 = base64.b64encode(img_bytes).decode("utf-8")
                    img_tag = f'<img src="data:image/jpeg;base64,{img_b64}" style="max-width:100%;height:auto;" />'
                except Exception:
                    img_tag = "<p>[Изображение недоступно]</p>"

                defect_rows = ""
                for d in photo_defects:
                    norm_refs = ", ".join(d.norm_references) if d.norm_references else ""
                    defect_rows += f"""
                    <tr>
                        <td>{d.criticality}</td>
                        <td>{d.description}</td>
                        <td>{norm_refs}</td>
                        <td>{d.recommendations}</td>
                    </tr>"""

                defect_table = ""
                if photo_defects:
                    defect_table = f"""
                    <table border="1" cellpadding="4" cellspacing="0" style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr>
                                <th>Критичность</th>
                                <th>Описание</th>
                                <th>Нормативы</th>
                                <th>Рекомендации</th>
                            </tr>
                        </thead>
                        <tbody>{defect_rows}</tbody>
                    </table>"""
                else:
                    defect_table = "<p>Дефекты не обнаружены</p>"

                photo_html_parts.append(f"""
                <div style="margin-bottom:30px;">
                    <h3>Фото {photo.order_index + 1}</h3>
                    {img_tag}
                    {defect_table}
                </div>""")

            photos_html = "".join(photo_html_parts)
            shot_date_str = analysis.shot_date.strftime("%d.%m.%Y") if analysis.shot_date else ""

            html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8"/>
    <title>Отчёт об инспекции</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        h1 {{ color: #333; }}
        h2 {{ color: #555; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ccc; padding: 6px; text-align: left; }}
        th {{ background-color: #f0f0f0; }}
        .summary {{ background: #f9f9f9; padding: 15px; border-radius: 4px; margin-top: 20px; }}
    </style>
</head>
<body>
    <h1>Отчёт об инспекции</h1>
    <h2>Объект: {analysis.object_name}</h2>
    <p>Дата съёмки: {shot_date_str}</p>

    {photos_html}

    <div class="summary">
        <h2>Итоговое резюме</h2>
        <p>Всего дефектов: <strong>{total_defects}</strong></p>
        <p>Критических: <strong>{critical_count}</strong></p>
        <p>Значительных: <strong>{significant_count}</strong></p>
        <p>Незначительных: <strong>{minor_count}</strong></p>
    </div>
</body>
</html>"""

            from weasyprint import HTML
            pdf_bytes = HTML(string=html_content).write_pdf()
            pdf_key = f"reports/{analysis_id}/report.pdf"
            await storage_service.upload_file(pdf_key, pdf_bytes, "application/pdf")

            # 5. Генерируем Excel через openpyxl
            import openpyxl
            wb = openpyxl.Workbook()

            # Лист 1: Сводная
            ws_summary = wb.active
            ws_summary.title = "Сводная"
            ws_summary.append(["Объект", analysis.object_name])
            ws_summary.append(["Дата", shot_date_str])
            ws_summary.append(["Всего дефектов", total_defects])
            ws_summary.append(["Критических", critical_count])
            ws_summary.append(["Значительных", significant_count])
            ws_summary.append(["Незначительных", minor_count])

            # Лист 2: Дефекты
            ws_defects = wb.create_sheet(title="Дефекты")
            ws_defects.append(["Фото №", "Тип дефекта", "Критичность", "Нормативы", "Рекомендации"])

            for photo in photos:
                photo_defects = defects_by_photo.get(photo.id, [])
                for d in photo_defects:
                    norm_refs = ", ".join(d.norm_references) if d.norm_references else ""
                    ws_defects.append([
                        photo.order_index + 1,
                        d.description,
                        d.criticality,
                        norm_refs,
                        d.recommendations,
                    ])

            excel_buffer = io.BytesIO()
            wb.save(excel_buffer)
            excel_bytes = excel_buffer.getvalue()
            excel_key = f"reports/{analysis_id}/report.xlsx"
            await storage_service.upload_file(
                excel_key,
                excel_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

            # 6. Обновляем Analysis: status="done"
            result = await session.execute(
                select(Analysis).where(Analysis.id == analysis_id)
            )
            analysis = result.scalar_one_or_none()
            if analysis:
                analysis.status = "done"
                analysis.completed_at = datetime.utcnow()
                await session.commit()

    except Exception as e:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Analysis).where(Analysis.id == analysis_id)
            )
            analysis = result.scalar_one_or_none()
            if analysis:
                analysis.status = "error"
                analysis.error_message = str(e)
                await session.commit()
        raise


async def startup(ctx):
    pass


async def shutdown(ctx):
    pass


class WorkerSettings:
    functions = [process_analysis]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
