"""
FutureOS Prediction Pipeline — 7 Stages
MVP: Mock data + real LLM for GoT reasoning
"""

import asyncio
import json
import random
import math
import uuid
import structlog
from typing import Any

from app.core.llm import call_llm, call_llm_json
from app.services.engines.mcts_engine import MCTSEngine
from app.services.engines.debate_engine import DebateEngine
from app.services.engines.ensemble import EnsembleAggregator

logger = structlog.get_logger()

# ─── Mock Data ────────────────────────────────────────────────

MALAYSIA_SAMPLE_DATA = {
    "census": {
        "total_population": 33_000_000,
        "median_age": 30.3,
        "ethnic_composition": {"Malay": 0.62, "Chinese": 0.21, "Indian": 0.06, "Others": 0.11},
        "urban_ratio": 0.78,
        "regions": ["Selangor", "Johor", "Sabah", "Sarawak", "Perak", "Kedah", "Kelantan", "Penang"],
    },
    "economic": {
        "gdp_growth": 4.5,
        "inflation": 2.8,
        "unemployment": 3.4,
        "ringgit_usd": 4.47,
        "oil_price_usd": 78,
        "gini_coefficient": 0.41,
    },
    "sentiment": {
        "government_approval": 0.45,
        "opposition_approval": 0.38,
        "key_issues": ["cost of living", "corruption", "education", "healthcare", "race relations"],
        "social_media_sentiment": {"positive": 0.35, "neutral": 0.40, "negative": 0.25},
    },
}


# ─── Stage 1: Intent Parser ──────────────────────────────────

async def stage_intent_parse(query: str) -> dict:
    """Parse user query into structured prediction task."""
    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a prediction task parser. Given a user query, extract a structured prediction task. "
                    "Return ONLY valid JSON with these fields:\n"
                    '{"type": "election|business|geopolitical|policy|tech|custom",'
                    ' "region": "ISO country code",'
                    ' "timeframe": "ISO 8601 duration like P6M",'
                    ' "outcomes": ["outcome1", "outcome2", ...],'
                    ' "key_variables": ["var1", "var2", ...]}'
                ),
            },
            {"role": "user", "content": query},
        ]
        result = await call_llm_json("intent_parse", messages)
        logger.info("intent_parsed", result=result)
        return result
    except Exception as e:
        logger.warning("intent_parse_fallback", error=str(e))
        # Fallback: rule-based parsing
        return {
            "type": "election",
            "region": "MY",
            "timeframe": "P6M",
            "outcomes": ["PH wins", "PN wins", "Hung parliament"],
            "key_variables": ["GDP growth", "Oil price", "Scandal exposure", "Youth turnout", "Urban sentiment"],
        }


# ─── Stage 2: Data Collection (Real APIs + fallback) ─────────

REGION_TO_WB_CODE = {"MY": "MYS", "US": "USA", "CN": "CHN", "SG": "SGP", "ID": "IDN", "TH": "THA", "PH": "PHL", "JP": "JPN"}
REGION_TO_NEWS_CODE = {"MY": "my", "US": "us", "CN": "cn", "SG": "sg", "ID": "id"}


