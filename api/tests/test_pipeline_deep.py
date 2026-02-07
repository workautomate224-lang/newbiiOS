"""Deep prediction pipeline tests."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json

from app.services.prediction_pipeline import (
    stage_intent_parse,
    stage_data_collection,
    stage_pop_synthesizer,
    stage_simulation,
    stage_got_reasoning,
    stage_explanation,
    stage_three_engine_reasoning,
    _fallback_got_result,
    MALAYSIA_SAMPLE_DATA,
)
from app.services.engines.mcts_engine import MCTSEngine, MCTSNode
from app.services.engines.debate_engine import DebateEngine
from app.services.engines.ensemble import EnsembleAggregator


# ─── Stage 1: Intent Parser ───

@pytest.mark.asyncio
async def test_intent_parser_fallback():
    """When LLM fails, intent parser returns fallback result."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("LLM down")):
        result = await stage_intent_parse("谁赢大选")
    assert "outcomes" in result
    assert len(result["outcomes"]) >= 2
    assert "key_variables" in result
    assert result["type"] == "election"


@pytest.mark.asyncio
async def test_intent_parser_valid_query():
    """Intent parser with valid LLM response."""
    mock_response = {
        "type": "election",
        "region": "MY",
        "timeframe": "P6M",
        "outcomes": ["Coalition A", "Coalition B"],
        "key_variables": ["GDP", "Approval"],
    }
    with patch("app.services.prediction_pipeline.call_llm_json", return_value=mock_response):
        result = await stage_intent_parse("Who will win the Malaysian election?")
    assert result["type"] == "election"
    assert len(result["outcomes"]) == 2


@pytest.mark.asyncio
async def test_intent_parser_english_query():
    """English query is handled properly."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("timeout")):
        result = await stage_intent_parse("What will happen to Bitcoin in 2026?")
    # Fallback still returns valid structure
    assert "outcomes" in result
    assert "key_variables" in result


# ─── Stage 2: Data Collection ───

@pytest.mark.asyncio
async def test_data_collection_returns_structure():
    """Data collection returns census, economic, sentiment."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
        result = await stage_data_collection({"region": "MY", "type": "election"})
    assert "census" in result
    assert "economic" in result
    assert "sentiment" in result
    assert result["census"]["total_population"] >= 33_000_000


