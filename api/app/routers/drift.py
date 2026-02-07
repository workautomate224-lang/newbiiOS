"""Drift monitoring API routes."""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user
from app.services.drift.monitor import DriftMonitor

router = APIRouter(prefix="/api/v1/drift", tags=["drift"])

# Singleton monitor instance for MVP
_monitor = DriftMonitor()


@router.get("/events")
async def get_drift_events():
    """Get all drift events."""
    events = _monitor.events
    if not events:
        # Sample events for demo
        return [
            {
                "id": "demo-1",
                "drift_type": "data_expiry",
                "severity": "warning",
                "entity_type": "data_source",
                "details": {"source_name": "Reuters API", "days_since_sync": 12, "expiry_days": 7},
                "auto_action_taken": "Marked data source as stale",
                "resolved": False,
            },
            {
                "id": "demo-2",
                "drift_type": "causal_decay",
                "severity": "warning",
                "entity_type": "causal_edge",
                "details": {"edge": "Economic Policy → GDP Growth", "original_weight": 0.85, "current_weight": 0.42, "decay_ratio": 0.49},
                "auto_action_taken": "Edge weight significantly reduced",
                "resolved": False,
            },
            {
                "id": "demo-3",
                "drift_type": "signal_divergence",
                "severity": "critical",
                "entity_type": "market",
                "details": {"outcome": "Yes", "ai_probability": 0.72, "crowd_probability": 0.35, "divergence": 0.37},
                "auto_action_taken": "Flagged for review",
                "resolved": False,
            },
        ]
    return events


@router.get("/stats")
async def get_drift_stats():
    """Get drift statistics summary."""
    events = _monitor.events
    stats = {
        "total": len(events),
        "by_type": {},
        "by_severity": {"info": 0, "warning": 0, "critical": 0},
        "unresolved": 0,
    }
    for e in events:
        dt = e.get("drift_type", "unknown")
        stats["by_type"][dt] = stats["by_type"].get(dt, 0) + 1
        sev = e.get("severity", "info")
        stats["by_severity"][sev] = stats["by_severity"].get(sev, 0) + 1
        if not e.get("resolved", False):
            stats["unresolved"] += 1

    # Sample stats if no real events
    if not events:
        stats = {
            "total": 8,
            "by_type": {"data_expiry": 3, "causal_decay": 2, "calibration_drift": 1, "signal_divergence": 2},
            "by_severity": {"info": 2, "warning": 4, "critical": 2},
            "unresolved": 5,
        }
    return stats


@router.post("/scan")
async def run_drift_scan(user: dict = Depends(get_current_user)):
    """Trigger a full drift scan."""
    from app.routers.studio import _data_sources

    # Scan data sources
    data_sources = list(_data_sources.values())
    events = _monitor.run_full_scan(data_sources=data_sources)

    for event in events:
        _monitor.auto_adapt(event)

    return {"scanned": True, "events_detected": len(events)}


@router.get("/edge-weights")
async def get_edge_weights():
    """Get causal edge weight decay data."""
    # Demo data for visualization
    return [
        {"edge_source": "Economic Policy", "edge_target": "GDP Growth", "original_weight": 0.85, "current_weight": 0.72, "decay_rate": 0.03, "days_since_validation": 6},
        {"edge_source": "Social Media", "edge_target": "Public Opinion", "original_weight": 0.70, "current_weight": 0.35, "decay_rate": 0.05, "days_since_validation": 15},
        {"edge_source": "Interest Rates", "edge_target": "Housing Prices", "original_weight": 0.90, "current_weight": 0.81, "decay_rate": 0.02, "days_since_validation": 5},
        {"edge_source": "Employment Rate", "edge_target": "Consumer Confidence", "original_weight": 0.65, "current_weight": 0.58, "decay_rate": 0.03, "days_since_validation": 4},
        {"edge_source": "Trade Policy", "edge_target": "Export Volume", "original_weight": 0.75, "current_weight": 0.12, "decay_rate": 0.08, "days_since_validation": 25},
    ]