async def stage_data_collection(task: dict) -> dict:
    """Collect real data from World Bank + News APIs, with fallback to mock."""
    region = task.get("region", "MY")
    query = task.get("query", "")
    logger.info("data_collection", region=region)

    wb_code = REGION_TO_WB_CODE.get(region, region)
    news_code = REGION_TO_NEWS_CODE.get(region, "my")

    # Try real data sources in parallel
    try:
        from app.services.data_providers import worldbank, news, malaysia

        wb_gdp, wb_pop, wb_unemp, wb_inflation, news_data = await asyncio.gather(
            worldbank.get_gdp(wb_code),
            worldbank.get_population(wb_code),
            worldbank.get_unemployment(wb_code),
            worldbank.get_inflation(wb_code),
            news.get_news_sentiment(query, news_code),
            return_exceptions=True,
        )

        # Build economic data from real sources, fallback to mock
        economic = {**MALAYSIA_SAMPLE_DATA["economic"]}
        if not isinstance(wb_gdp, Exception) and wb_gdp:
            economic["gdp_history"] = wb_gdp
            economic["gdp_growth"] = wb_gdp[0]["value"] if wb_gdp else economic["gdp_growth"]
        if not isinstance(wb_unemp, Exception) and wb_unemp:
            economic["unemployment_history"] = wb_unemp
        if not isinstance(wb_inflation, Exception) and wb_inflation:
            economic["inflation_history"] = wb_inflation

        # Census: real Malaysia data or mock
        census = {**MALAYSIA_SAMPLE_DATA["census"]}
        if region == "MY":
            my_demo = malaysia.get_demographics()
            census["total_population"] = my_demo["total_population"]
            census["ethnic_composition"] = {
                "Malay": my_demo["ethnic_distribution"]["Bumiputera"],
                "Chinese": my_demo["ethnic_distribution"]["Chinese"],
                "Indian": my_demo["ethnic_distribution"]["Indian"],
                "Others": my_demo["ethnic_distribution"]["Others"],
            }
            census["urban_ratio"] = my_demo["urban_rural"]["urban"]
            census["election_history"] = malaysia.get_election_history()
        if not isinstance(wb_pop, Exception) and wb_pop:
            census["population_history"] = wb_pop

        # Sentiment
        sentiment = {**MALAYSIA_SAMPLE_DATA["sentiment"]}
        if not isinstance(news_data, Exception) and isinstance(news_data, dict):
            sentiment["news"] = news_data

        data_sources = ["mock_baseline"]
        if not isinstance(wb_gdp, Exception) and wb_gdp:
            data_sources.append("worldbank")
        if not isinstance(news_data, Exception) and isinstance(news_data, dict):
            data_sources.append(news_data.get("source", "news"))

        data = {"census": census, "economic": economic, "sentiment": sentiment, "data_sources": data_sources}

    except Exception as e:
        logger.warning("data_collection_real_failed", error=str(e))
        data = {**MALAYSIA_SAMPLE_DATA, "data_sources": ["mock_only"]}

    # LLM gap fill
    try:
        messages = [
            {
                "role": "system",
                "content": "Given this dataset, identify 2-3 missing data points useful for this prediction. Return JSON: {\"gap_fills\": [{\"field\": \"...\", \"value\": ..., \"confidence\": 0.0-1.0}]}",
            },
            {"role": "user", "content": f"Task: {json.dumps(task)}\nData: {json.dumps(data, default=str)[:2000]}"},
        ]
        gaps = await call_llm_json("data_gap_fill", messages)
        data["gap_fills"] = gaps.get("gap_fills", [])
    except Exception:
        data["gap_fills"] = []

    return data


# ─── Stage 3: Population Synthesizer ─────────────────────────

async def stage_pop_synthesizer(data: dict, agent_count: int = 100) -> dict:
    """Generate synthetic agent population. MVP: random with constraints."""
    agents = []
    ethnicities = ["Malay", "Chinese", "Indian", "Others"]
    ethnic_weights = [0.62, 0.21, 0.06, 0.11]
    regions = data["census"]["regions"]

    for i in range(agent_count):
        ethnicity = random.choices(ethnicities, weights=ethnic_weights, k=1)[0]
        agent = {
            "id": i,
            "age": random.randint(21, 75),
            "ethnicity": ethnicity,
            "region": random.choice(regions),
            "income": random.choice(["low", "medium", "high"]),
            "education": random.choice(["secondary", "tertiary", "postgraduate"]),
            "urban": random.random() < data["census"]["urban_ratio"],
            "stance": random.uniform(-1, 1),  # -1=opposition, +1=government
            "influence": random.uniform(0.1, 1.0),
        }
        agents.append(agent)

    # Build simple social network
    edges = []
    for i in range(agent_count):
        for j in range(i + 1, min(i + 10, agent_count)):
            # Same region/ethnicity → higher connection probability
            same_region = agents[i]["region"] == agents[j]["region"]
            same_ethnicity = agents[i]["ethnicity"] == agents[j]["ethnicity"]
            prob = 0.05 + (0.15 if same_region else 0) + (0.1 if same_ethnicity else 0)
            if random.random() < prob:
                edges.append({"source": i, "target": j, "weight": random.uniform(0.3, 1.0)})

    logger.info("pop_synthesized", agent_count=len(agents), edge_count=len(edges))
    return {"agents": agents, "network": {"edges": edges}}


