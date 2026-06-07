import logging
import time
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.models.schemas import PredictionResponse, FairnessResponse
from backend.app.services.node_selector import node_selector
from backend.app.services.csv_manager import csv_result_manager
from backend.app.routers.nodes import CLUSTER_MEMBERSHIP_DIRECTORY

router = APIRouter(tags=["Predictive AI & Scheduling Efficacy"])
logger = logging.getLogger("PredictiveScheduler")

@router.get("/predict", response_model=PredictionResponse)
async def predict_node_load_telemetry(
    node_id: str = Query(..., description="Target node identifier to fetch load forecasting."),
    current_load: float = Query(..., ge=0.0, le=100.0, description="The momentary CPU load percent."),
    tasks_pending: int = Query(..., ge=0, description="Amount of transactions currently pending.")
):
    """
    Exposes high-grade load forecasting utilities.
    Runs linear regression on historical training points to determine future VM stress values.
    """
    try:
        # Resolve node URL or name
        matched_node_id = node_id
        for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
            if data["node_id"] == node_id or url == node_id:
                matched_node_id = data["node_id"]
                break
                
        prediction = node_selector.ai_predictor.predict_node_load(current_load, tasks_pending)
        
        return PredictionResponse(
            node_id=matched_node_id,
            current_load=current_load,
            tasks_pending=tasks_pending,
            predicted_load=round(prediction, 2)
        )
    except Exception as e:
        logger.error(f"Error during predictive scheduling calculations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/fairness", response_model=FairnessResponse)
async def get_cluster_fairness_indices():
    """
    Computes Jain's Fairness Index index across all nodes.
    Analyzes historical CSV file records and dynamic in-memory active states.
    Formula: J(x) = (sum(x)^2) / (n * sum(x^2))
    """
    # 1. In memory fairness index calculation
    completed_counts = [data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()]
    jains_mem = 1.0
    if completed_counts:
        n = len(completed_counts)
        sum_x = sum(completed_counts)
        sum_x_sq = sum(c ** 2 for c in completed_counts)
        if sum_x_sq > 0:
            jains_mem = (sum_x ** 2) / (n * sum_x_sq)
            
    # 2. Disk ledger fairness index calculation
    jains_csv = csv_result_manager.get_jains_index_from_file()
    
    # 3. Compile direct node distribution maps
    dist = {data["node_id"]: data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()}
    
    return FairnessResponse(
        jains_index_in_memory=round(jains_mem, 4),
        jains_index_from_csv=round(jains_csv, 4),
        node_distribution=dist
    )
