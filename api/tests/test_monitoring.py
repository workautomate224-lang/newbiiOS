"""Verify monitoring system — health check, cost tracking, uptime."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestHealthCheck:
    @pytest.mark.asyncio
    async def test_health_returns_200(self, client: AsyncClient):
        """Health endpoint returns 200."""
        resp = await client.get("/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_health_has_service_status(self, client: AsyncClient):
        """Health check includes service status."""
        resp = await client.get("/health")
        data = resp.json()
        assert data["status"] == "healthy"
        assert "services" in data
        assert "redis" in data["services"]

    @pytest.mark.asyncio
    async def test_health_has_version(self, client: AsyncClient):
        """Health check includes version."""
        resp = await client.get("/health")
        data = resp.json()
        assert "version" in data
        assert data["version"] == "1.5.0"

    @pytest.mark.asyncio
    async def test_health_has_uptime(self, client: AsyncClient):
        """Health check includes uptime."""
        resp = await client.get("/health")
        data = resp.json()
        assert "uptime_seconds" in data
        assert data["uptime_seconds"] >= 0


class TestCostDashboard:
    @pytest.mark.asyncio
    async def test_cost_endpoint_returns_200(self, client: AsyncClient):
        """Cost dashboard endpoint returns 200."""
        resp = await client.get("/api/v1/admin/costs")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_cost_endpoint_structure(self, client: AsyncClient):
        """Cost dashboard has today/this_week/all_time structure."""
        resp = await client.get("/api/v1/admin/costs")
        data = resp.json()
        assert "today" in data
        assert "this_week" in data
        assert "all_time" in data
        assert "calls" in data["today"]
        assert "by_model" in data["today"]


class TestCostTracking:
    def test_cost_log_is_list(self):
        """Cost log is accessible and is a list."""
        from app.core.llm import get_cost_log
        log = get_cost_log()
        assert isinstance(log, list)

    def test_uptime_positive(self):
        """Uptime is a positive number."""
        from app.core.llm import get_uptime_seconds
        uptime = get_uptime_seconds()
        assert uptime > 0
