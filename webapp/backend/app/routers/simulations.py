import logging
import os
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from backend.app.services.simulation_manager import load_simulator
from backend.app.services.csv_manager import csv_result_manager

router = APIRouter(prefix="/simulations", tags=["Simulation Manager"])
logger = logging.getLogger("SimulationsRouter")

@router.get("/csv")
async def download_simulation_csv():
    """ Downloads the raw result data ledger directly from storage. """
    file_path = csv_result_manager.filepath
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="CSV file not found")
    return FileResponse(path=file_path, filename="simulation_results.csv", media_type="text/csv")

@router.post("/start")
async def start_sim_run(
    request: Request,
    scenario: str = Query("normal", description="Sim config: normal, burst, or heavy"),
    strategy: str = Query("least_loaded", description="Selector: least_loaded, predictive, round_robin"),
    tasks: int = Query(20, ge=1, le=200, description="Task volume execution limit"),
    interval: float = Query(0.5, ge=0.01, le=5.0, description="Delay between task runs")
):
    """
    Kicks off an automated workload generation scenario in a background thread.
    Simulates high-velocity transactions and gauges response latency differences.
    """
    # Auto derive self base URL for request routing
    base_url = str(request.base_url).rstrip("/")
    
    success = load_simulator.trigger_scenario(
        scenario=scenario,
        base_url=base_url,
        strategy=strategy,
        task_count=tasks,
        interval_s=interval
    )
    
    if not success:
        raise HTTPException(
            status_code=400, 
            detail="A simulation run is already active in background. Abort it first."
        )
        
    return {
        "status": "started",
        "scenario": scenario,
        "strategy": strategy,
        "total_tasks": tasks,
        "polling_interval_s": interval
    }

@router.post("/stop")
async def stop_sim_run():
    """ Terminates any active background loop scenarios. """
    load_simulator.abort_simulation()
    return {"status": "stopped", "message": "Background load simulators stopped."}

@router.get("/logs", response_model=List[Dict[str, Any]])
async def get_simulation_logs(limit: int = Query(50, ge=1, le=200)):
    """ Retrieves records from our pandas-controlled results.csv ledger. """
    return csv_result_manager.read_logs(limit=limit)

@router.delete("/logs")
async def wipe_simulation_logs():
    """ Wipes execution histories to reset benchmark scenarios. """
    success = csv_result_manager.clear_logs()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to wipe ledger logs safely.")
    return {"status": "cleared", "message": "Persistent ledger reports reset successfully."}
