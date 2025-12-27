# Swarm Deploy Agent

Autonomous CI/CD orchestrator with **ticket-aware deployment logic** that enables Swarm to deploy itself.

## Overview

When code is committed to a Swarm repository, the Deploy Agent makes an intelligent decision:

| Scenario | Action |
|----------|--------|
| Ad-hoc commit (no ticket) | Deploy immediately |
| Standalone ticket (no parent) | Deploy immediately |
| Child of parent ticket | Queue until ALL siblings complete |
| Feature complete (all siblings done) | Deploy entire feature |

This ensures features are deployed as coherent units, not partial implementations.

## Quick Start

```bash
# On dev droplet (134.199.235.140)
mkdir -p /opt/swarm-deploy/{data,logs,manifests}
cp -r /opt/swarm-specs/deploy-agent/* /opt/swarm-deploy/
cd /opt/swarm-deploy
npm install
npm run build
pm2 start ecosystem.config.js
pm2 save
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEPLOY AGENT                                 │
│                                                                     │
│  GitHub Webhook                                                     │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────┐                                               │
│  │ Webhook Receiver│                                               │
│  │ - Parse event   │                                               │
│  │ - Find ticket   │                                               │
│  └────────┬────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────────────┐           │
│  │            DEPLOYMENT DECISION ENGINE               │           │
│  │                                                     │           │
│  │  Has ticket? ──NO──▶ DEPLOY NOW                    │           │
│  │      │                                              │           │
│  │     YES                                             │           │
│  │      │                                              │           │
│  │  Has parent? ──NO──▶ DEPLOY NOW                    │           │
│  │      │                                              │           │
│  │     YES                                             │           │
│  │      │                                              │           │
│  │  All siblings ──YES──▶ DEPLOY FEATURE              │           │
│  │  complete?                                          │           │
│  │      │                                              │           │
│  │      NO                                             │           │
│  │      │                                              │           │
│  │      ▼                                              │           │
│  │   QUEUE                                             │           │
│  │   (wait for siblings)                               │           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐            │
│  │  Pipeline   │    │    Queue     │    │  Ticket    │            │
│  │ Orchestrator│◀───│  Processor   │◀───│  Callback  │            │
│  └─────────────┘    └──────────────┘    └────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/github` | GitHub webhook receiver |

### Deployments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/deploy/:service` | Manual deployment trigger |
| GET | `/api/deployments` | List all deployments |
| GET | `/api/deployments/:id` | Get deployment details |

### Queue Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/queue` | View deployment queue status |
| GET | `/api/queue/:id` | Get queue item details |
| POST | `/api/deploy-feature/:parentTicketId` | Force deploy all queued items for a feature |

### Ticket Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/callbacks/ticket-complete` | Ticket completion callback |
| POST | `/api/link-commit` | Manually link commit to ticket |

### Info
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/manifests` | List service manifests |
| GET | `/api/manifests/:service` | Get specific manifest |

## Ticket-Aware Deployment Flow

### Example: Multi-Part Feature

```
Parent Ticket: "Add dark mode to dashboard"
├── T1: "Create ThemeContext" 
├── T2: "Build toggle component"
└── T3: "Wire to settings page"

Timeline:
─────────────────────────────────────────────────────────
Agent completes T1 → PR merges → Webhook fires
  └─ Check: Parent exists? YES
  └─ Check: All siblings complete? NO (T2, T3 pending)
  └─ Action: QUEUE (waiting for T2, T3)

Agent completes T2 → PR merges → Webhook fires
  └─ Check: Parent exists? YES
  └─ Check: All siblings complete? NO (T3 pending)
  └─ Action: QUEUE (waiting for T3)

Agent completes T3 → PR merges → Webhook fires
  └─ Check: Parent exists? YES
  └─ Check: All siblings complete? YES!
  └─ Action: DEPLOY ALL QUEUED + THIS COMMIT
