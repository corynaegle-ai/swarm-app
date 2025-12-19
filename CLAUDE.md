# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Swarm is a distributed AI agent coordination system using Firecracker microVMs to run Claude-powered coding agents in parallel. The monorepo contains the core platform services.

## ⚠️ CRITICAL: Path Handling Rules

**Project root**: This file (CLAUDE.md) is at the project root.

When working in this repository:
1. **ALWAYS verify your working directory first** with `pwd`
2. **The `.auto-claude/` folder exists ONLY at the project root** - never create nested `.auto-claude/` folders
3. **Use `./` prefix for relative paths** from project root
4. **Before writing to `.auto-claude/specs/`**, verify the path doesn't already contain `.auto-claude`

```bash
# CORRECT: Writing from project root
./apps/platform/server.js
./.auto-claude/specs/001-my-task/spec.md

# WRONG: Never create nested paths like this
./.auto-claude/specs/001-task/.auto-claude/specs/001-task/spec.md
```

## Repository Structure

```
swarm/                    <- PROJECT ROOT (this CLAUDE.md lives here)
├── .auto-claude/         <- Auto-Claude data (ONLY ONE, at root)
│   └── specs/            <- Spec folders go here
├── apps/
│   ├── platform/         # Express.js API server (port 8080)
│   └── dashboard/        # React SPA (port 3000)
├── packages/             # Shared libraries (future)
├── scripts/              # Dev scripts and automation
└── docs/                 # Documentation and prompts
```

## Commands

### Platform (apps/platform)
```bash
pnpm dev              # Development with nodemon
pnpm start            # Production
```

### Dashboard (apps/dashboard)
```bash
pnpm dev              # Vite dev server
pnpm build            # Production build
```

### Local Development Setup
```bash
# Terminal 1: SSH tunnel to DEV PostgreSQL
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
