"""Generates PDF inspection reports from analysis data using WeasyPrint."""
import asyncio
import base64
import io
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict, Optional

_executor = ThreadPoolExecutor(max_workers=2)

CRITICALITY_RU = {
    "critical": "Критический",
    "significant": "Значительный",
    "minor": "Незначительный",
}

CRITICALITY_COLOR = {
    "critical": "#dc2626",
    "significant": "#d97706",
    "minor": "#2563eb",
}


def _process_image(image_bytes: bytes, max_width: int = 1200) -> str:
    """Resize image, convert to JPEG, return base64 string."""
    from PIL import Image
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _build_html(data: Dict[str, Any]) -> str:
    analysis = data["analysis"]
    user = data["user"]
    photos = data["photos"]

    total_defects = sum(len(p["defects"]) for p in photos)
    critical = sum(1 for p in photos for d in p["defects"] if d["criticality"] == "critical")
    significant = sum(1 for p in photos for d in p["defects"] if d["criticality"] == "significant")
    minor = sum(1 for p in photos for d in p["defects"] if d["criticality"] == "minor")

    # Предобрабатываем изображения один раз (PIL в executor'е)
    photo_b64: dict[int, str] = {}
    for photo in photos:
        img_bytes: Optional[bytes] = photo.get("image_bytes")
        if img_bytes:
            photo_b64[photo["index"]] = _process_image(img_bytes)

    # ── Шапка + сводка ──────────────────────────────────────────────────────
    header_html = f"""
  <h1>АКТ ТЕХНИЧЕСКОГО НАДЗОРА</h1>
  <div class="subtitle">Результаты AI-анализа строительного объекта</div>

  <h2>Общие сведения</h2>
  <div class="meta-grid">
    <div class="meta-item"><b>Объект:</b> {analysis['object_name']}</div>
    <div class="meta-item"><b>Инспектор:</b> {user['full_name']}</div>
    <div class="meta-item"><b>Дата съёмки:</b> {analysis['shot_date']}</div>
    <div class="meta-item"><b>Email:</b> {user['email']}</div>
    <div class="meta-item"><b>Дата анализа:</b> {analysis['created_at']}</div>
    <div class="meta-item"><b>Фотографий:</b> {len(photos)} шт.</div>
  </div>

  <h2>Сводка дефектов</h2>
  <div class="stats">
    <div class="stat-box stat-total">
      <div class="num">{total_defects}</div><div class="lbl">Всего дефектов</div>
    </div>
    <div class="stat-box stat-critical">
      <div class="num">{critical}</div><div class="lbl">Критических</div>
    </div>
    <div class="stat-box stat-significant">
      <div class="num">{significant}</div><div class="lbl">Значительных</div>
    </div>
    <div class="stat-box stat-minor">
      <div class="num">{minor}</div><div class="lbl">Незначительных</div>
    </div>
  </div>
"""

    # ── Секция на каждое фото: таблица всех нарушений + фото под ней ──────────
    defect_cards = ""
    global_counter = 1
    for photo in photos:
        idx = photo["index"]
        defects = photo["defects"]
        b64 = photo_b64.get(idx)

        if b64:
            img_html = f'<img src="data:image/jpeg;base64,{b64}" class="defect-photo" />'
        else:
            img_html = '<div class="photo-placeholder">Изображение недоступно</div>'

        if defects:
            rows = ""
            for d in defects:
                color = CRITICALITY_COLOR.get(d["criticality"], "#000")
                crit_ru = CRITICALITY_RU.get(d["criticality"], d["criticality"])
                norms = ", ".join(d.get("norm_references") or []) or "—"
                rows += f"""
        <tr>
          <td class="center">{global_counter}</td>
          <td><b>{d.get('type_code', '—')}</b><br><small style="color:#555">{d.get('type_name', '—')}</small></td>
          <td style="color:{color};font-weight:bold">{crit_ru}</td>
          <td>{d.get('description', '—')}</td>
          <td>{d.get('consequences', '—')}</td>
          <td>{d.get('recommendations', '—')}</td>
          <td><small>{norms}</small></td>
        </tr>"""
                global_counter += 1
            table_html = f"""
    <table class="defect-table">
      <thead>
        <tr>
          <th style="width:3%">№</th>
          <th style="width:13%">Тип дефекта</th>
          <th style="width:10%">Критичность</th>
          <th style="width:20%">Описание</th>
          <th style="width:18%">Последствия</th>
          <th style="width:22%">Рекомендации</th>
          <th style="width:14%">Нормативы</th>
        </tr>
      </thead>
      <tbody>{rows}
      </tbody>
    </table>"""
        else:
            table_html = '<p class="no-defects">Дефекты на данной фотографии не обнаружены</p>'

        defect_cards += f"""
  <div class="defect-card">
    <div class="defect-header">
      <span class="defect-num">Фото {idx + 1}</span>
      <span class="defect-count">{len(defects)} нарушений</span>
    </div>
    {table_html}
    {img_html}
  </div>"""

    if not defect_cards:
        defect_cards = '<p class="no-defects">Дефекты не обнаружены</p>'

    footer_html = f"""
  <div class="footer">
    <span>Цифровой Инспектор — автоматизированный технический надзор</span>
    <span>Сформировано: {datetime.utcnow().strftime('%d.%m.%Y %H:%M')} UTC</span>
  </div>"""

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: "DejaVu Sans", Arial, sans-serif; font-size: 9.5pt; color: #1a1a1a; }}
  .page {{ padding: 15mm 15mm 10mm; }}

  h1 {{ font-size: 15pt; font-weight: bold; text-align: center; margin-bottom: 4px; }}
  h2 {{ font-size: 11pt; font-weight: bold; margin: 14px 0 6px; border-bottom: 2px solid #1e3a5f;
        padding-bottom: 3px; color: #1e3a5f; }}
  .subtitle {{ text-align: center; color: #555; font-size: 9.5pt; margin-bottom: 18px; }}

  .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 14px; }}
  .meta-item {{ font-size: 9pt; }}
  .meta-item b {{ display: inline-block; min-width: 110px; color: #555; font-weight: normal; }}

  .stats {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 4px; }}
  .stat-box {{ border-radius: 6px; padding: 8px 10px; text-align: center; }}
  .stat-box .num {{ font-size: 20pt; font-weight: bold; line-height: 1; }}
  .stat-box .lbl {{ font-size: 7.5pt; color: #555; margin-top: 2px; }}
  .stat-total {{ background: #f1f5f9; border: 1px solid #cbd5e1; }}
  .stat-critical {{ background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; }}
  .stat-significant {{ background: #fffbeb; border: 1px solid #fcd34d; color: #d97706; }}
  .stat-minor {{ background: #eff6ff; border: 1px solid #93c5fd; color: #2563eb; }}

  /* Карточка нарушения */
  .defect-card {{ page-break-inside: avoid; margin-top: 20px; }}
  .defect-card:first-of-type {{ margin-top: 8px; }}

  .defect-header {{ display: flex; align-items: center; gap: 12px;
                    background: #f8fafc; border: 1px solid #e2e8f0;
                    border-radius: 6px 6px 0 0; padding: 7px 12px; }}
  .defect-num {{ font-size: 10.5pt; font-weight: bold; color: #1e3a5f; }}
  .defect-count {{ font-size: 8.5pt; color: #64748b; }}

  .defect-table {{ width: 100%; border-collapse: collapse; font-size: 8.5pt; }}
  .defect-table th {{ background: #1e3a5f; color: white; padding: 5px 6px; text-align: left; }}
  .defect-table td {{ padding: 5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top;
                      border-left: 1px solid #e2e8f0; }}
  .defect-table td:first-child {{ border-left: none; }}

  .defect-photo {{ width: 100%; max-height: 380px; object-fit: contain;
                   border: 1px solid #d1d5db; border-top: none;
                   border-radius: 0 0 6px 6px; display: block; }}
  .photo-placeholder {{ width: 100%; height: 80px; background: #f3f4f6; border: 1px dashed #9ca3af;
                         border-radius: 0 0 6px 6px; display: flex; align-items: center;
                         justify-content: center; color: #6b7280; font-size: 8.5pt; }}
  .no-defects {{ color: #16a34a; font-size: 9.5pt; padding: 16px 0; font-style: italic; }}

  .footer {{ margin-top: 24px; border-top: 1px solid #ccc; padding-top: 8px;
             font-size: 8pt; color: #777; display: flex; justify-content: space-between; }}

  @page {{ margin: 0; size: A4 landscape; }}
</style>
</head>
<body>
<div class="page">
{header_html}
  <h2>Перечень нарушений</h2>
{defect_cards}
{footer_html}
</div>
</body>
</html>"""


def _render_pdf_sync(html: str) -> bytes:
    from weasyprint import HTML
    return HTML(string=html).write_pdf()


async def generate_pdf(data: Dict[str, Any]) -> bytes:
    html = _build_html(data)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, _render_pdf_sync, html)
