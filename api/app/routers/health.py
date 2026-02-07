import time

from fastapi import APIRouter

from app.core.llm import get_cost_log, get_uptime_seconds
from app.core.cache import get_redis

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Enhanced health check with service status."""
    services = {"database": "in_memory_mvp"}

    # Check Redis
    try:
        r = await get_redis()
        if r:
            await r.ping()
            services["redis"] = "connected"
        else:
            services["redis"] = "unavailable"
    except Exception:
        services["redis"] = "unavailable"

    services["openrouter"] = "configured"

    return {
        "status": "healthy",
        "service": "futureos-api",
        "version": "1.5.0",
        "services": services,
        "uptime_seconds": round(get_uptime_seconds()),
    }


@router.get("/api/v1/admin/costs")
async def get_costs():
    """LLM cost tracking dashboard."""
    log = get_cost_log()
    now = time.time()

    day_ago = now - 86400
    week_ago = now - 604800

    today_calls = [c for c in log if c["timestamp"] > day_ago]
    week_calls = [c for c in log if c["timestamp"] > week_ago]

    def _summarize(calls: list) -> dict:
        by_model: dict[str, dict] = {}
        for c in calls:
            m = c["model"]
            if m not in by_model:
                by_model[m] = {"calls": 0, "tokens_in": 0, "tokens_out": 0, "total_elapsed": 0}
            by_model[m]["calls"] += 1
            by_model[m]["tokens_in"] += c.get("tokens_in", 0)
            by_model[m]["tokens_out"] += c.get("tokens_out", 0)
            by_model[m]["total_elapsed"] += c.get("elapsed", 0)
        return {
            "calls": len(calls),
            "total_tokens_in": sum(c.get("tokens_in", 0) for c in calls),
            "total_tokens_out": sum(c.get("tokens_out", 0) for c in calls),
            "by_model": by_model,
        }

    return {
        "today": _summarize(today_calls),
        "this_week": _summarize(week_calls),
        "all_time": _summarize(log),
    }
