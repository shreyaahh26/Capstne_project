import time
from typing import Dict, Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression


class PredictiveScheduler:
    def __init__(self):
        self.model = LinearRegression()
        self.history = []
        self.is_trained = False
        self.pending_tasks = 0

    def train(self, historical_data: pd.DataFrame):
        required_columns = ["time", "current_load", "tasks_pending", "future_load"]

        if historical_data.empty or not all(col in historical_data.columns for col in required_columns):
            return

        X = historical_data[["time", "current_load", "tasks_pending"]]
        y = historical_data["future_load"]

        self.model.fit(X, y)
        self.is_trained = True

    def add_history(self, current_load: float, tasks_pending: int, future_load: float):
        self.history.append({
            "time": time.time(),
            "current_load": current_load,
            "tasks_pending": tasks_pending,
            "future_load": future_load,
        })

        if len(self.history) >= 5:
            self.train(pd.DataFrame(self.history[-50:]))

    def predict_load(self, current_load: float, tasks_pending: int = 0) -> float:
        if not self.is_trained:
            return current_load + (tasks_pending * 2)

        features = pd.DataFrame([{
            "time": time.time(),
            "current_load": current_load,
            "tasks_pending": tasks_pending,
        }])

        prediction = self.model.predict(features)[0]
        return float(np.clip(prediction, 0, 100))

    def select_worker(self, workers: Dict[str, Dict[str, Any]]) -> str:
        predictions = {}

        for worker_id, data in workers.items():
            current_load = data.get("load", 100)
            tasks_pending = data.get("tasks_pending", 0)

            predictions[worker_id] = self.predict_load(
                current_load=current_load,
                tasks_pending=tasks_pending
            )

        return min(predictions, key=predictions.get)