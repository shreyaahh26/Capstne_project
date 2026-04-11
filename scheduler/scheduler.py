"""
Central Scheduler Service
COIT13236 – Distributed Resource Allocation Project
Handles incoming tasks and distributes them to worker nodes
using multiple scheduling strategies.

Endpoints:
- GET  /workers
- GET  /health
- POST /dispatch
- POST /fail_node
- POST /recover_node
"""

from __future__ import annotations

import argparse
import json
import logging
import threading
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional
from urllib import error, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SCHEDULER] %(message)s")
LOGGER = logging.getLogger(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Scheduler:
    def __init__(self, worker_nodes: List[Dict[str, Any]], timeout_s: float = 5.0) -> None:
        self.worker_nodes = worker_nodes
        self.timeout_s = timeout_s
        self._rr_index = 0
        self._lock = threading.Lock()

    def _http_json(self, method: str, url: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data = None
        headers = {"Content-Type": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
        req = request.Request(url, data=data, headers=headers, method=method)
        with request.urlopen(req, timeout=self.timeout_s) as response:
            return json.loads(response.read().decode("utf-8"))

    def _worker_base_url(self, worker: Dict[str, Any]) -> str:
        return f"http://{worker['host']}:{worker['port']}"

    def _check_worker_health(self, worker: Dict[str, Any]) -> str:
        if not worker.get("enabled", True):
            worker["status"] = "DOWN"
            return "DOWN"
        try:
            health = self._http_json("GET", f"{self._worker_base_url(worker)}/health")
            worker["status"] = health.get("status", "UNKNOWN")
            worker["is_alive"] = health.get("is_alive", False)
            return worker["status"]
        except Exception:
            worker["status"] = "DOWN"
            worker["is_alive"] = False
            return "DOWN"

    def _fetch_worker_metrics(self, worker: Dict[str, Any]) -> Dict[str, Any]:
        try:
            metrics = self._http_json("GET", f"{self._worker_base_url(worker)}/metrics")
            worker["load"] = metrics.get("current_load_pct", 0)
            worker["task_count"] = metrics.get("tasks_completed", 0)
            worker["status"] = metrics.get("health", "UNKNOWN")
            worker["is_alive"] = metrics.get("is_alive", False)
            return metrics
        except Exception:
            worker["status"] = "DOWN"
            worker["is_alive"] = False
            worker["load"] = 100
            return {
                "node_id": worker["id"],
                "is_alive": False,
                "health": "DOWN",
                "current_load_pct": 100,
                "tasks_completed": worker.get("task_count", 0),
            }

    def refresh_all_workers(self) -> List[Dict[str, Any]]:
        snapshot = []
        for worker in self.worker_nodes:
            metrics = self._fetch_worker_metrics(worker)
            snapshot.append(
                {
                    "id": worker["id"],
                    "host": worker["host"],
                    "port": worker["port"],
                    "enabled": worker.get("enabled", True),
                    "status": metrics.get("health", worker.get("status", "UNKNOWN")),
                    "load": metrics.get("current_load_pct", worker.get("load", 0)),
                    "tasks_completed": metrics.get("tasks_completed", worker.get("task_count", 0)),
                }
            )
        return snapshot

    def static_allocation(self, task: Dict[str, Any]) -> Dict[str, Any]:
        for worker in self.worker_nodes:
            if self._check_worker_health(worker) != "DOWN":
                return worker
        raise RuntimeError("No available workers for static allocation")

    def round_robin(self, task: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            start_index = self._rr_index
            for offset in range(len(self.worker_nodes)):
                idx = (start_index + offset) % len(self.worker_nodes)
                worker = self.worker_nodes[idx]
                if self._check_worker_health(worker) != "DOWN":
                    self._rr_index = idx + 1
                    return worker
        raise RuntimeError("No available workers for round robin")

    def least_loaded(self, task: Dict[str, Any]) -> Dict[str, Any]:
        candidates = []
        for worker in self.worker_nodes:
            metrics = self._fetch_worker_metrics(worker)
            if metrics.get("is_alive"):
                candidates.append(worker)
        if not candidates:
            raise RuntimeError("No available workers for least-loaded scheduling")
        return min(candidates, key=lambda w: (w.get("load", 100), w.get("task_count", 0)))

    def fairness_based(self, task: Dict[str, Any]) -> Dict[str, Any]:
        candidates = []
        for worker in self.worker_nodes:
            metrics = self._fetch_worker_metrics(worker)
            if metrics.get("is_alive"):
                candidates.append(worker)
        if not candidates:
            raise RuntimeError("No available workers for fairness-based scheduling")
        return min(candidates, key=lambda w: (w.get("task_count", 0), w.get("load", 100)))

    def pick_worker(self, task: Dict[str, Any], strategy: str) -> Dict[str, Any]:
        strategies = {
            "static": self.static_allocation,
            "round_robin": self.round_robin,
            "least_loaded": self.least_loaded,
            "fairness": self.fairness_based,
        }
        if strategy not in strategies:
            raise ValueError(f"Unknown strategy: {strategy}")
        return strategies[strategy](task)

    def dispatch_task(self, task: Dict[str, Any], strategy: str = "round_robin") -> Dict[str, Any]:
        start = time.perf_counter()
        tried_ids: List[str] = []
        last_error = ""

        for _ in range(len(self.worker_nodes)):
            worker = self.pick_worker(task, strategy)
            if worker["id"] in tried_ids:
                continue
            tried_ids.append(worker["id"])

            try:
                result = self._http_json("POST", f"{self._worker_base_url(worker)}/execute", task)
                worker["load"] = result.get("load_pct", worker.get("load", 0))
                worker["task_count"] = worker.get("task_count", 0) + (1 if result.get("status") == "completed" else 0)
                elapsed = time.perf_counter() - start
                response = {
                    "task_id": result.get("task_id", task.get("id")),
                    "type": result.get("type", task.get("type", "normal")),
                    "complexity": result.get("complexity", task.get("complexity", 0.0)),
                    "worker": result.get("node_id", worker["id"]),
                    "strategy": strategy,
                    "latency_s": result.get("latency_s", round(elapsed, 4)),
                    "status": result.get("status", "completed"),
                    "reason": result.get("reason", ""),
                    "timestamp": result.get("timestamp", utc_now_iso()),
                }
                LOGGER.info(
                    "Task %s -> %s via %s | status=%s | latency=%ss",
                    response["task_id"],
                    response["worker"],
                    strategy,
                    response["status"],
                    response["latency_s"],
                )
                return response
            except error.HTTPError as exc:
                last_error = f"HTTP {exc.code} from {worker['id']}"
                worker["status"] = "DOWN"
                worker["is_alive"] = False
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                worker["status"] = "DOWN"
                worker["is_alive"] = False

        return {
            "task_id": task.get("id", "unknown-task"),
            "type": task.get("type", "normal"),
            "complexity": task.get("complexity", 0.0),
            "worker": "",
            "strategy": strategy,
            "latency_s": round(time.perf_counter() - start, 4),
            "status": "failed",
            "reason": f"No available workers. Last error: {last_error}",
            "timestamp": utc_now_iso(),
        }

    def simulate_node_failure(self, worker_id: str) -> Dict[str, Any]:
        for worker in self.worker_nodes:
            if worker["id"] == worker_id:
                worker["enabled"] = False
                try:
                    self._http_json("POST", f"{self._worker_base_url(worker)}/fail", {})
                except Exception:
                    pass
                worker["status"] = "DOWN"
                return {"node_id": worker_id, "status": "DOWN", "timestamp": utc_now_iso()}
        raise ValueError(f"Worker {worker_id} not found")

    def recover_node(self, worker_id: str) -> Dict[str, Any]:
        for worker in self.worker_nodes:
            if worker["id"] == worker_id:
                worker["enabled"] = True
                self._http_json("POST", f"{self._worker_base_url(worker)}/recover", {})
                worker["status"] = "HEALTHY"
                worker["load"] = 0
                return {"node_id": worker_id, "status": "HEALTHY", "timestamp": utc_now_iso()}
        raise ValueError(f"Worker {worker_id} not found")


class SchedulerRequestHandler(BaseHTTPRequestHandler):
    scheduler: Scheduler | None = None

    def _send_json(self, payload: Dict[str, Any] | List[Dict[str, Any]], status: int = HTTPStatus.OK) -> None:
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
        scheduler = self.scheduler
        if scheduler is None:
            self._send_json({"error": "Scheduler not initialised"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if self.path == "/workers":
            self._send_json(scheduler.refresh_all_workers())
            return

        if self.path == "/health":
            workers = scheduler.refresh_all_workers()
            healthy = sum(1 for w in workers if w.get("status") != "DOWN")
            self._send_json(
                {
                    "service": "scheduler",
                    "status": "HEALTHY" if healthy else "DEGRADED",
                    "available_workers": healthy,
                    "total_workers": len(workers),
                    "timestamp": utc_now_iso(),
                }
            )
            return

        self._send_json({"error": f"Unknown path: {self.path}"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:  # noqa: N802
        scheduler = self.scheduler
        if scheduler is None:
            self._send_json({"error": "Scheduler not initialised"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        try:
            payload = self._read_json_body()
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if self.path == "/dispatch":
            task = payload.get("task", payload)
            strategy = payload.get("strategy", "round_robin")
            result = scheduler.dispatch_task(task, strategy)
            status = HTTPStatus.OK if result.get("status") == "completed" else HTTPStatus.SERVICE_UNAVAILABLE
            self._send_json(result, status)
            return

        if self.path == "/fail_node":
            worker_id = payload.get("worker_id", "")
            try:
                result = scheduler.simulate_node_failure(worker_id)
                self._send_json(result)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if self.path == "/recover_node":
            worker_id = payload.get("worker_id", "")
            try:
                result = scheduler.recover_node(worker_id)
                self._send_json(result)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        self._send_json({"error": f"Unknown path: {self.path}"}, HTTPStatus.NOT_FOUND)


def parse_worker(worker_str: str) -> Dict[str, Any]:
    try:
        node_id, host, port = worker_str.split(":", 2)
        return {
            "id": node_id,
            "host": host,
            "port": int(port),
            "load": 0,
            "task_count": 0,
            "status": "UNKNOWN",
            "is_alive": False,
            "enabled": True,
        }
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "Workers must be in the format worker-id:host:port"
        ) from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Central Scheduler Service")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", type=int, default=9000, help="Port to listen on")
    parser.add_argument(
        "--worker",
        action="append",
        type=parse_worker,
        dest="workers",
        help="Worker definition in the format worker-id:host:port. Can be repeated.",
    )
    parser.add_argument("--timeout", type=float, default=5.0, help="Worker request timeout in seconds")
    return parser.parse_args()


def default_workers() -> List[Dict[str, Any]]:
    return [
        {"id": "worker-1", "host": "127.0.0.1", "port": 8001, "load": 0, "task_count": 0, "status": "UNKNOWN", "is_alive": False, "enabled": True},
        {"id": "worker-2", "host": "127.0.0.1", "port": 8002, "load": 0, "task_count": 0, "status": "UNKNOWN", "is_alive": False, "enabled": True},
        {"id": "worker-3", "host": "127.0.0.1", "port": 8003, "load": 0, "task_count": 0, "status": "UNKNOWN", "is_alive": False, "enabled": True},
    ]


def main() -> None:
    args = parse_args()
    workers = args.workers if args.workers else default_workers()
    scheduler = Scheduler(worker_nodes=workers, timeout_s=args.timeout)
    SchedulerRequestHandler.scheduler = scheduler

    server = ThreadingHTTPServer((args.host, args.port), SchedulerRequestHandler)
    LOGGER.info("Scheduler listening on %s:%s", args.host, args.port)
    LOGGER.info("Configured workers: %s", ", ".join(f"{w['id']}@{w['host']}:{w['port']}" for w in workers))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOGGER.info("Scheduler shutting down")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
