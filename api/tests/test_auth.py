import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def make_token(sub: str = "test-user-id", email: str = "test@test.com") -> str:
    payload = {"sub": sub, "email": email, "role": "authenticated", "aud": "authenticated"}
    return jwt.encode(payload, settings.supabase_anon_key or "test-secret", algorithm="HS256")


@pytest.mark.asyncio
async def test_protected_route_no_token(client: AsyncClient):
    response = await client.get("/api/v1/predictions/trending")
    # trending is public, so this should work without auth
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_auth_missing_token(client: AsyncClient):
    """Endpoints requiring auth should return 401 without token."""
    response = await client.post("/api/v1/predictions/create", json={"query": "test"})
    assert response.status_code == 401
