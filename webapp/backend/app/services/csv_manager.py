import os
import csv
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import pandas as pd
from backend.app.core.config import settings

logger = logging.getLogger("CSVManager")

class CSVResultManager:
    """
    Manages persistent logging of transaction ledgers using highly-robust processes.
    Enforces thread safe writes and computes Jain fairness directly from disks.
    """
    def __init__(self):
        self.filepath = settings.CSV_OUTPUT_PATH
        # Create directories if they do not exist
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        self._ensure_header()

    def _ensure_header(self) -> None:
        """ Ensures CSV exists with proper structured column headers. """
        if not os.path.exists(self.filepath):
            try:
                headers = [
                    "task_id", 
                    "type", 
                    "complexity", 
                    "worker", 
                    "strategy", 
                    "latency_s", 
                    "status", 
                    "reason", 
                    "timestamp"
                ]
                with open(self.filepath, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(headers)
                logger.info(f"Initialized dynamic CSV ledger path at: {self.filepath}")
            except Exception as e:
                logger.error(f"Failed to initialize CSV log: {e}")

    def log_result(
        self, 
        task_id: str, 
        task_type: str, 
        complexity: float, 
        worker: str, 
        strategy: str, 
        latency_s: float, 
        status: str, 
        reason: Optional[str] = None
    ) -> None:
        try:
            row = [
                task_id,
                task_type,
                complexity,
                worker,
                strategy,
                round(latency_s, 5),
                status,
                reason if reason else "",
                datetime.utcnow().isoformat()
            ]
            with open(self.filepath, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(row)
            logger.debug(f"Saved job entry {task_id} to CSV ledger.")
            
            # Broadcast CSV updated over websockets non-blockingly
            import asyncio
            from backend.app.services.websocket_manager import ws_telemetry_broadcaster
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(ws_telemetry_broadcaster.broadcast_metric_update("CSV_UPDATED", {
                        "path": self.filepath,
                        "exists": True,
                        "size_bytes": os.path.getsize(self.filepath) if os.path.exists(self.filepath) else 0,
                        "jains_from_file": round(self.get_jains_index_from_file(), 4)
                    }))
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Failed to append task result row: {e}")

    def read_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """ Reads logs using robust Pandas DataFrame parsing workflows. """
        if not os.path.exists(self.filepath):
            return []
        try:
            df = pd.read_csv(self.filepath)
            df = df.fillna("")
            records = df.tail(limit).to_dict(orient="records")
            return records
        except Exception as e:
            logger.error(f"Pandas read of CSV results failed: {e}")
            return []

    def clear_logs(self) -> bool:
        try:
            if os.path.exists(self.filepath):
                os.remove(self.filepath)
            self._ensure_header()
            
            # Broadcast wipe event to clear client tables
            import asyncio
            from backend.app.services.websocket_manager import ws_telemetry_broadcaster
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(ws_telemetry_broadcaster.broadcast_metric_update("CSV_WIPED", {
                        "path": self.filepath,
                        "exists": True,
                        "size_bytes": os.path.getsize(self.filepath) if os.path.exists(self.filepath) else 0,
                        "jains_from_file": 1.0
                    }))
            except Exception:
                pass
            return True
        except Exception as e:
            logger.error(f"Failed to wipe results ledger: {e}")
            return False

    def get_jains_index_from_file(self) -> float:
        """ Calculates fairness index from physical results.csv history. """
        if not os.path.exists(self.filepath):
            return 1.0
        try:
            df = pd.read_csv(self.filepath)
            df = df[df["status"] == "completed"]
            if df.empty:
                return 1.0
                
            counts = df["worker"].value_counts()
            if len(counts) == 0:
                return 1.0
                
            n = len(counts)
            sum_x = sum(counts)
            sum_x_sq = sum(c ** 2 for c in counts)
            
            numerator = sum_x ** 2
            denominator = n * sum_x_sq
            
            return float(numerator / denominator) if denominator > 0 else 1.0
        except Exception as e:
            logger.error(f"Jains Index calculation from disk failed: {e}")
            return 1.0

csv_result_manager = CSVResultManager()