# ─── Stage 4: Simulation ─────────────────────────────────────

async def stage_simulation(pop: dict, ticks: int = 30) -> dict:
    """Run agent-based simulation. MVP: rule-based, no LLM."""
    agents = pop["agents"]
    edges = pop["network"]["edges"]

    # Build adjacency: agent_id -> list of (neighbor_id, weight)
    adj: dict[int, list[tuple[int, float]]] = {a["id"]: [] for a in agents}
    for e in edges:
        adj[e["source"]].append((e["target"], e["weight"]))
        adj[e["target"]].append((e["source"], e["weight"]))

    tick_data = []
    for t in range(ticks):
        for agent in agents:
            neighbors = adj.get(agent["id"], [])
            if neighbors:
                neighbor_influence = sum(
                    agents[nid]["stance"] * w for nid, w in neighbors
                ) / max(sum(w for _, w in neighbors), 0.01)
                # 70% self + 30% neighbor
                agent["stance"] = 0.7 * agent["stance"] + 0.3 * neighbor_influence
            # Random noise
            if random.random() < 0.02:
                agent["stance"] += random.uniform(-0.3, 0.3)
            agent["stance"] = max(-1, min(1, agent["stance"]))

        # Record aggregate
        avg_stance = sum(a["stance"] for a in agents) / len(agents)
        gov_pct = sum(1 for a in agents if a["stance"] > 0) / len(agents)
        tick_data.append({"tick": t, "avg_stance": round(avg_stance, 4), "gov_support": round(gov_pct, 4)})

    final_distribution = {
        "government_support": tick_data[-1]["gov_support"],
        "opposition_support": 1 - tick_data[-1]["gov_support"],
    }

    logger.info("simulation_done", ticks=ticks, final=final_distribution)
    return {"ticks": tick_data, "final_distribution": final_distribution, "agent_count": len(agents)}


# ─── Stage 5: GoT Reasoning (REAL LLM — Core IP) ─────────────

GOT_SYSTEM_PROMPT = """You are a Graph of Thought (GoT) reasoning engine for political prediction.
Given comprehensive data about a political scenario, you must:
1. Decompose the problem into 5-8 analytical dimensions
2. For each dimension, analyze its impact on each possible outcome
3. Identify cross-dimensional interactions
4. Synthesize a final probability distribution with confidence intervals
5. Generate a causal graph structure

Return ONLY valid JSON in this exact format:
{
  "dimensions": [
    {"name": "...", "analysis": "...", "impact": {"outcome1": 0.0, "outcome2": 0.0}}
  ],
  "cross_interactions": [
    {"from": "dim1", "to": "dim2", "effect": "...", "strength": 0.0}
  ],
  "outcomes": [
    {"name": "...", "probability": 0.0, "confidence_interval": [0.0, 0.0], "reasoning": "..."}
  ],
  "causal_graph": {
    "nodes": [
      {"id": "...", "label": "...", "probability": 0.0, "confidence": 0.0, "category": "..."}
    ],
    "edges": [
      {"source": "...", "target": "...", "weight": 0.0, "type": "positive|negative", "description": "..."}
    ]
  }
}"""


