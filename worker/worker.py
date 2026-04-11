"""
Worker Node Service
COIT13236 – Distributed Resource Allocation Project
Runs a lightweight HTTP service that receives and processes tasks.

Endpoints:
- GET  /health
- GET  /metrics
- POST /execute
- POST /fail
- POST /recover
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict

logging.basicConfig(level=logging.INFO, format="%(asctime)s [WORKER] %(message)s")
LOGGER = logging.getLogger(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkerNode:
    """Represents a single distributed worker node."""

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

    def execute_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Process an incoming task and return execution metrics."""
        task_id = task.get("id", "unknown-task")
        task_type = task.get("type", "normal")
        complexity = float(task.get("complexity", 0.1))
        complexity = max(0.01, min(complexity, 5.0))
        predicted_increase = self._predicted_load_increase(complexity)

        with self._lock:
            if not self.is_alive:
                self.tasks_failed += 1
                return {
                    "task_id": task_id,
                    "type": task_type,
                    "complexity": complexity,
                    "node_id": self.node_id,
                    "status": "failed",
                    "reason": "node_down",
                    "latency_s": 0.0,
                    "load_pct": self.current_load,
                    "timestamp": utc_now_iso(),
                }

            if self.current_load + predicted_increase > self.capacity:
                self.tasks_failed += 1
                return {
                    "task_id": task_id,
                    "type": task_type,
                    "complexity": complexity,
                    "node_id": self.node_id,
                    "status": "rejected",
                    "reason": "overloaded",
                    "latency_s": 0.0,
                    "load_pct": self.current_load,
                    "timestamp": utc_now_iso(),
                }

            self.current_load = min(self.capacity, self.current_load + predicted_increase)

        start = time.perf_counter()
        time.sleep(complexity * random.uniform(0.8, 1.2))
        elapsed = time.perf_counter() - start

        with self._lock:
            self.current_load = max(0, self.current_load - predicted_increase)
            self.tasks_completed += 1
            self.total_latency += elapsed
            result = {
                "task_id": task_id,
                "type": task_type,
                "complexity": complexity,
                "node_id": self.node_id,
                "status": "completed",
                "reason": "",
                "latency_s": round(elapsed, 4),
                "load_pct": self.current_load,
                "timestamp": utc_now_iso(),
            }

        LOGGER.info(
            "[%s] Task %s done | latency=%.3fs | load=%s%%",
            self.node_id,
            task_id,
            elapsed,
            result["load_pct"],
        )
        return result

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

    def health_check(self) -> str:
        if not self.is_alive:
            return "DOWN"
        if self.current_load >= self.capacity * 0.9:
            return "OVERLOADED"
        if self.current_load >= self.capacity * 0.7:
            return "HIGH"
        return "HEALTHY"

    def fail(self) -> None:
        with self._lock:
            self.is_alive = False
        LOGGER.warning("%s has FAILED", self.node_id)

    def recover(self) -> None:
        with self._lock:
            self.is_alive = True
            self.current_load = 0
        LOGGER.info("%s has RECOVERED", self.node_id)


class WorkerRequestHandler(BaseHTTPRequestHandler):
    worker_node: WorkerNode | None = None

    def _send_json(self, payload: Dict[str, Any], status: int = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON payload")

    def log_message(self, fmt: str, *args: Any) -> None:
        LOGGER.info("%s - %s", self.address_string(), fmt % args)

    def do_GET(self) -> None:  # noqa: N802
        worker = self.worker_node
        if worker is None:
            self._send_json({"error": "Worker not initialised"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if self.path == "/health":
            self._send_json(
                {
                    "node_id": worker.node_id,
                    "status": worker.health_check(),
                    "is_alive": worker.is_alive,
                    "timestamp": utc_now_iso(),
                }
            )
            return

        if self.path == "/metrics":
            self._send_json(worker.get_metrics())
            return

        self._send_json({"error": f"Unknown path: {self.path}"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        worker = self.worker_node
        if worker is None:
            self._send_json({"error": "Worker not initialised"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        try:
            payload = self._read_json_body()
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if self.path == "/execute":
            result = worker.execute_task(payload)
            http_status = HTTPStatus.OK if result["status"] == "completed" else HTTPStatus.SERVICE_UNAVAILABLE
            self._send_json(result, http_status)
            return

        if self.path == "/fail":
            worker.fail()
            self._send_json({"node_id": worker.node_id, "status": "DOWN", "timestamp": utc_now_iso()})
            return

        if self.path == "/recover":
            worker.recover()
            self._send_json({"node_id": worker.node_id, "status": "HEALTHY", "timestamp": utc_now_iso()})
            return

        self._send_json({"error": f"Unknown path: {self.path}"}, HTTPStatus.NOT_FOUND)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Worker Node Service")
    parser.add_argument("--id", default="worker-1", help="Worker node ID")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", type=int, default=8001, help="Port to listen on")
    parser.add_argument("--capacity", type=int, default=100, help="Maximum load capacity")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    worker = WorkerNode(node_id=args.id, capacity=args.capacity)
    WorkerRequestHandler.worker_node = worker

    server = ThreadingHTTPServer((args.host, args.port), WorkerRequestHandler)
    LOGGER.info("Worker %s listening on %s:%s", args.id, args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Worker %s shutting down", args.id)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
