"""Deep Exchange API tests — markets, betting, signals, settlement."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.exchange.signal_fusion import SignalFusion
from app.services.exchange.reputation import (
    INITIAL_POINTS, calculate_potential_profit, calculate_payout,
    calculate_brier_score, calculate_reputation_score,
)
from tests.conftest import make_auth_headers, TEST_USER_ID, TEST_USER_B_ID


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def auth_a():
    return make_auth_headers(user_id=TEST_USER_ID)


def auth_b():
    return make_auth_headers(user_id=TEST_USER_B_ID)


# ═══════ Markets ═══════

@pytest.mark.asyncio
async def test_create_market_returns_id(client: AsyncClient):
    """Creating market returns market_id."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Deep Test Market", "category": "tech", "prediction_id": "p1"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["status"] == "open"
    assert data["title"] == "Deep Test Market"


@pytest.mark.asyncio
async def test_list_markets_returns_list(client: AsyncClient):
    """List markets returns array."""
    resp = await client.get("/api/v1/exchange/markets")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_market_filter_by_category(client: AsyncClient):
    """Market list can be filtered by category."""
    # Create markets with different categories
    await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Tech Market", "category": "tech", "prediction_id": "p2"},
        headers=auth_a(),
    )
    await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Politics Market", "category": "politics", "prediction_id": "p3"},
        headers=auth_a(),
    )

    resp = await client.get("/api/v1/exchange/markets?category=tech")
    markets = resp.json()
    for m in markets:
        assert m.get("category") == "tech"


# ═══════ Betting ═══════

@pytest.mark.asyncio
async def test_place_bet_success(client: AsyncClient):
    """Successful bet deducts from balance."""
    # Create market
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Bet Market", "category": "finance", "prediction_id": "p4"},
        headers=auth_a(),
    )
    market_id = resp.json()["id"]

    # Place bet
    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 100},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == 100
    assert data["new_balance"] == INITIAL_POINTS - 100


@pytest.mark.asyncio
async def test_place_bet_insufficient_points(client: AsyncClient):
    """Bet exceeding balance returns 400."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Poor Market", "category": "finance", "prediction_id": "p5"},
        headers=auth_b(),
    )
    market_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": INITIAL_POINTS + 1},
        headers=auth_b(),
    )
    assert resp.status_code == 400
    assert "Insufficient" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_place_bet_market_closed(client: AsyncClient):
    """Betting on resolved market returns 400."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Closed Market", "category": "finance", "prediction_id": "p6"},
        headers=auth_a(),
    )
    market_id = resp.json()["id"]

    # Resolve market
    await client.post(
        f"/api/v1/exchange/markets/{market_id}/resolve",
        json={"resolution": "Yes"},
        headers=auth_a(),
    )

    # Try to bet
    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 50},
        headers=auth_a(),
    )
    assert resp.status_code == 400
    assert "not open" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_place_bet_nonexistent_market(client: AsyncClient):
    """Betting on non-existent market returns 404."""
    resp = await client.post(
        "/api/v1/exchange/markets/nonexistent-id/positions",
        json={"outcome_name": "Yes", "amount": 50},
        headers=auth_a(),
    )
    assert resp.status_code == 404


# ═══════ Signal Fusion ═══════

class TestSignalFusionDeep:
    def test_fusion_weights_sum_to_1(self):
        """Signal fusion weights sum to 1.0."""
        fusion = SignalFusion()
        assert abs(sum(fusion.WEIGHTS.values()) - 1.0) < 0.01

    def test_fusion_normalized_output(self):
        """Fused probabilities sum to 1.0."""
        fusion = SignalFusion()
        ai = {"outcomes": [{"name": "Y", "probability": 0.7}, {"name": "N", "probability": 0.3}]}
        crowd = {"outcomes": [{"name": "Y", "probability": 0.5}, {"name": "N", "probability": 0.5}]}
        rep = {"outcomes": [{"name": "Y", "probability": 0.6}, {"name": "N", "probability": 0.4}]}
        result = fusion.compute(ai, crowd, rep)
        total = sum(o["probability"] for o in result["fused"]["outcomes"])
        assert abs(total - 1.0) < 0.01

    def test_anomaly_signal_divergence(self):
        """Detects anomaly when AI and Crowd diverge >25%."""
        fusion = SignalFusion()
        ai = {"outcomes": [{"name": "Y", "probability": 0.9}, {"name": "N", "probability": 0.1}]}
        crowd = {"outcomes": [{"name": "Y", "probability": 0.3}, {"name": "N", "probability": 0.7}]}
        rep = {"outcomes": [{"name": "Y", "probability": 0.5}, {"name": "N", "probability": 0.5}]}
        result = fusion.compute(ai, crowd, rep)
        assert len(result.get("anomalies", [])) >= 1

    def test_no_anomalies_aligned(self):
        """No anomalies when signals are aligned."""
        fusion = SignalFusion()
        ai = {"outcomes": [{"name": "Y", "probability": 0.6}, {"name": "N", "probability": 0.4}]}
        crowd = {"outcomes": [{"name": "Y", "probability": 0.58}, {"name": "N", "probability": 0.42}]}
        rep = {"outcomes": [{"name": "Y", "probability": 0.62}, {"name": "N", "probability": 0.38}]}
        result = fusion.compute(ai, crowd, rep)
        assert len(result.get("anomalies", [])) == 0

    def test_crowd_signal_from_bets(self):
        """Crowd signal is derived from bet distribution."""
        fusion = SignalFusion()
        # When crowd has outcomes from betting, verify weighting
        ai = {"outcomes": [{"name": "Y", "probability": 0.5}, {"name": "N", "probability": 0.5}]}
        crowd = {"outcomes": [{"name": "Y", "probability": 0.8}, {"name": "N", "probability": 0.2}]}
        rep = {"outcomes": [{"name": "Y", "probability": 0.5}, {"name": "N", "probability": 0.5}]}
        result = fusion.compute(ai, crowd, rep)
        # Crowd at 30% weight, AI at 50% — fused should be between
        fused_y = next(o["probability"] for o in result["fused"]["outcomes"] if o["name"] == "Y")
        assert 0.5 < fused_y < 0.8


