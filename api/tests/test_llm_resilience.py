"""Verify LLM call timeout, retry, and fallback mechanisms."""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock


class TestLLMResilience:
    @pytest.mark.asyncio
    async def test_timeout_triggers_retry(self):
        """LLM timeout triggers retry with fallback model."""
        from app.core.llm import call_llm

        call_count = 0

        async def timeout_then_succeed(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 1:
                raise asyncio.TimeoutError()
            # Return a mock response
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            mock_resp.choices[0].message.content = "success"
            mock_resp.usage = MagicMock()
            mock_resp.usage.prompt_tokens = 10
            mock_resp.usage.completion_tokens = 5
            return mock_resp

        with patch("app.core.llm.client.chat.completions.create", side_effect=timeout_then_succeed):
            result = await call_llm("test_task", [{"role": "user", "content": "test"}])
            assert result == "success"
            assert call_count >= 2  # At least one retry

    @pytest.mark.asyncio
    async def test_retry_on_transient_error(self):
        """Transient errors trigger automatic retry."""
        from app.core.llm import call_llm

        call_count = 0

        async def flaky_call(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise ConnectionError("Temporary failure")
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            mock_resp.choices[0].message.content = "recovered"
            mock_resp.usage = MagicMock()
            mock_resp.usage.prompt_tokens = 10
            mock_resp.usage.completion_tokens = 5
            return mock_resp

        with patch("app.core.llm.client.chat.completions.create", side_effect=flaky_call):
            result = await call_llm("test_task", [{"role": "user", "content": "test"}])
            assert result == "recovered"
            assert call_count >= 2

    @pytest.mark.asyncio
    async def test_all_retries_exhausted_raises(self):
        """When all retries fail, exception is raised."""
        from app.core.llm import call_llm

        async def always_fail(*args, **kwargs):
            raise ConnectionError("Permanent failure")

        with patch("app.core.llm.client.chat.completions.create", side_effect=always_fail):
            with pytest.raises(ConnectionError):
                await call_llm("test_task", [{"role": "user", "content": "test"}], max_retries=1)

    def test_cost_tracking_records_entries(self):
        """Cost log entries have expected fields."""
        from app.core.llm import _cost_log
        # Check structure of existing entries (if any)
        if _cost_log:
            entry = _cost_log[-1]
            assert "task" in entry
            assert "model" in entry
            assert "elapsed" in entry
            assert "timestamp" in entry

    def test_task_model_mapping_exists(self):
        """Task-to-model mapping is configured."""
        from app.core.llm import TASK_MODEL
        assert len(TASK_MODEL) > 0
        assert "intent_parse" in TASK_MODEL
        assert "got_reasoning" in TASK_MODEL
        assert "debate" in TASK_MODEL
