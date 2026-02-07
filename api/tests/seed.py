"""
Test data seeds for E2E and integration testing.
Creates a complete set of test data for all products.
"""

# ─── Test Users ───
TEST_USER = {
    "id": "test-user-001",
    "email": "test@futureos.app",
    "display_name": "Test User",
    "reputation_score": 850,
}

TEST_USER_B = {
    "id": "test-user-002",
    "email": "userb@futureos.app",
    "display_name": "User B",
    "reputation_score": 600,
}

# ─── Test Prediction (completed with full results) ───
SEED_PREDICTION = {
    "id": "seed-prediction-001",
    "query": "Who will win the 2026 Malaysian General Election?",
    "status": "completed",
    "user_id": TEST_USER["id"],
    "is_public": True,
    "category": "politics",
}

# ─── Test Exchange Market ───
SEED_MARKET = {
    "id": "seed-market-001",
    "title": "2026 Malaysian Election — Ruling coalition wins?",
    "category": "politics",
    "status": "open",
    "prediction_id": SEED_PREDICTION["id"],
}

# ─── Test Studio Project ───
SEED_PROJECT = {
    "id": "seed-project-001",
    "name": "Malaysia Election Analysis",
    "description": "Full analysis of 2026 election scenario",
    "user_id": TEST_USER["id"],
    "status": "active",
}

# ─── Test Data Source ───
SEED_DATA_SOURCE = {
    "id": "seed-ds-001",
    "project_id": SEED_PROJECT["id"],
    "name": "Census Data 2024",
    "source_type": "csv",
    "freshness_status": "fresh",
    "row_count": 1500,
}

# ─── Convenience Constants ───
SEED_PREDICTION_ID = SEED_PREDICTION["id"]
SEED_MARKET_ID = SEED_MARKET["id"]
SEED_PROJECT_ID = SEED_PROJECT["id"]
