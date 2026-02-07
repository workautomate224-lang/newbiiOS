"""Prediction API routes."""

import asyncio
import json
import uuid
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query

from app.core.auth import get_current_user
from app.schemas.prediction import PredictionCreate, PredictionResponse, PredictionUpdate, VariableRerun

router = APIRouter(prefix="/api/v1/predictions", tags=["predictions"])

# In-memory store for MVP (will be replaced by Supabase)
_predictions: dict[str, dict] = {}
_results: dict[str, dict] = {}


async def _update_prediction_status(prediction_id: str, status: str):
    """Update prediction status (MVP: in-memory, production: Supabase)."""
    if prediction_id in _predictions:
        _predictions[prediction_id]["status"] = status


async def _run_pipeline_background(prediction_id: str, query: str):
    """Run the prediction pipeline in the background."""
    from app.services.prediction_pipeline import run_prediction_pipeline

    start = time.time()
    try:
        result = await run_prediction_pipeline(
            prediction_id=prediction_id,
            query=query,
            update_status=_update_prediction_status,
        )
        result["metadata"]["total_time_seconds"] = round(time.time() - start, 1)
        _results[prediction_id] = result
        _predictions[prediction_id]["status"] = "completed"
    except Exception as e:
        _predictions[prediction_id]["status"] = "failed"
        _predictions[prediction_id]["error"] = str(e)


@router.post("/create", response_model=PredictionResponse)
async def create_prediction(
    body: PredictionCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    prediction_id = str(uuid.uuid4())
    _predictions[prediction_id] = {
        "id": prediction_id,
        "user_id": user["id"],
        "query": body.query,
        "status": "processing",
        "options": body.options or {},
    }
    background_tasks.add_task(_run_pipeline_background, prediction_id, body.query)
    return PredictionResponse(id=prediction_id, status="processing", estimated_seconds=120)


@router.get("/trending")
async def get_trending():
    """Get trending/public predictions. No auth required."""
    # MVP: return sample data
    return [
        {
            "id": "sample-1",
            "query": "2026 Malaysian General Election outcome?",
            "status": "completed",
            "probability": 0.42,
            "category": "election",
            "view_count": 1234,
        },
        {
            "id": "sample-2",
            "query": "Will AI replace 30% of white-collar jobs by 2030?",
            "status": "completed",
            "probability": 0.35,
            "category": "tech",
            "view_count": 892,
        },
        {
            "id": "sample-3",
            "query": "Bitcoin price above $200K by end of 2026?",
            "status": "completed",
            "probability": 0.22,
            "category": "finance",
            "view_count": 2456,
        },
    ]


@router.get("/explore")
async def explore_predictions(
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    page: int = Query(1, ge=1),
):
    """Get public predictions with filtering and sorting."""
    all_preds = [
        p for p in _predictions.values()
        if p.get("is_public", False) and p.get("status") == "completed"
    ]
    if category and category != "all":
        all_preds = [p for p in all_preds if p.get("category") == category]
    if sort == "popular":
        all_preds.sort(key=lambda p: p.get("view_count", 0), reverse=True)
    else:
        all_preds.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    page_size = 12
    start = (page - 1) * page_size
    return {
        "predictions": all_preds[start : start + page_size],
        "total": len(all_preds),
        "page": page,
        "page_size": page_size,
    }


@router.get("/{prediction_id}")
async def get_prediction(prediction_id: str):
    pred = _predictions.get(prediction_id)
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return pred


@router.get("/{prediction_id}/result")
async def get_prediction_result(prediction_id: str):
    result = _results.get(prediction_id)
    if not result:
        pred = _predictions.get(prediction_id)
        if not pred:
            raise HTTPException(status_code=404, detail="Prediction not found")
        if pred["status"] != "completed":
            raise HTTPException(status_code=202, detail=f"Prediction still processing: {pred['status']}")
        raise HTTPException(status_code=404, detail="Result not found")
    return {
        "id": prediction_id,
        "query": result["query"],
        "status": "completed",
        "outcomes": result["outcomes"],
        "causal_graph": result["causal_graph"],
        "reasoning": result["reasoning"],
        "engines": result.get("engines", {}),
        "variables": result["variables"],
        "metadata": result["metadata"],
    }


@router.get("/{prediction_id}/agents")
async def get_prediction_agents(prediction_id: str):
    """Get agent simulation data for visualization."""
    result = _results.get(prediction_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    metadata = result.get("metadata", {})
    return {
        "agents": metadata.get("agent_histories", []),
        "edges": metadata.get("network_edges", []),
        "tick_count": metadata.get("simulation_ticks", 30),
    }


@router.post("/{prediction_id}/rerun")
async def rerun_prediction(
    prediction_id: str,
    body: VariableRerun,
    user: dict = Depends(get_current_user),
):
    result = _results.get(prediction_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    from app.services.prediction_pipeline import rerun_with_variables

    try:
        new_result = await rerun_with_variables(
            task=result["task"],
            original_data=result["data"],
            got_result={"outcomes": result["outcomes"], "dimensions": result["reasoning"].get("got_tree", [])},
            new_variables=body.variables,
        )
        # Update stored result
        _results[prediction_id]["outcomes"] = new_result["outcomes"]
        _results[prediction_id]["causal_graph"] = new_result["causal_graph"]
        _results[prediction_id]["reasoning"] = new_result["reasoning"]
        return new_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rerun failed: {str(e)}")


@router.patch("/{prediction_id}")
async def update_prediction(
    prediction_id: str,
    body: PredictionUpdate,
    user: dict = Depends(get_current_user),
):
    """Update prediction visibility."""
    pred = _predictions.get(prediction_id)
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    if pred.get("user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your prediction")
    if body.is_public is not None:
        pred["is_public"] = body.is_public
    return pred
