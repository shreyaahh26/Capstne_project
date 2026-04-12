# Project Overview
This project is a framework design and an evaluation of the distributed resource allocation and sharing framework based on the operational needs of the Woolworths Group - a large scale Australian based e-commerce and retail site. The system is dynamically controlled to allocate tasks (modeled as customer orders and platform requests) across a number of worker nodes in varying scheduling policies, to recreate the behaviour of distributed systems in the real world (bursty traffic and node failures).

## Team Members

| Name | Role | Responsibility |
|------|------|---------------|
| Shreya Gopala | Project Manager & Quality Lead | Planning, coordination, documentation, Excel dashboard |
| Kush | System Architect & Technical Lead | System design, Azure infrastructure, architecture diagrams |
| Shamim | Lead Developer & Testing Lead | Code implementation, simulations, performance testing |

# System Architecture

'''
Woolworths Online Platform (Client Requests)
                    │
                    ▼
        ┌─────────────────────┐
        │   Central Scheduler  │  ← scheduler.py (Port 9000)
        └──────────┬──────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ worker-1  │ │ worker-2  │ │ worker-3  │
  │ Port 8001 │ │ Port 8002 │ │ Port 8003 │
  └──────────┘ └──────────┘ └──────────┘
                   │
        ┌──────────▼──────────┐
        │    Azure Monitor     │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │   Excel Dashboard    │
        └─────────────────────┘
'''
