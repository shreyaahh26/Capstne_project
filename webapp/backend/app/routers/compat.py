import logging
import time
import random
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Request, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from backend.app.models.schemas import (
    TaskCreate, TaskResult, PredictionResponse, FairnessResponse,
    VMActionRequest, VMStatusResponse, DashboardStatsResponse
)
from backend.app.routers.nodes import CLUSTER_MEMBERSHIP_DIRECTORY
from backend.app.routers.vms import VM_METADATA_POOL, get_node_by_id_or_name
from backend.app.services.node_selector import node_selector
from backend.app.services.csv_manager import csv_result_manager
from backend.app.services.simulation_manager import load_simulator
from backend.app.services.websocket_manager import ws_telemetry_broadcaster
from backend.app.services.azure_automation import azure_vm_automation

router = APIRouter(tags=["Unified Dashboard APIs"])
logger = logging.getLogger("CompatRouter")

# Helper executing task locally or mock-remotely
async def dispatch_payload_logic(payload: TaskCreate, start_time: float) -> TaskResult:
    strategy = payload.strategy
    
    # Check if there are any alive nodes
    alive_vms = {url: data for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items() if data.get("is_alive", True)}
    
    if not alive_vms:
        duration = time.time() - start_time
        csv_result_manager.log_result(
            task_id=payload.task_id,
            task_type=payload.task_type,
            complexity=payload.complexity,
            worker="coordinator-local",
            strategy=strategy,
            latency_s=duration,
            status="failed",
            reason="All cluster worker nodes reported down."
        )
        raise HTTPException(status_code=503, detail="Cluster node deficit: All cluster nodes down.")

    # Select target node
    target = node_selector.select_worker_node(
        strategy=strategy,
        nodes_directory=CLUSTER_MEMBERSHIP_DIRECTORY,
        self_id="coordinator",
        self_load=20.0,
        self_completed=100
    )

    if target == "self" or target == "coordinator":
        # Execute locally
        compute_delay = round(payload.complexity * (1.0 + random.uniform(0.05, 0.25)), 4)
        time.sleep(compute_delay)
        latency = time.time() - start_time
        result = TaskResult(
            task_id=payload.task_id,
            status="completed",
            worker_node="coordinator-local",
            latency_s=round(latency, 4),
            strategy=strategy,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        csv_result_manager.log_result(
            task_id=result.task_id,
            task_type=payload.task_type,
            complexity=payload.complexity,
            worker=result.worker_node,
            strategy=strategy,
            latency_s=latency,
            status="completed"
        )
        await ws_telemetry_broadcaster.broadcast_metric_update("TASK_COMPLETED", result.dict())
        return result
    else:
        # Simulate execution on selected remote worker vm
        latency_sim = round(payload.complexity * (1.2 + random.uniform(0.1, 0.4)), 4)
        time.sleep(latency_sim)
        
        # Adjust counters
        CLUSTER_MEMBERSHIP_DIRECTORY[target]["tasks_completed"] += 1
        CLUSTER_MEMBERSHIP_DIRECTORY[target]["load"] = min(
            100, 
            round(CLUSTER_MEMBERSHIP_DIRECTORY[target]["load"] + payload.complexity * 25)
        )
        node_selector.ai_predictor.append_telemetry_point(
            current_load=CLUSTER_MEMBERSHIP_DIRECTORY[target]["load"],
            tasks_pending=random.randint(1, 4),
            future_load=min(100.0, CLUSTER_MEMBERSHIP_DIRECTORY[target]["load"] + 10.0)
        )
        predicted = node_selector.ai_predictor.predict_node_load(
            CLUSTER_MEMBERSHIP_DIRECTORY[target]["load"],
            random.randint(1, 4)
        )
        CLUSTER_MEMBERSHIP_DIRECTORY[target]["predicted_load"] = predicted

        duration = time.time() - start_time
        result = TaskResult(
            task_id=payload.task_id,
            status="completed",
            worker_node=CLUSTER_MEMBERSHIP_DIRECTORY[target]["node_id"],
            latency_s=round(duration, 4),
            strategy=strategy,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        csv_result_manager.log_result(
            task_id=result.task_id,
            task_type=payload.task_type,
            complexity=payload.complexity,
            worker=result.worker_node,
            strategy=strategy,
            latency_s=duration,
            status="completed"
        )
        await ws_telemetry_broadcaster.broadcast_metric_update("TASK_COMPLETED", result.dict())
        return result


# ---------------------------------------------------------
# Endpoints Matrix Mapping
# ---------------------------------------------------------

@router.get("/nodes", response_model=Dict[str, Dict[str, Any]])
async def get_all_nodes_status():
    """ Returns latest membership list synchronized via background gossip checks. """
    return CLUSTER_MEMBERSHIP_DIRECTORY

@router.get("/metrics")
@router.get("/prometheus-metrics")
async def get_prometheus_telemetry_metrics():
    """ Exposes raw scraping points formatted with Prometheus compatibility. """
    text_data = generate_latest()
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
    
    print("DEBUG TEST throughput value:", throughput_tps, avg_lat)
    
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
    return Response(content=combined_body, media_type=CONTENT_TYPE_LATEST)

@router.get("/health")
async def get_enterprise_system_health():
    """ Returns overall platform operational readiness, loads and Jain's indicators. """
    completed_counts = [data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()]
    jains_score = 1.0
    if completed_counts:
        n = len(completed_counts)
        sum_x = sum(completed_counts)
        sum_x_sq = sum(c ** 2 for c in completed_counts)
        jains_score = (sum_x ** 2) / (n * sum_x_sq) if sum_x_sq > 0 else 1.0

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
        }
    }

