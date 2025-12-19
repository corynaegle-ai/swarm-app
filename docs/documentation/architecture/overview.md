# Swarm Architecture Overview

## System Diagram

```
+---------------------------------------------------------------------+
|                         SWARM ARCHITECTURE                          |
+---------------------------------------------------------------------+
|                                                                     |
|  +-----------+     +------------+     +---------------------+       |
|  |  Claude   |---->| Swarm Dev  |---->|  Firecracker VMs    |       |
|  |  Desktop  |     |    API     |     |   (100+ agents)     |       |
|  +-----------+     +------------+     +---------------------+       |
|        |                 |                      |                   |
|        |                 v                      v                   |
|        |          +------------+     +---------------------+        |
|        |          |   Ticket   |<--->|    GitHub API       |        |
|        |          |   Store    |     |   (repos, PRs)      |        |
|        |          |  (SQLite)  |     +---------------------+        |
|        |          +------------+              |                     |
|        |                 |                    v                     |
|        |                 v            +---------------------+       |
|        |          +------------+      |   Anthropic API     |       |
|        +--------->| Dashboard  |      |   (Claude)          |       |
|                   | (WebSocket)|      +---------------------+       |
|                   +------------+                                    |
|                                                                     |
+---------------------------------------------------------------------+
```

## Core Components

### 1. Firecracker MicroVMs
- **Purpose**: Isolated execution environments for AI agents
- **Boot Time**: Sub-10ms via snapshot restore
- **Capacity**: 100+ concurrent VMs on single droplet
- **Config**: Ubuntu 22.04, Node.js v20, Claude Code

### 2. Swarm Dev API
- **URL**: https://api.swarmstack.net
- **Purpose**: Remote management, file ops, git, VM control
- **Auth**: Bearer token authentication
- **Features**: WebSocket for real-time updates

### 3. Ticket Store
- **Backend**: SQLite database
- **Model**: Agent-pull architecture
- **Features**: DAG dependencies, execution waves, claiming

### 4. Agent Pipeline
- **Design Agent**: Converts specs to ticket DAGs
- **Coding Agents**: Pull tickets, generate code, submit PRs
- **Hierarchical Generation**: Skeleton, Expansion, Validation

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Agent-pull vs push | Eliminates SSH timeout nesting, better fault tolerance |
| Snapshot restore | 33x faster than cold boot, enables rapid scaling |
| SQLite tickets | Simple, portable, no external dependencies |
| HTTP-based claiming | Stateless, works through firewalls, easy debugging |
