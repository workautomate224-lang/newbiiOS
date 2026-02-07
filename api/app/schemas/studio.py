"""Studio Pydantic schemas."""

from pydantic import BaseModel, Field
from typing import Optional


# --- Projects ---
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    settings: Optional[dict] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    settings: Optional[dict] = None


# --- Data Sources ---
class DataSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    source_type: str = Field(..., pattern="^(csv|api|database|manual)$")
    config: dict


class DataSourceSync(BaseModel):
    data: Optional[list[dict]] = None  # For CSV re-upload


# --- Population ---
class PopulationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    agent_count: int = Field(1000, ge=100, le=10000)
    distribution: dict
    constraints: Optional[dict] = None


class AgentUpdate(BaseModel):
    updates: dict  # Partial agent field updates


# --- Scenarios ---
class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    causal_graph: dict  # {nodes: [], edges: []}
    variables: list[dict]  # [{name, value, range, type}]
    description: Optional[str] = None
    is_baseline: bool = False


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    causal_graph: Optional[dict] = None
    variables: Optional[list[dict]] = None
    description: Optional[str] = None


# --- Simulation ---
class SimulationCreate(BaseModel):
    scenario_id: str
    population_id: str
    config: Optional[dict] = None  # {ticks, agent_decision_mode}


class BranchCreate(BaseModel):
    branch_name: str
    variable_overrides: dict


# --- Reports ---
class ReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    template: str = "standard"


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[dict] = None  # Tiptap JSON


class ReportExport(BaseModel):
    format: str = Field(..., pattern="^(pdf|pptx)$")
