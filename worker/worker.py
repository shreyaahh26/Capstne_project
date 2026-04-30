from __future__ import annotations

import argparse
import logging
import random
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from prometheus_client import Counter, Gauge, Histogram, generate_latest


# -----------------------------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [WORKER] %(message)s")
LOGGER = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# FastAPI Application
# -----------------------------------------------------------------------------
app = FastAPI(title="Queensland Rail Worker Node")


# -----------------------------------------------------------------------------
# Prometheus Metrics
# -----------------------------------------------------------------------------
tasks_total = Counter(
    "worker_tasks_total",
    "Total number of tasks processed by the worker",
    ["worker_id", "status"],
)

current_load_gauge = Gauge(
    "worker_cpu_load",
    "Current worker load percentage",
    ["worker_id"],
)

task_latency_histogram = Histogram(
    "worker_task_latency_seconds",
    "Task processing latency in seconds",
    ["worker_id"],
)

tasks_failed_total = Counter(
    "worker_tasks_failed_total",
    "Total number of failed or rejected tasks",
    ["worker_id", "reason"],
)


def utc_now_iso() -> str:
    """Return the current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


# -----------------------------------------------------------------------------
# Request Model
# -----------------------------------------------------------------------------
class Task(BaseModel):
    """Represents a task received by the worker node."""

    task_id: str | None = None
    id: str | None = None
    task_type: str = "normal"
    type: str | None = None
    complexity: float = 0.1
    strategy: str = "round_robin"


# -----------------------------------------------------------------------------
# Worker Node Logic
# -----------------------------------------------------------------------------
class WorkerNode:
    """Maintains worker state and processes incoming tasks."""

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
        """Estimate temporary load increase based on task complexity."""
        return max(1, int(complexity * 20))

    def health_check(self) -> str:
        """Return the current health state of the worker."""
        if not self.is_alive:
            return "DOWN"
        if self.current_load >= self.capacity * 0.9:
            return "OVERLOADED"
        if self.current_load >= self.capacity * 0.7:
            return "HIGH"
        return "HEALTHY"

    def execute_task(self, task: Task) -> Dict[str, Any]:
        """Execute a task and update runtime and Prometheus metrics."""
        task_id = task.task_id or task.id or "unknown-task"
        task_type = task.type or task.task_type
        complexity = max(0.01, min(float(task.complexity), 5.0))
        predicted_increase = self._predicted_load_increase(complexity)

        with self._lock:
            if not self.is_alive:
                self.tasks_failed += 1
                tasks_total.labels(self.node_id, "failed").inc()
                tasks_failed_total.labels(self.node_id, "node_down").inc()
                current_load_gauge.labels(self.node_id).set(self.current_load)
                raise HTTPException(status_code=503, detail="Worker node is down")

            if self.current_load + predicted_increase > self.capacity:
                self.tasks_failed += 1
                tasks_total.labels(self.node_id, "rejected").inc()
                tasks_failed_total.labels(self.node_id, "overloaded").inc()
                current_load_gauge.labels(self.node_id).set(self.current_load)
                raise HTTPException(status_code=503, detail="Worker overloaded")

            self.current_load = min(self.capacity, self.current_load + predicted_increase)
            current_load_gauge.labels(self.node_id).set(self.current_load)

        start_time = time.perf_counter()

        # Simulate processing time for IoT sensor workload.
        time.sleep(complexity * random.uniform(0.8, 1.2))

        elapsed = time.perf_counter() - start_time

        with self._lock:
            self.current_load = max(0, self.current_load - predicted_increase)
            self.tasks_completed += 1
            self.total_latency += elapsed
            current_load_gauge.labels(self.node_id).set(self.current_load)

        tasks_total.labels(self.node_id, "completed").inc()
        task_latency_histogram.labels(self.node_id).observe(elapsed)

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
        """Return JSON metrics for API testing and manual inspection."""
        with self._lock:
            avg_latency = (
                self.total_latency / self.tasks_completed
                if self.tasks_completed
                else 0.0
            )
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


# -----------------------------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------------------------
@app.get("/health")
def health() -> Dict[str, Any]:
    """Check whether the worker node is available."""
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
def metrics() -> Dict[str, Any]:
    """Return worker metrics as JSON."""
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    return worker_node.get_metrics()


@app.get("/prometheus-metrics")
def prometheus_metrics() -> Response:
    """Expose worker metrics in Prometheus scrape format."""
    if worker_node is not None:
        current_load_gauge.labels(worker_node.node_id).set(worker_node.current_load)

    return Response(generate_latest(), media_type="text/plain")


@app.post("/execute")
def execute(task: Task) -> Dict[str, Any]:
    """Receive and execute a task."""
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    return worker_node.execute_task(task)


@app.post("/fail")
def fail() -> Dict[str, Any]:
    """Simulate a worker node failure."""
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    worker_node.is_alive = False
    current_load_gauge.labels(worker_node.node_id).set(worker_node.current_load)

    LOGGER.warning("%s has FAILED", worker_node.node_id)

    return {
        "node_id": worker_node.node_id,
        "status": "DOWN",
        "timestamp": utc_now_iso(),
    }


@app.post("/recover")
def recover() -> Dict[str, Any]:
    """Recover a failed worker node."""
    if worker_node is None:
        raise HTTPException(status_code=500, detail="Worker not initialised")

    worker_node.is_alive = True
    worker_node.current_load = 0
    current_load_gauge.labels(worker_node.node_id).set(0)

    LOGGER.info("%s has RECOVERED", worker_node.node_id)

    return {
        "node_id": worker_node.node_id,
        "status": "HEALTHY",
        "timestamp": utc_now_iso(),
    }


# -----------------------------------------------------------------------------
# Application Entry Point
# -----------------------------------------------------------------------------
def main() -> None:
    global worker_node

    parser = argparse.ArgumentParser(description="FastAPI Worker Node Service")
    parser.add_argument("--id", default="worker-1", help="Worker node ID")
    parser.add_argument("--host", default="0.0.0.0", help="Host address to bind")
    parser.add_argument("--port", type=int, default=8001, help="Port to listen on")
    parser.add_argument("--capacity", type=int, default=100, help="Maximum load capacity")

    args = parser.parse_args()

    worker_node = WorkerNode(node_id=args.id, capacity=args.capacity)

    LOGGER.info("Starting worker %s on %s:%s", args.id, args.host, args.port)
    LOGGER.info("Endpoints: /health /metrics /prometheus-metrics /execute /fail /recover")

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()