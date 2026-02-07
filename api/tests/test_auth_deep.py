"""Deep authentication system tests."""

import time
import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings
from tests.conftest import make_auth_headers, TEST_USER_ID, TEST_USER_B_ID


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ─── JWT Validation ───

@pytest.mark.asyncio
async def test_jwt_valid_token_returns_user(client: AsyncClient):
    """Valid JWT returns 200 with user_id."""
    headers = make_auth_headers()
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == TEST_USER_ID


@pytest.mark.asyncio
async def test_jwt_expired_token_returns_401(client: AsyncClient):
    """Expired JWT returns 401."""
    # Token expired 1 hour ago
    expired_time = int(time.time()) - 3600
    headers = make_auth_headers(exp=expired_time)
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_malformed_token_returns_401(client: AsyncClient):
    """Malformed JWT returns 401."""
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": "Bearer this.is.not.a.valid.jwt"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_missing_token_returns_401(client: AsyncClient):
    """Missing Authorization header returns 401."""
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_wrong_secret_returns_401(client: AsyncClient):
    """JWT signed with wrong secret returns 401."""
    headers = make_auth_headers(secret="completely-wrong-secret-key")
    resp = await client.get("/api/v1/users/me", headers=headers)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_jwt_no_sub_returns_401(client: AsyncClient):
    """JWT without 'sub' claim returns 401."""
    token = jwt.encode(
        {"email": "no-sub@test.com", "role": "authenticated", "aud": "authenticated"},
        settings.supabase_anon_key or "test-secret",
        algorithm="HS256",
    )
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 401


# ─── Protected Endpoints ───

@pytest.mark.asyncio
async def test_protected_endpoints_without_auth(client: AsyncClient):
    """Protected GET endpoints return 401 without auth."""
    protected_gets = [
        "/api/v1/users/me",
        "/api/v1/users/me/predictions",
        "/api/v1/studio/projects",
        "/api/v1/exchange/portfolio",
    ]
    for path in protected_gets:
        resp = await client.get(path)
        assert resp.status_code == 401, f"GET {path} returned {resp.status_code}"

    # POST endpoints may return 401 or 422 (body validation before auth)
    resp = await client.post("/api/v1/drift/scan")
    assert resp.status_code == 401


# ─── RLS / Data Isolation ───

@pytest.mark.asyncio
async def test_rls_user_can_only_see_own_projects(client: AsyncClient):
    """User A cannot see User B's projects."""
    headers_a = make_auth_headers(user_id=TEST_USER_ID)
    headers_b = make_auth_headers(user_id=TEST_USER_B_ID)

    # User A creates a project
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "A's Project", "description": "Private"},
        headers=headers_a,
    )
    assert resp.status_code == 200
    project_id = resp.json()["id"]

    # User B should not see it in their list
    resp = await client.get("/api/v1/studio/projects", headers=headers_b)
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert project_id not in ids

    # User B should get 404 accessing it directly
    resp = await client.get(f"/api/v1/studio/projects/{project_id}", headers=headers_b)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rls_public_predictions_visible_to_all(client: AsyncClient):
    """Public predictions are visible in explore endpoint (no auth required)."""
    resp = await client.get("/api/v1/predictions/explore")
    assert resp.status_code == 200
    data = resp.json()
    assert "predictions" in data
    assert isinstance(data["predictions"], list)
