import asyncio
from typing import Dict, Any

def get_mock_analysis_result() -> Dict[str, Any]:
    """
    Returns a deterministic but realistic mock analysis result 
    based on the first few defects in the catalog.
    """
    return {
        "defects": [
            {
                "code": "ROOF_FLAT_001",
                "name": "Вздутие кровельного покрытия",
                "bbox": {"x": 0.2, "y": 0.3, "w": 0.1, "h": 0.1},
                "criticality": "significant",
                "description": "Локальное вздутие кровельного ковра (пузырь).",
                "consequences": "Протечки, разрушение теплоизоляционного слоя.",
                "norm_references": ["СП 17.13330.2017 Кровли"],
                "recommendations": "Вскрытие вздутия конвертом, просушка и наложение заплатки."
            },
            {
                "code": "FACADE_001",
                "name": "Нарушение герметизации межпанельных швов",
                "bbox": {"x": 0.5, "y": 0.1, "w": 0.05, "h": 0.4},
                "criticality": "significant",
                "description": "Разгерметизация вертикального шва между панелями.",
                "consequences": "Промерзание, плесень внутри помещений.",
                "norm_references": ["СП 70.13330.2012 Несущие и ограждающие конструкции"],
                "recommendations": "Очистка шва и новая герметизация."
            }
        ],
        "overall_status": "unsatisfactory",
        "summary": "Обнаружены дефекты кровли и фасада, требующие планового ремонта."
    }

async def analyze_photo_mock(image_bytes: bytes) -> Dict[str, Any]:
    """
    Simulates AI photo analysis with a delay.
    """
    await asyncio.sleep(1.5) # Simulate processing time
    return get_mock_analysis_result()
