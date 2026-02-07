import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.prediction_pipeline import (
    stage_intent_parse,
    stage_data_collection,
    stage_pop_synthesizer,
    stage_simulation,
    stage_explanation,
    _fallback_got_result,
)


@pytest.mark.asyncio
async def test_intent_parse_fallback():
    """Intent parser should return valid structure even when LLM fails."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("LLM down")):
        result = await stage_intent_parse("2026 Malaysian election?")
        assert "type" in result
        assert "outcomes" in result
        assert "key_variables" in result
        assert len(result["outcomes"]) >= 2


@pytest.mark.asyncio
async def test_data_collection_returns_data():
    """Data collection should return sample data."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
        task = {"region": "MY", "type": "election"}
        result = await stage_data_collection(task)
        assert "census" in result
        assert "economic" in result
        assert "sentiment" in result


@pytest.mark.asyncio
async def test_pop_synthesizer():
    """Population synthesizer should generate agents."""
    from app.services.prediction_pipeline import MALAYSIA_SAMPLE_DATA

    pop = await stage_pop_synthesizer(MALAYSIA_SAMPLE_DATA, agent_count=20)
    assert len(pop["agents"]) == 20
    assert "network" in pop
    for agent in pop["agents"]:
        assert "id" in agent
        assert "stance" in agent
        assert "ethnicity" in agent


@pytest.mark.asyncio
async def test_simulation():
    """Simulation should run and return tick data."""
    from app.services.prediction_pipeline import MALAYSIA_SAMPLE_DATA

    pop = await stage_pop_synthesizer(MALAYSIA_SAMPLE_DATA, agent_count=20)
    result = await stage_simulation(pop, ticks=10)
    assert len(result["ticks"]) == 10
    assert "final_distribution" in result
    assert 0 <= result["final_distribution"]["government_support"] <= 1


def test_fallback_got_result():
    """Fallback GoT should return valid structure."""
    task = {"outcomes": ["A wins", "B wins", "Draw"]}
    result = _fallback_got_result(task)
    assert len(result["outcomes"]) == 3
    probs = [o["probability"] for o in result["outcomes"]]
    assert abs(sum(probs) - 1.0) < 0.01
    assert "causal_graph" in result
    assert "nodes" in result["causal_graph"]
    assert "edges" in result["causal_graph"]


@pytest.mark.asyncio
async def test_explanation_fallback():
    """Explanation should return valid structure even when LLM fails."""
    with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
        task = {"region": "MY"}
        got = {"outcomes": [{"name": "A", "probability": 0.5}]}
        result = await stage_explanation(task, got)
        assert "explanation_text" in result
        assert "shap_factors" in result
        assert len(result["shap_factors"]) > 0
