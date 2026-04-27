# Distributed Resource Allocation and Sharing System
**COIT13236 – Cyber Security Project | CQUniversity | Term 1, 2026**

# Project Overview
This project designs and evaluates a fully distributed resource allocation framework based on the operational needs of Queensland Rail — Australia's largest rail network operator developing driverless train technology. The system dynamically allocates IoT sensor data streams from driverless trains across multiple distributed worker nodes using different scheduling strategies, ensuring real-time safety-critical data is processed efficiently even during peak traffic periods and node failures.

## Team Members
| Name | Role | Responsibility |
|------|------|---------------|
| Shreya Gopala | Project Manager & Quality Lead | Planning, coordination, Python framework, GitHub, Grafana dashboard |
| Kush | System Architect & Technical Lead | System design, Azure infrastructure, Docker, Prometheus |
| Shamim | Lead Developer & Testing Lead | Code enhancement, simulations, FastAPI, performance testing |

## System Architecture
**Fully Distributed — No Central Scheduler**

Each node acts as both scheduler AND worker. Nodes communicate via gossip protocol sharing load information every 3 seconds.

```text
Queensland Rail IoT Sensors (Driverless Trains)
                    |
                    v
        +----------------------+
        |    Load Balancer     |
        +----------+-----------+
                   |
     +-------------+-------------+
     v             v             v
+--------+    +--------+    +--------+    +--------+
| Node 1 |<-->| Node 2 |<-->| Node 3 |<-->| Node 4 |
|Port8001|    |Port8002|    |Port8003|    |Port8004|
+--------+    +--------+    +--------+    +--------+
     ^             ^             ^             ^
     |_____________|_____________|_____________|
              Gossip Network (Peer-to-Peer)
                         |
              +----------v----------+
              |      Prometheus     |
              +----------+----------+
                         |
              +----------v----------+
              |   Grafana Dashboard  |
              +---------------------+
```

## Azure Infrastructure
| VM Name | Role | Public IP | Port | Status |
|---------|------|-----------|------|--------|
| worker-vm-1 | Distributed Node 1 | 20.92.56.192 | 8001 | Running |
| worker-vm-2 | Distributed Node 2 | 20.213.58.22 | 8002 | Running |
| worker-vm-3 | Distributed Node 3 | 20.58.185.74 | 8003 | Running |
| worker-vm-4 | Distributed Node 4 | TBC | 8004 | In Progress |
| scheduler-vm | Prometheus + Grafana | 20.190.108.20 | 3000/9090 | Running |

## Scheduling Strategies Implemented
| Strategy | Description | Best For |
|----------|-------------|---------|
| Static Allocation | Always assigns to node-1 (baseline) | Simple predictable workloads |
| Round Robin | Cycles through nodes in order | Uniform task distribution |
| Least Loaded | Assigns to node with lowest CPU load | Dynamic bursty workloads |
| Fairness Based | Prioritises nodes with fewer total tasks | Long-running equal workloads |

## Workload Scenarios
| Scenario | Description | Queensland Rail Context |
|----------|-------------|------------------------|
| Normal Workload | Steady stream of IoT sensor data | Regular off-peak train operations |
| Burst Workload | Sudden spike of sensor data | Peak morning rush hour 7-9am |
| Node Failure | Worker node fails and recovers | Processing node crash during data collection |

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Language | Python 3.x |
| API Framework | FastAPI + Uvicorn |
| Distributed Protocol | Gossip Protocol (peer-to-peer load sharing) |
| Containerisation | Docker |
| Cloud Infrastructure | Microsoft Azure VMs (Australia East) |
| Monitoring | Prometheus + Grafana |
| Load Testing | Locust |
| Version Control | GitHub |
| Results Dashboard | Grafana |

## Simulation Results Summary
| Strategy | Avg Latency | Throughput | Tasks Completed |
|----------|------------|-----------|----------------|
| Static | 0.111s | 9.01 tasks/s | 10/10 |
| Round Robin | 0.107s | 9.38 tasks/s | 10/10 |
| Least Loaded | 0.108s | 9.22 tasks/s | 10/10 |
| Fairness | 0.110s | 9.06 tasks/s | 10/10 |
| Burst (Least Loaded) | 0.254s | 3.94 tasks/s | 20/20 |
| Node Failure (Round Robin) | 0.110s | 9.12 tasks/s | 10/10 |

## How to Run — Distributed System
### Step 1 — Deploy distributed_node.py to each Azure VM

```bash
scp distributed_node.py azureuser@20.92.56.192:/home/azureuser/
scp distributed_node.py azureuser@20.213.58.22:/home/azureuser/
scp distributed_node.py azureuser@20.58.185.74:/home/azureuser/
```

### Step 2 — Start each node on its VM

```bash
# On worker-vm-1
python3 distributed_node.py --id node-1 --port 8001 --peers http://20.213.58.22:8002,http://20.58.185.74:8003

# On worker-vm-2
python3 distributed_node.py --id node-2 --port 8002 --peers http://20.92.56.192:8001,http://20.58.185.74:8003

# On worker-vm-3
python3 distributed_node.py --id node-3 --port 8003 --peers http://20.92.56.192:8001,http://20.213.58.22:8002
```

### Step 3 — Send tasks to any node

```bash
# Normal workload
curl -X POST http://20.92.56.192:8001/dispatch -H "Content-Type: application/json" -d '{"task_id":"t1","task_type":"normal","complexity":0.1,"strategy":"round_robin"}'

# Check metrics
curl http://20.92.56.192:8001/metrics

# Simulate node failure
curl -X POST http://20.213.58.22:8002/fail

# Recover node
curl -X POST http://20.213.58.22:8002/recover
```

## Project Milestones
| Week | Milestone | Status |
|------|-----------|--------|
| 1-2 | Team formation and project selection | Complete |
| 3-4 | Project proposal submission | Complete |
| 5 | Python framework developed by Shreya | Complete |
| 5-6 | GitHub setup, code enhancement by Shamim | Complete |
| 5-6 | Azure VMs deployed by Kush | Complete |
| 6 | Progress Report 1 submission | Complete |
| 7 | Distributed architecture redesign | Complete |
| 7 | Docker and Prometheus setup by Kush | Complete |
| 7-8 | FastAPI upgrade, Locust, Azure simulations | In Progress |
| 7-8 | Grafana dashboard | In Progress |
| 9 | Progress Report 2 submission | Planned |
| 10-12 | Performance evaluation and comparison | Planned |
| 13 | Final report and presentation | Planned |
   