# ═══════ Settlement ═══════

@pytest.mark.asyncio
async def test_resolve_market_correct_bet(client: AsyncClient):
    """Correct bet receives payout."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Settlement Market", "category": "finance", "prediction_id": "p7"},
        headers=auth_a(),
    )
    market_id = resp.json()["id"]

    # Place bet on "Yes"
    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 100},
        headers=auth_a(),
    )
    balance_after_bet = resp.json()["new_balance"]

    # Resolve as "Yes"
    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/resolve",
        json={"resolution": "Yes"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    settlements = resp.json()["settlements"]
    assert len(settlements) >= 1
    assert settlements[0]["is_correct"] is True
    assert settlements[0]["payout"] > 0


@pytest.mark.asyncio
async def test_resolve_market_wrong_bet(client: AsyncClient):
    """Wrong bet gets 0 payout."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Wrong Bet Market", "category": "finance", "prediction_id": "p8"},
        headers=auth_a(),
    )
    market_id = resp.json()["id"]

    await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 50},
        headers=auth_a(),
    )

    # Resolve as "No" (opposite)
    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/resolve",
        json={"resolution": "No"},
        headers=auth_a(),
    )
    settlements = resp.json()["settlements"]
    assert settlements[0]["is_correct"] is False
    assert settlements[0]["payout"] == 0


@pytest.mark.asyncio
async def test_resolve_already_resolved(client: AsyncClient):
    """Cannot resolve already resolved market."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "Double Resolve", "category": "finance", "prediction_id": "p9"},
        headers=auth_a(),
    )
    market_id = resp.json()["id"]

    await client.post(
        f"/api/v1/exchange/markets/{market_id}/resolve",
        json={"resolution": "Yes"},
        headers=auth_a(),
    )

    resp = await client.post(
        f"/api/v1/exchange/markets/{market_id}/resolve",
        json={"resolution": "No"},
        headers=auth_a(),
    )
    assert resp.status_code == 400


# ═══════ Reputation ═══════

class TestReputationDeep:
    def test_potential_profit_calculation(self):
        """Potential profit = amount * (1/price - 1)."""
        profit = calculate_potential_profit(100, 0.5)
        assert profit == 100.0  # 100 * (1/0.5 - 1) = 100

    def test_payout_correct(self):
        """Correct bet returns amount + profit."""
        payout = calculate_payout(100, 0.5, True)
        assert payout == 200.0  # 100 + 100

    def test_payout_wrong(self):
        """Wrong bet returns 0."""
        payout = calculate_payout(100, 0.5, False)
        assert payout == 0

    def test_brier_score_perfect(self):
        """Perfect predictions give Brier score of 0."""
        predictions = [
            {"price": 1.0, "is_correct": True},
            {"price": 0.0, "is_correct": False},
        ]
        score = calculate_brier_score(predictions)
        assert score == 0.0

    def test_brier_score_worst(self):
        """Worst predictions give Brier score of 1."""
        predictions = [
            {"price": 1.0, "is_correct": False},
            {"price": 0.0, "is_correct": True},
        ]
        score = calculate_brier_score(predictions)
        assert score == 1.0

    def test_reputation_score_formula(self):
        """Reputation score follows formula: 1000*(1-brier) + log(count+1)*50."""
        import math
        score = calculate_reputation_score(0.2, 10)
        expected = 1000 * (1 - 0.2) + math.log(11) * 50
        assert abs(score - expected) < 1  # round(_, 0) returns float with 0 decimals


# ═══════ Portfolio ═══════

@pytest.mark.asyncio
async def test_portfolio_balance(client: AsyncClient):
    """Portfolio shows correct balance."""
    resp = await client.get("/api/v1/exchange/portfolio", headers=auth_a())
    assert resp.status_code == 200
    data = resp.json()
    assert "balance" in data
    assert "active_positions" in data
    assert "settled_positions" in data
    assert "total_invested" in data


@pytest.mark.asyncio
async def test_orderbook(client: AsyncClient):
    """Orderbook shows bet volume distribution."""
    resp = await client.post(
        "/api/v1/exchange/markets",
        json={"title": "OB Market", "category": "tech", "prediction_id": "ob1"},
        headers=auth_a(),
    )
    market_id = resp.json()["id"]

    # Place some bets
    await client.post(
        f"/api/v1/exchange/markets/{market_id}/positions",
        json={"outcome_name": "Yes", "amount": 200},
        headers=auth_a(),
    )

    resp = await client.get(f"/api/v1/exchange/markets/{market_id}/orderbook")
    assert resp.status_code == 200
    data = resp.json()
    assert "outcomes" in data
