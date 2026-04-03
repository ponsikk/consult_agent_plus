import pytest
import io
import uuid
from httpx import AsyncClient
from app.models.analysis import Analysis

@pytest.mark.asyncio
async def test_create_analysis_success(client: AsyncClient, auth_headers):
    # Mock photo data
    photo1 = ("photo1.jpg", io.BytesIO(b"photo1"), "image/jpeg")
    photo2 = ("photo2.png", io.BytesIO(b"photo2"), "image/png")
    
    response = await client.post(
        "/api/v1/analyses",
        headers=auth_headers,
        data={
            "object_name": "Test Building",
            "shot_date": "2024-04-03"
        },
        files=[("photos", photo1), ("photos", photo2)]
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["object_name"] == "Test Building"
    assert data["status"] == "pending"
    assert len(data["photos"]) == 2

@pytest.mark.asyncio
async def test_create_analysis_no_photos(client: AsyncClient, auth_headers):
    response = await client.post(
        "/api/v1/analyses",
        headers=auth_headers,
        data={
            "object_name": "Test Building",
            "shot_date": "2024-04-03"
        }
    )
    assert response.status_code == 422
    assert "At least one photo is required" in response.json()["detail"]

@pytest.mark.asyncio
async def test_create_analysis_too_many_photos(client: AsyncClient, auth_headers):
    photos = [("photos", (f"p{i}.jpg", io.BytesIO(b"p"), "image/jpeg")) for i in range(11)]
    response = await client.post(
        "/api/v1/analyses",
        headers=auth_headers,
        data={
            "object_name": "Test Building",
            "shot_date": "2024-04-03"
        },
        files=photos
    )
    assert response.status_code == 422
    assert "Maximum 10 photos" in response.json()["detail"]

@pytest.mark.asyncio
async def test_create_analysis_invalid_date(client: AsyncClient, auth_headers):
    photo = ("p.jpg", io.BytesIO(b"p"), "image/jpeg")
    response = await client.post(
        "/api/v1/analyses",
        headers=auth_headers,
        data={
            "object_name": "Test Building",
            "shot_date": "invalid-date"
        },
        files=[("photos", photo)]
    )
    assert response.status_code == 422
    assert "Invalid shot_date format" in response.json()["detail"]

@pytest.mark.asyncio
async def test_list_analyses(client: AsyncClient, auth_headers, test_user):
    # The database is shared across tests in this session
    response = await client.get("/api/v1/analyses", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data

@pytest.mark.asyncio
async def test_get_analysis_status(client: AsyncClient, auth_headers, db_session, test_user):
    # Create an analysis record directly in DB for testing GET
    analysis_id = uuid.uuid4()
    import datetime
    from app.models.analysis import Analysis
    db_session.add(Analysis(
        id=analysis_id,
        user_id=test_user.id,
        object_name="Status Check",
        shot_date=datetime.date(2024, 4, 3),
        status="processing"
    ))
    await db_session.commit()
    
    response = await client.get(f"/api/v1/analyses/{analysis_id}/status", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "processing"

@pytest.mark.asyncio
async def test_get_analysis_404(client: AsyncClient, auth_headers):
    random_id = uuid.uuid4()
    response = await client.get(f"/api/v1/analyses/{random_id}", headers=auth_headers)
    assert response.status_code == 404