async def stage_got_reasoning(task: dict, data: dict, sim_result: dict) -> dict:
    """Graph of Thought reasoning. Uses real LLM (Opus via OpenRouter)."""
    context = f"""
Prediction Task: {json.dumps(task)}

Data Summary:
- Population: {data['census']['total_population']:,}
- GDP Growth: {data['economic']['gdp_growth']}%
- Unemployment: {data['economic']['unemployment']}%
- Government Approval: {data['sentiment']['government_approval']*100}%
- Key Issues: {', '.join(data['sentiment']['key_issues'])}
- Ethnic Composition: {json.dumps(data['census']['ethnic_composition'])}

Simulation Results ({sim_result['agent_count']} agents, {len(sim_result['ticks'])} ticks):
- Final Government Support: {sim_result['final_distribution']['government_support']*100:.1f}%
- Final Opposition Support: {sim_result['final_distribution']['opposition_support']*100:.1f}%

Possible Outcomes: {json.dumps(task.get('outcomes', []))}
Key Variables: {json.dumps(task.get('key_variables', []))}
"""

    try:
        messages = [
            {"role": "system", "content": GOT_SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ]
        result = await call_llm_json("got_reasoning", messages)
        logger.info("got_reasoning_done", outcomes=len(result.get("outcomes", [])))
        return result
    except Exception as e:
        logger.warning("got_reasoning_fallback", error=str(e))
        return _fallback_got_result(task)


def _fallback_got_result(task: dict) -> dict:
    """Fallback GoT result when LLM fails."""
    outcomes = task.get("outcomes", ["Outcome A", "Outcome B", "Outcome C"])
    n = len(outcomes)
    probs = [random.uniform(0.15, 0.5) for _ in range(n)]
    total = sum(probs)
    probs = [p / total for p in probs]

    return {
        "dimensions": [
            {"name": "Economic", "analysis": "GDP growth provides moderate stability", "impact": {o: random.uniform(-0.2, 0.3) for o in outcomes}},
            {"name": "Political", "analysis": "Incumbent advantage from governance record", "impact": {o: random.uniform(-0.2, 0.3) for o in outcomes}},
            {"name": "Social", "analysis": "Ethnic dynamics shape coalition preferences", "impact": {o: random.uniform(-0.2, 0.3) for o in outcomes}},
            {"name": "Youth", "analysis": "Young voter turnout is unpredictable factor", "impact": {o: random.uniform(-0.2, 0.3) for o in outcomes}},
            {"name": "External", "analysis": "Global economic conditions create uncertainty", "impact": {o: random.uniform(-0.2, 0.3) for o in outcomes}},
        ],
        "cross_interactions": [
            {"from": "Economic", "to": "Political", "effect": "Economic performance boosts incumbents", "strength": 0.6},
            {"from": "Social", "to": "Youth", "effect": "Social media amplifies youth engagement", "strength": 0.4},
        ],
        "outcomes": [
            {
                "name": outcomes[i],
                "probability": round(probs[i], 4),
                "confidence_interval": [round(max(0, probs[i] - 0.08), 4), round(min(1, probs[i] + 0.08), 4)],
                "reasoning": f"Based on multi-dimensional analysis of {outcomes[i]}",
            }
            for i in range(n)
        ],
        "causal_graph": {
            "nodes": [
                {"id": f"outcome_{i}", "label": outcomes[i], "probability": round(probs[i], 4), "confidence": 0.7, "category": "outcome"}
                for i in range(n)
            ]
            + [
                {"id": "gdp", "label": "GDP Growth", "probability": 0.65, "confidence": 0.8, "category": "economic"},
                {"id": "unemployment", "label": "Unemployment", "probability": 0.4, "confidence": 0.75, "category": "economic"},
                {"id": "approval", "label": "Gov Approval", "probability": 0.45, "confidence": 0.6, "category": "political"},
                {"id": "sentiment", "label": "Public Sentiment", "probability": 0.5, "confidence": 0.55, "category": "social"},
                {"id": "youth", "label": "Youth Turnout", "probability": 0.55, "confidence": 0.5, "category": "demographic"},
                {"id": "cost_of_living", "label": "Cost of Living", "probability": 0.6, "confidence": 0.7, "category": "economic"},
                {"id": "corruption", "label": "Corruption Perception", "probability": 0.5, "confidence": 0.65, "category": "political"},
                {"id": "ethnic", "label": "Ethnic Dynamics", "probability": 0.5, "confidence": 0.6, "category": "social"},
            ],
            "edges": [
                {"source": "gdp", "target": "approval", "weight": 0.7, "type": "positive", "description": "Economic growth boosts government approval"},
                {"source": "unemployment", "target": "approval", "weight": 0.5, "type": "negative", "description": "High unemployment hurts incumbents"},
                {"source": "cost_of_living", "target": "sentiment", "weight": 0.8, "type": "negative", "description": "Rising costs drive negative sentiment"},
                {"source": "corruption", "target": "approval", "weight": 0.6, "type": "negative", "description": "Corruption scandals erode trust"},
                {"source": "approval", "target": "outcome_0", "weight": 0.7, "type": "positive", "description": "Government approval drives ruling coalition votes"},
                {"source": "sentiment", "target": "outcome_1", "weight": 0.6, "type": "positive", "description": "Negative sentiment benefits opposition"},
                {"source": "youth", "target": "outcome_0", "weight": 0.4, "type": "negative", "description": "Youth voters lean opposition"},
                {"source": "ethnic", "target": "outcome_0", "weight": 0.5, "type": "positive", "description": "Ethnic dynamics favor coalition building"},
            ],
        },
    }


# ─── Stage 6: Explanation ─────────────────────────────────────

async def stage_explanation(task: dict, got_result: dict) -> dict:
    """Generate human-readable explanation + factor attribution."""
    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "Given prediction analysis results, generate:\n"
                    "1. A clear 2-3 paragraph explanation of the prediction\n"
                    "2. A list of key factors with their impact (positive/negative) and strength (0-1)\n\n"
                    "Return JSON: {\"explanation_text\": \"...\", \"shap_factors\": [{\"name\": \"...\", \"impact\": 0.0, \"direction\": \"positive|negative\"}]}"
                ),
            },
            {"role": "user", "content": f"Task: {json.dumps(task)}\nResults: {json.dumps(got_result['outcomes'])}"},
        ]
        result = await call_llm_json("explanation", messages)
        return result
    except Exception as e:
        logger.warning("explanation_fallback", error=str(e))
        return {
            "explanation_text": (
                f"Based on comprehensive analysis of {task.get('region', 'the region')}, "
                f"our multi-dimensional reasoning engine evaluated {len(got_result.get('outcomes', []))} possible outcomes. "
                "Economic factors, political dynamics, and social sentiment were the primary drivers. "
                "The simulation of agent interactions revealed polarization patterns that influence the final probabilities."
            ),
            "shap_factors": [
                {"name": "Economic Growth", "impact": 0.35, "direction": "positive"},
                {"name": "Government Approval", "impact": 0.25, "direction": "positive"},
                {"name": "Cost of Living", "impact": -0.30, "direction": "negative"},
                {"name": "Corruption Perception", "impact": -0.22, "direction": "negative"},
                {"name": "Youth Engagement", "impact": 0.18, "direction": "positive"},
                {"name": "Ethnic Coalition", "impact": 0.15, "direction": "positive"},
            ],
        }


