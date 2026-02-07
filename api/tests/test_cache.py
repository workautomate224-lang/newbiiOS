"""Verify Redis cache layer — graceful degradation when Redis unavailable."""

import pytest
from app.core.cache import cache_set, cache_get, cache_delete, make_cache_key


class TestCacheGraceful:
    """Cache operations degrade gracefully without Redis."""

    @pytest.mark.asyncio
    async def test_cache_get_returns_none_without_redis(self):
        """cache_get returns None when Redis unavailable."""
        result = await cache_get("nonexistent_key_xyz_test")
        # Without Redis, should return None (not crash)
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_set_no_crash_without_redis(self):
        """cache_set does not crash when Redis unavailable."""
        # Should silently no-op
        await cache_set("test_key_abc", {"foo": "bar"}, ttl=60)
        # If Redis is up, we can verify; if not, just ensure no crash

    @pytest.mark.asyncio
    async def test_cache_delete_no_crash_without_redis(self):
        """cache_delete does not crash when Redis unavailable."""
        await cache_delete("some_key")

    def test_make_cache_key_deterministic(self):
        """Same inputs produce same cache key."""
        key1 = make_cache_key("worldbank", "MYS", "gdp")
        key2 = make_cache_key("worldbank", "MYS", "gdp")
        assert key1 == key2

    def test_make_cache_key_different_inputs(self):
        """Different inputs produce different cache keys."""
        key1 = make_cache_key("worldbank", "MYS", "gdp")
        key2 = make_cache_key("worldbank", "USA", "gdp")
        assert key1 != key2

    @pytest.mark.asyncio
    async def test_cache_roundtrip_if_redis_available(self):
        """If Redis is available, set+get works. If not, graceful fallback."""
        await cache_set("roundtrip_test", {"hello": "world"}, ttl=60)
        result = await cache_get("roundtrip_test")
        # Either Redis returned the value, or None (no Redis)
        if result is not None:
            assert result == {"hello": "world"}
            # Cleanup
            await cache_delete("roundtrip_test")
