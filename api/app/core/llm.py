"""
OpenRouter LLM wrapper with timeout, retry, and cost tracking.
All LLM calls go through this module.
"""

import asyncio
import json
import time
import structlog
from openai import AsyncOpenAI
from app.core.config import settings

logger = structlog.get_logger()

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key or "sk-placeholder",
    default_headers={
        "HTTP-Referer": "https://futureos.app",
        "X-Title": "FutureOS",
    },
)


class Models:
    OPUS = "anthropic/claude-opus-4"
    SONNET = "anthropic/claude-sonnet-4"
    HAIKU = "anthropic/claude-haiku"
    FLASH = "google/gemini-2.0-flash-001"
    DEEPSEEK = "deepseek/deepseek-chat"


TASK_MODEL = {
    "intent_parse": Models.SONNET,
    "persona_generate": Models.HAIKU,
    "data_gap_fill": Models.SONNET,
    "sentiment_analysis": Models.FLASH,
    "got_reasoning": Models.OPUS,
    "mcts_evaluate": Models.SONNET,
    "debate": Models.SONNET,
    "explanation": Models.SONNET,
    "causal_discovery": Models.OPUS,
    "report_writing": Models.SONNET,
    "quality_check": Models.HAIKU,
    "translation": Models.DEEPSEEK,
    "schema_mapping": Models.FLASH,
}

# Cost tracking
_cost_log: list[dict] = []
_start_time = time.time()


def get_cost_log() -> list[dict]:
    """Return the cost log for admin dashboard."""
    return _cost_log


def get_uptime_seconds() -> float:
    return time.time() - _start_time


async def call_llm(task: str, messages: list, timeout: int = 60, max_retries: int = 2, **kwargs) -> str:
    """Unified LLM call with timeout, retry, and fallback to faster model."""
    model = TASK_MODEL.get(task, Models.HAIKU)
    logger.info("llm_call", task=task, model=model)

    for attempt in range(max_retries + 1):
        try:
            result = await asyncio.wait_for(
                _do_call(task, model, messages, **kwargs),
                timeout=timeout,
            )
            return result
        except asyncio.TimeoutError:
            logger.warning("llm_timeout", task=task, model=model, attempt=attempt)
            if attempt < max_retries:
                # Fallback to faster model on timeout
                model = Models.HAIKU
                timeout = 30
                continue
            raise
        except Exception as e:
            logger.warning("llm_error", task=task, error=str(e), attempt=attempt)
            if attempt < max_retries:
                await asyncio.sleep(1 * (attempt + 1))
                continue
            raise

    return ""


async def _do_call(task: str, model: str, messages: list, **kwargs) -> str:
    """Execute raw LLM call with cost tracking."""
    start = time.time()
    resp = await client.chat.completions.create(
        model=model,
        messages=messages,
        **kwargs,
    )
    elapsed = time.time() - start

    tokens_in = resp.usage.prompt_tokens if resp.usage else 0
    tokens_out = resp.usage.completion_tokens if resp.usage else 0

    _cost_log.append({
        "task": task,
        "model": model,
        "elapsed": round(elapsed, 2),
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "timestamp": time.time(),
    })

    # Keep log bounded
    if len(_cost_log) > 10000:
        _cost_log.pop(0)

    return resp.choices[0].message.content or ""


async def call_llm_json(task: str, messages: list, **kwargs) -> dict:
    """Call LLM and parse response as JSON."""
    text = await call_llm(task, messages, **kwargs)
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)
