from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from app.core.llm import call_llm, call_llm_json, TASK_MODEL, Models


def test_task_model_mapping():
    """Verify task→model mapping is correct per blueprint."""
    assert TASK_MODEL["intent_parse"] == Models.SONNET
    assert TASK_MODEL["got_reasoning"] == Models.OPUS
    assert TASK_MODEL["persona_generate"] == Models.HAIKU
    assert TASK_MODEL["sentiment_analysis"] == Models.FLASH
    assert TASK_MODEL["translation"] == Models.DEEPSEEK
    assert TASK_MODEL["causal_discovery"] == Models.OPUS


@pytest.mark.asyncio
async def test_call_llm_selects_correct_model():
    """call_llm should route to the correct model based on task."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "test response"

    with patch("app.core.llm.client") as mock_client:
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        result = await call_llm("intent_parse", [{"role": "user", "content": "test"}])

        assert result == "test response"
        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs["model"] == Models.SONNET


@pytest.mark.asyncio
async def test_call_llm_default_model():
    """Unknown task should default to HAIKU."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "ok"

    with patch("app.core.llm.client") as mock_client:
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        await call_llm("unknown_task", [{"role": "user", "content": "test"}])

        call_args = mock_client.chat.completions.create.call_args
        assert call_args.kwargs["model"] == Models.HAIKU


@pytest.mark.asyncio
async def test_call_llm_json():
    """call_llm_json should parse JSON from LLM response."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '```json\n{"key": "value"}\n```'

    with patch("app.core.llm.client") as mock_client:
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        result = await call_llm_json("intent_parse", [{"role": "user", "content": "test"}])

        assert result == {"key": "value"}
