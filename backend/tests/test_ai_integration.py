import pytest
from app.services.ai_service import analyze_photo
from app.config import settings
from io import BytesIO
from PIL import Image

def generate_sample_image():
    file_out = BytesIO()
    image = Image.new('RGB', (100, 100), color=(73, 109, 137))
    image.save(file_out, 'JPEG')
    return file_out.getvalue()

@pytest.mark.asyncio
async def test_analyze_photo_mock():
    # Force mock
    original_mock_setting = settings.USE_MOCK_AI
    settings.USE_MOCK_AI = True
    
    try:
        img = generate_sample_image()
        result = await analyze_photo(img)
        
        assert "defects" in result
        assert len(result["defects"]) > 0
        assert result["overall_status"] == "unsatisfactory"
        assert "ROOF_FLAT_001" in [d["defect_type"] for d in result["defects"]]
    finally:
        settings.USE_MOCK_AI = original_mock_setting

@pytest.mark.asyncio
async def test_analyze_photo_real_api_error_no_key():
    # Test that it handles missing API key gracefully when mock is OFF
    original_mock_setting = settings.USE_MOCK_AI
    original_api_key = settings.OPENROUTER_API_KEY
    
    settings.USE_MOCK_AI = False
    settings.OPENROUTER_API_KEY = ""
    
    try:
        img = generate_sample_image()
        result = await analyze_photo(img)
        
        assert result["overall_status"] == "error"
        assert "API Key missing" in result["summary"]
    finally:
        settings.USE_MOCK_AI = original_mock_setting
        settings.OPENROUTER_API_KEY = original_api_key
