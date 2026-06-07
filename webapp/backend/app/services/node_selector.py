import logging
import time
import threading
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

logger = logging.getLogger("NodeSelectorService")

class AIPredictiveModel:
    """
    Fits multi-variable Linear Regression to estimate VM node utilization curves.
    Ensures safe prediction constraints to handle complex telemetry data spikes.
    """
    def __init__(self):
        self.model = LinearRegression()
        self.history_records: List[Dict[str, Any]] = []
        self.is_trained: bool = False
        self.lock = threading.Lock()

    def train_model(self) -> None:
        """
        Trains Linear Regression from recorded historical queue metrics.
        Required columns: time (float), current_load (float), tasks_pending (int)
        """
        with self.lock:
            if len(self.history_records) < 5:
                # Require at least 5 frames prior to fitting standard arrays
                return
            
            df = pd.DataFrame(self.history_records[-50:])
            X = df[["time", "current_load", "tasks_pending"]]
            y = df["future_load"]
            
            try:
                self.model.fit(X, y)
                self.is_trained = True
                logger.debug("AI Predictive scheduling model fitted successfully.")
            except Exception as e:
                logger.error(f"Failed to fit Linear Regression: {e}")

    def append_telemetry_point(self, current_load: float, tasks_pending: int, future_load: float) -> None:
        self.history_records.append({
            "time": time.time(),
            "current_load": current_load,
            "tasks_pending": tasks_pending,
            "future_load": future_load
        })
        
        # Keep histories bounded to prevent memory leakage
        if len(self.history_records) > 100:
            self.history_records = self.history_records[-100:]
            
        if len(self.history_records) % 5 == 0:
            # Recompute model curves incrementally in the background
            self.train_model()

    def predict_node_load(self, current_load: float, tasks_pending: int) -> float:
        """
        Returns estimated utilization index (0-100%) using regression models.
        """
        if not self.is_trained:
            # Graceful linear fallback model
            return float(np.clip(current_load + (tasks_pending * 4.0), 0.0, 100.0))
            
        try:
            features = pd.DataFrame([{
                "time": time.time(),
                "current_load": current_load,
                "tasks_pending": tasks_pending
            }])
            prediction = self.model.predict(features)[0]
            return float(np.clip(prediction, 0.0, 100.0))
        except Exception as e:
            logger.warning(f"Prediction failed - falling back to linear: {e}")
            return float(np.clip(current_load + (tasks_pending * 4.0), 0.0, 100.0))


class DynamicNodeSelector:
    """
    Main dispatch service managing allocation algorithms across Azure VMs.
    """
    def __init__(self):
        self.ai_predictor = AIPredictiveModel()
        self.round_robin_counter = 0
        self.lock = threading.Lock()
        
    def calculate_jains_fairness_index(self, values: List[float]) -> float:
        """
        Formula: J(x) = (sum(x)^2) / (n * sum(x^2))
        """
        if not values:
            return 0.0
        n = len(values)
        numerator = sum(values) ** 2
        denominator = n * sum(v ** 2 for v in values)
        if denominator == 0:
            return 0.0
        return float(numerator / denominator)

    def select_worker_node(
        self, 
        strategy: str, 
        nodes_directory: Dict[str, Dict[str, Any]], 
        self_id: str, 
        self_load: float, 
        self_completed: int
    ) -> str:
        """
        Applies chosen algorithm to distribute standard tasks to physical URLs.
        Returns: Selected Peer Url or 'self' string.
        """
        # 1. Gather all active/alive executors
        available_peers: Dict[str, Dict[str, Any]] = {}
        for url, peer_data in nodes_directory.items():
            if peer_data.get("is_alive", True):
                available_peers[url] = peer_data
                
        # 2. Add local node state config ONLY if no peers available (fallback)
        all_options: Dict[str, Dict[str, Any]] = {}
        if not available_peers:
            all_options["self"] = {
                "load": self_load,
                "tasks_completed": self_completed,
                "predicted_load": self_load
            }
            logger.warning("No worker nodes active. Adding coordinator to execution pool.")
            
        for url, data in available_peers.items():
            all_options[url] = {
                "load": data.get("load", 100.0),
                "tasks_completed": data.get("tasks_completed", 99999),
                "predicted_load": data.get("predicted_load", 100.0)
            }

        # 3. Apply selected strategy rules
        if strategy == "static":
            # Direct everything to the first active physical worker
            if available_peers:
                return list(available_peers.keys())[0]
            return "self"
            
        elif strategy == "round_robin":
            with self.lock:
                urls = list(all_options.keys())
                self.round_robin_counter += 1
                return urls[self.round_robin_counter % len(urls)]
                
        elif strategy == "least_loaded":
            # Search minimum utilization variable, break ties randomly
            min_load = min(all_options.values(), key=lambda x: x["load"])["load"]
            candidates = [k for k, v in all_options.items() if v["load"] == min_load]
            import random
            return random.choice(candidates)
            
        elif strategy == "fairness":
            # Direct traffic to nodes with lowest executed count
            min_tasks = min(all_options.values(), key=lambda x: x["tasks_completed"])["tasks_completed"]
            candidates = [k for k, v in all_options.items() if v["tasks_completed"] == min_tasks]
            import random
            return random.choice(candidates)
            
        elif strategy == "predictive":
            # Evaluates predicted load from background fitting
            min_pred = min(all_options.values(), key=lambda x: x["predicted_load"])["predicted_load"]
            candidates = [k for k, v in all_options.items() if v["predicted_load"] == min_pred]
            import random
            selected = random.choice(candidates)
            logger.info(f"AI Predictive Scheduler selected executor: {selected} based on predicted metrics.")
            return selected
            
        else:
            # Safe default
            return "self"

node_selector = DynamicNodeSelector()
