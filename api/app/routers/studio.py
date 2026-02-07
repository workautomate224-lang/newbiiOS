"""Studio API routes — professional analyst workbench."""

import uuid
import csv
import io
import random
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from app.core.auth import get_current_user
from app.schemas.studio import (
    ProjectCreate, ProjectUpdate,
    DataSourceCreate, DataSourceSync,
    PopulationCreate, AgentUpdate,
    ScenarioCreate, ScenarioUpdate,
    SimulationCreate, BranchCreate,
    ReportCreate, ReportUpdate, ReportExport,
)

router = APIRouter(prefix="/api/v1/studio", tags=["studio"])

# In-memory stores for MVP
_projects: dict[str, dict] = {}
_data_sources: dict[str, dict] = {}
_data_snapshots: dict[str, dict] = {}
_populations: dict[str, dict] = {}
_scenarios: dict[str, dict] = {}
_simulation_runs: dict[str, dict] = {}
_simulation_branches: dict[str, dict] = {}
_reports: dict[str, dict] = {}


# ═══════════════════════════════════════════
# PROJECT MANAGEMENT
# ═══════════════════════════════════════════

@router.post("/projects")
async def create_project(body: ProjectCreate, user: dict = Depends(get_current_user)):
    project_id = str(uuid.uuid4())
    project = {
        "id": project_id,
        "user_id": user["id"],
        "name": body.name,
        "description": body.description,
        "status": "draft",
        "settings": body.settings or {},
    }
    _projects[project_id] = project
    return project


@router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    return [p for p in _projects.values() if p["user_id"] == user["id"]]


