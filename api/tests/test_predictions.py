import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def auth_headers() -> dict:
    token = jwt.encode(
        {"sub": "test-user-id", "email": "test@test.com", "role": "authenticated", "aud": "authenticated"},
        settings.supabase_anon_key or "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_trending_no_auth(client: AsyncClient):
    response = await client.get("/api/v1/predictions/trending")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_create_prediction_no_auth(client: AsyncClient):
    response = await client.post("/api/v1/predictions/create", json={"query": "test"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_prediction_with_auth(client: AsyncClient):
    response = await client.post(
        "/api/v1/predictions/create",
        json={"query": "Will AI take over by 2030?"},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["status"] == "processing"


@pytest.mark.asyncio
async def test_create_prediction_invalid_input(client: AsyncClient):
    response = await client.post(
        "/api/v1/predictions/create",
        json={"query": "ab"},  # too short
        headers=auth_headers(),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_prediction_not_found(client: AsyncClient):
    response = await client.get("/api/v1/predictions/nonexistent-id")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_explore_empty(client: AsyncClient):
    response = await client.get("/api/v1/predictions/explore")
    assert response.status_code == 200
    data = response.json()
    assert "predictions" in data
    assert "total" in data
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_leaderboard(client: AsyncClient):
    response = await client.get("/api/v1/leaderboard")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "rank" in data[0]
    assert "reputation_score" in data[0]


@pytest.mark.asyncio
async def test_get_me(client: AsyncClient):
    response = await client.get("/api/v1/users/me", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "display_name" in data


@pytest.mark.asyncio
async def test_update_me(client: AsyncClient):
    response = await client.patch(
        "/api/v1/users/me",
        json={"display_name": "TestUser"},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "TestUser"


@pytest.mark.asyncio
async def test_get_my_predictions(client: AsyncClient):
    response = await client.get("/api/v1/users/me/predictions", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_update_prediction_visibility(client: AsyncClient):
    # Create a prediction first
    create_resp = await client.post(
        "/api/v1/predictions/create",
        json={"query": "Test prediction for visibility"},
        headers=auth_headers(),
    )
    pred_id = create_resp.json()["id"]
    # Update visibility
    response = await client.patch(
        f"/api/v1/predictions/{pred_id}",
        json={"is_public": True},
        headers=auth_headers(),
    )
    assert response.status_code == 200
    assert response.json()["is_public"] is True
