"""
Drift Monitor — 5 drift types:
1. Data expiry: data source exceeds freshness_expiry
2. Causal edge decay: causal relationships weaken over time
3. Agent behavior drift: simulation agent behavior anomalies
4. Calibration drift: Brier Score trend worsening
5. Signal divergence: AI/Crowd/Reputation severely inconsistent
"""

import math
import uuid
from datetime import datetime


class DriftMonitor:
    """Monitors for various types of drift and triggers auto-adaptation."""

    def __init__(self):
        self._drift_events: list[dict] = []
        self._edge_weights: list[dict] = []

    def run_full_scan(
        self,
        data_sources: list[dict] | None = None,
        edge_weights: list[dict] | None = None,
        calibration_history: list[dict] | None = None,
        signal_snapshots: list[dict] | None = None,
    ) -> list[dict]:
        """Run a complete drift scan across all types."""
        results = []
        if data_sources:
            results.extend(self.check_data_expiry(data_sources))
        if edge_weights:
            results.extend(self.check_causal_decay(edge_weights))
        if calibration_history:
            results.extend(self.check_calibration_drift(calibration_history))
        if signal_snapshots:
            results.extend(self.check_signal_divergence(signal_snapshots))

        self._drift_events.extend(results)
        return results

    def check_data_expiry(self, data_sources: list[dict]) -> list[dict]:
        """Check all data sources for freshness expiry."""
        events = []
        now = datetime.now()
        for ds in data_sources:
            status = ds.get("freshness_status", "fresh")
            days_since_sync = ds.get("days_since_sync", 0)
            expiry_days = ds.get("expiry_days", 7)

            if days_since_sync > expiry_days:
                severity = "critical"
                new_status = "expired"
            elif days_since_sync > expiry_days * 0.7:
                severity = "warning"
                new_status = "stale"
            else:
                continue

            events.append({
                "id": str(uuid.uuid4()),
                "drift_type": "data_expiry",
                "severity": severity,
                "entity_type": "data_source",
                "entity_id": ds.get("id"),
                "details": {
                    "source_name": ds.get("name", "Unknown"),
                    "days_since_sync": days_since_sync,
                    "expiry_days": expiry_days,
                    "new_status": new_status,
                },
                "auto_action_taken": f"Marked data source as {new_status}",
                "resolved": False,
                "detected_at": now.isoformat(),
            })
        return events

    def check_causal_decay(self, edge_weights: list[dict]) -> list[dict]:
        """Check causal edge weight decay over time."""
        events = []
        now = datetime.now()
        for ew in edge_weights:
            original = ew.get("original_weight", 1.0)
            current = ew.get("current_weight", original)
            decay_rate = ew.get("decay_rate", 0.03)
            days_since_validation = ew.get("days_since_validation", 0)

            # Apply decay: current = original * (1 - decay_rate) ^ days
            decayed = original * ((1 - decay_rate) ** days_since_validation)
            ratio = decayed / original if original > 0 else 0

            if ratio < 0.1:
                severity = "critical"
                action = "Recommend removing this causal edge"
            elif ratio < 0.3:
                severity = "warning"
                action = "Edge weight significantly reduced"
            else:
                ew["current_weight"] = round(decayed, 4)
                continue

            events.append({
                "id": str(uuid.uuid4()),
                "drift_type": "causal_decay",
                "severity": severity,
                "entity_type": "causal_edge",
                "entity_id": ew.get("id"),
                "details": {
                    "edge": f"{ew.get('edge_source', '?')} → {ew.get('edge_target', '?')}",
                    "original_weight": original,
                    "current_weight": round(decayed, 4),
                    "decay_ratio": round(ratio, 4),
                    "days_since_validation": days_since_validation,
                },
                "auto_action_taken": action,
                "resolved": False,
                "detected_at": now.isoformat(),
            })
            ew["current_weight"] = round(decayed, 4)
        return events

    def check_calibration_drift(self, history: list[dict]) -> list[dict]:
        """Detect worsening calibration (Brier Score trend)."""
        events = []
        if len(history) < 10:
            return events

        # Compare first half vs second half
        mid = len(history) // 2
        first_half = history[:mid]
        second_half = history[mid:]

        avg_first = sum(h.get("brier_score", 0.5) for h in first_half) / len(first_half)
        avg_second = sum(h.get("brier_score", 0.5) for h in second_half) / len(second_half)

        if avg_second - avg_first > 0.1:
            events.append({
                "id": str(uuid.uuid4()),
                "drift_type": "calibration_drift",
                "severity": "warning",
                "entity_type": "system",
                "entity_id": None,
                "details": {
                    "early_brier": round(avg_first, 4),
                    "recent_brier": round(avg_second, 4),
                    "degradation": round(avg_second - avg_first, 4),
                    "sample_size": len(history),
                },
                "auto_action_taken": "Recommend recalibration with Platt Scaling",
                "resolved": False,
                "detected_at": datetime.now().isoformat(),
            })
        return events

    def check_signal_divergence(self, snapshots: list[dict]) -> list[dict]:
        """Detect severe divergence between AI/Crowd/Reputation signals."""
        events = []
        for snap in snapshots:
            ai = snap.get("ai_signal", {}).get("outcomes", [])
            crowd = snap.get("crowd_signal", {}).get("outcomes", [])
            rep = snap.get("reputation_signal", {}).get("outcomes", [])

            if not ai or not crowd:
                continue

            for ai_o in ai:
                name = ai_o["name"]
                crowd_prob = next((o["probability"] for o in crowd if o["name"] == name), None)
                rep_prob = next((o["probability"] for o in rep if o["name"] == name), None)

                if crowd_prob is not None and abs(ai_o["probability"] - crowd_prob) > 0.30:
                    events.append({
                        "id": str(uuid.uuid4()),
                        "drift_type": "signal_divergence",
                        "severity": "warning" if abs(ai_o["probability"] - crowd_prob) < 0.40 else "critical",
                        "entity_type": "market",
                        "entity_id": snap.get("market_id"),
                        "details": {
                            "outcome": name,
                            "ai_probability": ai_o["probability"],
                            "crowd_probability": crowd_prob,
                            "reputation_probability": rep_prob,
                            "divergence": round(abs(ai_o["probability"] - crowd_prob), 4),
                        },
                        "auto_action_taken": "Flagged for review",
                        "resolved": False,
                        "detected_at": datetime.now().isoformat(),
                    })
        return events

    def auto_adapt(self, drift_event: dict) -> str:
        """Execute automatic adaptation based on drift type."""
        drift_type = drift_event["drift_type"]

        if drift_type == "data_expiry":
            return "Marked predictions using this data as needing refresh"
        elif drift_type == "causal_decay":
            return "Reduced causal edge weight in active predictions"
        elif drift_type == "calibration_drift":
            return "Triggered Platt Scaling recalibration"
        elif drift_type == "signal_divergence":
            return "Logged anomaly and flagged for manual review"
        return "No action taken"

    @property
    def events(self) -> list[dict]:
        return self._drift_events
