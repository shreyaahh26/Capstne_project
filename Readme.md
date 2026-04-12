# Distributed Resource Allocation and Sharing System
**COIT13236 – Cyber Security Project | CQUniversity | Term 1, 2026**

# Project Overview 
This project is a framework design and an evaluation of the distributed resource allocation and sharing framework based on the operational needs of the Woolworths Group - a large scale Australian based e-commerce and retail site. The system is dynamically controlled to allocate tasks (modeled as customer orders and platform requests) across a number of worker nodes in varying scheduling policies, to recreate the behaviour of distributed systems in the real world (bursty traffic and node failures). 

## Team Members

| Name | Role | Responsibility |
|------|------|---------------|
| Shreya Gopala | Project Manager & Quality Lead | Planning, coordination, documentation, Excel dashboard |
| Kush | System Architect & Technical Lead | System design, Azure infrastructure, architecture diagrams |
| Shamim | Lead Developer & Testing Lead | Code implementation, simulations, performance testing |

## System Architecture

```text
Woolworths Online Platform (Client Requests) 
                    |
                    v
        +---------------------+
        |   Central Scheduler  |  <- scheduler.py (Port 9000)
        +----------+----------+
                   |
        +----------+----------+
        v          v          v
  +---------+ +---------+ +---------+
  | worker-1| | worker-2| | worker-3|
  | Port8001| | Port8002| | Port8003|
  +---------+ +---------+ +---------+
                   |
        +----------v----------+
        |    Azure Monitor     |
        +----------+----------+
                   |
        +----------v----------+
        |   Excel Dashboard    |
        +---------------------+
```

## Scheduling Strategies Implemented

| Strategy | Description | Best For |
|----------|-------------|---------|
| Static Allocation | Always assigns to worker-1 (baseline) | Simple, predictable workloads |
| Round Robin | Cycles through workers in order | Uniform task distribution |
| Least Loaded | Assigns to worker with lowest CPU load | Dynamic, bursty workloads |
| Fairness Based | Prioritises workers with fewer total tasks | Long-running equal workloads |

## Workload Scenarios

| Scenario | Description | Context |
|----------|-------------|---------|
| Normal Workload | Steady stream of tasks at regular intervals | Regular Woolworths trading day |
| Burst Workload | Sudden spike of tasks followed by normal load | Woolworths Click Frenzy flash sale |
| Node Failure | Worker node fails mid-execution and recovers | Server crash during peak traffic |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.x |
| Scheduler | Custom HTTP service (http.server) |
| Worker Nodes | Custom HTTP service (ThreadingHTTPServer) |
| Communication | HTTP REST API (JSON) |
| Cloud Infrastructure | Microsoft Azure VMs (planned) |
| Version Control | GitHub |
| Results Dashboard | Microsoft Excel |


## Simulation Results Summary

| Strategy | Avg Latency | Throughput | Tasks Completed |
|----------|------------|-----------|----------------|
| Static | 0.111s | 9.01 tasks/s | 10/10 |
| Round Robin | 0.107s | 9.38 tasks/s | 10/10 |
| Least Loaded | 0.108s | 9.22 tasks/s | 10/10 |
| Fairness | 0.110s | 9.06 tasks/s | 10/10 |
| Burst (Least Loaded) | 0.254s | 3.94 tasks/s | 20/20 |
| Node Failure (Round Robin) | 0.110s | 9.12 tasks/s | 10/10 |

## How to Run Locally

### Step 1 - Start Worker Nodes (open 3 separate terminals)

```bash
python worker.py --id worker-1 --port 8001
python worker.py --id worker-2 --port 8002
python worker.py --id worker-3 --port 8003
```

### Step 2 - Start the Scheduler

```bash
python scheduler.py --port 9000
```

### Step 3 - Run Simulations

```bash
# Normal workload
python workload_simulation.py --scheduler-url http://127.0.0.1:9000 --scenario normal --strategy round_robin

# Burst workload
python workload_simulation.py --scheduler-url http://127.0.0.1:9000 --scenario burst --strategy least_loaded --output burst_results.csv

# Node failure scenario
python workload_simulation.py --scheduler-url http://127.0.0.1:9000 --scenario failure --strategy round_robin --output failure_results.csv

# Compare all strategies
python workload_simulation.py --scheduler-url http://127.0.0.1:9000 --scenario compare --output all_results.csv
```
## Project Milestones

| Week | Milestone | Status |
|------|-----------|--------|
| 1-2 | Team formation and project selection | Complete |
| 3-4 | Project proposal submission | Complete |
| 5-6 | GitHub setup, code implementation, simulations | Complete |
| 6 | Progress Report 1 submission | Complete |
| 7-8 | Azure deployment, Excel dashboard | In Progress |
| 9 | Progress Report 2 submission | Planned |
| 10-12 | Performance evaluation and comparison | Planned |
| 13 | Final report and presentation | Planned |
