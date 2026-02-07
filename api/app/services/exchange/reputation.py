"""
Reputation Point System.

- Register: 1000 initial points
- Correct prediction: points × (1/price) profit
- Wrong prediction: lose bet amount
- Brier Score tracking for reputation_score
"""

INITIAL_POINTS = 1000


def get_initial_balance() -> float:
    """Get initial point balance for new users."""
    return INITIAL_POINTS


def calculate_potential_profit(amount: float, price: float) -> float:
    """Calculate potential profit if prediction is correct.
    Price is the probability at time of bet (0-1).
    Profit = amount × (1/price - 1) for correct bets.
    """
    if price <= 0 or price >= 1:
        return 0.0
    return round(amount * (1.0 / price - 1.0), 2)


def calculate_payout(amount: float, price: float, is_correct: bool) -> float:
    """Calculate payout after market resolution.
    Correct: return original + profit
    Wrong: lose everything
    """
    if is_correct:
        return round(amount + calculate_potential_profit(amount, price), 2)
    return 0.0


def calculate_brier_score(predictions: list[dict]) -> float:
    """Calculate Brier Score from a list of resolved predictions.
    Each prediction: {price: float, is_correct: bool}
    Lower is better (0 = perfect, 1 = worst).
    """
    if not predictions:
        return 0.5
    total = 0.0
    for p in predictions:
        forecast = p["price"]
        actual = 1.0 if p["is_correct"] else 0.0
        total += (forecast - actual) ** 2
    return round(total / len(predictions), 4)


def calculate_reputation_score(brier_score: float, prediction_count: int) -> float:
    """Convert Brier Score + activity into reputation score.
    reputation = 1000 × (1 - brier_score) + log bonus for activity.
    """
    import math
    base = 1000 * (1 - brier_score)
    activity_bonus = math.log(max(prediction_count, 1) + 1) * 50
    return round(base + activity_bonus, 0)
