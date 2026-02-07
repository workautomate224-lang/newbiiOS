"""
Debate Engine — 5-role, 3-round structured debate.
Roles: Optimist, Pessimist, Contrarian, Historian, Judge
"""

import asyncio
import json
import structlog
from typing import Any

from app.core.llm import call_llm_json

logger = structlog.get_logger()

ROLES = {
    "optimist": "You are the Optimist. Find the most positive interpretation and best-case scenarios. Emphasize strengths, opportunities, and upward trends.",
    "pessimist": "You are the Pessimist. Identify risks, worst-case scenarios, and overlooked dangers. Emphasize weaknesses, threats, and downward trends.",
    "contrarian": "You are the Contrarian. Challenge conventional wisdom. Find hidden dynamics that most analysts miss. Question popular assumptions.",
    "historian": "You are the Historian. Draw parallels from historical events. Use past patterns to project likely outcomes. Reference specific historical analogies.",
}

JUDGE_PROMPT = """You are the Judge in a structured debate about a prediction.
You have heard arguments from 4 perspectives: Optimist, Pessimist, Contrarian, and Historian.
Synthesize all arguments into a final balanced assessment.

Return JSON:
{
  "probabilities": {"outcome_name": probability, ...},
  "reasoning": "2-3 paragraph synthesis",
  "key_arguments": [{"from": "role", "argument": "...", "weight": 0.0-1.0}],
  "confidence": 0.0-1.0
}"""


def _extract_json(text: str) -> dict:
    """Robust JSON extraction: try ```json``` block, then last {} block, then default."""
    text = text.strip()
    # Try ```json``` block
    if "```json" in text:
        parts = text.split("```json")
        if len(parts) > 1:
            json_part = parts[1].split("```")[0].strip()
            try:
                return json.loads(json_part)
            except json.JSONDecodeError:
                pass
    if "```" in text:
        parts = text.split("```")
        for part in parts[1::2]:
            clean = part.strip()
            if clean.startswith("json"):
                clean = clean[4:].strip()
            try:
                return json.loads(clean)
            except json.JSONDecodeError:
                continue

    # Try finding last {} block
    last_open = text.rfind("{")
    last_close = text.rfind("}")
    if last_open != -1 and last_close > last_open:
        try:
            return json.loads(text[last_open : last_close + 1])
        except json.JSONDecodeError:
            pass

    # Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


