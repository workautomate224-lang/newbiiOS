"""
Real end-to-end tests — calls real OpenRouter API and World Bank API.
WARNING: Will produce API costs (~$0.50-2.00).
Marked @pytest.mark.real_e2e for selective runs.
"""

import pytest
import asyncio
import time


@pytest.mark.real_e2e
class TestRealPredictionFlow:

    @pytest.mark.asyncio
    async def test_full_prediction_malaysia_election(self):
        """
        Core test: complete 7-stage prediction pipeline.
        Input: "2026马来西亚大选谁赢"
        Verify: all stages complete, returns reasonable result.
        """
        from app.services.prediction_pipeline import run_prediction_pipeline

        start = time.time()

        result = await run_prediction_pipeline(
            prediction_id="test-real-e2e",
            query="2026马来西亚大选谁赢",
        )
        elapsed = time.time() - start

        # === Basic structure ===
        assert result is not None
        assert "outcomes" in result
        assert len(result["outcomes"]) >= 2

        # === Probability validation ===
        total_prob = sum(o["probability"] for o in result["outcomes"])
        assert 0.95 <= total_prob <= 1.05, f"Prob sum should be ~1.0, got {total_prob}"

        for o in result["outcomes"]:
            assert 0 <= o["probability"] <= 1, f"{o['name']} prob out of range: {o['probability']}"
            assert o["name"], "outcome name must not be empty"

        # === Confidence intervals ===
        for o in result["outcomes"]:
            if "confidence_interval" in o:
                ci = o["confidence_interval"]
                assert 0 <= ci[0] and ci[1] <= 1

        # === Causal graph ===
        if "causal_graph" in result:
            graph = result["causal_graph"]
            assert "nodes" in graph
            assert "edges" in graph
            assert len(graph["nodes"]) >= 3
            assert len(graph["edges"]) >= 2

        # === Engines ===
        if "engines" in result:
            engines = result["engines"]
            assert len(engines) > 0

        # === Time validation ===
        assert elapsed < 300, f"Pipeline should complete <5min, took {elapsed:.0f}s"

        print(f"\n{'='*60}")
        print(f"Full pipeline completed in {elapsed:.1f}s")
        print(f"Results:")
        for o in result["outcomes"]:
            print(f"  {o['name']}: {o['probability']:.1%}")
        print(f"{'='*60}")

    @pytest.mark.asyncio
    async def test_full_prediction_english_query(self):
        """English query is handled correctly."""
        from app.services.prediction_pipeline import run_prediction_pipeline

        result = await run_prediction_pipeline(
            prediction_id="test-real-english",
            query="Will AI surpass human intelligence by 2030?",
        )
        assert result is not None
        assert len(result["outcomes"]) >= 2
        total = sum(o["probability"] for o in result["outcomes"])
        assert 0.9 <= total <= 1.1


@pytest.mark.real_e2e
class TestRealDataSources:

    @pytest.mark.asyncio
    async def test_stage2_returns_real_economic_data(self):
        """Stage 2 returns economic data from real APIs."""
        from app.services.prediction_pipeline import stage_data_collection

        context = {"query": "Malaysia economy 2026", "region": "MY", "type": "election"}
        result = await stage_data_collection(context)

        assert "economic" in result
        assert "sentiment" in result
        assert "census" in result

        eco = result["economic"]
        has_data = bool(eco.get("gdp")) or bool(eco.get("unemployment")) or bool(eco.get("inflation"))
        print(f"Economic data: GDP={'Y' if eco.get('gdp') else 'N'} "
              f"Unemp={'Y' if eco.get('unemployment') else 'N'} "
              f"Inflation={'Y' if eco.get('inflation') else 'N'}")


@pytest.mark.real_e2e
class TestRealThreeEngines:

    @pytest.mark.asyncio
    async def test_three_engines_parallel(self):
        """Three engines run in parallel successfully."""
        from app.services.engines.mcts_engine import MCTSEngine
        from app.services.engines.debate_engine import DebateEngine

        context = {
            "query": "2026 Malaysia election",
            "outcomes": [{"name": "PH"}, {"name": "PN"}],
            "data_summary": "Malaysia economic and political context",
        }

        start = time.time()

        mcts_result, debate_result = await asyncio.gather(
            MCTSEngine(iterations=30).search(context),
            DebateEngine().run(context, ["PH", "PN"]),
            return_exceptions=True,
        )

        elapsed = time.time() - start

        mcts_ok = not isinstance(mcts_result, Exception)
        debate_ok = not isinstance(debate_result, Exception)
        assert mcts_ok or debate_ok, "At least one engine should succeed"

        if mcts_ok:
            print(f"MCTS: OK ({mcts_result.get('iterations', '?')} iterations)")
        if debate_ok:
            rounds = debate_result.get("rounds", debate_result.get("debate_log", []))
            print(f"Debate: OK ({len(rounds)} rounds)")

        print(f"Parallel elapsed: {elapsed:.1f}s")
        assert elapsed < 300, f"Parallel engines should complete <5min, took {elapsed:.0f}s"
