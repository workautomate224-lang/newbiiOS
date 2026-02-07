"""
Triple Signal Fusion Engine.

AI Signal: From three-engine ensemble result
Crowd Signal: From market participant bet distribution
Reputation Signal: From high-reputation users' weighted bets
"""


class SignalFusion:
    WEIGHTS = {
        "ai": 0.50,
        "crowd": 0.30,
        "reputation": 0.20,
    }

    def compute(self, ai_signal: dict, crowd_signal: dict, reputation_signal: dict) -> dict:
        """Compute fused signal from three sources."""
        fused = self._fuse(ai_signal, crowd_signal, reputation_signal)
        anomalies = self._detect_anomalies(ai_signal, crowd_signal, reputation_signal)

        return {
            "ai": ai_signal,
            "crowd": crowd_signal,
            "reputation": reputation_signal,
            "fused": fused,
            "anomalies": anomalies,
        }

    def _fuse(self, ai: dict, crowd: dict, reputation: dict) -> dict:
        """Weighted fusion of three signals."""
        outcomes: set[str] = set()
        for signal in [ai, crowd, reputation]:
            for o in signal.get("outcomes", []):
                outcomes.add(o["name"])

        fused = []
        for name in sorted(outcomes):
            p = 0.0
            total_weight = 0.0
            for signal, weight in [
                (ai, self.WEIGHTS["ai"]),
                (crowd, self.WEIGHTS["crowd"]),
                (reputation, self.WEIGHTS["reputation"]),
            ]:
                signal_outcomes = signal.get("outcomes", [])
                prob = next((o["probability"] for o in signal_outcomes if o["name"] == name), None)
                if prob is not None:
                    p += prob * weight
                    total_weight += weight

            if total_weight > 0:
                fused.append({"name": name, "probability": round(p / total_weight * (total_weight), 4)})
            else:
                fused.append({"name": name, "probability": 0.0})

        # Normalize
        total = sum(f["probability"] for f in fused)
        if total > 0:
            for f in fused:
                f["probability"] = round(f["probability"] / total, 4)

        return {"outcomes": fused}

    def _detect_anomalies(self, ai: dict, crowd: dict, reputation: dict) -> list:
        """Detect anomalies: large bets, signal divergence, sudden shifts."""
        anomalies = []

        for ai_o in ai.get("outcomes", []):
            name = ai_o["name"]
            crowd_prob = next(
                (o["probability"] for o in crowd.get("outcomes", []) if o["name"] == name), None
            )
            if crowd_prob is not None and abs(ai_o["probability"] - crowd_prob) > 0.25:
                anomalies.append({
                    "type": "signal_divergence",
                    "severity": "warning",
                    "details": f"{name}: AI={ai_o['probability']:.0%} vs Crowd={crowd_prob:.0%}",
                })

            rep_prob = next(
                (o["probability"] for o in reputation.get("outcomes", []) if o["name"] == name), None
            )
            if rep_prob is not None and crowd_prob is not None:
                diffs = [
                    abs(ai_o["probability"] - crowd_prob),
                    abs(ai_o["probability"] - rep_prob),
                    abs(crowd_prob - rep_prob),
                ]
                if all(d > 0.20 for d in diffs):
                    anomalies.append({
                        "type": "signal_divergence",
                        "severity": "critical",
                        "details": f"{name}: All three signals disagree significantly",
                    })

        return anomalies
