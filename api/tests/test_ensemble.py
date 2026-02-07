"""Tests for Ensemble Aggregator."""

import pytest
from app.services.engines.ensemble import EnsembleAggregator


class TestEnsembleAggregator:
    def test_basic_aggregation(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {
                "outcomes": [
                    {"name": "A", "probability": 0.5},
                    {"name": "B", "probability": 0.3},
                    {"name": "C", "probability": 0.2},
                ]
            },
            "mcts": {"outcome_probabilities": {"A": 0.4, "B": 0.35, "C": 0.25}},
            "debate": {"outcome_probabilities": {"A": 0.45, "B": 0.30, "C": 0.25}},
        }
        result = agg.aggregate(engine_results, ["A", "B", "C"])

        assert len(result["outcomes"]) == 3
        total = sum(o["probability"] for o in result["outcomes"])
        assert abs(total - 1.0) < 0.01
        assert "engine_weights" in result
        assert "consensus" in result

    def test_probabilities_sum_to_one(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {"outcome_probabilities": {"X": 0.7, "Y": 0.3}},
            "mcts": {"outcome_probabilities": {"X": 0.6, "Y": 0.4}},
        }
        result = agg.aggregate(engine_results, ["X", "Y"])
        total = sum(o["probability"] for o in result["outcomes"])
        assert abs(total - 1.0) < 0.01

    def test_single_engine_fallback(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {"outcome_probabilities": {"A": 0.6, "B": 0.4}},
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        assert len(result["outcomes"]) == 2
        assert result["consensus"] == 1.0  # Single engine = perfect consensus

    def test_no_engines(self):
        agg = EnsembleAggregator()
        result = agg.aggregate({}, ["A", "B"])
        assert len(result["outcomes"]) == 2
        assert result["consensus"] == 0.0

    def test_engine_breakdown_present(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {"outcome_probabilities": {"A": 0.5, "B": 0.5}},
            "mcts": {"outcome_probabilities": {"A": 0.6, "B": 0.4}},
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        for outcome in result["outcomes"]:
            assert "engine_breakdown" in outcome
            assert "got" in outcome["engine_breakdown"]
            assert "mcts" in outcome["engine_breakdown"]

    def test_confidence_intervals(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {"outcome_probabilities": {"A": 0.3, "B": 0.7}},
            "mcts": {"outcome_probabilities": {"A": 0.7, "B": 0.3}},
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        for outcome in result["outcomes"]:
            ci = outcome["confidence_interval"]
            assert ci[0] <= outcome["probability"] <= ci[1]
            assert ci[0] >= 0
            assert ci[1] <= 1

    def test_simulation_result_extraction(self):
        agg = EnsembleAggregator()
        engine_results = {
            "simulation": {
                "final_distribution": {
                    "government_support": 0.55,
                    "opposition_support": 0.45,
                }
            },
            "got": {"outcome_probabilities": {"PH wins": 0.5, "PN wins": 0.5}},
        }
        result = agg.aggregate(engine_results, ["PH wins", "PN wins"])
        assert len(result["outcomes"]) == 2

    def test_high_consensus(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {"outcome_probabilities": {"A": 0.6, "B": 0.4}},
            "mcts": {"outcome_probabilities": {"A": 0.58, "B": 0.42}},
            "debate": {"outcome_probabilities": {"A": 0.62, "B": 0.38}},
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        assert result["consensus"] > 0.8

    def test_low_consensus(self):
        agg = EnsembleAggregator()
        engine_results = {
            "got": {"outcome_probabilities": {"A": 0.9, "B": 0.1}},
            "mcts": {"outcome_probabilities": {"A": 0.2, "B": 0.8}},
            "debate": {"outcome_probabilities": {"A": 0.5, "B": 0.5}},
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        assert result["consensus"] < 0.5