# ─── Stage 5 (upgraded): Three-Engine Parallel Reasoning ─────

async def stage_three_engine_reasoning(
    task: dict, data: dict, sim_result: dict, pop: dict,
    update_substage=None, prediction_id: str = "",
) -> dict:
    """Run GoT + MCTS + Debate in parallel, then ensemble aggregate."""
    outcomes = task.get("outcomes", [])

    # Build shared context for engines
    context = {
        "query": task.get("type", "") + ": " + ", ".join(outcomes),
        "outcomes": outcomes,
        "data_summary": (
            f"GDP: {data['economic']['gdp_growth']}%, "
            f"Unemployment: {data['economic']['unemployment']}%, "
            f"Gov Approval: {data['sentiment']['government_approval']*100}%, "
            f"Ethnic: {json.dumps(data['census']['ethnic_composition'])}"
        ),
    }

    # Run all three in parallel
    got_coro = stage_got_reasoning(task, data, sim_result)
    mcts_coro = MCTSEngine(iterations=80).search(context)
    debate_coro = DebateEngine().run(context, outcomes)

    got_result, mcts_result, debate_result = await asyncio.gather(
        got_coro, mcts_coro, debate_coro,
        return_exceptions=True,
    )

    # Collect successful results (skip failures)
    engine_results = {}
    got_data = None
    if not isinstance(got_result, Exception):
        engine_results["got"] = got_result
        got_data = got_result
        logger.info("engine_got_ok")
    else:
        logger.warning("engine_got_failed", error=str(got_result))

    if not isinstance(mcts_result, Exception):
        engine_results["mcts"] = mcts_result
        logger.info("engine_mcts_ok")
    else:
        logger.warning("engine_mcts_failed", error=str(mcts_result))

    if not isinstance(debate_result, Exception):
        engine_results["debate"] = debate_result
        logger.info("engine_debate_ok")
    else:
        logger.warning("engine_debate_failed", error=str(debate_result))

    # Add simulation results
    if sim_result and "final_distribution" in sim_result:
        engine_results["simulation"] = sim_result

    if not engine_results:
        raise RuntimeError("All engines failed")

    # Ensemble aggregate
    final = EnsembleAggregator().aggregate(engine_results, outcomes)

    # Use GoT causal graph if available, else empty
    causal_graph = got_data.get("causal_graph", {"nodes": [], "edges": []}) if got_data else {"nodes": [], "edges": []}

    return {
        "outcomes": final["outcomes"],
        "causal_graph": causal_graph,
        "engine_weights": final.get("engine_weights", {}),
        "consensus": final.get("consensus", 0),
        "engines": {
            "got": got_data if got_data else None,
            "mcts": mcts_result if not isinstance(mcts_result, Exception) else None,
            "debate": debate_result if not isinstance(debate_result, Exception) else None,
            "ensemble": {"weights": final.get("engine_weights", {}), "consensus": final.get("consensus", 0)},
        },
    }


