import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from backend.app.models.schemas import GossipPayload, NodeStatus, VMScaleRequest
from backend.app.services.websocket_manager import ws_telemetry_broadcaster
from backend.app.services.azure_automation import azure_vm_automation

router = APIRouter(prefix="/nodes", tags=["Node Management"])
logger = logging.getLogger("NodesRouter")

# Global cluster membership state
CLUSTER_MEMBERSHIP_DIRECTORY: Dict[str, Dict[str, Any]] = {
    "http://20.92.56.192:8001": {
        "node_id": "worker-vm-1",
        "load": 12.0,
        "tasks_completed": 45,
        "is_alive": True,
        "history": [10.0, 15.0, 8.0, 12.0],
        "predicted_load": 15.0,
        "tasks_failed": 0
    },
    "http://20.213.58.22:8002": {
        "node_id": "worker-vm-2",
        "load": 18.0,
        "tasks_completed": 38,
        "is_alive": True,
        "history": [12.0, 14.0, 22.0, 18.0],
        "predicted_load": 20.0,
        "tasks_failed": 0
    },
    "http://20.58.185.74:8003": {
        "node_id": "worker-vm-3",
        "load": 5.0,
        "tasks_completed": 29,
        "is_alive": True,
        "history": [5.0, 8.0, 4.0, 5.0],
        "predicted_load": 8.0,
        "tasks_failed": 0
    },
    "http://20.24.209.147:8004": {
        "node_id": "worker-vm-4",
        "load": 25.0,
        "tasks_completed": 42,
        "is_alive": True,
        "history": [15.0, 20.0, 30.0, 25.0],
        "predicted_load": 28.0,
        "tasks_failed": 2
    }
}

@router.get("", response_model=Dict[str, Dict[str, Any]])
async def get_all_members():
    """ Returns latest membership list synchronized via background gossip checks. """
    return CLUSTER_MEMBERSHIP_DIRECTORY

@router.post("/gossip")
async def receive_gossip_heartbeat(payload: GossipPayload):
    """
    Simulates gossip heartbeats exchanged between other worker VMs in the cluster topology.
    Updates the local routing table in-memory and broadcasts status updates to live web dashboards.
    """
    node_found = False
    target_url = ""
    
    # Locate matched node inside registry
    for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
        if data["node_id"] == payload.node_id:
            node_found = True
            target_url = url
            data.update({
                "load": payload.load,
                "tasks_completed": payload.tasks_completed,
                "is_alive": payload.is_alive,
                "predicted_load": payload.predicted_load,
                "history": (data["history"] + [payload.load])[-10:]
            })
            break
            
    if not node_found:
        # Register a newly introduced dynamic container to the pool
        target_url = f"http://dynamic-{payload.node_id}:8000"
        CLUSTER_MEMBERSHIP_DIRECTORY[target_url] = {
            "node_id": payload.node_id,
            "load": payload.load,
            "tasks_completed": payload.tasks_completed,
            "is_alive": payload.is_alive,
            "history": [payload.load],
            "predicted_load": payload.predicted_load,
            "tasks_failed": 0
        }
        logger.info(f"Dynamically registered custom worker node in mesh: {payload.node_id}")

    # Broadcast event payload via Websocket connections
    await ws_telemetry_broadcaster.broadcast_metric_update(
        "GOSSIP_UPDATE", 
        {"url": target_url, "node": CLUSTER_MEMBERSHIP_DIRECTORY[target_url]}
    )
    return {"status": "ok", "message": "Gossip state reconciled."}

@router.post("/{node_id}/fail")
async def trigger_manual_failure(node_id: str):
    """
    Failure Injection Testing API.
    Simulates a hardware fault by setting the node's 'is_alive' state to False.
    """
    for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
        if data["node_id"] == node_id:
            data["is_alive"] = False
            data["load"] = 0.0
            data["predicted_load"] = 0.0
            data["tasks_failed"] += 1
            
            await ws_telemetry_broadcaster.broadcast_metric_update(
                "NODE_CRASHED", 
                {"node_id": node_id, "url": url}
            )
            await ws_telemetry_broadcaster.broadcast_metric_update(
                "NODES_UPDATE", 
                {"nodes": CLUSTER_MEMBERSHIP_DIRECTORY}
            )
            logger.warning(f"Simulated fault injected into node: {node_id}")
            return {"status": "failed", "node_id": node_id, "nodes_remaining": len([n for n in CLUSTER_MEMBERSHIP_DIRECTORY.values() if n["is_alive"] or n["node_id"] == "self"])}
            
    raise HTTPException(status_code=404, detail="Requested VM node does not exist in cluster.")

@router.post("/{node_id}/recover")
async def trigger_manual_recovery(node_id: str):
    """
    Recovers an injected node and restores it to healthy cluster participation.
    """
    for url, data in CLUSTER_MEMBERSHIP_DIRECTORY.items():
        if data["node_id"] == node_id:
            data["is_alive"] = True
            data["load"] = 10.0  # Base line idle load upon boot
            data["predicted_load"] = 12.0
            
            await ws_telemetry_broadcaster.broadcast_metric_update(
                "NODE_RECOVERED", 
                {"node_id": node_id, "url": url}
            )
            await ws_telemetry_broadcaster.broadcast_metric_update(
                "NODES_UPDATE", 
                {"nodes": CLUSTER_MEMBERSHIP_DIRECTORY}
            )
            logger.info(f"Simulated node self-healed successfully: {node_id}")
            return {"status": "recovered", "node_id": node_id}
            
    raise HTTPException(status_code=404, detail="Requested VM node does not exist in cluster.")

@router.post("/scale")
async def trigger_azure_scale(request: VMScaleRequest, background_tasks: BackgroundTasks):
    """
    Orchestrates continuous scale operations on B-Series Azure instances.
    Integrates background automated tasks to resize virtual instances safely.
    """
    background_tasks.add_task(
        azure_vm_automation.scale_up_vm_fleet, 
        request.node_name, 
        request.vm_size
    )
    return {
        "status": "queued",
        "message": f"Azure deployment sequence initialized for {request.node_name} of size {request.vm_size}."
    }
