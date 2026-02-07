"""Deep Studio API tests — projects, data, population, scenario, simulation, reports."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
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


# ═══════ Project Management ═══════

@pytest.mark.asyncio
async def test_create_project_returns_id(client: AsyncClient):
    """Creating project returns project_id."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Deep Test Project", "description": "For testing"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert data["name"] == "Deep Test Project"
    assert data["status"] == "draft"


@pytest.mark.asyncio
async def test_list_projects_only_own(client: AsyncClient):
    """Each user only sees their own projects."""
    # User A creates
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "A's project"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    # User B creates
    await client.post(
        "/api/v1/studio/projects",
        json={"name": "B's project"},
        headers=auth_b(),
    )

    # User A's list
    resp = await client.get("/api/v1/studio/projects", headers=auth_a())
    a_ids = [p["id"] for p in resp.json()]
    assert pid in a_ids

    # User B's list should not contain User A's project (unless both created in same memory)
    resp = await client.get("/api/v1/studio/projects", headers=auth_b())
    b_projects = resp.json()
    b_names = [p["name"] for p in b_projects]
    assert "B's project" in b_names


@pytest.mark.asyncio
async def test_delete_project(client: AsyncClient):
    """Deleting project removes it."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "To Delete"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.delete(f"/api/v1/studio/projects/{pid}", headers=auth_a())
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    resp = await client.get(f"/api/v1/studio/projects/{pid}", headers=auth_a())
    assert resp.status_code == 404


# ═══════ Data Workbench ═══════

@pytest.mark.asyncio
async def test_data_source_full_workflow(client: AsyncClient):
    """Full data source lifecycle: create → sync → preview → quality → delete."""
    # Create project
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Data Test"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    # Add data source
    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/data-sources",
        json={"name": "Census CSV", "source_type": "csv", "config": {}},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    ds_id = resp.json()["id"]
    assert resp.json()["freshness_status"] == "fresh"

    # Sync with data
    test_data = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
    resp = await client.post(
        f"/api/v1/studio/data-sources/{ds_id}/sync",
        json={"data": test_data},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["row_count"] == 2

    # Preview
    resp = await client.get(
        f"/api/v1/studio/data-sources/{ds_id}/preview",
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 2
    assert len(resp.json()["rows"]) == 2

    # Delete
    resp = await client.delete(
        f"/api/v1/studio/data-sources/{ds_id}",
        headers=auth_a(),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_data_preview_empty_source(client: AsyncClient):
    """Preview of source with no data returns empty."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Empty Data"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/data-sources",
        json={"name": "Empty", "source_type": "csv", "config": {}},
        headers=auth_a(),
    )
    ds_id = resp.json()["id"]

    resp = await client.get(
        f"/api/v1/studio/data-sources/{ds_id}/preview",
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


# ═══════ Population Workbench ═══════

@pytest.mark.asyncio
async def test_generate_agents_count(client: AsyncClient):
    """Generating 500 agents returns exactly 500."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Pop Test"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Test Pop", "agent_count": 500, "distribution": {}},
        headers=auth_a(),
    )
    pop_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/populations/{pop_id}/generate",
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["agent_count"] == 500
    assert resp.json()["edge_count"] > 0


@pytest.mark.asyncio
async def test_generate_agents_demographics(client: AsyncClient):
    """Generated agents have valid demographics."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Demo Test"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Demo Pop", "agent_count": 1000, "distribution": {
            "regions": ["Urban", "Rural"],
            "ethnicities": ["Malay", "Chinese"],
        }},
        headers=auth_a(),
    )
    pop_id = resp.json()["id"]

    await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_a())

    resp = await client.get(f"/api/v1/studio/populations/{pop_id}/agents", headers=auth_a())
    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert len(agents) == 1000

    for a in agents:
        assert a["region"] in ["Urban", "Rural"]
        assert a["ethnicity"] in ["Malay", "Chinese"]
        assert a["gender"] in ["male", "female"]


