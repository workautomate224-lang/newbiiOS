"""Shared test fixtures for FutureOS API tests."""

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings


TEST_USER_ID = "test-user-001"
TEST_USER_EMAIL = "test@futureos.app"
TEST_USER_B_ID = "test-user-002"
TEST_USER_B_EMAIL = "userb@futureos.app"


def make_auth_headers(
    user_id: str = TEST_USER_ID,
    email: str = TEST_USER_EMAIL,
    role: str = "authenticated",
    secret: str | None = None,
    exp: int | None = None,
) -> dict:
    """Create valid JWT auth headers for testing."""
    payload: dict = {
        "sub": user_id,
        "email": email,
        "role": role,
        "aud": "authenticated",
    }
    if exp is not None:
        payload["exp"] = exp
    token = jwt.encode(
        payload,
        secret or settings.supabase_anon_key or "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def client():
    """Async test client for FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_headers():
    """Default auth headers for test user A."""
    return make_auth_headers()


@pytest.fixture
def auth_headers_b():
    """Auth headers for test user B (for RLS/isolation tests)."""
    return make_auth_headers(user_id=TEST_USER_B_ID, email=TEST_USER_B_EMAIL)