class DebateEngine:
    """Multi-role structured debate engine."""

    async def run(self, context: dict, outcomes: list[str]) -> dict:
        """Run 3-round debate and return results."""
        query = context.get("query", "")
        data_summary = context.get("data_summary", "")
        debate_log: list[dict] = []

        # Round 1: Independent opening statements (parallel)
        logger.info("debate_round_1_start")
        round1 = await self._round1_opening(query, data_summary, outcomes)
        debate_log.append({"round": 1, "type": "opening", "statements": round1})

        # Round 2: Rebuttals after seeing Round 1 (parallel)
        logger.info("debate_round_2_start")
        round2 = await self._round2_rebuttals(query, outcomes, round1)
        debate_log.append({"round": 2, "type": "rebuttal", "statements": round2})

        # Round 3: Judge synthesizes
        logger.info("debate_round_3_start")
        judgment = await self._round3_judgment(query, outcomes, round1, round2)
        debate_log.append({"round": 3, "type": "judgment", "result": judgment})

        # Build outcome probabilities
        outcome_probs = judgment.get("probabilities", {})
        if not outcome_probs and outcomes:
            n = len(outcomes)
            outcome_probs = {o: round(1.0 / n, 4) for o in outcomes}

        return {
            "engine": "debate",
            "outcome_probabilities": outcome_probs,
            "debate_log": debate_log,
            "consensus": judgment.get("confidence", 0.5),
            "key_arguments": judgment.get("key_arguments", []),
            "reasoning": judgment.get("reasoning", ""),
        }

    async def _round1_opening(
        self, query: str, data_summary: str, outcomes: list[str]
    ) -> dict[str, dict]:
        """Round 1: Each debater gives independent opening statement."""
        outcomes_str = json.dumps(outcomes)

        async def _debater_opening(role: str, prompt: str) -> tuple[str, dict]:
            try:
                messages = [
                    {
                        "role": "system",
                        "content": (
                            f"{prompt}\n\n"
                            f"Analyze this prediction question and provide your perspective.\n"
                            f"Possible outcomes: {outcomes_str}\n\n"
                            "Return JSON: {\"analysis\": \"...\", \"probabilities\": {\"outcome\": probability}, \"key_evidence\": [\"...\"]}"
                        ),
                    },
                    {"role": "user", "content": f"Question: {query}\nData: {data_summary}"},
                ]
                result = await call_llm_json("debate", messages)
                return role, result
            except Exception as e:
                logger.warning("debate_r1_fallback", role=role, error=str(e))
                default_probs = {o: round(1.0 / len(outcomes), 4) for o in outcomes} if outcomes else {}
                return role, {
                    "analysis": f"{role.title()} perspective on {query}",
                    "probabilities": default_probs,
                    "key_evidence": [f"General {role} analysis"],
                }

        tasks = [_debater_opening(role, prompt) for role, prompt in ROLES.items()]
        results = await asyncio.gather(*tasks)
        return {role: data for role, data in results}

    async def _round2_rebuttals(
        self, query: str, outcomes: list[str], round1: dict[str, dict]
    ) -> dict[str, dict]:
        """Round 2: Each debater rebuts after seeing Round 1."""
        round1_summary = json.dumps(
            {role: data.get("analysis", "")[:200] for role, data in round1.items()},
            ensure_ascii=False,
        )
        outcomes_str = json.dumps(outcomes)

        async def _debater_rebuttal(role: str, prompt: str) -> tuple[str, dict]:
            try:
                messages = [
                    {
                        "role": "system",
                        "content": (
                            f"{prompt}\n\n"
                            f"You've heard the opening statements. Now provide rebuttals.\n"
                            f"Possible outcomes: {outcomes_str}\n\n"
                            "Return JSON: {\"rebuttals\": [\"...\"], \"updated_probabilities\": {\"outcome\": probability}}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Question: {query}\nOpening statements: {round1_summary}",
                    },
                ]
                result = await call_llm_json("debate", messages)
                return role, result
            except Exception as e:
                logger.warning("debate_r2_fallback", role=role, error=str(e))
                r1_probs = round1.get(role, {}).get("probabilities", {})
                return role, {
                    "rebuttals": [f"{role.title()} maintains position"],
                    "updated_probabilities": r1_probs,
                }

        tasks = [_debater_rebuttal(role, prompt) for role, prompt in ROLES.items()]
        results = await asyncio.gather(*tasks)
        return {role: data for role, data in results}

    async def _round3_judgment(
        self,
        query: str,
        outcomes: list[str],
        round1: dict[str, dict],
        round2: dict[str, dict],
    ) -> dict:
        """Round 3: Judge synthesizes all arguments."""
        debate_summary = ""
        for role in ROLES:
            r1 = round1.get(role, {})
            r2 = round2.get(role, {})
            debate_summary += f"\n{role.upper()}:\n"
            debate_summary += f"  Opening: {r1.get('analysis', 'N/A')[:200]}\n"
            debate_summary += f"  Rebuttals: {json.dumps(r2.get('rebuttals', []))[:200]}\n"
            debate_summary += f"  Final probs: {json.dumps(r2.get('updated_probabilities', {}))}\n"

        outcomes_str = json.dumps(outcomes)
        try:
            messages = [
                {"role": "system", "content": JUDGE_PROMPT + f"\nPossible outcomes: {outcomes_str}"},
                {"role": "user", "content": f"Question: {query}\n\nDebate transcript:\n{debate_summary}"},
            ]
            result = await call_llm_json("debate", messages)
            return result
        except Exception as e:
            logger.warning("debate_judge_fallback", error=str(e))
            default_probs = {o: round(1.0 / len(outcomes), 4) for o in outcomes} if outcomes else {}
            return {
                "probabilities": default_probs,
                "reasoning": "Judge synthesis based on balanced consideration of all perspectives.",
                "key_arguments": [],
                "confidence": 0.5,
            }
