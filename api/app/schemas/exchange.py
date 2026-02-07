"""Exchange Pydantic schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class MarketCreate(BaseModel):
    prediction_id: Optional[str] = None
    title: str = Field(..., min_length=3, max_length=500)
    description: Optional[str] = None
    category: str = "general"
    close_at: Optional[str] = None  # ISO datetime string


class PositionCreate(BaseModel):
    outcome_name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0, le=10000)


class MarketResolve(BaseModel):
    resolution: str  # The actual outcome name
