# Swarm

**Distributed AI Agent Orchestration Platform**

Swarm enables autonomous software development at scale using Firecracker microVMs to run Claude-powered coding agents in parallel. Each agent operates in complete isolation with sub-10ms VM boot times.

## Architecture

```
swarm/
├── apps/
│   ├── platform/     # Backend API (Express.js, PostgreSQL, WebSocket)
│   └── dashboard/    # Frontend UI (React, Vite, TailwindCSS)
├── docs/             # Specifications, prompts, and documentation
├── package.json      # Workspace root
└── pnpm-workspace.yaml
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:platform    # Start backend API
pnpm dev:dashboard   # Start frontend UI
```

## Infrastructure

| Environment | Platform API | Dashboard |
|-------------|-------------|-----------|
| **DEV** | api.dev.swarmstack.net | dashboard.dev.swarmstack.net |
| **PROD** | api.swarmstack.net | dashboard.swarmstack.net |

## Core Concepts

- **1 Ticket = 1 Agent = 1 VM = 1 Branch = 1 PR**
- Agent-pull architecture (VMs claim work via HTTP)
- Snapshot-based VM restoration (8ms average boot time)
- DAG-based ticket dependency resolution

## Documentation

See `/docs` for:
- Architecture diagrams
- API specifications  
- Implementation prompts
- Session notes

## License

MIT