@router.post("/dispatch", response_model=TaskResult)
async def dispatch_task(payload: TaskCreate):
    """ Exposes a direct entry task scheduler to analyze, select, and relay incoming transactions. """
    start_time = time.time()
    return await dispatch_payload_logic(payload, start_time)

@router.get("/predict", response_model=PredictionResponse)
async def predict_workload(
    node_id: str = Query(..., description="Target node identifier."),
    current_load: float = Query(..., ge=0.0, le=100.0, description=" momentary load value."),
    tasks_pending: int = Query(..., ge=0, description="Amount of transactions pending.")
):
    """ Forecaster estimating stress indices on individual instances via machine learning models. """
    try:
        predicted = node_selector.ai_predictor.predict_node_load(current_load, tasks_pending)
        return PredictionResponse(
            node_id=node_id,
            current_load=current_load,
            tasks_pending=tasks_pending,
            predicted_load=round(predicted, 2)
        )
    except Exception as e:
        logger.error(f"Error during predictive calculations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/fairness", response_model=FairnessResponse)
async def get_jains_fairness():
    """ Calculates Jain's Fairness index representing resource distribution accuracy across instances. """
    completed_counts = [data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()]
    jains_mem = 1.0
    if completed_counts:
        n = len(completed_counts)
        sum_x = sum(completed_counts)
        sum_x_sq = sum(c ** 2 for c in completed_counts)
        if sum_x_sq > 0:
            jains_mem = (sum_x ** 2) / (n * sum_x_sq)
            
    jains_csv = csv_result_manager.get_jains_index_from_file()
    dist = {data["node_id"]: data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()}
    
    return FairnessResponse(
        jains_index_in_memory=round(jains_mem, 4),
        jains_index_from_csv=round(jains_csv, 4),
        node_distribution=dist
    )

