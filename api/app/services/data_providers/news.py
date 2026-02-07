"""
News sentiment — uses NewsData.io when API key available, otherwise LLM fallback.
"""

import httpx
import os

NEWSDATA_API_KEY = os.environ.get("NEWSDATA_API_KEY", "")


async def get_news_sentiment(query: str, country: str = "my", count: int = 10) -> dict:
    """Fetch news articles and analyze sentiment."""
    articles = await _fetch_news(query, country, count)

    if not articles:
        return await _llm_news_fallback(query)

    from app.core.llm import call_llm_json
    try:
        sentiment = await call_llm_json("sentiment_analysis", [{
            "role": "user",
            "content": (
                f'Analyze the sentiment of these news headlines related to "{query}":\n'
                + "\n".join([f"- {a['title']}" for a in articles[:10]])
                + "\n\nReturn JSON: {"
                '"overall_sentiment": -1.0 to 1.0, '
                '"positive_themes": ["theme1"], '
                '"negative_themes": ["theme1"], '
                '"key_events": ["event1"], '
                '"summary": "2-3 sentence summary"}'
            ),
        }])
    except Exception:
        sentiment = {
            "overall_sentiment": 0.0,
            "positive_themes": [],
            "negative_themes": [],
            "key_events": [],
            "summary": "Sentiment analysis unavailable.",
        }

    return {
        "articles": articles[:5],
        "sentiment": sentiment,
        "source": "newsdata" if NEWSDATA_API_KEY else "llm_generated",
    }


async def _fetch_news(query: str, country: str, count: int) -> list:
    """Fetch articles from NewsData.io API."""
    if not NEWSDATA_API_KEY:
        return []

    url = "https://newsdata.io/api/1/news"
    params = {
        "apikey": NEWSDATA_API_KEY,
        "q": query,
        "country": country,
        "language": "en,ms",
        "size": count,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            data = resp.json()
        return [
            {"title": a["title"], "source": a.get("source_id", ""), "date": a.get("pubDate", "")}
            for a in data.get("results", [])
        ]
    except Exception:
        return []


async def _llm_news_fallback(query: str) -> dict:
    """When no news API available, use LLM to generate context."""
    from app.core.llm import call_llm_json
    try:
        return await call_llm_json("data_gap_fill", [{
            "role": "user",
            "content": (
                f'Based on your knowledge, provide current context about: "{query}"\n\n'
                "Return JSON: {"
                '"articles": [], '
                '"sentiment": {'
                '"overall_sentiment": 0.0, '
                '"positive_themes": [], '
                '"negative_themes": [], '
                '"key_events": [], '
                '"summary": "summary"}, '
                '"source": "llm_knowledge"}'
            ),
        }])
    except Exception:
        return {
            "articles": [],
            "sentiment": {
                "overall_sentiment": 0.0,
                "positive_themes": [],
                "negative_themes": [],
                "key_events": [],
                "summary": "No data available.",
            },
            "source": "fallback",
        }