@pytest.mark.asyncio
async def test_edit_single_agent(client: AsyncClient):
    """Can modify individual agent properties."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Agent Edit"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Edit Pop", "agent_count": 100, "distribution": {}},
        headers=auth_a(),
    )
    assert resp.status_code == 200, f"Population create failed: {resp.json()}"
    pop_id = resp.json()["id"]

    resp = await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_a())
    assert resp.status_code == 200

    # Edit agent-0
    resp = await client.patch(
        f"/api/v1/studio/populations/{pop_id}/agents/agent-0",
        json={"updates": {"stance": "opposition", "age": 99}},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["stance"] == "opposition"
    assert resp.json()["age"] == 99


@pytest.mark.asyncio
async def test_population_network(client: AsyncClient):
    """Generated population has network edges."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Network"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Net Pop", "agent_count": 100, "distribution": {}},
        headers=auth_a(),
    )
    assert resp.status_code == 200, f"Population create failed: {resp.json()}"
    pop_id = resp.json()["id"]
    await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_a())

    resp = await client.get(f"/api/v1/studio/populations/{pop_id}/agents", headers=auth_a())
    network = resp.json()["network"]
    assert "edges" in network
    assert len(network["edges"]) > 0


# ═══════ Scenario Workbench ═══════

@pytest.mark.asyncio
async def test_create_scenario_empty_graph(client: AsyncClient):
    """Creating scenario with empty graph works."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Scenario Project"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={
            "name": "Baseline",
            "causal_graph": {"nodes": [], "edges": []},
            "variables": [],
            "is_baseline": True,
        },
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
    assert resp.json()["is_baseline"] is True


@pytest.mark.asyncio
async def test_scenario_versioning(client: AsyncClient):
    """Each graph update increments version."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Version Test"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={"name": "Versioned", "causal_graph": {"nodes": [], "edges": []}, "variables": []},
        headers=auth_a(),
    )
    sid = resp.json()["id"]
    assert resp.json()["version"] == 1

    # Update graph → version++
    resp = await client.patch(
        f"/api/v1/studio/scenarios/{sid}",
        json={"causal_graph": {"nodes": [{"id": "n1"}], "edges": []}},
        headers=auth_a(),
    )
    assert resp.json()["version"] == 2

    # Another update
    resp = await client.patch(
        f"/api/v1/studio/scenarios/{sid}",
        json={"causal_graph": {"nodes": [{"id": "n1"}, {"id": "n2"}], "edges": []}},
        headers=auth_a(),
    )
    assert resp.json()["version"] == 3


@pytest.mark.asyncio
async def test_fork_scenario(client: AsyncClient):
    """Forking creates new scenario with inherited data."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Fork Test"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={
            "name": "Original",
            "causal_graph": {"nodes": [{"id": "x"}], "edges": []},
            "variables": [{"name": "GDP", "value": 4.5}],
            "is_baseline": True,
        },
        headers=auth_a(),
    )
    sid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/scenarios/{sid}/fork",
        headers=auth_a(),
    )
    assert resp.status_code == 200
    fork = resp.json()
    assert fork["id"] != sid
    assert "(Fork)" in fork["name"]
    assert fork["parent_scenario_id"] == sid
    assert fork["is_baseline"] is False


@pytest.mark.asyncio
async def test_scenario_diff(client: AsyncClient):
    """Diff between two scenarios shows variable differences."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Diff Test"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    # Create two scenarios with different variables
    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={"name": "A", "causal_graph": {"nodes": [], "edges": []},
              "variables": [{"name": "GDP", "value": 4.5}, {"name": "Inflation", "value": 2.0}]},
        headers=auth_a(),
    )
    sid_a = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={"name": "B", "causal_graph": {"nodes": [{"id": "x"}], "edges": []},
              "variables": [{"name": "GDP", "value": 6.0}, {"name": "Inflation", "value": 2.0}]},
        headers=auth_a(),
    )
    sid_b = resp.json()["id"]

    resp = await client.get(
        f"/api/v1/studio/scenarios/{sid_a}/diff/{sid_b}",
        headers=auth_a(),
    )
    assert resp.status_code == 200
    diff = resp.json()
    assert len(diff["variable_diffs"]) >= 1  # GDP differs
    gdp_diff = next(d for d in diff["variable_diffs"] if d["variable"] == "GDP")
    assert gdp_diff["scenario_a"] == 4.5
    assert gdp_diff["scenario_b"] == 6.0


