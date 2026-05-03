"""
COIT13236 - Distributed Resource Allocation System
Queensland Rail IoT Sensor Data Processing

Distributed Node - Each node acts as BOTH scheduler AND worker
No central scheduler - fully peer-to-peer distributed system
Author: Shreya Gopala (Project Manager)
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
import requests
import threading
import time
import random
import logging
import csv
import os
import argparse
from datetime import datetime
from typing import Optional
import json

# ── Logging Setup ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)

# ── FastAPI App ────────────────────────────────────────────────────────────────
app = FastAPI(title="Queensland Rail Distributed Node")

# ── Node State ─────────────────────────────────────────────────────────────────
class NodeState:
    def __init__(self, node_id: str, port: int, peers: list):
        self.node_id = node_id
        self.port = port
        self.peers = peers  # List of peer URLs
        self.is_alive = True
        self.current_load = 0.0  # CPU load percentage
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.total_latency = 0.0
        self.lock = threading.Lock()
        self.peer_loads = {}  # Cache of peer loads
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

# ── Request/Response Models ────────────────────────────────────────────────────
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

# ── Gossip Protocol — Share Load with Peers ────────────────────────────────────
def gossip_load():
    """Periodically share this node's load with all peers"""
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
                except:
                    pass
        time.sleep(3)

# ── Scheduling Strategies ──────────────────────────────────────────────────────
def select_worker(strategy: str) -> str:
    """Select the best node to handle a task based on strategy"""

    available_peers = {}
    for peer_url in node_state.peers:
        peer_load = node_state.peer_loads.get(peer_url, {})
        if peer_load.get("is_alive", True):
            available_peers[peer_url] = peer_load

    # Include self as option
    all_nodes = {f"self": {"load": node_state.current_load, "tasks_completed": node_state.tasks_completed}}
    all_nodes.update(available_peers)

    if not all_nodes:
        return "self"

    if strategy == "static":
        # Always handle locally
        return "self"

    elif strategy == "round_robin":
        # Rotate through all nodes
        all_urls = ["self"] + list(available_peers.keys())
        idx = node_state.tasks_completed % len(all_urls)
        return all_urls[idx]

    elif strategy == "least_loaded":
        # Send to least loaded node
        min_load = node_state.current_load
        best = "self"
        for peer_url, peer_data in available_peers.items():
            peer_load = peer_data.get("load", 100)
            if peer_load < min_load:
                min_load = peer_load
                best = peer_url
        return best

    elif strategy == "fairness":
        # Send to node with fewest completed tasks
        min_tasks = node_state.tasks_completed
        best = "self"
        for peer_url, peer_data in available_peers.items():
            peer_tasks = peer_data.get("tasks_completed", 999999)
            if peer_tasks < min_tasks:
                min_tasks = peer_tasks
                best = peer_url
        return best

    return "self"

# ── Task Execution ─────────────────────────────────────────────────────────────
def execute_task_locally(task: Task) -> TaskResult:
    """Execute a task on this node"""
    start_time = time.time()

    with node_state.lock:
        node_state.current_load = min(100, node_state.current_load + task.complexity * 30)

    # Simulate IoT sensor data processing
    time.sleep(task.complexity * random.uniform(0.05, 0.15))

    with node_state.lock:
        node_state.current_load = max(0, node_state.current_load - task.complexity * 30)
        node_state.tasks_completed += 1
        latency = time.time() - start_time
        node_state.total_latency += latency

    result = TaskResult(
        task_id=task.task_id,
        status="completed",
        worker_node=node_state.node_id,
        latency_s=round(latency, 3),
        strategy=task.strategy
    )

    logger.info(f"Task {task.task_id} completed on {node_state.node_id} | latency={latency:.3f}s | load={node_state.current_load:.0f}%")

    # Save result
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

# ── API Endpoints ──────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    """Health check endpoint"""
    return {
        "node_id": node_state.node_id,
        "status": "alive" if node_state.is_alive else "failed",
        "load": round(node_state.current_load, 2),
        "tasks_completed": node_state.tasks_completed,
        "peers": len(node_state.peers)
    }

@app.get("/metrics")
def metrics():
    """Performance metrics endpoint"""
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

@app.post("/dispatch")
def dispatch_task(task: Task):
    """Receive a task and decide where to execute it"""
    if not node_state.is_alive:
        raise HTTPException(status_code=503, detail=f"Node {node_state.node_id} is down")

    # Select best worker using strategy
    selected = select_worker(task.strategy)

    logger.info(f"[{node_state.node_id}] Task {task.task_id} → {selected} via {task.strategy}")

    if selected == "self":
        # Execute locally
        return execute_task_locally(task)
    else:
        # Forward to selected peer
        try:
            response = requests.post(
                f"{selected}/execute",
                json=task.dict(),
                timeout=10
            )
            return response.json()
        except Exception as e:
            logger.warning(f"Peer {selected} failed — executing locally: {e}")
            return execute_task_locally(task)

@app.post("/execute")
def execute_task(task: Task):
    """Directly execute a task on this node"""
    if not node_state.is_alive:
        raise HTTPException(status_code=503, detail=f"Node {node_state.node_id} is down")
    return execute_task_locally(task)

@app.post("/gossip")
def receive_gossip(data: dict):
    """Receive load information from a peer"""
    peer_id = data.get("node_id")
    # Find peer URL from node_id
    for peer_url in node_state.peers:
        if peer_id in peer_url or data.get("node_id") == peer_id:
            node_state.peer_loads[peer_url] = data
    return {"status": "received"}

@app.post("/fail")
def simulate_failure():
    """Simulate node failure"""
    node_state.is_alive = False
    logger.warning(f"Node {node_state.node_id} has FAILED — marked unavailable")
    return {"status": "failed", "node_id": node_state.node_id}

@app.post("/recover")
def simulate_recovery():
    """Simulate node recovery"""
    node_state.is_alive = True
    node_state.current_load = 0.0
    logger.info(f"Node {node_state.node_id} RECOVERED — back online")
    return {"status": "recovered", "node_id": node_state.node_id}

@app.get("/results")
def get_results():
    """Get all task results from this node"""
    return node_state.results

@app.post("/save_results")
def save_results(filename: str = "results.csv"):
    """Save results to CSV file"""
    if not node_state.results:
        return {"status": "no results to save"}

    filepath = f"/home/azureuser/{filename}"
    with open(filepath, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=node_state.results[0].keys())
        writer.writeheader()
        writer.writerows(node_state.results)

    return {"status": "saved", "filepath": filepath, "count": len(node_state.results)}

# ── Startup ────────────────────────────────────────────────────────────────────
def start_node(node_id: str, port: int, peers: list):
    global node_state
    node_state = NodeState(node_id=node_id, port=port, peers=peers)

    # Start gossip thread
    gossip_thread = threading.Thread(target=gossip_load, daemon=True)
    gossip_thread.start()

    logger.info(f"Starting Queensland Rail Distributed Node: {node_id}")
    logger.info(f"Port: {port}")
    logger.info(f"Peers: {peers}")
    logger.info(f"Endpoints: /health /metrics /dispatch /execute /gossip /fail /recover")

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Queensland Rail Distributed Node")
    parser.add_argument("--id", required=True, help="Node ID e.g. node-1")
    parser.add_argument("--port", type=int, required=True, help="Port to listen on")
    parser.add_argument("--peers", default="", help="Comma separated peer URLs e.g. http://IP:8002,http://IP:8003")
    args = parser.parse_args()

    peers = [p.strip() for p in args.peers.split(",") if p.strip()]
    start_node(args.id, args.port, peers)
