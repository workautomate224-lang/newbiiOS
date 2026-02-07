"""
Ensemble Aggregator
Combines results from multiple reasoning engines with weighted averaging.
Weights: GoT 40% + Simulation 25% + MCTS 20% + Debate 15%
"""

import math
import structlog

logger = structlog.get_logger()

DEFAULT_WEIGHTS = {
    "got": 0.40,
    "simulation": 0.25,
    "mcts": 0.20,
    "debate": 0.15,
}


class EnsembleAggregator:
    """Aggregates predictions from multiple reasoning engines."""

    def __init__(self, weights: dict[str, float] | None = None):
        self.weights = weights or DEFAULT_WEIGHTS

    def aggregate(self, engine_results: dict, outcomes: list[str]) -> dict:
        """
        Aggregate engine results into final prediction.

        engine_results: {"got": {...}, "mcts": {...}, "debate": {...}, "simulation": {...}}
        outcomes: ["outcome1", "outcome2", ...]
        """
        # Collect per-engine probabilities
        engine_probs: dict[str, dict[str, float]] = {}
        for engine_name, result in engine_results.items():
            probs = self._extract_probs(engine_name, result, outcomes)
            if probs:
                engine_probs[engine_name] = probs

        if not engine_probs:
            # No valid engine results
            n = len(outcomes)
            uniform = {o: round(1.0 / n, 4) for o in outcomes}
            return {
                "outcomes": [
                    {
                        "name": o,
                        "probability": uniform[o],
                        "confidence_interval": [max(0, uniform[o] - 0.15), min(1, uniform[o] + 0.15)],
                        "engine_breakdown": {},
                    }
                    for o in outcomes
                ],
                "engine_weights": self.weights,
                "consensus": 0.0,
            }

        # Reweight based on available engines
        active_weights = {k: self.weights.get(k, 0.1) for k in engine_probs}
        total_weight = sum(active_weights.values())
        active_weights = {k: v / total_weight for k, v in active_weights.items()}

        # Weighted average
        final_probs: dict[str, float] = {}
        for outcome in outcomes:
            weighted_sum = sum(
                engine_probs[eng].get(outcome, 0) * active_weights[eng]
                for eng in engine_probs
            )
            final_probs[outcome] = weighted_sum

        # Normalize
        total = sum(final_probs.values())
        if total > 0:
            final_probs = {k: v / total for k, v in final_probs.items()}

        # Bootstrap confidence intervals from engine disagreement
        confidence_intervals = {}
        for outcome in outcomes:
            values = [engine_probs[eng].get(outcome, 0) for eng in engine_probs]
            if len(values) > 1:
                std = self._std(values)
                ci_half = 1.96 * std
            else:
                ci_half = 0.1
            p = final_probs[outcome]
            confidence_intervals[outcome] = [
                round(max(0, p - ci_half), 4),
                round(min(1, p + ci_half), 4),
            ]

        # Engine consensus (1 - normalized disagreement)
        consensus = self._compute_consensus(engine_probs, outcomes)

        # Build output
        result_outcomes = []
        for outcome in outcomes:
            breakdown = {
                eng: round(engine_probs[eng].get(outcome, 0), 4)
                for eng in engine_probs
            }
            result_outcomes.append({
                "name": outcome,
                "probability": round(final_probs[outcome], 4),
                "confidence_interval": confidence_intervals[outcome],
                "engine_breakdown": breakdown,
            })

        logger.info(
            "ensemble_aggregated",
            engines=list(engine_probs.keys()),
            consensus=round(consensus, 4),
        )

        return {
            "outcomes": result_outcomes,
            "engine_weights": {k: round(v, 4) for k, v in active_weights.items()},
            "consensus": round(consensus, 4),
        }

    def _extract_probs(
        self, engine_name: str, result: dict, outcomes: list[str]
    ) -> dict[str, float]:
        """Extract outcome probabilities from engine result."""
        # Direct outcome_probabilities field
        probs = result.get("outcome_probabilities", {})
        if probs:
            return probs

        # GoT-style: outcomes list with probability field
        if "outcomes" in result and isinstance(result["outcomes"], list):
            return {
                o.get("name", ""): o.get("probability", 0)
                for o in result["outcomes"]
                if "name" in o
            }

        # Simulation: final_distribution
        if "final_distribution" in result:
            dist = result["final_distribution"]
            if outcomes and len(outcomes) >= 2:
                gov = dist.get("government_support", 0.5)
                return {outcomes[0]: gov, outcomes[1]: 1 - gov}
            return dist

        return {}

    def _std(self, values: list[float]) -> float:
        """Standard deviation."""
        n = len(values)
        if n < 2:
            return 0.0
        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / (n - 1)
        return math.sqrt(variance)

    def _compute_consensus(
        self, engine_probs: dict[str, dict[str, float]], outcomes: list[str]
    ) -> float:
        """Compute consensus score (0=total disagreement, 1=perfect agreement)."""
        if len(engine_probs) < 2:
            return 1.0

        # Average pairwise agreement
        engines = list(engine_probs.keys())
        total_diff = 0.0
        pairs = 0
        for i in range(len(engines)):
            for j in range(i + 1, len(engines)):
                for outcome in outcomes:
                    p1 = engine_probs[engines[i]].get(outcome, 0)
                    p2 = engine_probs[engines[j]].get(outcome, 0)
                    total_diff += abs(p1 - p2)
                    pairs += 1

        avg_diff = total_diff / max(pairs, 1)
        # Convert to 0-1 consensus (0 diff = 1 consensus)
        return max(0.0, 1.0 - avg_diff * 2)
