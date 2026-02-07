"""Tests for Exchange API and services."""

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings
from app.services.exchange.signal_fusion import SignalFusion
from app.services.exchange.reputation import (
    calculate_potential_profit, calculate_payout,
    calculate_brier_score, calculate_reputation_score,
)


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def auth_headers(user_id: str = "exchange-user") -> dict:
    token = jwt.encode(
        {"sub": user_id, "email": f"{user_id}@test.com", "role": "authenticated", "aud": "authenticated"},
        settings.supabase_anon_key or "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


# ─── Signal Fusion ───

class TestSignalFusion:
    def test_basic_fusion(self):
        fusion = SignalFusion()
        ai = {"outcomes": [{"name": "Yes", "probability": 0.6}, {"name": "No", "probability": 0.4}]}
        crowd = {"outcomes": [{"name": "Yes", "probability": 0.5}, {"name": "No", "probability": 0.5}]}
        rep = {"outcomes": [{"name": "Yes", "probability": 0.7}, {"name": "No", "probability": 0.3}]}
        result = fusion.compute(ai, crowd, rep)

        assert "fused" in result
        fused_outcomes = result["fused"]["outcomes"]
        total = sum(o["probability"] for o in fused_outcomes)
        assert abs(total - 1.0) < 0.01

    def test_anomaly_detection(self):
        fusion = SignalFusion()
        ai = {"outcomes": [{"name": "Yes", "probability": 0.8}]}
        crowd = {"outcomes": [{"name": "Yes", "probability": 0.3}]}  # >25% divergence
        rep = {"outcomes": [{"name": "Yes", "probability": 0.5}]}
        result = fusion.compute(ai, crowd, rep)

        assert len(result["anomalies"]) >= 1
        assert result["anomalies"][0]["type"] == "signal_divergence"

    def test_no_anomalies_when_aligned(self):
        fusion = SignalFusion()
        ai = {"outcomes": [{"name": "Yes", "probability": 0.5}]}
        crowd = {"outcomes": [{"name": "Yes", "probability": 0.55}]}
        rep = {"outcomes": [{"name": "Yes", "probability": 0.48}]}
        result = fusion.compute(ai, crowd, rep)
        assert len(result["anomalies"]) == 0

    def test_weights_correct(self):
        assert SignalFusion.WEIGHTS["ai"] == 0.50
        assert SignalFusion.WEIGHTS["crowd"] == 0.30
        assert SignalFusion.WEIGHTS["reputation"] == 0.20


# ─── Reputation ───

class TestReputation:
    def test_potential_profit(self):
        # Buy at 0.25, bet 100 → profit = 100 * (1/0.25 - 1) = 300
        assert calculate_potential_profit(100, 0.25) == 300.0

    def test_payout_correct(self):
        assert calculate_payout(100, 0.5, True) == 200.0  # 100 + 100
        assert calculate_payout(100, 0.5, False) == 0.0

    def test_brier_score(self):
        # Perfect predictions
        perfect = [{"price": 1.0, "is_correct": True}, {"price": 0.0, "is_correct": False}]
        assert calculate_brier_score(perfect) == 0.0

        # Worst predictions
        worst = [{"price": 0.0, "is_correct": True}, {"price": 1.0, "is_correct": False}]
        assert calculate_brier_score(worst) == 1.0

    def test_reputation_score(self):
        good = calculate_reputation_score(0.1, 20)
        bad = calculate_reputation_score(0.5, 5)
        assert good > bad


# ─── API ───

@pytest.mark.asyncio
async def test_list_markets(client: AsyncClient):
    resp = await client.get("/api/v1/exchange/markets")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_create_market(client: AsyncClient):
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Test Market", "category": "tech"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Test Market"


@pytest.mark.asyncio
async def test_place_bet(client: AsyncClient):
    # Create market
    market_resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Bet Test Market"},
        headers=auth_headers("bet-user"),
    )
    market_id = market_resp.json()["id"]

    # Place bet
    bet_resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 100},
        headers=auth_headers("bet-user"),
    )
    assert bet_resp.status_code == 200
    data = bet_resp.json()
    assert data["amount"] == 100
    assert data["new_balance"] == 900  # 1000 - 100


@pytest.mark.asyncio
async def test_insufficient_balance(client: AsyncClient):
    market_resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Balance Test"},
        headers=auth_headers("poor-user"),
    )
    market_id = market_resp.json()["id"]

    # Try to bet more than balance
    bet_resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 2000},
        headers=auth_headers("poor-user"),
    )
    assert bet_resp.status_code == 400


@pytest.mark.asyncio
async def test_resolve_market(client: AsyncClient):
    # Create + bet + resolve
    market_resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Resolve Test"},
        headers=auth_headers("resolve-user"),
    )
    market_id = market_resp.json()["id"]

    await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 50},
        headers=auth_headers("resolve-user"),
    )

    resolve_resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/resolve",
        json={"resolution": "Yes"},
        headers=auth_headers("resolve-user"),
    )
    assert resolve_resp.status_code == 200
    assert resolve_resp.json()["resolution"] == "Yes"
    settlements = resolve_resp.json()["settlements"]
    assert len(settlements) >= 1
    assert settlements[0]["is_correct"] is True


@pytest.mark.asyncio
async def test_portfolio(client: AsyncClient):
    resp = await client.get("/api/v1/exchange/portfolio", headers=auth_headers("portfolio-user"))
    assert resp.status_code == 200
    assert "balance" in resp.json()


@pytest.mark.asyncio
async def test_orderbook(client: AsyncClient):
    market_resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Orderbook Test"},
        headers=auth_headers("ob-user"),
    )
    market_id = market_resp.json()["id"]

    resp = await client.get(f"/api/v1/exchange/markets/{market_id}/orderbook")
    assert resp.status_code == 200
    assert "outcomes" in resp.json()
