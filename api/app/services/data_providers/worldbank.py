"""
World Bank Open Data API — https://api.worldbank.org/v2/
Free, no API key required.
"""

import httpx

BASE_URL = "https://api.worldbank.org/v2"


async def get_gdp(country_code: str = "MYS", years: int = 5) -> list:
    """Fetch GDP data (current USD)."""
    return await _fetch_indicator(country_code, "NY.GDP.MKTP.CD", years)


async def get_population(country_code: str = "MYS", years: int = 5) -> list:
    """Fetch total population."""
    return await _fetch_indicator(country_code, "SP.POP.TOTL", years)


async def get_unemployment(country_code: str = "MYS", years: int = 5) -> list:
    """Fetch unemployment rate (% of total labor force)."""
    return await _fetch_indicator(country_code, "SL.UEM.TOTL.ZS", years)


async def get_inflation(country_code: str = "MYS", years: int = 5) -> list:
    """Fetch inflation rate (CPI annual %)."""
    return await _fetch_indicator(country_code, "FP.CPI.TOTL.ZG", years)


async def _fetch_indicator(country_code: str, indicator: str, years: int) -> list:
    """Generic World Bank indicator fetch."""
    url = f"{BASE_URL}/country/{country_code}/indicator/{indicator}"
    params = {"format": "json", "per_page": years, "date": "2019:2025"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        return _parse_wb_response(data)
    except Exception:
        return []


def _parse_wb_response(data) -> list:
    """Parse World Bank API response into clean records."""
    if not data or len(data) < 2 or not isinstance(data[1], list):
        return []
    return [
        {"year": item["date"], "value": item["value"], "country": item["country"]["value"]}
        for item in data[1]
        if item["value"] is not None
    ]
