"""Tests for Debate Engine."""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.engines.debate_engine import DebateEngine, _extract_json


class TestExtractJson:
    def test_plain_json(self):
        result = _extract_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_code_block(self):
        text = 'Some text\n```json\n{"key": "value"}\n```\nMore text'
        result = _extract_json(text)
        assert result == {"key": "value"}

    def test_last_brace_block(self):
        text = 'Lots of text here {"nested": true} and more'
        result = _extract_json(text)
        assert result == {"nested": True}

    def test_invalid_returns_empty(self):
        result = _extract_json("no json here at all")
        assert result == {}


class TestDebateEngine:
    @pytest.mark.asyncio
    async def test_full_debate_with_mock(self):
        engine = DebateEngine()
        outcomes = ["PH wins", "PN wins", "Hung parliament"]

        mock_r1 = {
            "analysis": "Test analysis",
            "probabilities": {"PH wins": 0.4, "PN wins": 0.35, "Hung parliament": 0.25},
            "key_evidence": ["Evidence 1"],
        }
        mock_r2 = {
            "rebuttals": ["Counter argument"],
            "updated_probabilities": {"PH wins": 0.42, "PN wins": 0.33, "Hung parliament": 0.25},
        }
        mock_judge = {
            "probabilities": {"PH wins": 0.41, "PN wins": 0.34, "Hung parliament": 0.25},
            "reasoning": "Balanced synthesis",
            "key_arguments": [{"from": "optimist", "argument": "Strong economy", "weight": 0.7}],
            "confidence": 0.72,
        }

        call_idx = 0

        async def mock_llm(task, msgs, **kw):
            nonlocal call_idx
            call_idx += 1
            # First 4 calls = Round 1, next 4 = Round 2, last = Judge
            if call_idx <= 4:
                return mock_r1
            elif call_idx <= 8:
                return mock_r2
            else:
                return mock_judge

        with patch("app.services.engines.debate_engine.call_llm_json", side_effect=mock_llm):
            result = await engine.run(
                {"query": "Malaysian Election", "data_summary": "GDP 4.5%"},
                outcomes,
            )

        assert result["engine"] == "debate"
        assert len(result["debate_log"]) == 3
        assert result["debate_log"][0]["round"] == 1
        assert result["debate_log"][1]["round"] == 2
        assert result["debate_log"][2]["round"] == 3
        assert "outcome_probabilities" in result
        assert result["consensus"] == 0.72

    @pytest.mark.asyncio
    async def test_debate_fallback_on_failure(self):
        engine = DebateEngine()
        outcomes = ["A", "B"]

        with patch("app.services.engines.debate_engine.call_llm_json", new_callable=AsyncMock) as mock:
            mock.side_effect = Exception("LLM down")
            result = await engine.run({"query": "Test"}, outcomes)

        assert result["engine"] == "debate"
        assert len(result["debate_log"]) == 3
        # Should have fallback probabilities
        assert "outcome_probabilities" in result

    @pytest.mark.asyncio
    async def test_round1_parallel_execution(self):
        engine = DebateEngine()
        call_order = []

        async def mock_llm(task, msgs, **kw):
            role = "unknown"
            for r in ["optimist", "pessimist", "contrarian", "historian"]:
                if r.title() in str(msgs):
                    role = r
                    break
            call_order.append(role)
            return {
                "analysis": f"{role} analysis",
                "probabilities": {"X": 0.5, "Y": 0.5},
                "key_evidence": [],
            }

        with patch("app.services.engines.debate_engine.call_llm_json", side_effect=mock_llm):
            round1 = await engine._round1_opening("Q", "data", ["X", "Y"])

        assert len(round1) == 4
        assert set(round1.keys()) == {"optimist", "pessimist", "contrarian", "historian"}
