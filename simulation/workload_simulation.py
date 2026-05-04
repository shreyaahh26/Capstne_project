"""
Workload Simulation Script
COIT13236 – Distributed Resource Allocation Project

This script sends workload scenarios to the Azure-hosted distributed node system.
Although the argument name is scheduler-url, it now refers to the entry node URL,
because the system uses distributed_node.py instead of a central scheduler.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from urllib import request, error


logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIMULATION] %(message)s")
LOGGER = logging.getLogger(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def post_json(url: str, payload: Dict[str, Any], timeout: float = 15.0) -> Dict[str, Any]:
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    except error.HTTPError as exc:
        return {
            "task_id": payload.get("task_id", ""),
            "type": payload.get("task_type", ""),
            "complexity": payload.get("complexity", ""),
            "worker": "",
            "strategy": payload.get("strategy", ""),
            "latency_s": 0,
            "status": "failed",
            "reason": f"HTTP {exc.code}",
            "timestamp": utc_now_iso(),
        }

    except Exception as exc:
        return {
            "task_id": payload.get("task_id", ""),
            "type": payload.get("task_type", ""),
            "complexity": payload.get("complexity", ""),
            "worker": "",
            "strategy": payload.get("strategy", ""),
            "latency_s": 0,
            "status": "failed",
            "reason": str(exc),
            "timestamp": utc_now_iso(),
        }


def generate_task(task_id: int, task_type: str = "normal") -> Dict[str, Any]:
    """Generate a task with realistic complexity values."""
    complexity_map = {
        "normal": (0.05, 0.2),
        "burst": (0.3, 0.8),
        "heavy": (0.5, 1.0),
    }

    low, high = complexity_map.get(task_type, (0.05, 0.2))

    return {
        "task_id": f"task-{task_id:04d}",
        "task_type": task_type,
        "complexity": round(random.uniform(low, high), 4),
        "created_at": utc_now_iso(),
    }


def normalise_result(result: Dict[str, Any], task: Dict[str, Any], strategy: str) -> Dict[str, Any]:
    """Convert distributed node response into consistent CSV format."""
    return {
        "task_id": result.get("task_id", task["task_id"]),
        "type": task["task_type"],
        "complexity": task["complexity"],
        "worker": result.get("worker_node", result.get("node", "")),
        "strategy": result.get("strategy", strategy),
        "latency_s": result.get("latency_s", result.get("latency", 0)),
        "status": result.get("status", "unknown"),
        "reason": result.get("reason", ""),
        "timestamp": result.get("timestamp", utc_now_iso()),
    }


def dispatch_task_to_entry_node(
    task: Dict[str, Any],
    entry_node_url: str,
    strategy: str,
) -> Dict[str, Any]:
    """Send task to the distributed node /dispatch endpoint."""
    payload = {
        "task_id": task["task_id"],
        "task_type": task["task_type"],
        "complexity": task["complexity"],
        "strategy": strategy,
    }

    result = post_json(f"{entry_node_url.rstrip('/')}/dispatch", payload)
    return normalise_result(result, task, strategy)


def normal_workload(
    entry_node_url: str,
    strategy: str,
    num_tasks: int = 10,
    interval: float = 0.1,
) -> List[Dict[str, Any]]:
    LOGGER.info("Starting NORMAL workload: %s tasks using %s", num_tasks, strategy)

    results = []

    for i in range(num_tasks):
        task = generate_task(i + 1, "normal")
        results.append(dispatch_task_to_entry_node(task, entry_node_url, strategy))
        time.sleep(interval)

    LOGGER.info("Normal workload complete")
    return results


def burst_workload(
    entry_node_url: str,
    strategy: str,
    num_tasks: int = 50,
    burst_size: int = 30,
) -> List[Dict[str, Any]]:
    LOGGER.info(
        "Starting BURST workload: %s tasks, burst size=%s using %s",
        num_tasks,
        burst_size,
        strategy,
    )

    results = []

    # Warm-up phase
    for i in range(5):
        task = generate_task(i + 1, "normal")
        results.append(dispatch_task_to_entry_node(task, entry_node_url, strategy))
        time.sleep(0.1)

    # Sudden burst phase
    LOGGER.info(">>> BURST PHASE started")
    for i in range(burst_size):
        task = generate_task(100 + i, "burst")
        results.append(dispatch_task_to_entry_node(task, entry_node_url, strategy))
        time.sleep(0.02)

    # Recovery/normal phase
    LOGGER.info(">>> Burst subsiding")
    remaining = max(0, num_tasks - burst_size - 5)

    for i in range(remaining):
        task = generate_task(200 + i, "normal")
        results.append(dispatch_task_to_entry_node(task, entry_node_url, strategy))
        time.sleep(0.1)

    LOGGER.info("Burst workload complete")
    return results


def node_failure_scenario(
    entry_node_url: str,
    strategy: str,
    tasks_before: int = 5,
    tasks_after: int = 5,
) -> List[Dict[str, Any]]:
    """
    Simulate failure of the entry node.

    In the distributed architecture, each node can fail/recover through its own
    /fail and /recover endpoints. This scenario fails the selected entry node,
    then recovers it after capturing failed task behaviour.
    """
    LOGGER.info("Starting NODE FAILURE scenario using %s", strategy)

    results = []

    for i in range(tasks_before):
        task = generate_task(i + 1, "normal")
        results.append(dispatch_task_to_entry_node(task, entry_node_url, strategy))
        time.sleep(0.1)

    LOGGER.warning("Simulating entry node failure")
    post_json(f"{entry_node_url.rstrip('/')}/fail", {})

    for i in range(tasks_after):
        task = generate_task(300 + i, "normal")
        results.append(dispatch_task_to_entry_node(task, entry_node_url, strategy))
        time.sleep(0.1)

    LOGGER.info("Recovering entry node")
    post_json(f"{entry_node_url.rstrip('/')}/recover", {})

    LOGGER.info("Node failure scenario complete")
    return results


def save_results(results: List[Dict[str, Any]], output_path: str) -> Path:
    filepath = Path(output_path)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "task_id",
        "type",
        "complexity",
        "worker",
        "strategy",
        "latency_s",
        "status",
        "reason",
        "timestamp",
    ]

    with filepath.open("w", newline="", encoding="utf-8") as file_obj:
        writer = csv.DictWriter(file_obj, fieldnames=fieldnames)
        writer.writeheader()

        for row in results:
            writer.writerow({key: row.get(key, "") for key in fieldnames})

    LOGGER.info("Results saved to %s", filepath)
    return filepath


def print_summary(results: List[Dict[str, Any]]) -> None:
    if not results:
        print("No results to summarise.")
        return

    latencies = [float(r.get("latency_s", 0) or 0) for r in results]
    completed = [r for r in results if r.get("status") == "completed"]
    failed = [r for r in results if r.get("status") != "completed"]

    avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
    min_latency = min(latencies) if latencies else 0.0
    max_latency = max(latencies) if latencies else 0.0
    throughput = len(completed) / max(sum(latencies), 0.001)

    workers = {}

    for row in completed:
        worker = row.get("worker", "unknown")
        workers[worker] = workers.get(worker, 0) + 1

    print("\n" + "=" * 50)
    print("SIMULATION SUMMARY")
    print("=" * 50)
    print(f"Total tasks:      {len(results)}")
    print(f"Completed:        {len(completed)}")
    print(f"Failed/Rejected:  {len(failed)}")
    print(f"Avg latency:      {avg_latency:.3f}s")
    print(f"Min latency:      {min_latency:.3f}s")
    print(f"Max latency:      {max_latency:.3f}s")
    print(f"Throughput:       {throughput:.2f} tasks/s")
    print(f"Task distribution:{workers}")
    print("=" * 50)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run workload simulations against the distributed node system"
    )

    parser.add_argument(
        "--scheduler-url",
        default="http://127.0.0.1:8001",
        help="Entry node URL. Kept as scheduler-url for compatibility.",
    )

    parser.add_argument(
        "--strategy",
        default="round_robin",
        choices=["static", "round_robin", "least_loaded", "fairness"],
        help="Scheduling strategy",
    )

    parser.add_argument(
        "--scenario",
        default="normal",
        choices=["normal", "burst", "failure", "all", "compare"],
        help="Scenario to run",
    )

    parser.add_argument(
        "--output",
        default="monitoring/results/azure/simulation_results.csv",
        help="CSV output path",
    )

    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducible tests",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)

    if args.scenario == "normal":
        results = normal_workload(args.scheduler_url, args.strategy)

    elif args.scenario == "burst":
        results = burst_workload(args.scheduler_url, args.strategy)

    elif args.scenario == "failure":
        results = node_failure_scenario(args.scheduler_url, args.strategy)

    elif args.scenario == "compare":
        results = []

        for strategy in ["static", "round_robin", "least_loaded", "fairness"]:
            results.extend(normal_workload(args.scheduler_url, strategy))

    else:
        results = []
        results.extend(normal_workload(args.scheduler_url, args.strategy))
        results.extend(burst_workload(args.scheduler_url, args.strategy))
        results.extend(node_failure_scenario(args.scheduler_url, args.strategy))

    print_summary(results)
    output_path = save_results(results, args.output)

    print(f"\nDone. Check {output_path} for CSV output.")


if __name__ == "__main__":
    main()