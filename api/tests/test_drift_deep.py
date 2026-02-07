"""Deep Drift monitoring system tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.drift.monitor import DriftMonitor
from tests.conftest import make_auth_headers


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def auth():
    return make_auth_headers()


# ═══════ Data Expiry ═══════

class TestDataExpiryDeep:
    def test_data_expiry_critical(self):
        """Days since sync > expiry_days → critical event."""
        monitor = DriftMonitor()
        sources = [{"id": "s1", "name": "Old", "days_since_sync": 20, "expiry_days": 7}]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 1
        assert events[0]["severity"] == "critical"
        assert events[0]["details"]["new_status"] == "expired"

    def test_data_expiry_stale_warning(self):
        """Days since sync > 70% of expiry → stale warning."""
        monitor = DriftMonitor()
        sources = [{"id": "s2", "name": "Aging", "days_since_sync": 6, "expiry_days": 7}]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 1
        assert events[0]["severity"] == "warning"
        assert events[0]["details"]["new_status"] == "stale"

    def test_data_expiry_fresh(self):
        """Fresh data produces no events."""
        monitor = DriftMonitor()
        sources = [{"id": "s3", "name": "Fresh", "days_since_sync": 2, "expiry_days": 7}]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 0

    def test_data_expiry_multiple_sources(self):
        """Multiple sources checked independently."""
        monitor = DriftMonitor()
        sources = [
            {"id": "s1", "name": "Critical", "days_since_sync": 30, "expiry_days": 7},
            {"id": "s2", "name": "Fresh", "days_since_sync": 1, "expiry_days": 7},
            {"id": "s3", "name": "Stale", "days_since_sync": 6, "expiry_days": 7},
        ]
        events = monitor.check_data_expiry(sources)
        assert len(events) == 2  # critical + warning


# ═══════ Causal Decay ═══════

class TestCausalDecayDeep:
    def test_causal_decay_30_days(self):
        """After 30 days with 3% decay rate, weight should be reduced."""
        monitor = DriftMonitor()
        edges = [{"id": "e1", "edge_source": "A", "edge_target": "B",
                  "original_weight": 1.0, "current_weight": 1.0,
                  "decay_rate": 0.03, "days_since_validation": 30}]
        events = monitor.check_causal_decay(edges)
        # (1-0.03)^30 = 0.97^30 ≈ 0.401 — this is above 0.3, so it should be updated but not flagged
        # Actually 0.401 > 0.3, so no event (just update weight)
        # Wait — ratio = 0.401 > 0.3 so no event, weight just updated
        assert edges[0]["current_weight"] < 1.0

    def test_causal_decay_critical_threshold(self):
        """Decay below 0.1 ratio triggers critical."""
        monitor = DriftMonitor()
        edges = [{"id": "e2", "edge_source": "X", "edge_target": "Y",
                  "original_weight": 0.8, "current_weight": 0.8,
                  "decay_rate": 0.05, "days_since_validation": 100}]
        events = monitor.check_causal_decay(edges)
        # (1-0.05)^100 = 0.95^100 ≈ 0.0059 → ratio < 0.1 → critical
        assert len(events) == 1
        assert events[0]["severity"] == "critical"

    def test_causal_decay_warning_threshold(self):
        """Decay between 0.1 and 0.3 triggers warning."""
        monitor = DriftMonitor()
        edges = [{"id": "e3", "edge_source": "A", "edge_target": "B",
                  "original_weight": 1.0, "current_weight": 1.0,
                  "decay_rate": 0.03, "days_since_validation": 50}]
        events = monitor.check_causal_decay(edges)
        # (1-0.03)^50 = 0.97^50 ≈ 0.218 — between 0.1 and 0.3 → warning
        assert len(events) == 1
        assert events[0]["severity"] == "warning"

    def test_causal_decay_healthy(self):
        """Short time since validation = no event."""
        monitor = DriftMonitor()
        edges = [{"id": "e4", "edge_source": "A", "edge_target": "B",
                  "original_weight": 0.8, "current_weight": 0.8,
                  "decay_rate": 0.03, "days_since_validation": 2}]
        events = monitor.check_causal_decay(edges)
        assert len(events) == 0


# ═══════ Calibration Drift ═══════

class TestCalibrationDriftDeep:
    def test_calibration_worsening(self):
        """Worsening Brier Score trend triggers warning."""
        monitor = DriftMonitor()
        history = [{"brier_score": 0.2}] * 5 + [{"brier_score": 0.5}] * 5
        events = monitor.check_calibration_drift(history)
        assert len(events) == 1
        assert events[0]["drift_type"] == "calibration_drift"
        assert events[0]["details"]["degradation"] > 0.1

    def test_calibration_stable(self):
        """Stable Brier Score trend produces no events."""
        monitor = DriftMonitor()
        history = [{"brier_score": 0.3}] * 5 + [{"brier_score": 0.32}] * 5
        events = monitor.check_calibration_drift(history)
        assert len(events) == 0

    def test_calibration_insufficient_data(self):
        """Less than 10 records → no analysis."""
        monitor = DriftMonitor()
        history = [{"brier_score": 0.2}] * 5
        events = monitor.check_calibration_drift(history)
        assert len(events) == 0

    def test_calibration_improving(self):
        """Improving Brier Score (lower is better) → no event."""
        monitor = DriftMonitor()
        history = [{"brier_score": 0.5}] * 5 + [{"brier_score": 0.2}] * 5
        events = monitor.check_calibration_drift(history)
        assert len(events) == 0


# ═══════ Signal Divergence ═══════

class TestSignalDivergenceDeep:
    def test_signal_divergence_detected(self):
        """Large AI-Crowd divergence triggers event."""
        monitor = DriftMonitor()
        snapshots = [{
            "market_id": "m1",
            "ai_signal": {"outcomes": [{"name": "Y", "probability": 0.9}]},
            "crowd_signal": {"outcomes": [{"name": "Y", "probability": 0.3}]},
            "reputation_signal": {"outcomes": [{"name": "Y", "probability": 0.5}]},
        }]
        events = monitor.check_signal_divergence(snapshots)
        assert len(events) >= 1
        assert events[0]["drift_type"] == "signal_divergence"

    def test_signal_divergence_critical(self):
        """>40% divergence → critical severity."""
        monitor = DriftMonitor()
        snapshots = [{
            "market_id": "m2",
            "ai_signal": {"outcomes": [{"name": "Y", "probability": 0.95}]},
            "crowd_signal": {"outcomes": [{"name": "Y", "probability": 0.1}]},
            "reputation_signal": {"outcomes": [{"name": "Y", "probability": 0.5}]},
        }]
        events = monitor.check_signal_divergence(snapshots)
        assert events[0]["severity"] == "critical"

    def test_signal_divergence_aligned(self):
        """Aligned signals → no event."""
        monitor = DriftMonitor()
        snapshots = [{
            "market_id": "m3",
            "ai_signal": {"outcomes": [{"name": "Y", "probability": 0.6}]},
            "crowd_signal": {"outcomes": [{"name": "Y", "probability": 0.55}]},
            "reputation_signal": {"outcomes": [{"name": "Y", "probability": 0.58}]},
        }]
        events = monitor.check_signal_divergence(snapshots)
        assert len(events) == 0


# ═══════ Auto Adaptation ═══════

class TestAutoAdaptDeep:
    def test_auto_adapt_data_expiry(self):
        """Data expiry → refresh action."""
        monitor = DriftMonitor()
        action = monitor.auto_adapt({"drift_type": "data_expiry"})
        assert "refresh" in action.lower()

    def test_auto_adapt_causal_decay(self):
        """Causal decay → weight reduction action."""
        monitor = DriftMonitor()
        action = monitor.auto_adapt({"drift_type": "causal_decay"})
        assert "weight" in action.lower() or "reduced" in action.lower() or "edge" in action.lower()

    def test_auto_adapt_calibration_drift(self):
        """Calibration drift → recalibration action."""
        monitor = DriftMonitor()
        action = monitor.auto_adapt({"drift_type": "calibration_drift"})
        assert "platt" in action.lower() or "calibr" in action.lower()

    def test_auto_adapt_signal_divergence(self):
        """Signal divergence → review action."""
        monitor = DriftMonitor()
        action = monitor.auto_adapt({"drift_type": "signal_divergence"})
        assert "review" in action.lower() or "anomaly" in action.lower()

    def test_auto_adapt_unknown(self):
        """Unknown drift type → no action."""
        monitor = DriftMonitor()
        action = monitor.auto_adapt({"drift_type": "unknown_type"})
        assert "no action" in action.lower()


# ═══════ Full Scan ═══════

class TestFullScanDeep:
    def test_full_scan_all_types(self):
        """Full scan checks all drift types."""
        monitor = DriftMonitor()
        events = monitor.run_full_scan(
            data_sources=[{"id": "s1", "name": "Old", "days_since_sync": 20, "expiry_days": 7}],
            edge_weights=[{"id": "e1", "edge_source": "A", "edge_target": "B",
                          "original_weight": 0.8, "current_weight": 0.8,
                          "decay_rate": 0.05, "days_since_validation": 100}],
            calibration_history=[{"brier_score": 0.2}] * 5 + [{"brier_score": 0.5}] * 5,
            signal_snapshots=[{
                "market_id": "m1",
                "ai_signal": {"outcomes": [{"name": "Y", "probability": 0.9}]},
                "crowd_signal": {"outcomes": [{"name": "Y", "probability": 0.3}]},
                "reputation_signal": {"outcomes": [{"name": "Y", "probability": 0.5}]},
            }],
        )
        drift_types = {e["drift_type"] for e in events}
        assert "data_expiry" in drift_types
        assert "causal_decay" in drift_types
        assert "calibration_drift" in drift_types
        assert "signal_divergence" in drift_types

    def test_full_scan_stores_events(self):
        """Full scan appends events to monitor's event list."""
        monitor = DriftMonitor()
        assert len(monitor.events) == 0
        monitor.run_full_scan(
            data_sources=[{"id": "s1", "name": "X", "days_since_sync": 20, "expiry_days": 7}],
        )
        assert len(monitor.events) >= 1

    def test_full_scan_idempotent_events_structure(self):
        """Each event has required fields."""
        monitor = DriftMonitor()
        events = monitor.run_full_scan(
            data_sources=[{"id": "s1", "name": "X", "days_since_sync": 20, "expiry_days": 7}],
        )
        for e in events:
            assert "id" in e
            assert "drift_type" in e
            assert "severity" in e
            assert "entity_type" in e
            assert "auto_action_taken" in e
            assert "resolved" in e
            assert "detected_at" in e


# ═══════ API Endpoints ═══════

@pytest.mark.asyncio
async def test_drift_events_endpoint(client: AsyncClient):
    """GET /drift/events returns list."""
    resp = await client.get("/api/v1/drift/events")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_drift_stats_endpoint(client: AsyncClient):
    """GET /drift/stats returns summary."""
    resp = await client.get("/api/v1/drift/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data
    assert "by_type" in data
    assert "by_severity" in data


@pytest.mark.asyncio
async def test_drift_scan_requires_auth(client: AsyncClient):
    """POST /drift/scan requires authentication."""
    resp = await client.post("/api/v1/drift/scan")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_drift_scan_returns_results(client: AsyncClient):
    """POST /drift/scan returns scan results."""
    resp = await client.post("/api/v1/drift/scan", headers=auth())
    assert resp.status_code == 200
    data = resp.json()
    assert "scanned" in data
    assert data["scanned"] is True


@pytest.mark.asyncio
async def test_edge_weights_endpoint(client: AsyncClient):
    """GET /drift/edge-weights returns demo data."""
    resp = await client.get("/api/v1/drift/edge-weights")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    for ew in data:
        assert "edge_source" in ew
        assert "edge_target" in ew
        assert "original_weight" in ew
        assert "current_weight" in ew
