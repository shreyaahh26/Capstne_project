import time
import logging
import random
import threading
import uuid
import requests
from typing import Dict, Any, List
from backend.app.services.csv_manager import csv_result_manager
from backend.app.services.websocket_manager import ws_telemetry_broadcaster

logger = logging.getLogger("SimulationService")

class DistributedLoadSimulator:
    """
    Simulates real-world railway sensor loads hitting our active cluster.
    Spawns background routines mimicking traffic bursts or failure cycles.
    """
    def __init__(self):
        self.simulation_thread: Optional[threading.Thread] = None
        self.is_running = False
        self._lock = threading.Lock()
        
    def _run_workload_loop(
        self, 
        scenario: str, 
        base_url: str, 
        strategy: str, 
        task_count: int, 
        interval_s: float
    ):
        """ Internal execution loop executing requests in a background thread context. """
        logger.info(f"Simulation started: Scenario={scenario}, strategy={strategy}")
        
        for i in range(task_count):
            if not self.is_running:
                break
                
            task_id = f"task-{random.randint(1000, 9999)}"
            # Normal or spike-heavy complexities
            if scenario == "burst":
                # High complexity burst jobs
                complexity = round(random.uniform(0.40, 0.85), 4)
                step_sleep = max(0.02, interval_s * 0.2)
            elif scenario == "heavy":
                complexity = round(random.uniform(0.60, 1.00), 4)
                step_sleep = interval_s
            else:
                complexity = round(random.uniform(0.05, 0.20), 4)
                step_sleep = interval_s
                
            payload = {
                "task_id": f"sim-job-{task_id}",
                "task_type": "burst" if scenario == "burst" else "normal",
                "complexity": complexity,
                "strategy": strategy
            }
            
            start_time = time.time()
            try:
                # Dispatches the simulation job into our active router endpoints
                res = requests.post(
                    f"{base_url}/api/v1/tasks/dispatch",
                    json=payload,
                    timeout=5.0
                )
                duration = time.time() - start_time
                
                if res.status_code == 200:
                    data = res.json()
                    logger.info(f"[SIMULATION] Dispatched successfully: {data['task_id']} handled by {data.get('worker_node')}")
                else:
                    logger.error(f"[SIMULATION] Server returned status: {res.status_code}")
                    csv_result_manager.log_result(
                        task_id=payload["task_id"],
                        task_type=payload["task_type"],
                        complexity=payload["complexity"],
                        worker="",
                        strategy=strategy,
                        latency_s=duration,
                        status="failed",
                        reason=f"Status: {res.status_code}"
                    )
            except Exception as e:
                duration = time.time() - start_time
                logger.error(f"[SIMULATION] Dispatch execution network timeout: {e}")
                csv_result_manager.log_result(
                    task_id=payload["task_id"],
                    task_type=payload["task_type"],
                    complexity=payload["complexity"],
                    worker="",
                    strategy=strategy,
                    latency_s=duration,
                    status="failed",
                    reason=str(e)
                )
                
            time.sleep(step_sleep)
            
        with self._lock:
            self.is_running = False
        logger.info("Simulation run terminated safely.")

    def trigger_scenario(
        self, 
        scenario: str, 
        base_url: str, 
        strategy: str, 
        task_count: int, 
        interval_s: float
    ) -> bool:
        """
        Launches async background loops to generate continuous telemetry workloads.
        """
        with self._lock:
            if self.is_running:
                logger.warning("Simulation is already executing on another queue loop.")
                return False
                
            self.is_running = True
            self.simulation_thread = threading.Thread(
                target=self._run_workload_loop,
                args=(scenario, base_url, strategy, task_count, interval_s),
                daemon=True
            )
            self.simulation_thread.start()
            return True

    def abort_simulation(self) -> None:
        with self._lock:
            self.is_running = False
        logger.info("Aborted simulation traffic triggers successfully.")

load_simulator = DistributedLoadSimulator()
