"""Leaderboard API routes."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["leaderboard"])


@router.get("/leaderboard")
async def get_leaderboard():
    """Get top users ranked by reputation score."""
    from app.routers.users import _user_profiles

    users = list(_user_profiles.values())
    # Add sample data if no real users yet
    if not users:
        users = [
            {
                "id": "demo-1",
                "display_name": "AlphaPredictor",
                "avatar_url": None,
                "reputation_score": 2450,
                "prediction_count": 47,
                "accuracy_score": 0.72,
            },
            {
                "id": "demo-2",
                "display_name": "FutureSeeker",
                "avatar_url": None,
                "reputation_score": 1890,
                "prediction_count": 35,
                "accuracy_score": 0.68,
            },
            {
                "id": "demo-3",
                "display_name": "DataOracle",
                "avatar_url": None,
                "reputation_score": 1540,
                "prediction_count": 28,
                "accuracy_score": 0.65,
            },
            {
                "id": "demo-4",
                "display_name": "ProbabilityWiz",
                "avatar_url": None,
                "reputation_score": 1320,
                "prediction_count": 22,
                "accuracy_score": 0.61,
            },
            {
                "id": "demo-5",
                "display_name": "CrystalBall99",
                "avatar_url": None,
                "reputation_score": 980,
                "prediction_count": 15,
                "accuracy_score": 0.58,
            },
        ]
    users.sort(key=lambda u: u.get("reputation_score", 0), reverse=True)
    return [
        {
            "rank": i + 1,
            "id": u["id"],
            "display_name": u.get("display_name", "Anonymous"),
            "avatar_url": u.get("avatar_url"),
            "reputation_score": u.get("reputation_score", 0),
            "prediction_count": u.get("prediction_count", 0),
            "accuracy_score": u.get("accuracy_score", 0),
        }
        for i, u in enumerate(users[:50])
    ]