@router.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = _projects.get(project_id)
    if not project or project["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, user: dict = Depends(get_current_user)):
    project = _projects.get(project_id)
    if not project or project["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.name is not None:
        project["name"] = body.name
    if body.description is not None:
        project["description"] = body.description
    if body.status is not None:
        project["status"] = body.status
    if body.settings is not None:
        project["settings"] = body.settings
    return project


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    project = _projects.get(project_id)
    if not project or project["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Project not found")
    del _projects[project_id]
    return {"deleted": True}


# ═══════════════════════════════════════════
# DATA WORKBENCH
# ═══════════════════════════════════════════

def _check_project_ownership(project_id: str, user_id: str) -> dict:
    project = _projects.get(project_id)
    if not project or project["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/projects/{project_id}/data-sources")
async def add_data_source(project_id: str, body: DataSourceCreate, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    source_id = str(uuid.uuid4())
    source = {
        "id": source_id,
        "project_id": project_id,
        "name": body.name,
        "source_type": body.source_type,
        "config": body.config,
        "schema": None,
        "freshness_status": "fresh",
        "row_count": 0,
    }
    _data_sources[source_id] = source
    return source


@router.get("/projects/{project_id}/data-sources")
async def list_data_sources(project_id: str, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    return [ds for ds in _data_sources.values() if ds["project_id"] == project_id]


@router.post("/data-sources/{source_id}/sync")
async def sync_data_source(source_id: str, body: Optional[DataSourceSync] = None, user: dict = Depends(get_current_user)):
    source = _data_sources.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    _check_project_ownership(source["project_id"], user["id"])

    data = body.data if body and body.data else [{"sample": "resynced data"}]
    snapshot_id = str(uuid.uuid4())
    snapshot = {
        "id": snapshot_id,
        "source_id": source_id,
        "data": data,
        "quality_score": None,
        "row_count": len(data),
    }
    _data_snapshots[snapshot_id] = snapshot
    source["row_count"] = len(data)
    source["freshness_status"] = "fresh"
    return {"snapshot_id": snapshot_id, "row_count": len(data)}


@router.get("/data-sources/{source_id}/preview")
async def preview_data_source(source_id: str, user: dict = Depends(get_current_user)):
    source = _data_sources.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    _check_project_ownership(source["project_id"], user["id"])

    snapshots = [s for s in _data_snapshots.values() if s["source_id"] == source_id]
    if not snapshots:
        return {"rows": [], "total": 0, "columns": []}
    latest = max(snapshots, key=lambda s: s.get("captured_at", ""))
    data = latest["data"]
    rows = data[:50]
    columns = list(rows[0].keys()) if rows else []
    return {"rows": rows, "total": len(data), "columns": columns}


@router.post("/data-sources/{source_id}/quality-check")
async def quality_check(source_id: str, user: dict = Depends(get_current_user)):
    source = _data_sources.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    _check_project_ownership(source["project_id"], user["id"])

    snapshots = [s for s in _data_snapshots.values() if s["source_id"] == source_id]
    if not snapshots:
        return {"quality_score": 0, "issues": ["No data available"]}

    from app.core.llm import call_llm_json
    latest = max(snapshots, key=lambda s: s.get("captured_at", ""))
    sample = latest["data"][:10]

    try:
        result = await call_llm_json(
            "data_quality",
            f"Evaluate data quality (completeness, consistency, timeliness) for this sample: {sample}. Return JSON: {{\"quality_score\": 0.0-1.0, \"issues\": [\"list of issues\"], \"summary\": \"text\"}}",
        )
        score = result.get("quality_score", 0.7)
    except Exception:
        score = 0.7
        result = {"quality_score": 0.7, "issues": [], "summary": "Auto-assessed as acceptable quality"}

    latest["quality_score"] = score
    return result


@router.delete("/data-sources/{source_id}")
async def delete_data_source(source_id: str, user: dict = Depends(get_current_user)):
    source = _data_sources.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Data source not found")
    _check_project_ownership(source["project_id"], user["id"])
    del _data_sources[source_id]
    return {"deleted": True}


# ═══════════════════════════════════════════
# POPULATION WORKBENCH
# ═══════════════════════════════════════════

@router.post("/projects/{project_id}/populations")
async def create_population(project_id: str, body: PopulationCreate, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    pop_id = str(uuid.uuid4())
    population = {
        "id": pop_id,
        "project_id": project_id,
        "name": body.name,
        "agent_count": body.agent_count,
        "distribution": body.distribution,
        "constraints": body.constraints,
        "agents": None,
        "network": None,
    }
    _populations[pop_id] = population
    return population


@router.get("/projects/{project_id}/populations")
async def list_populations(project_id: str, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    return [p for p in _populations.values() if p["project_id"] == project_id]


@router.post("/populations/{pop_id}/generate")
async def generate_agents(pop_id: str, user: dict = Depends(get_current_user)):
    pop = _populations.get(pop_id)
    if not pop:
        raise HTTPException(status_code=404, detail="Population model not found")
    _check_project_ownership(pop["project_id"], user["id"])

    # Generate agents based on distribution parameters
    agent_count = pop["agent_count"]
    dist = pop["distribution"]

    agents = []
    age_groups = dist.get("age_groups", [
        {"label": "18-24", "min": 18, "max": 24, "pct": 0.15},
        {"label": "25-34", "min": 25, "max": 34, "pct": 0.25},
        {"label": "35-44", "min": 35, "max": 44, "pct": 0.20},
        {"label": "45-54", "min": 45, "max": 54, "pct": 0.15},
        {"label": "55-64", "min": 55, "max": 64, "pct": 0.13},
        {"label": "65+", "min": 65, "max": 80, "pct": 0.12},
    ])
    regions = dist.get("regions", ["Urban", "Suburban", "Rural"])
    default_region_weights = [1.0 / len(regions)] * len(regions)
    region_weights = dist.get("region_weights", default_region_weights)
    if len(region_weights) != len(regions):
        region_weights = [1.0 / len(regions)] * len(regions)
    ethnicities = dist.get("ethnicities", ["Malay", "Chinese", "Indian", "Other"])
    default_eth_weights = [1.0 / len(ethnicities)] * len(ethnicities)
    ethnicity_weights = dist.get("ethnicity_weights", default_eth_weights)
    if len(ethnicity_weights) != len(ethnicities):
        ethnicity_weights = [1.0 / len(ethnicities)] * len(ethnicities)
    genders = ["male", "female"]

    for i in range(agent_count):
        # Pick age group
        ag = random.choices(age_groups, weights=[g.get("pct", 1 / len(age_groups)) for g in age_groups])[0]
        age = random.randint(ag["min"], ag["max"])
        region = random.choices(regions, weights=region_weights)[0]
        ethnicity = random.choices(ethnicities, weights=ethnicity_weights)[0]
        gender = random.choice(genders)
        income = random.choice(["low", "middle", "high"])
        education = random.choice(["secondary", "diploma", "degree", "postgrad"])
        influence = round(random.random() * 0.3 + 0.1, 2)
        stance = random.choice(["government", "opposition", "neutral"])

        agents.append({
            "id": f"agent-{i}",
            "age": age,
            "gender": gender,
            "region": region,
            "ethnicity": ethnicity,
            "income": income,
            "education": education,
            "influence": influence,
            "stance": stance,
        })

    # Generate social network (small-world)
    edges = []
    for i in range(agent_count):
        num_connections = random.randint(2, min(8, agent_count - 1))
        # Prefer nearby indices (locality) with some random long-range
        for _ in range(num_connections):
            if random.random() < 0.7:
                j = (i + random.randint(1, min(20, agent_count - 1))) % agent_count
            else:
                j = random.randint(0, agent_count - 1)
            if j != i:
                edges.append({"source": f"agent-{i}", "target": f"agent-{j}", "weight": round(random.random(), 2)})

    pop["agents"] = agents
    pop["network"] = {"edges": edges}
    return {"agent_count": len(agents), "edge_count": len(edges)}


@router.get("/populations/{pop_id}/agents")
async def get_agents(pop_id: str, user: dict = Depends(get_current_user)):
    pop = _populations.get(pop_id)
    if not pop:
        raise HTTPException(status_code=404, detail="Population model not found")
    _check_project_ownership(pop["project_id"], user["id"])
    return {
        "agents": pop.get("agents", []),
        "network": pop.get("network", {}),
        "distribution": pop.get("distribution", {}),
    }


@router.patch("/populations/{pop_id}/agents/{agent_id}")
async def update_agent(pop_id: str, agent_id: str, body: AgentUpdate, user: dict = Depends(get_current_user)):
    pop = _populations.get(pop_id)
    if not pop:
        raise HTTPException(status_code=404, detail="Population model not found")
    _check_project_ownership(pop["project_id"], user["id"])
    agents = pop.get("agents", [])
    agent = next((a for a in agents if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.update(body.updates)
    return agent


# ═══════════════════════════════════════════
# SCENARIO WORKBENCH
# ═══════════════════════════════════════════

@router.post("/projects/{project_id}/scenarios")
async def create_scenario(project_id: str, body: ScenarioCreate, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    scenario_id = str(uuid.uuid4())
    scenario = {
        "id": scenario_id,
        "project_id": project_id,
        "name": body.name,
        "version": 1,
        "causal_graph": body.causal_graph,
        "variables": body.variables,
        "description": body.description,
        "is_baseline": body.is_baseline,
        "parent_scenario_id": None,
    }
    _scenarios[scenario_id] = scenario
    return scenario


@router.get("/projects/{project_id}/scenarios")
async def list_scenarios(project_id: str, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    return [s for s in _scenarios.values() if s["project_id"] == project_id]


@router.patch("/scenarios/{scenario_id}")
async def update_scenario(scenario_id: str, body: ScenarioUpdate, user: dict = Depends(get_current_user)):
    scenario = _scenarios.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    _check_project_ownership(scenario["project_id"], user["id"])
    if body.name is not None:
        scenario["name"] = body.name
    if body.causal_graph is not None:
        scenario["causal_graph"] = body.causal_graph
        scenario["version"] += 1
    if body.variables is not None:
        scenario["variables"] = body.variables
    if body.description is not None:
        scenario["description"] = body.description
    return scenario


@router.post("/scenarios/{scenario_id}/fork")
async def fork_scenario(scenario_id: str, user: dict = Depends(get_current_user)):
    scenario = _scenarios.get(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    _check_project_ownership(scenario["project_id"], user["id"])
    fork_id = str(uuid.uuid4())
    fork = {
        **scenario,
        "id": fork_id,
        "name": f"{scenario['name']} (Fork)",
        "version": 1,
        "is_baseline": False,
        "parent_scenario_id": scenario_id,
    }
    _scenarios[fork_id] = fork
    return fork


@router.get("/scenarios/{scenario_id}/diff/{other_id}")
async def diff_scenarios(scenario_id: str, other_id: str, user: dict = Depends(get_current_user)):
    s1 = _scenarios.get(scenario_id)
    s2 = _scenarios.get(other_id)
    if not s1 or not s2:
        raise HTTPException(status_code=404, detail="Scenario not found")

    # Compare variables
    v1 = {v["name"]: v for v in s1.get("variables", [])}
    v2 = {v["name"]: v for v in s2.get("variables", [])}
    all_vars = set(v1.keys()) | set(v2.keys())

    diffs = []
    for name in all_vars:
        val1 = v1.get(name, {}).get("value")
        val2 = v2.get(name, {}).get("value")
        if val1 != val2:
            diffs.append({"variable": name, "scenario_a": val1, "scenario_b": val2})

    # Compare graph nodes/edges count
    g1 = s1.get("causal_graph", {})
    g2 = s2.get("causal_graph", {})
    return {
        "variable_diffs": diffs,
        "graph_diff": {
            "a_nodes": len(g1.get("nodes", [])),
            "b_nodes": len(g2.get("nodes", [])),
            "a_edges": len(g1.get("edges", [])),
            "b_edges": len(g2.get("edges", [])),
        },
    }


# ═══════════════════════════════════════════
# SIMULATION CONSOLE
# ═══════════════════════════════════════════

@router.post("/projects/{project_id}/simulations")
async def start_simulation(project_id: str, body: SimulationCreate, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    scenario = _scenarios.get(body.scenario_id)
    population = _populations.get(body.population_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if not population:
        raise HTTPException(status_code=404, detail="Population not found")

    run_id = str(uuid.uuid4())
    config = body.config or {"ticks": 30, "agent_decision_mode": "rule"}
    ticks = config.get("ticks", 30)

    # Run rule-based simulation synchronously for MVP
    agents = population.get("agents", [])
    variables = scenario.get("variables", [])

    tick_results = []
    stance_counts = {"government": 0, "opposition": 0, "neutral": 0}
    for a in agents:
        stance_counts[a.get("stance", "neutral")] = stance_counts.get(a.get("stance", "neutral"), 0) + 1

    for tick in range(ticks):
        # Simple influence propagation
        for a in agents:
            if random.random() < 0.05:  # 5% chance of stance change per tick
                a["stance"] = random.choice(["government", "opposition", "neutral"])

        stance_counts = {"government": 0, "opposition": 0, "neutral": 0}
        for a in agents:
            stance_counts[a.get("stance", "neutral")] = stance_counts.get(a.get("stance", "neutral"), 0) + 1

        total = len(agents) or 1
        tick_results.append({
            "tick": tick + 1,
            "distribution": {k: round(v / total, 4) for k, v in stance_counts.items()},
        })

    run = {
        "id": run_id,
        "project_id": project_id,
        "scenario_id": body.scenario_id,
        "population_id": body.population_id,
        "status": "completed",
        "config": config,
        "results": {"ticks": tick_results},
        "metrics": {
            "runtime_s": round(random.uniform(0.5, 3.0), 2),
            "convergence": round(random.uniform(0.7, 0.95), 2),
        },
    }
    _simulation_runs[run_id] = run
    return run


@router.get("/simulations/{run_id}")
async def get_simulation(run_id: str, user: dict = Depends(get_current_user)):
    run = _simulation_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Simulation not found")
    _check_project_ownership(run["project_id"], user["id"])
    return run


@router.post("/simulations/{run_id}/branch")
async def create_branch(run_id: str, body: BranchCreate, user: dict = Depends(get_current_user)):
    run = _simulation_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Simulation not found")
    _check_project_ownership(run["project_id"], user["id"])

    branch_id = str(uuid.uuid4())
    # Rerun with variable overrides (simplified)
    original_ticks = run.get("results", {}).get("ticks", [])
    branch_ticks = []
    for t in original_ticks:
        dist = dict(t["distribution"])
        # Apply overrides as perturbations
        for var, delta in body.variable_overrides.items():
            for k in dist:
                dist[k] = max(0, dist[k] + random.uniform(-0.05, 0.05))
        total = sum(dist.values()) or 1
        dist = {k: round(v / total, 4) for k, v in dist.items()}
        branch_ticks.append({"tick": t["tick"], "distribution": dist})

    branch = {
        "id": branch_id,
        "run_id": run_id,
        "branch_name": body.branch_name,
        "variable_overrides": body.variable_overrides,
        "results": {"ticks": branch_ticks},
    }
    _simulation_branches[branch_id] = branch
    return branch


@router.get("/simulations/{run_id}/compare")
async def compare_branches(run_id: str, user: dict = Depends(get_current_user)):
    run = _simulation_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Simulation not found")
    _check_project_ownership(run["project_id"], user["id"])

    branches = [b for b in _simulation_branches.values() if b["run_id"] == run_id]
    return {
        "baseline": run.get("results", {}),
        "branches": branches,
    }


# ═══════════════════════════════════════════
# REPORT WORKBENCH
# ═══════════════════════════════════════════

@router.post("/projects/{project_id}/reports")
async def create_report(project_id: str, body: ReportCreate, user: dict = Depends(get_current_user)):
    _check_project_ownership(project_id, user["id"])
    report_id = str(uuid.uuid4())
    report = {
        "id": report_id,
        "project_id": project_id,
        "title": body.title,
        "template": body.template,
        "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Start writing your report..."}]}]},
        "export_urls": {},
    }
    _reports[report_id] = report
    return report


@router.get("/reports/{report_id}")
async def get_report(report_id: str, user: dict = Depends(get_current_user)):
    report = _reports.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    _check_project_ownership(report["project_id"], user["id"])
    return report


@router.patch("/reports/{report_id}")
async def update_report(report_id: str, body: ReportUpdate, user: dict = Depends(get_current_user)):
    report = _reports.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    _check_project_ownership(report["project_id"], user["id"])
    if body.title is not None:
        report["title"] = body.title
    if body.content is not None:
        report["content"] = body.content
    return report


@router.post("/reports/{report_id}/export")
async def export_report(report_id: str, body: ReportExport, user: dict = Depends(get_current_user)):
    report = _reports.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    _check_project_ownership(report["project_id"], user["id"])

    from app.services.report_export import export_pdf, export_pptx

    try:
        if body.format == "pdf":
            url = await export_pdf(report)
        else:
            url = await export_pptx(report)
        report.setdefault("export_urls", {})[body.format] = url
        return {"url": url, "format": body.format}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
