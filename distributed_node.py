"""
COIT13236 - Distributed Resource Allocation System
Queensland Rail IoT Sensor Data Processing

Each node acts as both scheduler and worker.
Includes FastAPI, gossip-based peer communication, scheduling strategies,
task execution, failure simulation, result saving, and Prometheus metrics. 
"""

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from prometheus_client import Counter, Gauge, Histogram, generate_latest

import uvicorn
import requests
import threading
import time
import random
import logging
import csv
import argparse
from datetime import datetime
from typing import Optional


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Queensland Rail Distributed Node")


# Prometheus metrics
tasks_total = Counter(
    "distributed_node_tasks_total",
    "Total tasks processed by distributed node",
    ["node_id", "status", "strategy"]
)

current_load_gauge = Gauge(
    "distributed_node_current_load",
    "Current load percentage of distributed node",
    ["node_id"]
)

task_latency_histogram = Histogram(
    "distributed_node_task_latency_seconds",
    "Task execution latency in seconds",
    ["node_id", "strategy"]
)

tasks_failed_total = Counter(
    "distributed_node_tasks_failed_total",
    "Total failed tasks",
    ["node_id", "reason"]
)


class NodeState:
    def __init__(self, node_id: str, port: int, peers: list):
        self.node_id = node_id
        self.port = port
        self.peers = peers
        self.is_alive = True
        self.current_load = 0.0
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.total_latency = 0.0
        self.lock = threading.Lock()
        self.peer_loads = {}
        self.results = []

    @property
    def avg_latency(self):
        if self.tasks_completed == 0:
            return 0.0
        return self.total_latency / self.tasks_completed

    @property
    def throughput(self):
        return self.tasks_completed


node_state: Optional[NodeState] = None


class Task(BaseModel):
    task_id: str
    task_type: str = "normal"
    complexity: float = 0.1
    strategy: str = "least_loaded"
    source_node: str = ""


class TaskResult(BaseModel):
    task_id: str
    status: str
    worker_node: str
    latency_s: float
    strategy: str


def gossip_load():
    """Share this node's load with peers every 3 seconds."""
    while True:
        if node_state and node_state.is_alive:
            for peer_url in node_state.peers:
                try:
                    requests.post(
                        f"{peer_url}/gossip",
                        json={
                            "node_id": node_state.node_id,
                            "load": node_state.current_load,
                            "tasks_completed": node_state.tasks_completed,
                            "is_alive": node_state.is_alive
                        },
                        timeout=2
                    )
                except Exception:
                    pass
        time.sleep(3)


def select_worker(strategy: str) -> str:
    """Select target node based on the chosen scheduling strategy."""
    available_peers = {}

    for peer_url in node_state.peers:
        peer_load = node_state.peer_loads.get(peer_url, {})
        if peer_load.get("is_alive", True):
            available_peers[peer_url] = peer_load

    if strategy == "static":
        return "self"

    if strategy == "round_robin":
        all_urls = ["self"] + list(available_peers.keys())
        index = node_state.tasks_completed % len(all_urls)
        return all_urls[index]

    if strategy == "least_loaded":
        best = "self"
        min_load = node_state.current_load

        for peer_url, peer_data in available_peers.items():
            peer_load = peer_data.get("load", 100)
            if peer_load < min_load:
                min_load = peer_load
                best = peer_url

        return best

    if strategy == "fairness":
        best = "self"
        min_tasks = node_state.tasks_completed

        for peer_url, peer_data in available_peers.items():
            peer_tasks = peer_data.get("tasks_completed", 999999)
            if peer_tasks < min_tasks:
                min_tasks = peer_tasks
                best = peer_url

        return best

    return "self"


def execute_task_locally(task: Task) -> TaskResult:
    """Simulate processing of an IoT sensor task on this node."""
    start_time = time.time()

    with node_state.lock:
        node_state.current_load = min(
            100,
            node_state.current_load + task.complexity * 30
        )
        current_load_gauge.labels(
            node_id=node_state.node_id
        ).set(node_state.current_load)

    time.sleep(task.complexity * random.uniform(0.05, 0.15))

    with node_state.lock:
        node_state.current_load = max(
            0,
            node_state.current_load - task.complexity * 30
        )
        node_state.tasks_completed += 1
        latency = time.time() - start_time
        node_state.total_latency += latency

        current_load_gauge.labels(
            node_id=node_state.node_id
        ).set(node_state.current_load)

    tasks_total.labels(
        node_id=node_state.node_id,
        status="completed",
        strategy=task.strategy
    ).inc()

    task_latency_histogram.labels(
        node_id=node_state.node_id,
        strategy=task.strategy
    ).observe(latency)

    result = TaskResult(
        task_id=task.task_id,
        status="completed",
        worker_node=node_state.node_id,
        latency_s=round(latency, 3),
        strategy=task.strategy
    )

    logger.info(
        f"Task {task.task_id} completed on {node_state.node_id} | "
        f"latency={latency:.3f}s | load={node_state.current_load:.0f}%"
    )

    node_state.results.append({
        "task_id": task.task_id,
        "type": task.task_type,
        "complexity": task.complexity,
        "worker": node_state.node_id,
        "strategy": task.strategy,
        "latency_s": round(latency, 3),
        "status": "completed",
        "timestamp": datetime.utcnow().isoformat()
    })

    return result