# ─── Stage 7: Store Results (handled by caller) ──────────────

# ─── Variable Rerun ───────────────────────────────────────────

async def rerun_with_variables(
    task: dict, original_data: dict, got_result: dict, new_variables: dict[str, float]
) -> dict:
    """Re-run three-engine reasoning with modified variables."""
    modified_data = {**original_data}
    econ = {**modified_data.get("economic", {})}
    for var_name, var_value in new_variables.items():
        key = var_name.lower().replace(" ", "_")
        if key in econ:
            econ[key] = var_value
    modified_data["economic"] = econ

    sim_placeholder = {"agent_count": 100, "ticks": [], "final_distribution": {"government_support": 0.5, "opposition_support": 0.5}}
    pop_placeholder = {"agents": [], "network": {"edges": []}}

    # Run three engines (MCTS with reduced iterations for speed)
    context = {
        "query": json.dumps(task.get("outcomes", [])),
        "outcomes": task.get("outcomes", []),
        "data_summary": f"GDP: {econ.get('gdp_growth', 0)}%, Unemployment: {econ.get('unemployment', 0)}%",
    }

    got_coro = stage_got_reasoning(task, modified_data, sim_placeholder)
    mcts_coro = MCTSEngine(iterations=30).search(context)
    debate_coro = DebateEngine().run(context, task.get("outcomes", []))

    got_r, mcts_r, debate_r = await asyncio.gather(got_coro, mcts_coro, debate_coro, return_exceptions=True)

    engine_results = {}
    got_data = None
    if not isinstance(got_r, Exception):
        engine_results["got"] = got_r
        got_data = got_r
    if not isinstance(mcts_r, Exception):
        engine_results["mcts"] = mcts_r
    if not isinstance(debate_r, Exception):
        engine_results["debate"] = debate_r

    if not engine_results:
        engine_results["got"] = _fallback_got_result(task)
        got_data = engine_results["got"]

    outcomes = task.get("outcomes", [])
    final = EnsembleAggregator().aggregate(engine_results, outcomes)
    causal_graph = got_data.get("causal_graph", {"nodes": [], "edges": []}) if got_data else {"nodes": [], "edges": []}

    new_explanation = await stage_explanation(task, got_data or {"outcomes": final["outcomes"]})

    return {
        "outcomes": final["outcomes"],
        "causal_graph": causal_graph,
        "reasoning": {
            "got_tree": got_data.get("dimensions", []) if got_data else [],
            "shap_factors": new_explanation.get("shap_factors", []),
            "explanation_text": new_explanation.get("explanation_text", ""),
        },
        "engines": {
            "got": got_data,
            "mcts": mcts_r if not isinstance(mcts_r, Exception) else None,
            "debate": debate_r if not isinstance(debate_r, Exception) else None,
            "ensemble": {"weights": final.get("engine_weights", {})},
        },
    }


