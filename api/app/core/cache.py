"""
Redis cache layer — reduces repeated LLM calls and API queries.
Gracefully degrades to no-op if Redis unavailable.
"""

import json
import hashlib
import os

import redis.asyncio as redis
import structlog

logger = structlog.get_logger()

_redis = None
_redis_available = True


async def get_redis():
    """Get Redis connection, returns None if unavailable."""
    global _redis, _redis_available
    if not _redis_available:
        return None
    if _redis is None:
        try:
            _redis = redis.from_url(
                os.environ.get("REDIS_URL", "redis://localhost:6379"),
                decode_responses=True,
            )
            await _redis.ping()
        except Exception:
            logger.warning("redis_unavailable")
            _redis_available = False
            _redis = None
    return _redis


async def cache_get(key: str):
    """Get value from cache. Returns None on miss or failure."""
    r = await get_redis()
    if not r:
        return None
    try:
        val = await r.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


async def cache_set(key: str, value, ttl: int = 3600):
    """Set value in cache with TTL (seconds)."""
    r = await get_redis()
    if not r:
        return
    try:
        await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass


async def cache_delete(key: str):
    """Delete key from cache."""
    r = await get_redis()
    if not r:
        return
    try:
        await r.delete(key)
    except Exception:
        pass


def make_cache_key(prefix: str, *args) -> str:
    """Generate a deterministic cache key."""
    raw = f"{prefix}:" + ":".join(str(a) for a in args)
    return hashlib.md5(raw.encode()).hexdigest()
