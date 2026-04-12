# Project Overview
This project is a framework design and an evaluation of the distributed resource allocation and sharing framework based on the operational needs of the Woolworths Group - a large scale Australian based e-commerce and retail site. The system is dynamically controlled to allocate tasks (modeled as customer orders and platform requests) across a number of worker nodes in varying scheduling policies, to recreate the behaviour of distributed systems in the real world (bursty traffic and node failures).

## Team Members

| Name | Role | Responsibility |
|------|------|---------------|
| Shreya Gopala | Project Manager & Quality Lead | Planning, coordination, documentation, Excel dashboard |
| Kush | System Architect & Technical Lead | System design, Azure infrastructure, architecture diagrams |
| Shamim | Lead Developer & Testing Lead | Code implementation, simulations, performance testing |

# System Architecture

## Simulation Results Summary

| Strategy | Avg Latency | Throughput | Tasks Completed |
|----------|------------|-----------|----------------|
| Static | 0.111s | 9.01 tasks/s | 10/10 |
| Round Robin | 0.107s | 9.38 tasks/s | 10/10 |
| Least Loaded | 0.108s | 9.22 tasks/s | 10/10 |
| Fairness | 0.110s | 9.06 tasks/s | 10/10 |
| Burst (Least Loaded) | 0.254s | 3.94 tasks/s | 20/20 |
| Node Failure (Round Robin) | 0.110s | 9.12 tasks/s | 10/10 |

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

## References
Burns, B., Grant, B., Oppenheimer, D., Brewer, E. and Wilkes, J. (2016) 'Borg, Omega, and Kubernetes', Communications of the ACM, vol. 59, no. 5, pp. 50–57. Available at: https://doi.org/10.1145/2890784

Luo, Q., Li, C., Huang, T. and Liu, Y. (2021) 'Resource Scheduling in Edge Computing: A Survey', IEEE Communications Surveys and Tutorials, vol. 23, no. 4, pp. 2131–2165. Available at: https://ieeexplore.ieee.org/document/9511316

Chen, Z., Hu, J. and Min, G. (2022) 'Optimal Resource Scheduling and Allocation in Distributed Computing Systems', IEEE Conference Publication. Available at: https://ieeexplore.ieee.org/document/9867340

Verma, A., Pedrosa, L., Korupolu, M., Oppenheimer, D., Tune, E. and Wilkes, J. (2015) 'Large-scale cluster management at Google with Borg', Proceedings of EuroSys 2015. Available at: https://doi.org/10.1145/2741948.2741964
