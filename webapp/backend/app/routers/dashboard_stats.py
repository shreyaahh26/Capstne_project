import logging
from typing import Dict, Any, List
from fastapi import APIRouter

from backend.app.models.schemas import DashboardStatsResponse
from backend.app.routers.nodes import CLUSTER_MEMBERSHIP_DIRECTORY
from backend.app.services.csv_manager import csv_result_manager
from backend.app.services.simulation_manager import load_simulator

router = APIRouter(prefix="/dashboard", tags=["Dashboard Real-time Telemetry Services"])
logger = logging.getLogger("DashboardStatsRouter")

@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_aggregated_telemetry():
    """
    Returns unified metrics spanning nodes, load-balancing strategy metrics,
    and rolling timelines of utilization indices.
    """
    # 1. Parse in-memory cluster details
    live_nodes = list(CLUSTER_MEMBERSHIP_DIRECTORY.values())
    node_count = len(live_nodes)
    healthy_count = len([n for n in live_nodes if n["is_alive"]])
    
    active_loads = [n["load"] for n in live_nodes if n["is_alive"]]
    avg_load = sum(active_loads) / len(active_loads) if active_loads else 0.0
    
    completed_counts = [n["tasks_completed"] for n in live_nodes]
    total_completed_mem = sum(completed_counts)
    
    # Calculate Jains in memory index
    jains_mem = 1.0
    if completed_counts:
        n = len(completed_counts)
        sum_x = sum(completed_counts)
        sum_x_sq = sum(c ** 2 for c in completed_counts)
        if sum_x_sq > 0:
            jains_mem = (sum_x ** 2) / (n * sum_x_sq)

    # 2. Parse pandas ledger calculations for latencies and strategy indexes
    logs = csv_result_manager.read_logs(limit=300)
    
    total_completed = 0
    total_failed = 0
    total_latency = 0.0
    
    # Stratified metrics tracker
    strategy_map: Dict[str, Dict[str, Any]] = {
        "static": {"completed": 0, "failed": 0, "total_latency": 0.0},
        "round_robin": {"completed": 0, "failed": 0, "total_latency": 0.0},
        "least_loaded": {"completed": 0, "failed": 0, "total_latency": 0.0},
        "fairness": {"completed": 0, "failed": 0, "total_latency": 0.0},
        "predictive": {"completed": 0, "failed": 0, "total_latency": 0.0}
    }
    
    for row in logs:
        strat = row.get("strategy", "unknown")
        status = row.get("status", "unknown")
        lat = float(row.get("latency_s", 0.0))
        
        if status == "completed":
            total_completed += 1
            total_latency += lat
            
            if strat in strategy_map:
                strategy_map[strat]["completed"] += 1
                strategy_map[strat]["total_latency"] += lat
        elif status == "failed":
            total_failed += 1
            if strat in strategy_map:
                strategy_map[strat]["failed"] += 1

    # Format strategy details
    formatted_strategies: Dict[str, Any] = {}
    for st, v in strategy_map.items():
        comp = v["completed"]
        avg_lat = v["total_latency"] / comp if comp > 0 else 0.0
        formatted_strategies[st] = {
            "completed": comp,
            "failed": v["failed"],
            "avg_latency_s": round(avg_lat, 4)
        }
        
    global_avg_latency = total_latency / total_completed if total_completed > 0 else 0.0

    # 3. Compile rolling historical loads lists
    historical_utilization: List[Dict[str, Any]] = []
    
    # We find max length of histories
    max_len = max([len(n["history"]) for n in live_nodes]) if live_nodes else 0
    
    for idx in range(max_len):
        point: Dict[str, Any] = {"timestamp": f"t-{max_len - idx}"}
        for node in live_nodes:
            hist = node["history"]
            if idx < len(hist):
                point[node["node_id"]] = hist[idx]
            else:
                point[node["node_id"]] = 0.0
        historical_utilization.append(point)

    return DashboardStatsResponse(
        status="healthy" if avg_load < 85.0 else "congested",
        api_ready=True,
        cluster_metrics={
            "node_count": node_count,
            "healthy_count": healthy_count,
            "average_util_pct": round(avg_load, 2),
            "jains_fairness_index": round(jains_mem, 4),
            "total_tasks_completed": total_completed_mem,
            "global_avg_latency_s": round(global_avg_latency, 4)
        },
        strategy_metrics=formatted_strategies,
        historical_utilization=historical_utilization,
        simulation_active=load_simulator.is_running
    )
