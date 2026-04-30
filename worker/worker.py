from __future__ import annotations

import argparse
import logging
import random
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [WORKER] %(message)s")
LOGGER = logging.getLogger(__name__)

app = FastAPI(title="Queensland Rail Worker Node")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Task(BaseModel):
    task_id: str | None = None
    id: str | None = None
    task_type: str = "normal"
    type: str | None = None
    complexity: float = 0.1
    strategy: str = "round_robin"


class WorkerNode:
    def __init__(self, node_id: str, capacity: int = 100) -> None:
        self.node_id = node_id
        self.capacity = capacity
        self.current_load = 0
        self.tasks_completed = 0
        self.tasks_failed = 0
        self.total_latency = 0.0
        self.is_alive = True
        self._lock = threading.Lock()

    def _predicted_load_increase(self, complexity: float) -> int:
        return max(1, int(complexity * 20))

    def health_check(self) -> str:
        if not self.is_alive:
            return "DOWN"
        if self.current_load >= self.capacity * 0.9:
            return "OVERLOADED"
        if self.current_load >= self.capacity * 0.7:
            return "HIGH"
        return "HEALTHY"

    def execute_task(self, task: Task) -> Dict[str, Any]:
        task_id = task.task_id or task.id or "unknown-task"
        task_type = task.type or task.task_type
        complexity = max(0.01, min(float(task.complexity), 5.0))
        predicted_increase = self._predicted_load_increase(complexity)

        with self._lock:
            if not self.is_alive:
                self.tasks_failed += 1
                raise HTTPException(status_code=503, detail="Worker node is down")

            if self.current_load + predicted_increase > self.capacity:
                self.tasks_failed += 1
                raise HTTPException(status_code=503, detail="Worker overloaded")

            self.current_load = min(self.capacity, self.current_load + predicted_increase)

        start = time.perf_counter()
        time.sleep(complexity * random.uniform(0.8, 1.2))
        elapsed = time.perf_counter() - start

        with self._lock:
            self.current_load = max(0, self.current_load - predicted_increase)
            self.tasks_completed += 1
            self.total_latency += elapsed

        LOGGER.info(
            "[%s] Task %s completed | latency=%.3fs | load=%s%%",
            self.node_id,
            task_id,
            elapsed,
            self.current_load,
        )

        return {
            "task_id": task_id,
            "type": task_type,
            "complexity": complexity,
            "node_id": self.node_id,
            "status": "completed",
            "latency_s": round(elapsed, 4),
            "load_pct": self.current_load,
            "timestamp": utc_now_iso(),
        }

    def get_metrics(self) -> Dict[str, Any]:
        with self._lock:
            avg_latency = self.total_latency / self.tasks_completed if self.tasks_completed else 0.0
            throughput = self.tasks_completed / max(self.total_latency, 0.001)

            return {
                "node_id": self.node_id,
                "is_alive": self.is_alive,
                "health": self.health_check(),
                "current_load_pct": self.current_load,
                "capacity_pct": self.capacity,
                "tasks_completed": self.tasks_completed,
                "tasks_failed": self.tasks_failed,
                "avg_latency_s": round(avg_latency, 4),
                "throughput": round(throughput, 2),
                "timestamp": utc_now_iso(),
            }


worker_node: WorkerNode | None = None


@app.get("/health")
def health():
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    return {
        "node_id": worker_node.node_id,
        "status": worker_node.health_check(),
        "is_alive": worker_node.is_alive,
        "load": worker_node.current_load,
        "tasks_completed": worker_node.tasks_completed,
        "timestamp": utc_now_iso(),
    }


@app.get("/metrics")
def metrics():
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")
    return worker_node.get_metrics()


@app.post("/execute")
def execute(task: Task):
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")
    return worker_node.execute_task(task)


@app.post("/fail")
def fail():
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    worker_node.is_alive = False
    LOGGER.warning("%s has FAILED", worker_node.node_id)

    return {
        "node_id": worker_node.node_id,
        "status": "DOWN",
        "timestamp": utc_now_iso(),
    }


@app.post("/recover")
def recover():
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    worker_node.is_alive = True
    worker_node.current_load = 0
    LOGGER.info("%s has RECOVERED", worker_node.node_id)

    return {
        "node_id": worker_node.node_id,
        "status": "HEALTHY",
        "timestamp": utc_now_iso(),
    }


def main() -> None:
    global worker_node

    parser = argparse.ArgumentParser(description="FastAPI Worker Node Service")
    parser.add_argument("--id", default="worker-1", help="Worker node ID")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", type=int, default=8001, help="Port to listen on")
    parser.add_argument("--capacity", type=int, default=100, help="Maximum load capacity")
    args = parser.parse_args()

    worker_node = WorkerNode(node_id=args.id, capacity=args.capacity)

    LOGGER.info("FastAPI worker %s starting on %s:%s", args.id, args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()