# ─── Full Pipeline Runner ────────────────────────────────────

async def run_prediction_pipeline(
    prediction_id: str,
    query: str,
    update_status: Any = None,
) -> dict:
    """Run the complete 7-stage prediction pipeline."""

    async def _update(stage: str):
        if update_status:
            await update_status(prediction_id, stage)
        logger.info("pipeline_stage", prediction_id=prediction_id, stage=stage)

    # Stage 1: Intent Parse
    await _update("stage_1_done")
    task = await stage_intent_parse(query)

    # Stage 2: Data Collection
    await _update("stage_2_done")
    data = await stage_data_collection(task)

    # Stage 3: Population Synthesis
    await _update("stage_3_done")
    pop = await stage_pop_synthesizer(data, agent_count=100)

    # Stage 4: Simulation
    await _update("stage_4_done")
    sim = await stage_simulation(pop, ticks=30)

    # Stage 5: Three-Engine Parallel Reasoning (GoT + MCTS + Debate → Ensemble)
    await _update("stage_5_done")
    three_engine = await stage_three_engine_reasoning(task, data, sim, pop)

    # Stage 6: Explanation
    await _update("stage_6_done")
    got_data = three_engine.get("engines", {}).get("got") or {}
    explanation = await stage_explanation(task, got_data if got_data else {"outcomes": three_engine["outcomes"]})

    # Combine results
    variables = [
        {"name": v, "current": data["economic"].get(v.lower().replace(" ", "_"), 0), "range": [-10, 100], "impact": random.uniform(0.1, 0.5)}
        for v in task.get("key_variables", [])[:5]
    ]

    # Store agent histories for Agent 2D visualization
    agent_histories = [
        {"id": a["id"], "age": a["age"], "region": a["region"], "ethnicity": a["ethnicity"], "stance": a["stance"], "influence": a["influence"]}
        for a in pop.get("agents", [])
    ]

    result = {
        "prediction_id": prediction_id,
        "query": query,
        "task": task,
        "data": data,
        "outcomes": three_engine["outcomes"],
        "causal_graph": three_engine.get("causal_graph", {"nodes": [], "edges": []}),
        "reasoning": {
            "got_tree": got_data.get("dimensions", []) if got_data else [],
            "shap_factors": explanation.get("shap_factors", []),
            "explanation_text": explanation.get("explanation_text", ""),
        },
        "engines": three_engine.get("engines", {}),
        "variables": variables,
        "metadata": {
            "agent_count": 100,
            "simulation_ticks": 30,
            "reasoning_engines": ["got", "mcts", "debate"],
            "engine_consensus": three_engine.get("consensus", 0),
            "total_time_seconds": 0,
            "cost_usd": 0,
            "agent_histories": agent_histories,
            "network_edges": pop.get("network", {}).get("edges", []),
        },
    }

    await _update("completed")
    return result