@pytest.mark.asyncio
async def test_data_collection_handles_missing():
    """Gap fill failure still returns complete data."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("LLM fail")):
        result = await stage_data_collection({"region": "MY"})
    assert result["gap_fills"] == []
    assert "census" in result


# ─── Stage 3: Population Synthesizer ───

@pytest.mark.asyncio
async def test_pop_synthesizer_correct_count():
    """Generates exactly the requested number of agents."""
    data = MALAYSIA_SAMPLE_DATA
    result = await stage_pop_synthesizer(data, agent_count=100)
    assert len(result["agents"]) == 100


@pytest.mark.asyncio
async def test_pop_synthesizer_valid_demographics():
    """Agent demographics are valid."""
    data = MALAYSIA_SAMPLE_DATA
    result = await stage_pop_synthesizer(data, agent_count=200)
    for agent in result["agents"]:
        assert 21 <= agent["age"] <= 75
        assert agent["ethnicity"] in ["Malay", "Chinese", "Indian", "Others"]
        assert agent["income"] in ["low", "medium", "high"]
        assert agent["education"] in ["secondary", "tertiary", "postgraduate"]
        assert -1 <= agent["stance"] <= 1
        assert 0.1 <= agent["influence"] <= 1.0


@pytest.mark.asyncio
async def test_pop_synthesizer_network_connected():
    """Social network has edges (no completely disconnected graph)."""
    data = MALAYSIA_SAMPLE_DATA
    result = await stage_pop_synthesizer(data, agent_count=100)
    assert len(result["network"]["edges"]) > 0
    # Check edges reference valid agents
    agent_ids = {a["id"] for a in result["agents"]}
    for edge in result["network"]["edges"]:
        assert edge["source"] in agent_ids
        assert edge["target"] in agent_ids


# ─── Stage 4: Simulation ───

@pytest.mark.asyncio
async def test_simulation_runs_30_ticks():
    """Simulation completes 30 ticks."""
    data = MALAYSIA_SAMPLE_DATA
    pop = await stage_pop_synthesizer(data, agent_count=50)
    result = await stage_simulation(pop, ticks=30)
    assert len(result["ticks"]) == 30
    assert result["agent_count"] == 50


@pytest.mark.asyncio
async def test_simulation_stance_changes():
    """Some agents change stance during simulation."""
    data = MALAYSIA_SAMPLE_DATA
    pop = await stage_pop_synthesizer(data, agent_count=100)
    initial_stances = [a["stance"] for a in pop["agents"]]
    await stage_simulation(pop, ticks=30)
    final_stances = [a["stance"] for a in pop["agents"]]
    # At least some stances should have changed
    changes = sum(1 for i, f in zip(initial_stances, final_stances) if abs(i - f) > 0.01)
    assert changes > 0, "No agents changed stance in 30 ticks"


@pytest.mark.asyncio
async def test_simulation_final_distribution():
    """Final distribution sums to ~1.0."""
    data = MALAYSIA_SAMPLE_DATA
    pop = await stage_pop_synthesizer(data, agent_count=100)
    result = await stage_simulation(pop, ticks=30)
    fd = result["final_distribution"]
    total = fd["government_support"] + fd["opposition_support"]
    assert abs(total - 1.0) < 0.01


# ─── Stage 5: Three Engines ───

class TestMCTSDeep:
    def test_mcts_ucb1_correct(self):
        """UCB1 calculation is mathematically correct."""
        parent = MCTSNode(state="root")
        parent.visits = 100
        node = MCTSNode(state="child", parent=parent)
        node.visits = 10
        node.value = 5.0
        import math
        ucb = node.ucb1  # property, not method
        expected_exploit = 5.0 / 10
        expected_explore = 1.414 * math.sqrt(math.log(100) / 10)
        assert abs(ucb - (expected_exploit + expected_explore)) < 0.01

    def test_mcts_node_depth(self):
        """Node depth calculation is correct."""
        root = MCTSNode(state="root")
        child = MCTSNode(state="child", parent=root)
        grandchild = MCTSNode(state="grandchild", parent=child)
        assert root.depth == 0
        assert child.depth == 1
        assert grandchild.depth == 2

    @pytest.mark.asyncio
    async def test_mcts_engine_runs_iterations(self):
        """MCTS completes iterations and returns results."""
        engine = MCTSEngine(iterations=20)
        mock_llm = AsyncMock(return_value={
            "branches": [{"action": "analyze", "state": "test analysis"}],
            "score": 0.6,
        })
        with patch("app.services.engines.mcts_engine.call_llm_json", mock_llm):
            result = await engine.search({"query": "test", "outcomes": ["A", "B"]})
        assert "outcome_probabilities" in result
        assert "top_paths" in result
        assert result["iterations"] >= 1

    @pytest.mark.asyncio
    async def test_mcts_engine_converges(self):
        """MCTS outcome probabilities sum to ~1.0."""
        engine = MCTSEngine(iterations=20)
        mock_llm = AsyncMock(return_value={
            "branches": [{"action": "analyze", "state": "analysis"}],
            "score": 0.65,
        })
        with patch("app.services.engines.mcts_engine.call_llm_json", mock_llm):
            result = await engine.search({"query": "test", "outcomes": ["X", "Y"]})
        total = sum(result["outcome_probabilities"].values())
        assert abs(total - 1.0) < 0.05


class TestDebateDeep:
    @pytest.mark.asyncio
    async def test_debate_engine_3_rounds(self):
        """Debate completes 3 rounds."""
        engine = DebateEngine()
        mock_response = {
            "analysis": "Test argument",
            "probabilities": {"A": 0.6, "B": 0.4},
            "key_evidence": ["evidence"],
            "rebuttals": ["rebuttal"],
            "updated_probabilities": {"A": 0.6, "B": 0.4},
            "reasoning": "Judge synthesis",
            "key_arguments": [],
            "confidence": 0.7,
        }
        with patch("app.services.engines.debate_engine.call_llm_json", AsyncMock(return_value=mock_response)):
            result = await engine.run({"query": "test", "outcomes": ["A", "B"]}, ["A", "B"])
        assert "debate_log" in result
        assert len(result["debate_log"]) == 3

    @pytest.mark.asyncio
    async def test_debate_engine_judge_returns_json(self):
        """Judge produces structured probability output."""
        engine = DebateEngine()
        mock_response = {
            "analysis": "Test",
            "probabilities": {"A": 0.55, "B": 0.45},
            "key_evidence": ["evidence"],
            "rebuttals": ["rebuttal"],
            "updated_probabilities": {"A": 0.55, "B": 0.45},
            "reasoning": "Balanced judgment",
            "key_arguments": [],
            "confidence": 0.8,
        }
        with patch("app.services.engines.debate_engine.call_llm_json", AsyncMock(return_value=mock_response)):
            result = await engine.run({"query": "test", "outcomes": ["A", "B"]}, ["A", "B"])
        assert "outcome_probabilities" in result
        assert "A" in result["outcome_probabilities"]
        assert "B" in result["outcome_probabilities"]


class TestEnsembleDeep:
    def test_ensemble_weights_correct(self):
        """Ensemble weights sum to 1.0."""
        agg = EnsembleAggregator()
        assert abs(sum(agg.weights.values()) - 1.0) < 0.01

    def test_ensemble_normalization(self):
        """Ensemble output probabilities sum to 1.0."""
        agg = EnsembleAggregator()
        engine_results = {
            "got": {
                "outcomes": [
                    {"name": "A", "probability": 0.6, "confidence_interval": [0.5, 0.7]},
                    {"name": "B", "probability": 0.4, "confidence_interval": [0.3, 0.5]},
                ]
            },
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        total = sum(o["probability"] for o in result["outcomes"])
        assert abs(total - 1.0) < 0.01

    def test_ensemble_confidence_interval_valid(self):
        """Confidence intervals are within [0, 1]."""
        agg = EnsembleAggregator()
        engine_results = {
            "got": {
                "outcomes": [
                    {"name": "A", "probability": 0.7, "confidence_interval": [0.6, 0.8]},
                    {"name": "B", "probability": 0.3, "confidence_interval": [0.2, 0.4]},
                ]
            },
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        for o in result["outcomes"]:
            ci = o.get("confidence_interval", [0, 1])
            assert ci[0] >= 0
            assert ci[1] <= 1
            assert ci[0] <= ci[1]

    def test_ensemble_single_engine_fallback(self):
        """Works with only one engine result."""
        agg = EnsembleAggregator()
        engine_results = {
            "got": {
                "outcomes": [
                    {"name": "X", "probability": 0.8, "confidence_interval": [0.7, 0.9]},
                    {"name": "Y", "probability": 0.2, "confidence_interval": [0.1, 0.3]},
                ]
            },
        }
        result = agg.aggregate(engine_results, ["X", "Y"])
        assert len(result["outcomes"]) == 2

    def test_ensemble_all_engines_present(self):
        """Works with all engine results."""
        agg = EnsembleAggregator()
        outcomes_data = [
            {"name": "A", "probability": 0.6, "confidence_interval": [0.5, 0.7]},
            {"name": "B", "probability": 0.4, "confidence_interval": [0.3, 0.5]},
        ]
        engine_results = {
            "got": {"outcomes": outcomes_data},
            "mcts": {"outcomes": outcomes_data, "stats": {"iterations": 80}},
            "debate": {"outcomes": outcomes_data, "rounds": []},
            "simulation": {"final_distribution": {"A": 0.55, "B": 0.45}, "ticks": []},
        }
        result = agg.aggregate(engine_results, ["A", "B"])
        assert len(result["outcomes"]) == 2
        assert "consensus" in result


# ─── Stage 6: Explanation ───

@pytest.mark.asyncio
async def test_explanation_generates_text():
    """Explanation returns non-empty text."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
        result = await stage_explanation(
            {"region": "MY", "outcomes": ["A", "B"]},
            {"outcomes": [{"name": "A", "probability": 0.6}]},
        )
    assert len(result["explanation_text"]) > 0


@pytest.mark.asyncio
async def test_explanation_has_shap_factors():
    """Explanation returns factor attribution list."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
        result = await stage_explanation(
            {"region": "MY", "outcomes": ["A", "B"]},
            {"outcomes": [{"name": "A", "probability": 0.6}]},
        )
    assert len(result["shap_factors"]) >= 3
    for f in result["shap_factors"]:
        assert "name" in f
        assert "impact" in f
        assert "direction" in f


# ─── GoT Fallback ───

def test_fallback_got_result_valid():
    """Fallback GoT result has all required fields."""
    task = {"outcomes": ["A", "B", "C"]}
    result = _fallback_got_result(task)
    assert "dimensions" in result
    assert "outcomes" in result
    assert "causal_graph" in result
    assert len(result["outcomes"]) == 3
    total = sum(o["probability"] for o in result["outcomes"])
    assert abs(total - 1.0) < 0.01
    assert len(result["causal_graph"]["nodes"]) > 0
    assert len(result["causal_graph"]["edges"]) > 0
