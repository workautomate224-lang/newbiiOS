"""Tests for real data providers + upgraded Stage 2."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import json

from app.services.data_providers.worldbank import (
    get_gdp, get_population, get_unemployment, get_inflation, _parse_wb_response,
)
from app.services.data_providers.malaysia import (
    get_demographics, get_election_history, get_state_data,
    MALAYSIA_DEMOGRAPHICS, GE15_RESULTS, GE14_RESULTS,
)
from app.services.data_providers.news import get_news_sentiment


# ═══════ World Bank ═══════

class TestWorldBankParser:
    def test_parse_valid_response(self):
        data = [
            {"page": 1, "pages": 1, "per_page": 5, "total": 3},
            [
                {"date": "2023", "value": 400000000000, "country": {"value": "Malaysia"}},
                {"date": "2022", "value": 380000000000, "country": {"value": "Malaysia"}},
                {"date": "2021", "value": None, "country": {"value": "Malaysia"}},
            ],
        ]
        result = _parse_wb_response(data)
        assert len(result) == 2  # None value filtered out
        assert result[0]["year"] == "2023"
        assert result[0]["value"] == 400000000000

    def test_parse_empty_response(self):
        assert _parse_wb_response(None) == []
        assert _parse_wb_response([]) == []
        assert _parse_wb_response([{"page": 1}]) == []

    def test_parse_invalid_data(self):
        assert _parse_wb_response([{}, "not a list"]) == []


class TestWorldBankAPI:
    @pytest.mark.asyncio
    async def test_get_gdp_success(self):
        mock_data = [
            {"page": 1},
            [{"date": "2023", "value": 400e9, "country": {"value": "Malaysia"}}],
        ]
        mock_resp = MagicMock()
        mock_resp.json.return_value = mock_data
        mock_resp.raise_for_status = MagicMock()

        with patch("app.services.data_providers.worldbank.httpx.AsyncClient") as mc:
            mc.return_value.__aenter__ = AsyncMock(return_value=MagicMock(get=AsyncMock(return_value=mock_resp)))
            mc.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await get_gdp("MYS")
        assert len(result) == 1
        assert result[0]["year"] == "2023"

    @pytest.mark.asyncio
    async def test_get_gdp_failure_returns_empty(self):
        with patch("app.services.data_providers.worldbank.httpx.AsyncClient") as mc:
            mc.return_value.__aenter__ = AsyncMock(side_effect=Exception("Network error"))
            mc.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await get_gdp("MYS")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_population(self):
        with patch("app.services.data_providers.worldbank.httpx.AsyncClient") as mc:
            mc.return_value.__aenter__ = AsyncMock(side_effect=Exception("fail"))
            mc.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await get_population("MYS")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_unemployment(self):
        with patch("app.services.data_providers.worldbank.httpx.AsyncClient") as mc:
            mc.return_value.__aenter__ = AsyncMock(side_effect=Exception("fail"))
            mc.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await get_unemployment("MYS")
        assert result == []

    @pytest.mark.asyncio
    async def test_get_inflation(self):
        with patch("app.services.data_providers.worldbank.httpx.AsyncClient") as mc:
            mc.return_value.__aenter__ = AsyncMock(side_effect=Exception("fail"))
            mc.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await get_inflation("MYS")
        assert result == []


# ═══════ Malaysia Data ═══════

class TestMalaysiaData:
    def test_demographics_valid(self):
        demo = get_demographics()
        assert demo["total_population"] == 33_200_000
        assert abs(sum(demo["ethnic_distribution"].values()) - 1.0) < 0.01
        assert abs(sum(demo["age_distribution"].values()) - 1.0) < 0.01
        assert len(demo["states"]) == 16

    def test_election_history(self):
        history = get_election_history()
        assert "ge15" in history
        assert "ge14" in history
        assert history["ge15"]["total_seats"] == 222
        assert history["ge15"]["turnout"] > 0.7

    def test_state_data(self):
        selangor = get_state_data("Selangor")
        assert selangor["population"] == 6_900_000
        assert selangor["seats"] == 22

    def test_state_data_missing(self):
        assert get_state_data("Nonexistent") == {}

    def test_ge15_seat_total(self):
        total = sum(c["seats"] for c in GE15_RESULTS["coalitions"].values())
        assert total == 222

    def test_ge14_ph_majority(self):
        assert GE14_RESULTS["coalitions"]["PH"]["seats"] > 112  # Simple majority


# ═══════ News API ═══════

class TestNewsAPI:
    @pytest.mark.asyncio
    async def test_no_api_key_uses_fallback(self):
        with patch("app.services.data_providers.news.NEWSDATA_API_KEY", ""):
            with patch("app.services.data_providers.news._llm_news_fallback", AsyncMock(return_value={
                "articles": [], "sentiment": {"overall_sentiment": 0.0}, "source": "llm_knowledge",
            })):
                result = await get_news_sentiment("test query")
        assert result["source"] in ("llm_knowledge", "fallback")

    @pytest.mark.asyncio
    async def test_api_failure_uses_fallback(self):
        with patch("app.services.data_providers.news.NEWSDATA_API_KEY", "fake-key"):
            with patch("app.services.data_providers.news._fetch_news", AsyncMock(return_value=[])):
                with patch("app.services.data_providers.news._llm_news_fallback", AsyncMock(return_value={
                    "articles": [], "sentiment": {"overall_sentiment": 0.0}, "source": "fallback",
                })):
                    result = await get_news_sentiment("test")
        assert "sentiment" in result or "source" in result


# ═══════ Upgraded Stage 2 ═══════

class TestStage2RealData:
    @pytest.mark.asyncio
    async def test_stage2_with_real_providers_failure_fallback(self):
        """When all real providers fail, falls back to mock data."""
        from app.services.prediction_pipeline import stage_data_collection
        with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
            result = await stage_data_collection({"region": "MY", "type": "election"})
        assert "census" in result
        assert "economic" in result
        assert "sentiment" in result

    @pytest.mark.asyncio
    async def test_stage2_returns_gap_fills(self):
        """Stage 2 returns gap_fills (empty on LLM failure)."""
        from app.services.prediction_pipeline import stage_data_collection
        with patch("app.services.prediction_pipeline.call_llm_json", side_effect=Exception("skip")):
            result = await stage_data_collection({"region": "MY"})
        assert "gap_fills" in result
        assert isinstance(result["gap_fills"], list)
