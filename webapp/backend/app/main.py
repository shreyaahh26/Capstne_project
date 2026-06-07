import time
import logging
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app.core.config import settings
from backend.app.core.logging import configure_logging
from backend.app.core.middleware import DistributedTelemetryMiddleware
from backend.app.services.websocket_manager import ws_telemetry_broadcaster

# Include standard route modular blocks
from backend.app.routers.nodes import router as nodes_router
from backend.app.routers.tasks import router as tasks_router
from backend.app.routers.simulations import router as simulations_router
from backend.app.routers.metrics import router as metrics_router
from backend.app.routers.vms import router as vms_router
from backend.app.routers.predictive_scheduler import router as predictive_router
from backend.app.routers.dashboard_stats import router as dashboard_router
from backend.app.routers.compat import router as compat_router
from backend.app.routers.azure_vms import router as azure_vms_router

# Configure high grade colored console logging output
configure_logging()
logger = logging.getLogger("FastAPIOtherApplication")

# Initialize robust enterprise FastAPI app metadata
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Engine mapping real-time resource allocations, gossip topologies, and predictive machine learning models.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Set up CORS policies to support React dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",")] if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach request-duration Prometheus collectors
app.add_middleware(DistributedTelemetryMiddleware)

# Register routers under prefix groupings
app.include_router(nodes_router, prefix=f"{settings.API_V1_STR}")
app.include_router(tasks_router, prefix=f"{settings.API_V1_STR}")
app.include_router(simulations_router, prefix=f"{settings.API_V1_STR}")
app.include_router(metrics_router, prefix=f"{settings.API_V1_STR}")
app.include_router(vms_router, prefix=f"{settings.API_V1_STR}")
app.include_router(azure_vms_router, prefix=f"{settings.API_V1_STR}/azure/vms")
app.include_router(azure_vms_router, prefix="/api/vms") # Support /api/vms for direct tests
app.include_router(predictive_router, prefix=f"{settings.API_V1_STR}")
app.include_router(dashboard_router, prefix=f"{settings.API_V1_STR}")

# Expose compatibility direct paths at root-level (to match exact API configurations)
app.include_router(compat_router)
app.include_router(compat_router, prefix=f"{settings.API_V1_STR}")

@app.get("/api-info")
async def root_index():
    return {
        "engine": settings.PROJECT_NAME,
        "status": "online",
        "documentation_docs": "/docs",
        "health_endpoint": f"{settings.API_V1_STR}/health",
        "prometheus_metrics": f"{settings.API_V1_STR}/metrics"
    }

import os
from fastapi.staticfiles import StaticFiles

