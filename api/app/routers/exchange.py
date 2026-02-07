"""Exchange API routes — prediction market."""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user
from app.schemas.exchange import MarketCreate, PositionCreate, MarketResolve
from app.services.exchange.signal_fusion import SignalFusion
from app.services.exchange.reputation import (
    INITIAL_POINTS, calculate_potential_profit, calculate_payout,
    calculate_brier_score, calculate_reputation_score,
)

router = APIRouter(prefix="/api/v1/exchange", tags=["exchange"])

# In-memory stores for MVP
_markets: dict[str, dict] = {}
_positions: dict[str, dict] = {}
_price_history: dict[str, list] = {}  # market_id -> list of price records
_signal_snapshots: dict[str, list] = {}  # market_id -> list of snapshots
_anomaly_logs: list[dict] = []
_user_balances: dict[str, float] = {}  # user_id -> balance


def _get_balance(user_id: str) -> float:
    if user_id not in _user_balances:
        _user_balances[user_id] = INITIAL_POINTS
    return _user_balances[user_id]


# ─── Markets ───

@router.get("/markets")
async def list_markets(
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    status: Optional[str] = Query(None),
):
    """List markets with optional filtering."""
    markets = list(_markets.values())
    if category and category != "all":
        markets = [m for m in markets if m.get("category") == category]
    if status:
        markets = [m for m in markets if m.get("status") == status]
    if sort == "popular":
        markets.sort(key=lambda m: m.get("position_count", 0), reverse=True)
    else:
        markets.sort(key=lambda m: m.get("created_at", ""), reverse=True)

    # Add sample markets if empty
    if not markets:
        markets = [
            {
                "id": "demo-market-1",
                "title": "Will AI replace 30% of white-collar jobs by 2030?",
                "category": "tech",
                "status": "open",
                "position_count": 156,
                "top_outcome": {"name": "Yes", "probability": 0.35},
                "signals": {"ai": 0.35, "crowd": 0.42, "reputation": 0.38},
            },
            {
                "id": "demo-market-2",
                "title": "Bitcoin above $200K by end of 2026?",
                "category": "finance",
                "status": "open",
                "position_count": 89,
                "top_outcome": {"name": "Yes", "probability": 0.22},
                "signals": {"ai": 0.22, "crowd": 0.31, "reputation": 0.25},
            },
            {
                "id": "demo-market-3",
                "title": "2026 Malaysian General Election — ruling coalition wins?",
                "category": "politics",
                "status": "open",
                "position_count": 234,
                "top_outcome": {"name": "Yes", "probability": 0.58},
                "signals": {"ai": 0.58, "crowd": 0.52, "reputation": 0.55},
            },
        ]
    return markets


@router.get("/markets/{market_id}")
async def get_market(market_id: str):
    market = _markets.get(market_id)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    # Compute signals
    fusion = SignalFusion()
    ai_signal = market.get("ai_signal", {"outcomes": []})
    crowd_signal = _compute_crowd_signal(market_id)
    rep_signal = _compute_reputation_signal(market_id)
    fused = fusion.compute(ai_signal, crowd_signal, rep_signal)

    return {
        **market,
        "signals": fused,
    }


@router.post("/markets")
async def create_market(body: MarketCreate, user: dict = Depends(get_current_user)):
    market_id = str(uuid.uuid4())
    market = {
        "id": market_id,
        "prediction_id": body.prediction_id,
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "status": "open",
        "resolution": None,
        "close_at": body.close_at,
        "created_by": user["id"],
        "position_count": 0,
        "ai_signal": {"outcomes": [
            {"name": "Yes", "probability": 0.5},
            {"name": "No", "probability": 0.5},
        ]},
    }
    _markets[market_id] = market
    return market


# ─── Positions / Betting ───

@router.post("/markets/{market_id}/positions")
async def place_bet(market_id: str, body: PositionCreate, user: dict = Depends(get_current_user)):
    market = _markets.get(market_id)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    if market["status"] != "open":
        raise HTTPException(status_code=400, detail="Market is not open")

    balance = _get_balance(user["id"])
    if body.amount > balance:
        raise HTTPException(status_code=400, detail=f"Insufficient balance: {balance}")

    # Current price = current crowd probability for this outcome
    crowd = _compute_crowd_signal(market_id)
    price = next(
        (o["probability"] for o in crowd.get("outcomes", []) if o["name"] == body.outcome_name),
        0.5,
    )

    position_id = str(uuid.uuid4())
    position = {
        "id": position_id,
        "market_id": market_id,
        "user_id": user["id"],
        "outcome_name": body.outcome_name,
        "amount": body.amount,
        "price": price,
    }
    _positions[position_id] = position
    _user_balances[user["id"]] = balance - body.amount
    market["position_count"] = market.get("position_count", 0) + 1

    potential_profit = calculate_potential_profit(body.amount, price)

    return {
        **position,
        "potential_profit": potential_profit,
        "new_balance": _user_balances[user["id"]],
    }