─────────────────────────────────────────────────────────
Result: Feature deploys as one coherent unit
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOY_AGENT_PORT` | 3457 | HTTP server port |
| `MANIFESTS_DIR` | /opt/swarm-deploy/manifests | Service manifests |
| `DB_PATH` | /opt/swarm-deploy/data/deployments.db | SQLite database |
| `TICKET_API_URL` | http://localhost:8080 | Swarm Ticket API |
| `TICKET_API_TOKEN` | | API authentication token |
| `LOG_LEVEL` | info | Logging verbosity |

### Service Manifests

Each service needs a YAML manifest in `/manifests/`:

```yaml
service:
  name: swarm-dashboard
  pm2_name: swarm-dashboard-dev
  port: 3000

repository:
  path: /opt/swarm-dashboard
  github: corynaegle-ai/swarm-dashboard
  branch: main

environment:
  target: dev
  droplet_ip: 134.199.235.140

build:
  commands:
    - npm ci
    - npm run build
  timeout: 300

deploy:
  commands:
    - pm2 restart swarm-dashboard-dev
  timeout: 60

health_check:
  endpoint: http://localhost:3000
  expected_status: 200
  timeout: 30
  retries: 3
  retry_delay: 5

rollback:
  enabled: true
  commands:
    - git checkout HEAD^
    - npm ci
    - npm run build
    - pm2 restart swarm-dashboard-dev
```

## Ticket Integration Setup

### 1. Configure Ticket API Webhook

In the Swarm Platform, add a webhook for ticket status changes:

```javascript
// When ticket status changes to 'completed' or 'done'
await fetch('https://deploy.dev.swarmstack.net/api/callbacks/ticket-complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ticket_id: ticket.id,
    status: 'completed'
  })
});
```

### 2. Link Commits to Tickets

**Option A**: Include ticket ID in PR title
```
[TICKET-123] Add dark mode toggle
```

**Option B**: Manual linking
```bash
curl -X POST https://deploy.dev.swarmstack.net/api/link-commit \
  -H "Content-Type: application/json" \
  -d '{"commit_sha": "abc123", "ticket_id": "TICKET-123", "repo": "swarm-dashboard"}'
```

## Safety Guardrails

| Guardrail | Description |
|-----------|-------------|
| **Environment Lock** | Only deploys to dev (134.199.235.140), NEVER prod |
| **Health Checks** | Validates deployment via HTTP endpoint |
| **Auto-Rollback** | Reverts to previous commit on failure |
| **Audit Trail** | All events logged to SQLite |
| **Feature Coherence** | Child tickets deploy together, not individually |

## Directory Structure

```
/opt/swarm-deploy/
├── src/
│   ├── index.ts              # Entry point + API routes
│   ├── webhook-receiver.ts    # GitHub webhook + decision engine
│   ├── pipeline.ts           # Deployment orchestration
│   ├── queue-processor.ts    # Feature completion handling
│   ├── ticket-api.ts         # Ticket system client
│   ├── executor.ts           # Shell command runner
│   ├── health-checker.ts     # Post-deploy verification
│   ├── manifest-loader.ts    # YAML config parser
│   ├── db.ts                 # SQLite operations
│   ├── logger.ts             # Winston logging
│   └── types.ts              # TypeScript interfaces
├── manifests/
│   ├── swarm-dashboard.yaml
│   └── swarm-platform.yaml
├── data/
│   └── deployments.db
├── logs/
│   └── deploy-agent.log
├── package.json
├── tsconfig.json
└── ecosystem.config.js
```

## Debugging

### Check Queue Status
```bash
curl https://deploy.dev.swarmstack.net/api/queue | jq
```

### View Recent Deployments
```bash
curl https://deploy.dev.swarmstack.net/api/deployments | jq
```

### Force Deploy a Feature
```bash
curl -X POST https://deploy.dev.swarmstack.net/api/deploy-feature/PARENT-TICKET-ID
```

### View Logs
```bash
pm2 logs deploy-agent --lines 100
```