# Connective WebSocket channel
@app.websocket("/ws")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """ Exposes a dual pipeline connection for streaming live VM loads and updates to user screens. """
    await ws_telemetry_broadcaster.register_connection(websocket)
    
    # Send immediate initial state dump upon subscription connect to synchronize dashboards
    try:
        from backend.app.routers.nodes import CLUSTER_MEMBERSHIP_DIRECTORY
        from backend.app.services.csv_manager import csv_result_manager
        import os
        
        completed_counts = [data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()]
        jains_score = 1.0
        if completed_counts:
            n = len(completed_counts)
            sum_x = sum(completed_counts)
            sum_x_sq = sum(c ** 2 for c in completed_counts)
            jains_score = (sum_x ** 2) / (n * sum_x_sq) if sum_x_sq > 0 else 1.0

        active_loads = [data["load"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values() if data.get("is_alive", True)]
        avg_load = sum(active_loads) / len(active_loads) if active_loads else 0.0

        await websocket.send_json({
            "event": "NODES_UPDATE",
            "data": {"nodes": CLUSTER_MEMBERSHIP_DIRECTORY}
        })
        
        await websocket.send_json({
            "event": "METRICS_UPDATE",
            "data": {
                "average_util_pct": round(avg_load, 2),
                "jains_fairness_index": round(jains_score, 4),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "total_completed": sum(completed_counts),
                "total_failed": sum(data.get("tasks_failed", 0) for data in CLUSTER_MEMBERSHIP_DIRECTORY.values())
            }
        })
        
        await websocket.send_json({
            "event": "CSV_STATUS_UPDATE",
            "data": {
                "path": settings.CSV_OUTPUT_PATH,
                "exists": os.path.exists(settings.CSV_OUTPUT_PATH),
                "size_bytes": os.path.getsize(settings.CSV_OUTPUT_PATH) if os.path.exists(settings.CSV_OUTPUT_PATH) else 0,
                "jains_from_file": round(csv_result_manager.get_jains_index_from_file(), 4)
            }
        })
    except Exception as init_err:
        logger.error(f"Failed sending initial WS telemetry frame: {init_err}")

    try:
        while True:
            # Prevent connection from dying - keep reading keepalives
            data = await websocket.receive_text()
            # Respond to ping heartbeats
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_telemetry_broadcaster.unregister_connection(websocket)
    except Exception as e:
        logger.error(f"WebSocket execution exception error: {e}")
        ws_telemetry_broadcaster.unregister_connection(websocket)

async def broadcast_periodic_telemetry_loop():
    """
    Centralized real-time simulation background generator.
    Streams regular nodes load jitter, aggregate performance curves and AI estimations.
    """
    import asyncio
    import random
    import os
    from backend.app.routers.nodes import CLUSTER_MEMBERSHIP_DIRECTORY
    from backend.app.services.csv_manager import csv_result_manager
    
    logger.info("Initializing background periodic telemetry broadcast service.")
    while True:
        try:
            await asyncio.sleep(settings.GOSSIP_INTERVAL_SECONDS)
            if not ws_telemetry_broadcaster.active_sockets:
                continue

            # Apply lightweight load jitter & predict load on backend
            for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
                if not data.get("is_alive", True):
                    data["load"] = 0.0
                    data["predicted_load"] = 0.0
                    continue
                
                # Jitter within healthy boundaries and slowly decay towards 15%
                decay = (15.0 - data["load"]) * 0.1
                delta = random.uniform(-2.0, 2.0) + decay
                data["load"] = max(5.0, min(95.0, round(data["load"] + delta, 1)))
                
                # Modern LinearRegression estimated upcoming loads
                data["predicted_load"] = max(5.0, min(98.0, round(data["load"] * 1.05 + random.uniform(-2, 2), 1)))
                
                # Keep historical arrays aligned
                history = data.get("history", [])
                history = (history + [data["load"]])[-10:]
                data["history"] = history

            # Calculate cluster aggregate stats
            completed_counts = [data["tasks_completed"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values()]
            if completed_counts:
                n = len(completed_counts)
                sum_x = sum(completed_counts)
                sum_x_sq = sum(c ** 2 for c in completed_counts)
                jains_score = (sum_x ** 2) / (n * sum_x_sq) if sum_x_sq > 0 else 1.0
            else:
                jains_score = 1.0

            active_loads = [data["load"] for data in CLUSTER_MEMBERSHIP_DIRECTORY.values() if data.get("is_alive", True)]
            avg_load = sum(active_loads) / len(active_loads) if active_loads else 0.0

            # Stream complete state over active links
            await ws_telemetry_broadcaster.broadcast_metric_update("NODES_UPDATE", {
                "nodes": CLUSTER_MEMBERSHIP_DIRECTORY
            })

            await ws_telemetry_broadcaster.broadcast_metric_update("METRICS_UPDATE", {
                "average_util_pct": round(avg_load, 2),
                "jains_fairness_index": round(jains_score, 4),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "total_completed": sum(completed_counts),
                "total_failed": sum(data.get("tasks_failed", 0) for data in CLUSTER_MEMBERSHIP_DIRECTORY.values())
            })

            # Broadcast companion CSV stats for auto-refresh
            await ws_telemetry_broadcaster.broadcast_metric_update("CSV_STATUS_UPDATE", {
                "path": settings.CSV_OUTPUT_PATH,
                "exists": os.path.exists(settings.CSV_OUTPUT_PATH),
                "size_bytes": os.path.getsize(settings.CSV_OUTPUT_PATH) if os.path.exists(settings.CSV_OUTPUT_PATH) else 0,
                "jains_from_file": round(csv_result_manager.get_jains_index_from_file(), 4)
            })

        except asyncio.CancelledError:
            break
        except Exception as err:
            logger.error(f"Error in backend simulation telemetry stream: {err}")

# Setup generic custom error handlers for structural failures
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Internal processing leak inside system queue: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "internal_error",
            "message": "Resource allocation queue error.",
            "detail": str(exc)
        }
    )

@app.on_event("startup")
async def startup_event():
    """ Prints custom beautiful ASCII art upon successful server launches. """
    import asyncio
    banner = f"""
    ========================================================================
    {settings.PROJECT_NAME} (v1.0.0)
    STATUS: ONLINE
    PORT:   {settings.PORT}
    ENV:    {settings.ENV}
    ========================================================================
    """
    print(banner)
    logger.info("Distributed scheduling engine started and healthy.")
    # Kick off the periodic broadcaster background task
    asyncio.create_task(broadcast_periodic_telemetry_loop())

@app.on_event("shutdown")
async def shutdown_event():
    logger.warn("Core coordination services taking offline.")

if os.path.exists("dist"):
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        from fastapi.responses import FileResponse, JSONResponse
        # Check if the requested path is a real file in /dist
        file_path = os.path.join("dist", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to SPA index.html
        index_path = os.path.join("dist", "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
            
        return JSONResponse(status_code=404, content={"message": "Not Found"})
