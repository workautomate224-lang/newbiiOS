from pydantic import BaseModel, Field
from typing import Optional


class PredictionCreate(BaseModel):
    query: str = Field(..., min_length=3, max_length=1000)
    options: Optional[dict] = None


class PredictionResponse(BaseModel):
    id: str
    status: str
    estimated_seconds: int = 120


class PredictionUpdate(BaseModel):
    is_public: Optional[bool] = None


class VariableRerun(BaseModel):
    variables: dict[str, float]


class OutcomeProbability(BaseModel):
    name: str
    probability: float
    confidence_interval: list[float]


class CausalNode(BaseModel):
    id: str
    label: str
    probability: float = 0.5
    confidence: float = 0.5
    category: str = "general"


class CausalEdge(BaseModel):
    source: str
    target: str
    weight: float
    type: str = "positive"  # positive or negative
    description: str = ""


class PredictionResult(BaseModel):
    id: str
    query: str
    status: str
    outcomes: list[OutcomeProbability]
    causal_graph: dict
    reasoning: dict
    variables: list[dict]
    metadata: dict