@router.post("/simulation/start")
async def start_sim(
    request: Request,
    scenario: str = Query("normal", description="Sim: normal, burst, heavy"),
    strategy: str = Query("least_loaded", description="least_loaded, predictive, round_robin"),
    tasks: int = Query(20, ge=1, le=200, description="Task volume"),
    interval: float = Query(0.5, ge=0.01, le=5.0, description="Delay between runs")
):
    """ Kicks off background traffic simulation workloads mimicking load profiles on train sensors. """
    base_url = str(request.base_url).rstrip("/")
    success = load_simulator.trigger_scenario(
        scenario=scenario,
        base_url=base_url,
        strategy=strategy,
        task_count=tasks,
        interval_s=interval
    )
    if not success:
        raise HTTPException(status_code=400, detail="Another simulation flow is currently active.")
    return {
        "status": "started",
        "scenario": scenario,
        "strategy": strategy,
        "total_tasks": tasks,
        "polling_interval_s": interval
    }

@router.post("/simulation/stop")
async def stop_sim():
    """ Terminates all active background traffic generators. """
    load_simulator.abort_simulation()
    return {"status": "stopped", "message": "Simulation paused."}

@router.get("/simulation/results")
@router.get("/logs", response_model=List[Dict[str, Any]])
async def query_benchmarks(limit: int = Query(50, ge=1, le=200)):
    """ Retrieves processing records and execution queues logged to the csv ledger file. """
    return csv_result_manager.read_logs(limit=limit)

@router.post("/vm/start", response_model=Dict[str, Any])
async def boot_instance(payload: VMActionRequest, background_tasks: BackgroundTasks):
    """ Initiates boot procedures on cluster VMs to accept distributed traffic loads. """
    node_tuple = get_node_by_id_or_name(payload.node_id)
    if not node_tuple:
        raise HTTPException(status_code=404, detail=f"VM node '{payload.node_id}' unrecognized.")
    url, node_data = node_tuple
    if node_data["is_alive"]:
        return {"status": "already_active", "node_id": node_data["node_id"]}
        
    background_tasks.add_task(azure_vm_automation.scale_up_vm_fleet, node_data["node_id"], payload.vm_size)
    node_data["is_alive"] = True
    node_data["load"] = 10.0
    node_data["predicted_load"] = 12.0
    if node_data["node_id"] in VM_METADATA_POOL:
        VM_METADATA_POOL[node_data["node_id"]]["boot_time"] = time.time()
        
    await ws_telemetry_broadcaster.broadcast_metric_update("NODE_RECOVERED", {"node_id": node_data["node_id"], "url": url})
    return {"status": "starting", "node_id": node_data["node_id"]}

@router.post("/vm/stop", response_model=Dict[str, Any])
async def tear_instance(payload: VMActionRequest):
    """ Powers down standard instances in the cluster. """
    node_tuple = get_node_by_id_or_name(payload.node_id)
    if not node_tuple:
        raise HTTPException(status_code=404, detail=f"VM node '{payload.node_id}' unrecognized.")
    url, node_data = node_tuple
    if not node_data["is_alive"]:
        return {"status": "already_stopped", "node_id": node_data["node_id"]}
        
    node_data["is_alive"] = False
    node_data["load"] = 0.0
    node_data["predicted_load"] = 0.0
    node_data["tasks_failed"] += 1
    
    await ws_telemetry_broadcaster.broadcast_metric_update("NODE_CRASHED", {"node_id": node_data["node_id"], "url": url})
    return {"status": "stopped", "node_id": node_data["node_id"]}

