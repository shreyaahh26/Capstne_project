import logging
from typing import Dict, Any
from fastapi import APIRouter, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from backend.app.services.csv_manager import csv_result_manager
from backend.app.routers.nodes import CLUSTER_MEMBERSHIP_DIRECTORY

router = APIRouter(tags=["Observability & Diagnostics"])
logger = logging.getLogger("MetricsRouter")

@router.get("/health")
async def get_system_health():
    """
    Returns high-integrity system metrics. Calculates cumulative loads
    and Jain Fairness index indicators dynamically.
    """
    # Grab all completed count lists to compute Jains score
    completed_counts = [data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()]
    
    # Calculate Jain index
    if completed_counts:
        n = len(completed_counts)
        sum_x = sum(completed_counts)
        sum_x_sq = sum(c ** 2 for c in completed_counts)
        jains_score = (sum_x ** 2) / (n * sum_x_sq) if sum_x_sq > 0 else 1.0
    else:
        jains_score = 1.0

    # Calculate average cluster load
    active_loads = [data["load"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values() if data.get("is_alive", True)]
    avg_load = sum(active_loads) / len(active_loads) if active_loads else 0.0

    return {
        "status": "healthy" if avg_load < 85 else "congested",
        "api_ready": True,
        "cluster_health": {
            "node_count": len(CLUSTER_MEMBERSHIP_DIRECTORY),
            "healthy_count": len([n for n in CLUSTER_MEMBERSHIP_DIRECTORY.values() if n.get("is_alive", True)]),
            "average_util_pct": round(avg_load, 2),
            "jains_fairness_index": round(jains_score, 4),
            "gossip_topology": "full-mesh"
        },
        "ledgers": {
            "results_file_index": round(csv_result_manager.get_jains_index_from_file(), 4)
        }
    }

@router.get("/metrics")
@router.get("/prometheus-metrics")
async def get_prometheus_metrics():
    """
    Serves formatted text scraping points compatible with Prometheus.
    Exposes JVM/runtime custom queues, request latency percentiles, and counts.
    """
    # Generate latest metrics output using prometheus_client library
    text_data = generate_latest()
    
    # Append custom custom metric lines matching physical VM specifications if needed
    custom_metrics = []
    
    # Calculate global latency and throughput metrics roughly for Grafana
    logs = csv_result_manager.read_logs(limit=200)
    avg_lat = 0.0
    throughput_tps = 0.0
    
    if logs:
        lats = [float(l.get("latency_s", 0)) for l in logs if l.get("status") == "completed"]
        if lats:
            avg_lat = sum(lats)/len(lats)
            
        import datetime
        now = datetime.datetime.utcnow()
        recent = 0
        for l in logs:
            try:
                dt_str = l.get("timestamp")
                # Parse timestamp naive
                dt = datetime.datetime.fromisoformat(dt_str)
                # Compute naive difference
                diff = (now - dt).total_seconds()
                if 0 <= diff <= 10:  # Count tasks from last 10 seconds
                    recent += 1
            except Exception:
                pass
        throughput_tps = recent / 10.0
        
    custom_metrics.extend([
        f'# HELP distributed_cluster_throughput_tps Cluster throughput (req/s)',
        f'# TYPE distributed_cluster_throughput_tps gauge',
        f'distributed_cluster_throughput_tps {throughput_tps}',
        f'# HELP distributed_cluster_avg_latency_s Cluster average latency',
        f'# TYPE distributed_cluster_avg_latency_s gauge',
        f'distributed_cluster_avg_latency_s {avg_lat}',
    ])
    
    # Append load and totals of existing membership list
    for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
        node_lbl = f'node_id="{data["node_id"]}"'
        alive_val = "1.0" if data["is_alive"] else "0.0"
        
        custom_metrics.extend([
            f'# HELP distributed_node_current_load Current node utilization index percentage',
            f'# TYPE distributed_node_current_load gauge',
            f'distributed_node_current_load{{{node_lbl}}} {data["load"]}',
            f'# HELP distributed_node_predicted_load AI estimated upcoming load percentage',
            f'# TYPE distributed_node_predicted_load gauge',
            f'distributed_node_predicted_load{{{node_lbl}}} {data["predicted_load"]}',
            f'# HELP distributed_node_tasks_total Completed load balancing jobs counter',
            f'# TYPE distributed_node_tasks_total counter',
            f'distributed_node_tasks_total{{{node_lbl},status="completed"}} {data["tasks_completed"]}',
            f'distributed_node_tasks_total{{{node_lbl},status="failed"}} {data["tasks_failed"]}',
            f'# HELP distributed_node_is_alive Member machine heartbeat indicator',
            f'# TYPE distributed_node_is_alive gauge',
            f'distributed_node_is_alive{{{node_lbl}}} {alive_val}'
        ])
        
    combined_body = text_data.decode("utf-8") + "\n" + "\n".join(custom_metrics) + "\n"
    print("DEBUG: metrics response has throughput? ", "throughput" in combined_body, "length=", len(combined_body))
    
    return Response(content=combined_body, media_type=CONTENT_TYPE_LATEST)