@router.get("/markets/{market_id}/positions")
async def get_positions(market_id: str, user: dict = Depends(get_current_user)):
    positions = [p for p in _positions.values() if p["market_id"] == market_id and p["user_id"] == user["id"]]
    return positions


@router.get("/markets/{market_id}/orderbook")
async def get_orderbook(market_id: str):
    """Get bet volume distribution by outcome."""
    positions = [p for p in _positions.values() if p["market_id"] == market_id]
    orderbook: dict[str, float] = {}
    for p in positions:
        name = p["outcome_name"]
        orderbook[name] = orderbook.get(name, 0) + p["amount"]
    return {"outcomes": [{"name": k, "volume": v} for k, v in orderbook.items()]}


# ─── Signals ───

@router.get("/markets/{market_id}/signals")
async def get_signals(market_id: str):
    market = _markets.get(market_id)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    fusion = SignalFusion()
    ai_signal = market.get("ai_signal", {"outcomes": []})
    crowd_signal = _compute_crowd_signal(market_id)
    rep_signal = _compute_reputation_signal(market_id)
    result = fusion.compute(ai_signal, crowd_signal, rep_signal)
    return result


@router.get("/markets/{market_id}/price-history")
async def get_price_history(market_id: str):
    return _price_history.get(market_id, [])


# ─── Admin / Resolution ───

@router.post("/markets/{market_id}/resolve")
async def resolve_market(market_id: str, body: MarketResolve, user: dict = Depends(get_current_user)):
    market = _markets.get(market_id)
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    if market["status"] != "open":
        raise HTTPException(status_code=400, detail="Market already resolved")

    market["status"] = "resolved"
    market["resolution"] = body.resolution

    # Settle positions
    positions = [p for p in _positions.values() if p["market_id"] == market_id]
    results = []
    for pos in positions:
        is_correct = pos["outcome_name"] == body.resolution
        payout = calculate_payout(pos["amount"], pos["price"], is_correct)
        if payout > 0:
            _user_balances[pos["user_id"]] = _get_balance(pos["user_id"]) + payout
        results.append({
            "position_id": pos["id"],
            "user_id": pos["user_id"],
            "outcome": pos["outcome_name"],
            "is_correct": is_correct,
            "payout": payout,
        })

    return {"market_id": market_id, "resolution": body.resolution, "settlements": results}


@router.get("/anomalies")
async def get_anomalies():
    return _anomaly_logs


@router.get("/portfolio")
async def get_portfolio(user: dict = Depends(get_current_user)):
    """Get user's portfolio: balance + active positions + history."""
    balance = _get_balance(user["id"])
    positions = [p for p in _positions.values() if p["user_id"] == user["id"]]
    active = [p for p in positions if _markets.get(p["market_id"], {}).get("status") == "open"]
    settled = [p for p in positions if _markets.get(p["market_id"], {}).get("status") == "resolved"]

    return {
        "balance": balance,
        "active_positions": active,
        "settled_positions": settled,
        "total_invested": sum(p["amount"] for p in active),
    }


# ─── Helper functions ───

def _compute_crowd_signal(market_id: str) -> dict:
    """Compute crowd probability from bet distribution."""
    positions = [p for p in _positions.values() if p["market_id"] == market_id]
    if not positions:
        market = _markets.get(market_id, {})
        return market.get("ai_signal", {"outcomes": [{"name": "Yes", "probability": 0.5}, {"name": "No", "probability": 0.5}]})

    volumes: dict[str, float] = {}
    for p in positions:
        volumes[p["outcome_name"]] = volumes.get(p["outcome_name"], 0) + p["amount"]

    total = sum(volumes.values()) or 1
    outcomes = [{"name": k, "probability": round(v / total, 4)} for k, v in volumes.items()]
    return {"outcomes": outcomes, "total_volume": total}


def _compute_reputation_signal(market_id: str) -> dict:
    """Compute reputation-weighted probability from high-rep users."""
    from app.routers.users import _user_profiles

    positions = [p for p in _positions.values() if p["market_id"] == market_id]
    if not positions:
        market = _markets.get(market_id, {})
        return market.get("ai_signal", {"outcomes": [{"name": "Yes", "probability": 0.5}, {"name": "No", "probability": 0.5}]})

    # Weight by reputation
    weighted_volumes: dict[str, float] = {}
    for p in positions:
        profile = _user_profiles.get(p["user_id"], {})
        rep = profile.get("reputation_score", 100)
        weighted_volumes[p["outcome_name"]] = weighted_volumes.get(p["outcome_name"], 0) + p["amount"] * rep

    total = sum(weighted_volumes.values()) or 1
    outcomes = [{"name": k, "probability": round(v / total, 4)} for k, v in weighted_volumes.items()]
    return {"outcomes": outcomes}