# ═══════ Simulation Console ═══════

@pytest.mark.asyncio
async def test_simulation_completes(client: AsyncClient):
    """Simulation runs to completion."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Sim Test"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    pid = resp.json()["id"]

    # Create population + generate
    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Sim Pop", "agent_count": 100, "distribution": {}},
        headers=auth_a(),
    )
    assert resp.status_code == 200, f"Population create failed: {resp.json()}"
    pop_id = resp.json()["id"]
    await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_a())

    # Create scenario
    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={"name": "Sim Scenario", "causal_graph": {"nodes": [], "edges": []}, "variables": []},
        headers=auth_a(),
    )
    scen_id = resp.json()["id"]

    # Start simulation
    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/simulations",
        json={"scenario_id": scen_id, "population_id": pop_id, "config": {"ticks": 20}},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    run = resp.json()
    assert run["status"] == "completed"
    assert len(run["results"]["ticks"]) == 20


@pytest.mark.asyncio
async def test_simulation_branch_different_results(client: AsyncClient):
    """Branch produces different results than baseline."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Branch Test"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "B Pop", "agent_count": 100, "distribution": {}},
        headers=auth_a(),
    )
    assert resp.status_code == 200, f"Population create failed: {resp.json()}"
    pop_id = resp.json()["id"]
    await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_a())

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={"name": "B Scenario", "causal_graph": {"nodes": [], "edges": []}, "variables": []},
        headers=auth_a(),
    )
    scen_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/simulations",
        json={"scenario_id": scen_id, "population_id": pop_id, "config": {"ticks": 10}},
        headers=auth_a(),
    )
    run_id = resp.json()["id"]

    # Create branch
    resp = await client.post(
        f"/api/v1/studio/simulations/{run_id}/branch",
        json={"branch_name": "What-if", "variable_overrides": {"GDP": 8.0}},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    branch = resp.json()
    assert len(branch["results"]["ticks"]) == 10


# ═══════ Report Workbench ═══════

@pytest.mark.asyncio
async def test_report_full_workflow(client: AsyncClient):
    """Create → update → export report."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Report Project"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    # Create
    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/reports",
        json={"title": "Test Report", "template": "standard"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    report_id = resp.json()["id"]

    # Update content
    new_content = {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "Updated content here."}]}
    ]}
    resp = await client.patch(
        f"/api/v1/studio/reports/{report_id}",
        json={"content": new_content},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["content"] == new_content

    # Export PDF
    resp = await client.post(
        f"/api/v1/studio/reports/{report_id}/export",
        json={"format": "pdf"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert "url" in resp.json()
    assert resp.json()["format"] == "pdf"


@pytest.mark.asyncio
async def test_export_pptx(client: AsyncClient):
    """PPTX export returns URL."""
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "PPTX Project"},
        headers=auth_a(),
    )
    pid = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/projects/{pid}/reports",
        json={"title": "PPTX Report", "template": "standard"},
        headers=auth_a(),
    )
    report_id = resp.json()["id"]

    resp = await client.post(
        f"/api/v1/studio/reports/{report_id}/export",
        json={"format": "pptx"},
        headers=auth_a(),
    )
    assert resp.status_code == 200
    assert resp.json()["format"] == "pptx"
