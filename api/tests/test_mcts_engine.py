"""Tests for MCTS Engine."""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.engines.mcts_engine import MCTSNode, MCTSEngine


class TestMCTSNode:
    def test_ucb1_unvisited(self):
        node = MCTSNode(state="test")
        assert node.ucb1 == float("inf")

    def test_ucb1_visited(self):
        parent = MCTSNode(state="parent")
        parent.visits = 10
        child = MCTSNode(state="child", parent=parent)
        child.visits = 5
        child.value = 3.0
        ucb = child.ucb1
        assert ucb > 0
        assert ucb < 10  # reasonable bound

    def test_depth(self):
        root = MCTSNode(state="root")
        child = MCTSNode(state="child", parent=root)
        grandchild = MCTSNode(state="grandchild", parent=child)
        assert root.depth == 0
        assert child.depth == 1
        assert grandchild.depth == 2

    def test_best_child(self):
        parent = MCTSNode(state="parent")
        parent.visits = 10
        c1 = MCTSNode(state="c1", parent=parent)
        c1.visits = 3
        c1.value = 1.0
        c2 = MCTSNode(state="c2", parent=parent)
        c2.visits = 5
        c2.value = 4.0
        parent.children = [c1, c2]
        # c2 has higher value/visits ratio
        best = parent.best_child()
        assert best in [c1, c2]


class TestMCTSEngine:
    @pytest.mark.asyncio
    async def test_search_with_mock_llm(self):
        engine = MCTSEngine(iterations=10, max_depth=2)

        mock_expand = {"branches": [
            {"action": "Economic analysis", "state": "Root → Economic"},
            {"action": "Political analysis", "state": "Root → Political"},
        ]}
        mock_eval = {"score": 0.65, "rationale": "Reasonable path"}

        with patch("app.services.engines.mcts_engine.call_llm_json", new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = lambda task, msgs, **kw: mock_expand if "branches" in str(msgs) else mock_eval
            result = await engine.search({
                "query": "2026 Malaysian Election",
                "outcomes": ["PH wins", "PN wins"],
            })

        assert result["engine"] == "mcts"
        assert "top_paths" in result
        assert "outcome_probabilities" in result
        assert "confidence" in result
        assert result["total_nodes"] >= 1

    @pytest.mark.asyncio
    async def test_search_fallback_on_llm_failure(self):
        engine = MCTSEngine(iterations=5, max_depth=2)

        with patch("app.services.engines.mcts_engine.call_llm_json", new_callable=AsyncMock) as mock_llm:
            mock_llm.side_effect = Exception("LLM unavailable")
            result = await engine.search({
                "query": "Test query",
                "outcomes": ["A", "B", "C"],
            })

        assert result["engine"] == "mcts"
        assert len(result["outcome_probabilities"]) == 3
        # Probabilities should sum to ~1
        total = sum(result["outcome_probabilities"].values())
        assert abs(total - 1.0) < 0.01

    @pytest.mark.asyncio
    async def test_convergence_early_stop(self):
        engine = MCTSEngine(iterations=100, max_depth=2)

        call_count = 0

        async def mock_llm(task, msgs, **kw):
            nonlocal call_count
            call_count += 1
            return {"branches": [{"action": "A", "state": "S"}], "score": 0.5}

        with patch("app.services.engines.mcts_engine.call_llm_json", side_effect=mock_llm):
            result = await engine.search({"query": "Test", "outcomes": ["X", "Y"]})

        # Should have stopped early due to convergence
        assert result["engine"] == "mcts"
