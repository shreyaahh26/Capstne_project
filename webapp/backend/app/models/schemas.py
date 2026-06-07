from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional, Any
from datetime import datetime

class TaskBase(BaseModel):
    task_id: str = Field(..., description="Unique generated UUID string for routing verification.")
    task_type: str = Field("normal", description="Complexity identifier: normal, burst, or heavy.")
    complexity: float = Field(default=0.15, ge=0.01, le=1.00, description="Task CPU bound load multiplier.")
    strategy: str = Field(default="least_loaded", description="Allocation strategy: static, round_robin, least_loaded, fairness, or predictive.")

class TaskCreate(TaskBase):
    pass

class Task(TaskBase):
    status: str = Field("pending", description="Processing status: pending, completed, or failed.")
    worker_node: Optional[str] = Field(None, description="Physical worker IP or hostname that executed the task.")
    latency_s: float = Field(0.0, description="Cumulative dispatching and executing time.")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class TaskResult(BaseModel):
    task_id: str
    status: str
    worker_node: str
    latency_s: float
    strategy: str
    reason: Optional[str] = None
    timestamp: str
    cpu: float = 0.0
    memory: float = 0.0

class GossipPayload(BaseModel):
    node_id: str = Field(..., description="Self identifier e.g. worker-vm-1")
    load: float = Field(..., ge=0.0, le=100.0)
    tasks_completed: int = Field(0)
    is_alive: bool = Field(True)
    history: List[float] = Field(default_factory=list)
    predicted_load: float = Field(0.0)

class NodeStatus(BaseModel):
    node_id: str
    is_alive: bool
    current_load: float
    predicted_load: float
    tasks_completed: int
    tasks_failed: int
    avg_latency_s: float
    throughput: float
    peers: List[str]

class VMScaleRequest(BaseModel):
    scale_direction: str = Field("up", description="Directions: up, down, or restart")
    node_name: str = Field(..., description="Target Azure VM identifier or suffix.")
    vm_size: str = Field(default="Standard_B2ats_v2")

class ConnectionEvent(BaseModel):
    event_type: str
    client_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PredictionRequest(BaseModel):
    node_id: str = Field(..., description="Target node ID for load prediction.")
    current_load: float = Field(..., ge=0.0, le=100.0, description="The current CPU performance utilization index.")
    tasks_pending: int = Field(..., ge=0, description="Amount of jobs lingering in the node's local queue.")

class PredictionResponse(BaseModel):
    node_id: str
    current_load: float
    tasks_pending: int
    predicted_load: float
    confidence_score: float = Field(default=0.92, description="Calculated machine learning model prediction confidence interval.")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class VMActionRequest(BaseModel):
    node_id: str = Field(..., description="The unique string identifier of the target virtual machine.")
    vm_size: Optional[str] = Field(default="Standard_B2ats_v2", description="The hardware sizing SKU associated with this machine tier.")

class VMStatusResponse(BaseModel):
    node_id: str
    status: str = Field("running", description="Resource operational status: running, stopped, restarting.")
    is_alive: bool
    vm_size: str
    location: str
    cpu_cores: int
    memory_gb: float
    uptime_seconds: float

class SimulationRequest(BaseModel):
    scenario: str = Field("normal", description="Traffic generation configuration: normal, burst, or heavy.")
    strategy: str = Field("least_loaded", description="Core scheduling strategy: static, round_robin, least_loaded, fairness, or predictive.")
    tasks: int = Field(20, ge=1, le=200, description="Total list of simulation tasks to dispatch.")
    interval: float = Field(0.5, ge=0.01, le=5.0, description="Interval spacing delay between active queries.")

class FairnessResponse(BaseModel):
    jains_index_in_memory: float = Field(..., description="Calculated fairness index based on live transaction registers.")
    jains_index_from_csv: float = Field(..., description="Calculated fairness index parsed from disk logs history.")
    node_distribution: Dict[str, int] = Field(..., description="Map tracking job counts executed across active VM targets.")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class DashboardStatsResponse(BaseModel):
    status: str
    api_ready: bool
    cluster_metrics: Dict[str, Any] = Field(..., description="Consolidated real-time operational indicators.")
    strategy_metrics: Dict[str, Any] = Field(..., description="Efficacy indicators filtered per distribution mechanism.")
    historical_utilization: List[Dict[str, Any]] = Field(..., description="TimeSeries load histories per registered computing node.")
    simulation_active: bool


class SSHCommandRequest(BaseModel):
    node_id: str = Field(..., description="Target VM node name or IP e.g. worker-vm-1")
    command: str = Field(..., description="The terminal command to execute remotely via SSH.")


class SSHCommandResponse(BaseModel):
    node_id: str
    command: str
    exit_code: int
    stdout: str
    stderr: str
