"""
Workload Simulation Script
COIT13236 – Distributed Resource Allocation Project
Generates realistic workload patterns and sends tasks to the scheduler.
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
from urllib import request

logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIMULATION] %(message)s")
LOGGER = logging.getLogger(__name__)

OUTPUT_DIR = Path("monitoring/results")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def post_json(url: str, payload: Dict[str, Any], timeout: float = 10.0) -> Dict[str, Any]:
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


# ── Task generator ────────────────────────────────────────────────────────────

def generate_task(task_id: int, task_type: str = "normal") -> Dict[str, Any]:
    complexity_map = {
        "normal": (0.05, 0.2),
        "burst": (0.3, 0.8),
        "heavy": (0.5, 1.0),
    }
    low, high = complexity_map.get(task_type, (0.05, 0.2))
    return {
        "id": f"task-{task_id:04d}",
        "type": task_type,
        "complexity": round(random.uniform(low, high), 4),
        "created_at": utc_now_iso(),
    }


def dispatch_task_to_scheduler(task: Dict[str, Any], scheduler_url: str, strategy: str) -> Dict[str, Any]:
    payload = {"task": task, "strategy": strategy}
    result = post_json(f"{scheduler_url.rstrip('/')}/dispatch", payload)
    return result


# ── Workload scenarios ────────────────────────────────────────────────────────

def normal_workload(scheduler_url: str, strategy: str, num_tasks: int = 20, interval: float = 0.1) -> List[Dict[str, Any]]:
    LOGGER.info("Starting NORMAL workload: %s tasks using %s", num_tasks, strategy)
    results = []
    for i in range(num_tasks):
        task = generate_task(i + 1, "normal")
        result = dispatch_task_to_scheduler(task, scheduler_url, strategy)
        results.append(result)
        time.sleep(interval)
    LOGGER.info("Normal workload complete")
    return results


def burst_workload(scheduler_url: str, strategy: str, num_tasks: int = 30, burst_size: int = 10) -> List[Dict[str, Any]]:
    LOGGER.info("Starting BURST workload: %s tasks (burst size=%s) using %s", num_tasks, burst_size, strategy)
    results = []

    for i in range(5):
        task = generate_task(i + 1, "normal")
        results.append(dispatch_task_to_scheduler(task, scheduler_url, strategy))
        time.sleep(0.1)

    LOGGER.info(">>> BURST PHASE: flash sale event started")
    for i in range(burst_size):
        task = generate_task(100 + i, "burst")
        results.append(dispatch_task_to_scheduler(task, scheduler_url, strategy))
        time.sleep(0.02)

    LOGGER.info(">>> Burst subsiding – returning to normal traffic")
    for i in range(max(0, num_tasks - burst_size - 5)):
        task = generate_task(200 + i, "normal")
        results.append(dispatch_task_to_scheduler(task, scheduler_url, strategy))
        time.sleep(0.1)

    LOGGER.info("Burst workload complete")
    return results


def node_failure_scenario(
    scheduler_url: str,
    strategy: str,
    failing_worker_id: str = "worker-2",
    tasks_before: int = 10,
    tasks_after: int = 10,
) -> List[Dict[str, Any]]:
    LOGGER.info("Starting NODE FAILURE scenario using %s", strategy)
    results = []

    for i in range(tasks_before):
        task = generate_task(i + 1, "normal")
        results.append(dispatch_task_to_scheduler(task, scheduler_url, strategy))
        time.sleep(0.1)

    LOGGER.warning("Simulating failure of %s", failing_worker_id)
    post_json(f"{scheduler_url.rstrip('/')}/fail_node", {"worker_id": failing_worker_id})

    for i in range(tasks_after):
        task = generate_task(300 + i, "normal")
        results.append(dispatch_task_to_scheduler(task, scheduler_url, strategy))
        time.sleep(0.1)

    LOGGER.info("Recovering %s", failing_worker_id)
    post_json(f"{scheduler_url.rstrip('/')}/recover_node", {"worker_id": failing_worker_id})

    LOGGER.info("Node failure scenario complete")
    return results


# ── Metrics collection ────────────────────────────────────────────────────────

def save_results(results: List[Dict[str, Any]], filename: str = "simulation_results.csv") -> Path:
    filepath = OUTPUT_DIR / filename
    if not results:
        return filepath

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
    print("=" * 50)


def compare_all_strategies(scheduler_url: str, scenario: str, seed: int | None = None) -> List[Dict[str, Any]]:
    all_results: List[Dict[str, Any]] = []
    for strategy in ["static", "round_robin", "least_loaded", "fairness"]:
        if seed is not None:
            random.seed(seed)
        if scenario == "normal":
            all_results.extend(normal_workload(scheduler_url, strategy, num_tasks=10))
        elif scenario == "burst":
            all_results.extend(burst_workload(scheduler_url, strategy, num_tasks=20, burst_size=8))
        elif scenario == "failure":
            all_results.extend(node_failure_scenario(scheduler_url, strategy, tasks_before=5, tasks_after=5))
        else:
            raise ValueError(f"Unknown scenario: {scenario}")
    return all_results


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run workload simulations against the scheduler service")
    parser.add_argument("--scheduler-url", default="http://127.0.0.1:9000", help="Base URL of the scheduler service")
    parser.add_argument("--strategy", default="round_robin", choices=["static", "round_robin", "least_loaded", "fairness"], help="Scheduling strategy")
    parser.add_argument("--scenario", default="all", choices=["normal", "burst", "failure", "all", "compare"], help="Scenario to run")
    parser.add_argument("--output", default="simulation_results.csv", help="CSV output filename")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible tests")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    random.seed(args.seed)

    all_results: List[Dict[str, Any]] = []

    if args.scenario == "normal":
        all_results = normal_workload(args.scheduler_url, args.strategy, num_tasks=10)
    elif args.scenario == "burst":
        all_results = burst_workload(args.scheduler_url, args.strategy, num_tasks=20, burst_size=8)
    elif args.scenario == "failure":
        all_results = node_failure_scenario(args.scheduler_url, args.strategy, tasks_before=5, tasks_after=5)
    elif args.scenario == "compare":
        all_results = compare_all_strategies(args.scheduler_url, "normal", seed=args.seed)
    else:
        all_results.extend(normal_workload(args.scheduler_url, args.strategy, num_tasks=10))
        all_results.extend(burst_workload(args.scheduler_url, args.strategy, num_tasks=20, burst_size=8))
        all_results.extend(node_failure_scenario(args.scheduler_url, args.strategy, tasks_before=5, tasks_after=5))

    print_summary(all_results)
    output_path = save_results(all_results, args.output)
    print(f"\nDone. Check {output_path} for CSV output.")


if __name__ == "__main__":
    main()
