"""Tests for Studio API routes."""

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.main import app
from app.core.config import settings


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def auth_headers() -> dict:
    token = jwt.encode(
        {"sub": "studio-test-user", "email": "studio@test.com", "role": "authenticated", "aud": "authenticated"},
        settings.supabase_anon_key or "test-secret",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


# ─── Projects ───

@pytest.mark.asyncio
async def test_create_project(client: AsyncClient):
    resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "Test Project", "description": "A test"},
        headers=auth_headers(),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Project"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_projects(client: AsyncClient):
    await client.post("/api/v1/studio/projects", json={"name": "P1"}, headers=auth_headers())
    resp = await client.get("/api/v1/studio/projects", headers=auth_headers())
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_project_crud(client: AsyncClient):
    # Create
    create_resp = await client.post(
        "/api/v1/studio/projects",
        json={"name": "CRUD Test"},
        headers=auth_headers(),
    )
    pid = create_resp.json()["id"]

    # Get
    get_resp = await client.get(f"/api/v1/studio/projects/{pid}", headers=auth_headers())
    assert get_resp.status_code == 200

    # Update
    patch_resp = await client.patch(
        f"/api/v1/studio/projects/{pid}",
        json={"name": "Updated"},
        headers=auth_headers(),
    )
    assert patch_resp.json()["name"] == "Updated"

    # Delete
    del_resp = await client.delete(f"/api/v1/studio/projects/{pid}", headers=auth_headers())
    assert del_resp.json()["deleted"] is True


# ─── Data Sources ───

@pytest.mark.asyncio
async def test_data_source_workflow(client: AsyncClient):
    # Create project
    proj = await client.post("/api/v1/studio/projects", json={"name": "DS Test"}, headers=auth_headers())
    pid = proj.json()["id"]

    # Add data source
    ds_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/data-sources",
        json={"name": "test.csv", "source_type": "csv", "config": {"filename": "test.csv"}},
        headers=auth_headers(),
    )
    assert ds_resp.status_code == 200
    ds_id = ds_resp.json()["id"]

    # Sync (upload data)
    sync_resp = await client.post(
        f"/api/v1/studio/data-sources/{ds_id}/sync",
        json={"data": [{"a": 1, "b": 2}, {"a": 3, "b": 4}]},
        headers=auth_headers(),
    )
    assert sync_resp.json()["row_count"] == 2

    # Preview
    preview_resp = await client.get(f"/api/v1/studio/data-sources/{ds_id}/preview", headers=auth_headers())
    assert preview_resp.status_code == 200
    assert len(preview_resp.json()["rows"]) == 2

    # List
    list_resp = await client.get(f"/api/v1/studio/projects/{pid}/data-sources", headers=auth_headers())
    assert len(list_resp.json()) >= 1

    # Delete
    del_resp = await client.delete(f"/api/v1/studio/data-sources/{ds_id}", headers=auth_headers())
    assert del_resp.json()["deleted"] is True


# ─── Population ───

@pytest.mark.asyncio
async def test_population_workflow(client: AsyncClient):
    proj = await client.post("/api/v1/studio/projects", json={"name": "Pop Test"}, headers=auth_headers())
    pid = proj.json()["id"]

    # Create population
    pop_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Test Pop", "agent_count": 100, "distribution": {"regions": ["Urban", "Rural"]}},
        headers=auth_headers(),
    )
    pop_id = pop_resp.json()["id"]

    # Generate agents
    gen_resp = await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_headers())
    assert gen_resp.json()["agent_count"] == 100
    assert gen_resp.json()["edge_count"] > 0

    # Get agents
    agents_resp = await client.get(f"/api/v1/studio/populations/{pop_id}/agents", headers=auth_headers())
    assert len(agents_resp.json()["agents"]) == 100


# ─── Scenarios ───

@pytest.mark.asyncio
async def test_scenario_workflow(client: AsyncClient):
    proj = await client.post("/api/v1/studio/projects", json={"name": "Sc Test"}, headers=auth_headers())
    pid = proj.json()["id"]

    # Create scenario
    sc_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={
            "name": "Baseline",
            "causal_graph": {"nodes": [{"id": "a"}], "edges": []},
            "variables": [{"name": "economy", "value": 0.5, "range": [0, 1]}],
            "is_baseline": True,
        },
        headers=auth_headers(),
    )
    sc_id = sc_resp.json()["id"]

    # Fork
    fork_resp = await client.post(f"/api/v1/studio/scenarios/{sc_id}/fork", headers=auth_headers())
    fork_id = fork_resp.json()["id"]
    assert "Fork" in fork_resp.json()["name"]

    # Update fork
    await client.patch(
        f"/api/v1/studio/scenarios/{fork_id}",
        json={"variables": [{"name": "economy", "value": 0.8, "range": [0, 1]}]},
        headers=auth_headers(),
    )

    # Diff
    diff_resp = await client.get(f"/api/v1/studio/scenarios/{sc_id}/diff/{fork_id}", headers=auth_headers())
    assert "variable_diffs" in diff_resp.json()


# ─── Simulation ───

@pytest.mark.asyncio
async def test_simulation_workflow(client: AsyncClient):
    proj = await client.post("/api/v1/studio/projects", json={"name": "Sim Test"}, headers=auth_headers())
    pid = proj.json()["id"]

    # Create population + scenario
    pop_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/populations",
        json={"name": "Pop", "agent_count": 100, "distribution": {}},
        headers=auth_headers(),
    )
    pop_id = pop_resp.json()["id"]
    await client.post(f"/api/v1/studio/populations/{pop_id}/generate", headers=auth_headers())

    sc_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/scenarios",
        json={"name": "Sc", "causal_graph": {"nodes": [], "edges": []}, "variables": []},
        headers=auth_headers(),
    )
    sc_id = sc_resp.json()["id"]

    # Run simulation
    run_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/simulations",
        json={"scenario_id": sc_id, "population_id": pop_id, "config": {"ticks": 10}},
        headers=auth_headers(),
    )
    assert run_resp.json()["status"] == "completed"
    run_id = run_resp.json()["id"]

    # Create branch
    branch_resp = await client.post(
        f"/api/v1/studio/simulations/{run_id}/branch",
        json={"branch_name": "Alt", "variable_overrides": {"economy": 0.8}},
        headers=auth_headers(),
    )
    assert branch_resp.json()["branch_name"] == "Alt"

    # Compare
    compare_resp = await client.get(f"/api/v1/studio/simulations/{run_id}/compare", headers=auth_headers())
    assert "baseline" in compare_resp.json()
    assert len(compare_resp.json()["branches"]) >= 1


# ─── Reports ───

@pytest.mark.asyncio
async def test_report_workflow(client: AsyncClient):
    proj = await client.post("/api/v1/studio/projects", json={"name": "Report Test"}, headers=auth_headers())
    pid = proj.json()["id"]

    # Create report
    rpt_resp = await client.post(
        f"/api/v1/studio/projects/{pid}/reports",
        json={"title": "Test Report"},
        headers=auth_headers(),
    )
    rpt_id = rpt_resp.json()["id"]

    # Update
    update_resp = await client.patch(
        f"/api/v1/studio/reports/{rpt_id}",
        json={"content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Updated content"}]}]}},
        headers=auth_headers(),
    )
    assert update_resp.status_code == 200

    # Get
    get_resp = await client.get(f"/api/v1/studio/reports/{rpt_id}", headers=auth_headers())
    assert get_resp.status_code == 200