@app.get("/health")
def health():
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    return {
        "node_id": node_state.node_id,
        "status": "alive" if node_state.is_alive else "failed",
        "load": round(node_state.current_load, 2),
        "tasks_completed": node_state.tasks_completed,
        "peers": len(node_state.peers)
    }


@app.get("/metrics")
def metrics():
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    return {
        "node_id": node_state.node_id,
        "is_alive": node_state.is_alive,
        "current_load": round(node_state.current_load, 2),
        "tasks_completed": node_state.tasks_completed,
        "tasks_failed": node_state.tasks_failed,
        "avg_latency_s": round(node_state.avg_latency, 3),
        "throughput": node_state.throughput,
        "peer_count": len(node_state.peers),
        "peer_loads": node_state.peer_loads
    }


@app.get("/prometheus-metrics")
def prometheus_metrics():
    if node_state is not None:
        current_load_gauge.labels(
            node_id=node_state.node_id
        ).set(node_state.current_load)

    return Response(generate_latest(), media_type="text/plain")


@app.post("/dispatch")
def dispatch_task(task: Task):
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    if not node_state.is_alive:
        node_state.tasks_failed += 1

        tasks_failed_total.labels(
            node_id=node_state.node_id,
            reason="node_down"
        ).inc()

        tasks_total.labels(
            node_id=node_state.node_id,
            status="failed",
            strategy=task.strategy
        ).inc()

        raise HTTPException(
            status_code=503,
            detail=f"Node {node_state.node_id} is down"
        )

    selected = select_worker(task.strategy)

    logger.info(
        f"[{node_state.node_id}] Task {task.task_id} "
        f"→ {selected} via {task.strategy}"
    )

    if selected == "self":
        return execute_task_locally(task)

    try:
        response = requests.post(
            f"{selected}/execute",
            json=task.dict(),
            timeout=10
        )

        if response.status_code != 200:
            raise Exception(f"Peer returned status {response.status_code}")

        return response.json()

    except Exception as e:
        logger.warning(f"Peer {selected} failed — executing locally: {e}")

        tasks_failed_total.labels(
            node_id=node_state.node_id,
            reason="peer_forward_failed"
        ).inc()

        return execute_task_locally(task)


@app.post("/execute")
def execute_task(task: Task):
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    if not node_state.is_alive:
        node_state.tasks_failed += 1

        tasks_failed_total.labels(
            node_id=node_state.node_id,
            reason="node_down"
        ).inc()

        tasks_total.labels(
            node_id=node_state.node_id,
            status="failed",
            strategy=task.strategy
        ).inc()

        raise HTTPException(
            status_code=503,
            detail=f"Node {node_state.node_id} is down"
        )

    return execute_task_locally(task)


@app.post("/gossip")
def receive_gossip(data: dict):
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    peer_id = data.get("node_id")

    for peer_url in node_state.peers:
        if peer_id in peer_url or data.get("node_id") == peer_id:
            node_state.peer_loads[peer_url] = data

    return {"status": "received"}


@app.post("/fail")
def simulate_failure():
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    node_state.is_alive = False

    tasks_failed_total.labels(
        node_id=node_state.node_id,
        reason="manual_failure"
    ).inc()

    logger.warning(f"Node {node_state.node_id} has FAILED")

    return {
        "status": "failed",
        "node_id": node_state.node_id
    }


@app.post("/recover")
def simulate_recovery():
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    node_state.is_alive = True
    node_state.current_load = 0.0

    current_load_gauge.labels(
        node_id=node_state.node_id
    ).set(0)

    logger.info(f"Node {node_state.node_id} RECOVERED")

    return {
        "status": "recovered",
        "node_id": node_state.node_id
    }


@app.get("/results")
def get_results():
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    return node_state.results


@app.post("/save_results")
def save_results(filename: str = "results.csv"):
    if node_state is None:
        raise HTTPException(status_code=500, detail="Node not initialised")

    if not node_state.results:
        return {"status": "no results to save"}

    filepath = f"/home/azureuser/{filename}"

    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=node_state.results[0].keys()
        )
        writer.writeheader()
        writer.writerows(node_state.results)

    return {
        "status": "saved",
        "filepath": filepath,
        "count": len(node_state.results)
    }


def start_node(node_id: str, port: int, peers: list):
    global node_state

    node_state = NodeState(
        node_id=node_id,
        port=port,
        peers=peers
    )

    current_load_gauge.labels(
        node_id=node_state.node_id
    ).set(node_state.current_load)

    threading.Thread(
        target=gossip_load,
        daemon=True
    ).start()

    logger.info(f"Starting Queensland Rail Distributed Node: {node_id}")
    logger.info(f"Port: {port}")
    logger.info(f"Peers: {peers}")
    logger.info(
        "Endpoints: /health /metrics /prometheus-metrics "
        "/dispatch /execute /gossip /fail /recover /results /save_results"
    )

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Queensland Rail Distributed Node"
    )

    parser.add_argument(
        "--id",
        required=True,
        help="Node ID e.g. node-1"
    )

    parser.add_argument(
        "--port",
        type=int,
        required=True,
        help="Port to listen on"
    )

    parser.add_argument(
        "--peers",
        default="",
        help="Comma separated peer URLs e.g. http://IP:8002,http://IP:8003"
    )

    args = parser.parse_args()

    peers = [
        p.strip()
        for p in args.peers.split(",")
        if p.strip()
    ]

    start_node(args.id, args.port, peers)