@router.post("/vm/restart", response_model=Dict[str, Any])
async def restart_instance(payload: VMActionRequest, background_tasks: BackgroundTasks):
    """ Cycles virtual machine power nodes to restore clear registers. """
    node_tuple = get_node_by_id_or_name(payload.node_id)
    if not node_tuple:
        raise HTTPException(status_code=404, detail=f"VM node '{payload.node_id}' unrecognized.")
    url, node_data = node_tuple
    
    await ws_telemetry_broadcaster.broadcast_metric_update("NODE_CRASHED", {"node_id": node_data["node_id"], "url": url})
    node_data["is_alive"] = False
    node_data["load"] = 0.0
    node_data["predicted_load"] = 0.0
    
    def run_reboot(nid: str):
        time.sleep(2.0)
        nt = get_node_by_id_or_name(nid)
        if nt:
            _url, nd = nt
            nd["is_alive"] = True
            nd["load"] = 15.0
            nd["predicted_load"] = 18.0
            if nd["node_id"] in VM_METADATA_POOL:
                VM_METADATA_POOL[nd["node_id"]]["boot_time"] = time.time()
                
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(ws_telemetry_broadcaster.broadcast_metric_update("NODE_RECOVERED", {"node_id": nd["node_id"], "url": _url}))
            except Exception:
                pass
                
    background_tasks.add_task(run_reboot, node_data["node_id"])
    return {"status": "restarting", "node_id": node_data["node_id"]}

@router.get("/vm/status", response_model=List[VMStatusResponse])
async def list_vm_status(node_id: Optional[str] = Query(None)):
    """ Queries operational status indexes and uptime details for individual or full pools of machines. """
    vms_out = []
    for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
        nid = data["node_id"]
        if node_id and nid != node_id and url != node_id:
            continue
        meta = VM_METADATA_POOL.get(nid, {"location": "australiaeast", "cpu_cores": 2, "memory_gb": 4.0, "boot_time": time.time() - 3600})
        uptime = max(0.0, time.time() - meta["boot_time"]) if data["is_alive"] else 0.0
        vms_out.append(VMStatusResponse(
            node_id=nid,
            status="running" if data["is_alive"] else "stopped",
            is_alive=data["is_alive"],
            vm_size="Standard_B2ats_v2" if nid in VM_METADATA_POOL else "Standard_B1s",
            location=meta["location"],
            cpu_cores=meta["cpu_cores"],
            memory_gb=meta["memory_gb"],
            uptime_seconds=round(uptime, 2)
        ))
    if node_id and not vms_out:
        raise HTTPException(status_code=404, detail="Requested instance not active during lookup.")
    return vms_out

@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def fetch_dashboard_stats():
    """ Multi-dimensional stats aggregator returning loaded profiles, trends, and execution latencies. """
    live_nodes = list(CLUSTER_MEMBERSHIP_DIRECTORY.values())
    node_count = len(live_nodes)
    healthy_count = len([n for n in live_nodes if n["is_alive"]])
    active_loads = [n["load"] for n in live_nodes if n["is_alive"]]
    avg_load = sum(active_loads) / len(active_loads) if active_loads else 0.0
    completed_counts = [n["tasks_completed"] for n in live_nodes]
    total_completed_mem = sum(completed_counts)
    
    jains_mem = 1.0
    if completed_counts:
        n = len(completed_counts)
        sum_x = sum(completed_counts)
        sum_x_sq = sum(c ** 2 for c in completed_counts)
        if sum_x_sq > 0:
            jains_mem = (sum_x ** 2) / (n * sum_x_sq)

    logs = csv_result_manager.read_logs(limit=300)
    total_completed = 0
    total_failed = 0
    total_latency = 0.0
    
    strategy_map = {
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

    formatted_strategies = {}
    for st, v in strategy_map.items():
        comp = v["completed"]
        avg_lat = v["total_latency"] / comp if comp > 0 else 0.0
        formatted_strategies[st] = {
            "completed": comp,
            "failed": v["failed"],
            "avg_latency_s": round(avg_lat, 4)
        }
        
    global_avg_latency = total_latency / total_completed if total_completed > 0 else 0.0
    historical_utilization = []
    max_len = max([len(n["history"]) for n in live_nodes]) if live_nodes else 0
    for idx in range(max_len):
        point = {"timestamp": f"t-{max_len - idx}"}
        for node in live_nodes:
            hist = node["history"]
            point[node["node_id"]] = hist[idx] if idx < len(hist) else 0.0
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
