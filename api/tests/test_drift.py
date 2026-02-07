"""Tests for Drift Monitor and API."""

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings
from app.services.drift.monitor import DriftMonitor


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def auth_headers() -> dict:
    token = jwt.encode(
        {"sub": "drift-user", "email": "drift@test.com", "role": "authenticated", "aud": "authenticated"},
        settings.supabase_anon_key or "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


# ─── DriftMonitor unit tests ───

class TestDriftMonitor:
    def test_data_expiry_critical(self):
        monitor = DriftMonitor()
        sources = [{"id": "s1", "name": "Old Data", "days_since_sync": 15, "expiry_days": 7, "freshness_status": "fresh"}]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 1
        assert events[0]["severity"] == "critical"
        assert events[0]["drift_type"] == "data_expiry"

    def test_data_expiry_warning(self):
        monitor = DriftMonitor()
        sources = [{"id": "s2", "name": "Aging Data", "days_since_sync": 6, "expiry_days": 7}]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 1
        assert events[0]["severity"] == "warning"

    def test_data_expiry_fresh(self):
        monitor = DriftMonitor()
        sources = [{"id": "s3", "name": "Fresh Data", "days_since_sync": 2, "expiry_days": 7}]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 0

    def test_causal_decay_critical(self):
        monitor = DriftMonitor()
        edges = [{"id": "e1", "edge_source": "A", "edge_target": "B", "original_weight": 0.8, "current_weight": 0.8, "decay_rate": 0.03, "days_since_validation": 100}]
        events = monitor.check_causal_decay(edges)
        assert len(events) == 1
        assert events[0]["severity"] == "critical"

    def test_causal_decay_healthy(self):
        monitor = DriftMonitor()
        edges = [{"id": "e2", "edge_source": "A", "edge_target": "B", "original_weight": 0.8, "current_weight": 0.8, "decay_rate": 0.03, "days_since_validation": 2}]
        events = monitor.check_causal_decay(edges)
        assert len(events) == 0

    def test_calibration_drift_detected(self):
        monitor = DriftMonitor()
        history = [{"brier_score": 0.2}] * 5 + [{"brier_score": 0.5}] * 5
        events = monitor.check_calibration_drift(history)
        assert len(events) == 1
        assert events[0]["drift_type"] == "calibration_drift"

    def test_calibration_drift_not_detected(self):
        monitor = DriftMonitor()
        history = [{"brier_score": 0.3}] * 5 + [{"brier_score": 0.32}] * 5
        events = monitor.check_calibration_drift(history)
        assert len(events) == 0

    def test_signal_divergence(self):
        monitor = DriftMonitor()
        snapshots = [{
            "market_id": "m1",
            "ai_signal": {"outcomes": [{"name": "Yes", "probability": 0.8}]},
            "crowd_signal": {"outcomes": [{"name": "Yes", "probability": 0.3}]},
            "reputation_signal": {"outcomes": [{"name": "Yes", "probability": 0.5}]},
        }]
        events = monitor.check_signal_divergence(snapshots)
        assert len(events) >= 1
        assert events[0]["drift_type"] == "signal_divergence"

    def test_full_scan(self):
        monitor = DriftMonitor()
        data_sources = [{"id": "s1", "name": "Old", "days_since_sync": 20, "expiry_days": 7}]
        events = monitor.run_full_scan(data_sources=data_sources)
        assert len(events) >= 1

    def test_auto_adapt(self):
        monitor = DriftMonitor()
        event = {"drift_type": "data_expiry"}
        action = monitor.auto_adapt(event)
        assert "refresh" in action.lower()


# ─── API tests ───

@pytest.mark.asyncio
async def test_drift_events(client: AsyncClient):
    resp = await client.get("/api/v1/drift/events")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_drift_stats(client: AsyncClient):
    resp = await client.get("/api/v1/drift/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "by_type" in data
    assert "by_severity" in data


@pytest.mark.asyncio
async def test_run_drift_scan(client: AsyncClient):
    resp = await client.post("/api/v1/drift/scan", headers=auth_headers())
    assert resp.status_code == 200
    assert "scanned" in resp.json()


@pytest.mark.asyncio
async def test_edge_weights(client: AsyncClient):
    resp = await client.get("/api/v1/drift/edge-weights")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "edge_source" in data[0]
