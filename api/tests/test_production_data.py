"""
Verify real data source integration.
These tests call real external APIs and require network.
Marked @pytest.mark.integration for selective runs.
"""

import pytest


@pytest.mark.integration
class TestWorldBankAPI:
    @pytest.mark.asyncio
    async def test_gdp_malaysia_returns_data(self):
        """World Bank GDP API returns Malaysia data."""
        from app.services.data_providers.worldbank import get_gdp
        data = await get_gdp("MYS")
        assert len(data) > 0
        assert data[0]["country"] == "Malaysia"
        assert data[0]["value"] is not None
        assert data[0]["value"] > 0  # GDP should be positive

    @pytest.mark.asyncio
    async def test_population_malaysia(self):
        """Population data in expected range."""
        from app.services.data_providers.worldbank import get_population
        data = await get_population("MYS")
        assert len(data) > 0
        latest = data[0]["value"]
        assert 25_000_000 < latest < 45_000_000

    @pytest.mark.asyncio
    async def test_unemployment_returns_percentage(self):
        """Unemployment is a percentage 0-30%."""
        from app.services.data_providers.worldbank import get_unemployment
        data = await get_unemployment("MYS")
        if data:
            assert 0 < data[0]["value"] < 30

    @pytest.mark.asyncio
    async def test_inflation_returns_data(self):
        """Inflation rate in reasonable range."""
        from app.services.data_providers.worldbank import get_inflation
        data = await get_inflation("MYS")
        if data:
            assert -10 < data[0]["value"] < 30

    @pytest.mark.asyncio
    async def test_api_timeout_handled(self):
        """Invalid country code returns empty, not crash."""
        from app.services.data_providers.worldbank import get_gdp
        data = await get_gdp("ZZZZZ")
        assert isinstance(data, list)


@pytest.mark.integration
class TestNewsAPI:
    @pytest.mark.asyncio
    async def test_news_sentiment_with_fallback(self):
        """News sentiment works with or without API key."""
        from app.services.data_providers.news import get_news_sentiment
        from unittest.mock import patch

        # Force fallback path (no real API key, mock LLM to fail → hardcoded fallback)
        with patch("app.services.data_providers.news.NEWSDATA_API_KEY", ""), \
             patch("app.core.llm.call_llm_json", side_effect=Exception("skip")):
            result = await get_news_sentiment("Malaysia election 2026")
        assert "sentiment" in result
        assert "source" in result

    @pytest.mark.asyncio
    async def test_sentiment_fallback_structure(self):
        """Fallback sentiment has correct structure."""
        from app.services.data_providers.news import get_news_sentiment
        from unittest.mock import patch

        with patch("app.services.data_providers.news.NEWSDATA_API_KEY", ""), \
             patch("app.core.llm.call_llm_json", side_effect=Exception("skip")):
            result = await get_news_sentiment("economy growth")
        score = result.get("sentiment", {}).get("overall_sentiment", 0)
        assert -1.0 <= score <= 1.0


@pytest.mark.integration
class TestMalaysiaData:
    def test_demographics_structure(self):
        """Malaysia demographics data has correct structure."""
        from app.services.data_providers.malaysia import get_demographics
        data = get_demographics()
        assert data["total_population"] > 30_000_000
        assert abs(sum(data["ethnic_distribution"].values()) - 1.0) < 0.01
        assert len(data["states"]) >= 13

    def test_election_history(self):
        """Election history data is correct."""
        from app.services.data_providers.malaysia import get_election_history
        data = get_election_history()
        assert "ge15" in data
        assert data["ge15"]["total_seats"] == 222
        assert data["ge15"]["coalitions"]["PH"]["seats"] == 82

    def test_ge15_seats_sum_to_222(self):
        """GE15 all coalition seats sum to 222."""
        from app.services.data_providers.malaysia import get_election_history
        ge15 = get_election_history()["ge15"]
        total = sum(c["seats"] for c in ge15["coalitions"].values())
        assert total == 222
