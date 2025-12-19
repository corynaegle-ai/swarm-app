# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Swarm is a distributed AI agent coordination system using Firecracker microVMs to run Claude-powered coding agents in parallel. The monorepo contains the core platform services.

## Repository Structure

```
swarm/
├── apps/
│   ├── platform/      # Express.js API server (port 8080)
│   └── dashboard/     # React SPA (port 3000)
├── packages/          # Shared libraries (future)
├── scripts/           # Dev scripts and automation
└── docs/              # Documentation and prompts
```

## Commands

### Platform (apps/platform)
```bash
# Development (requires SSH tunnel to DEV DB)
pnpm dev              # Start with nodemon

# Production
pnpm start            # Start server.js
```

### Dashboard (apps/dashboard)
```bash
pnpm dev              # Vite dev server
pnpm build            # Production build
```

### Local Development Setup
```bash
# Terminal 1: Start SSH tunnel to DEV PostgreSQL
./scripts/tunnel-dev-db.sh

# Terminal 2: Start platform
cd apps/platform && pnpm dev
```

## API Endpoints (Platform)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /api/tickets | List tickets |
| POST | /api/tickets | Create ticket |
| GET | /api/agents | List agents |
| POST | /api/design-sessions | Create design session |

## Environment Variables

Platform requires:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Auth secret
- `ANTHROPIC_API_KEY` - Claude API key
- `GITHUB_TOKEN` - GitHub PAT

## Deployment

Push to `main` triggers GitHub Actions deploy to DEV droplet (134.199.235.140).
PM2 manages processes on the server.

## Key Principles

1. **Agent-pull model**: VMs claim work via HTTP, not pushed
2. **1 Ticket = 1 Agent = 1 VM = 1 Branch = 1 PR**
3. **Context management**: Keep file reads minimal, use pagination
4. **Git-native workflow**: Session notes in git, not conversation
