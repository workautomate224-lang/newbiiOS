"""User API routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.auth import get_current_user

router = APIRouter(prefix="/api/v1/users", tags=["users"])

# In-memory user profiles for MVP
_user_profiles: dict[str, dict] = {}


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user profile."""
    uid = user["id"]
    profile = _user_profiles.get(uid, {
        "id": uid,
        "display_name": user.get("email", "").split("@")[0],
        "avatar_url": None,
        "reputation_score": 0,
        "prediction_count": 0,
        "accuracy_score": 0,
    })
    return profile


@router.patch("/me")
async def update_me(body: UserUpdate, user: dict = Depends(get_current_user)):
    """Update current user profile."""
    uid = user["id"]
    profile = _user_profiles.get(uid, {
        "id": uid,
        "display_name": user.get("email", "").split("@")[0],
        "avatar_url": None,
        "reputation_score": 0,
        "prediction_count": 0,
        "accuracy_score": 0,
    })
    if body.display_name is not None:
        profile["display_name"] = body.display_name
    if body.avatar_url is not None:
        profile["avatar_url"] = body.avatar_url
    _user_profiles[uid] = profile
    return profile


@router.get("/me/predictions")
async def get_my_predictions(user: dict = Depends(get_current_user)):
    """Get current user's predictions."""
    from app.routers.predictions import _predictions
    uid = user["id"]
    my_preds = [p for p in _predictions.values() if p.get("user_id") == uid]
    return my_preds
