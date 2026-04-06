import base64
import httpx
import json
import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Any, List
from app.config import settings
from app.services.mock_ai_service import analyze_photo_mock

logger = logging.getLogger(__name__)

def _load_defect_catalog() -> str:
    """Loads defect catalog for prompt injection."""
    try:
        # Paths for both Docker and Local development
        candidates = [
            Path("/coordination/defect_catalog.json"),
            Path(__file__).parent.parent.parent / "coordination" / "defect_catalog.json",
        ]
        catalog_path = next((p for p in candidates if p.exists()), None)
        if not catalog_path:
            return "Catalog not found."
        
        with open(catalog_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Compact format for prompt: code - name
            items = [f"- {item['code']}: {item['name']}" for item in data]
            return "\n".join(items)
    except Exception as e:
        logger.error(f"Failed to load defect catalog: {e}")
        return "Error loading catalog."

# System prompt base
SYSTEM_PROMPT_BASE = """
You are an expert construction technical supervision inspector (TechNadzor). Your task is to analyze photographs of construction sites and identify defects, violations, and non-compliance with building codes (SP, SNiP, GOST).

## Output Format
Return ONLY a valid JSON object following the schema below. Do not include any markdown formatting (like ```json), preamble, or postamble.

## Schema
{{
  "defects": [
    {{
      "defect_type": "STRING",
      "name": "STRING",
      "bbox": {{ "x": float, "y": float, "w": float, "h": float }},
      "criticality": "critical" | "significant" | "minor",
      "description": "STRING",
      "consequences": "STRING",
      "norm_references": ["STRING"],
      "recommendations": "STRING"
    }}
  ],
  "overall_status": "satisfactory" | "unsatisfactory" | "critical",
  "summary": "STRING"
}}

## Guidelines
- **bbox**: Use normalized coordinates (0.0 to 1.0). `x, y` is the top-left corner, `w, h` are width and height.
- **defect_type**: ОБЯЗАТЕЛЬНОЕ поле — всегда указывай тип дефекта (код) из справочника ниже. Никогда не оставляй пустым.
- **criticality**: 
  - `critical`: Immediate risk to structural integrity or safety.
  - `significant`: Functional issue that will lead to damage if not fixed.
  - `minor`: Aesthetic issue or early-stage defect.
- **Language**: All text fields must be in Russian.

## Available Defect Types (Code: Name)
{catalog}
"""

async def analyze_photo(image_bytes: bytes) -> Dict[str, Any]:
    """
    Analyzes a photo using OpenRouter Vision API.
    Retries up to 3 times on invalid JSON or API errors.
    """
    if settings.USE_MOCK_AI:
        return await analyze_photo_mock(image_bytes)

    api_key = settings.OPENROUTER_API_KEY
    model = settings.OPENROUTER_MODEL
    url = "https://openrouter.ai/api/v1/chat/completions"
    
    if not api_key:
        logger.error("OPENROUTER_API_KEY is not set")
        return {"defects": [], "overall_status": "error", "summary": "API Key missing"}

    catalog = _load_defect_catalog()
    system_prompt = SYSTEM_PROMPT_BASE.format(catalog=catalog)

    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-Title": "Digital Inspector"
    }
    
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    },
                    {
                        "type": "text",
                        "text": "Проанализируй фото и верни строго валидный JSON со списком дефектов."
                    }
                ]
            }
        ],
        "response_format": { "type": "json_object" }
    }
    
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                
                if 'choices' not in result or not result['choices']:
                    raise KeyError("Empty response from OpenRouter")
                    
                content = result['choices'][0]['message']['content']
                
                # Cleaning common LLM output issues
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:-3].strip()
                elif content.startswith("```"):
                    content = content[3:-3].strip()
                
                analysis_result = json.loads(content)
                
                # Basic validation
                if "defects" not in analysis_result:
                    analysis_result["defects"] = []
                
                return analysis_result
                
        except httpx.HTTPStatusError as e:
            logger.warning(f"Attempt {attempt + 1} for AI analysis failed: {str(e)} - Body: {e.response.text}")
            if attempt == 2:
                return {"defects": [], "overall_status": "error", "summary": f"Ошибка анализа: {str(e)} - {e.response.text}"}
            await asyncio.sleep(1 * (attempt + 1))
        except (json.JSONDecodeError, KeyError, Exception) as e:
            logger.warning(f"Attempt {attempt + 1} for AI analysis failed: {str(e)}")
            if attempt == 2:
                # If all retries failed, return an empty structure
                return {
                    "defects": [], 
                    "overall_status": "error", 
                    "summary": f"Ошибка анализа после 3 попыток: {str(e)}"
                }
            await asyncio.sleep(1 * (attempt + 1)) # Exponential-ish backoff
            
    return {"defects": [], "overall_status": "error", "summary": "Неизвестная ошибка анализа."}
