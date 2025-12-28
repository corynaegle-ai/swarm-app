# Swarm Deploy Agent - Architecture Specification

## Overview

The Deploy Agent is an autonomous CI/CD orchestrator that enables Swarm to deploy itself. When code is committed by Swarm agents (or humans), the Deploy Agent detects the change, builds the affected service, deploys to dev, and verifies the deployment succeeded.

## Design Principles

1. **Dev-Only Deployment**: The Deploy Agent ONLY deploys to dev environment. Production promotions require human approval through a separate workflow.

2. **Gate-Based Pipeline**: Every deployment passes through verification gates (Sentinel approval, tests, health checks).

3. **Atomic Deployments**: Each deployment is atomic - it either fully succeeds or rolls back.

4. **Observable**: Every action is logged, traceable, and reportable.

5. **Self-Healing**: On failure, the system auto-rollbacks and reports.

## Architecture Components

### 1. Webhook Receiver (`/api/webhooks/github`)

Listens for GitHub webhook events:
- `push` - Direct pushes to main/master
- `pull_request.merged` - PR merges
- `workflow_run.completed` - CI completion

```typescript
interface WebhookEvent {
  event_type: 'push' | 'pull_request' | 'workflow_run';
  repository: string;
  ref: string;
  commit_sha: string;
  actor: string;
  timestamp: string;
}
```

### 2. Manifest Registry

Stores deployment manifests for each service:

```yaml
# /opt/swarm-deploy/manifests/swarm-dashboard.yaml
service:
  name: swarm-dashboard
  pm2_name: swarm-dashboard-dev
  
repository:
  path: /opt/swarm-dashboard
  github: corynaegle-ai/swarm-dashboard
  branch: main
  
build:
  pre_checks:
    - test -f package.json
  commands:
    - npm ci --production=false
    - npm run build
  timeout: 300s
  
deploy:
  strategy: rolling  # or 'replace'
  commands:
    - pm2 restart swarm-dashboard-dev
  timeout: 60s
  
health_check:
  endpoint: http://localhost:3000
  method: GET
  expected_status: 200
  timeout: 30s
  retries: 3
  retry_delay: 5s
  
rollback:
  enabled: true
  commands:
    - git checkout HEAD^
    - npm ci --production=false
    - npm run build
    - pm2 restart swarm-dashboard-dev
    
notifications:
  on_success: true
  on_failure: true
  channels:
    - type: ticket  # Creates/updates ticket
    - type: log     # System log
```

### 3. Pipeline Orchestrator

The brain of the Deploy Agent. Coordinates the deployment workflow:

```
┌─────────────────────────────────────────────────────────────┐
│                    PIPELINE STAGES                          │
├─────────────────────────────────────────────────────────────┤
│  1. TRIGGER    │ Webhook received, event validated         │
│  2. GATE       │ Check Sentinel approval status            │
│  3. PREPARE    │ Git pull, identify changes                │
│  4. BUILD      │ Execute build commands                    │
│  5. DEPLOY     │ Restart service via PM2                   │
│  6. VERIFY     │ Run health checks                         │
│  7. FINALIZE   │ Update ticket, cleanup, notify            │
└─────────────────────────────────────────────────────────────┘
```

### 4. Executor

Runs shell commands safely with:
- Timeout enforcement
- Output capture
- Exit code validation
- Resource isolation

### 5. Health Checker

Post-deployment verification:
- HTTP endpoint checks
- Response time validation
- Status code verification
- Retry with backoff

### 6. Event Store (SQLite)

Tracks all deployment events for audit:

```sql
CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  trigger_type TEXT NOT NULL,  -- 'webhook', 'manual', 'ticket'
  status TEXT NOT NULL,        -- 'pending', 'building', 'deploying', 'success', 'failed', 'rolled_back'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  build_log TEXT,
  deploy_log TEXT,
  health_check_result TEXT,
  rollback_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deployment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  details TEXT,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id)
);
```

## Safety Guardrails

### 1. Environment Lock

```typescript
const ALLOWED_DEPLOY_TARGETS = ['dev'];
const DEV_DROPLET_IP = '134.199.235.140';

function validateTarget(target: string): boolean {
  if (!ALLOWED_DEPLOY_TARGETS.includes(target)) {
    throw new Error(`BLOCKED: Cannot deploy to ${target}. Only dev is allowed.`);
  }
  return true;
}
```

### 2. Sentinel Gate

Before any deployment, verify Sentinel approval:

```typescript
async function checkSentinelApproval(commitSha: string): Promise<boolean> {
  const review = await db.get(`
    SELECT status FROM sentinel_reviews 
    WHERE commit_sha = ? 
    ORDER BY created_at DESC LIMIT 1
  `, [commitSha]);
  
  return review?.status === 'approved';
}
```

### 3. Rollback Policy

Auto-rollback on:
- Build failure
- Health check failure (after 3 retries)
- Timeout exceeded

```typescript
async function executeWithRollback(
  deployFn: () => Promise<void>,
  rollbackFn: () => Promise<void>
): Promise<void> {
  try {
    await deployFn();
  } catch (error) {
    logger.error('Deployment failed, initiating rollback', error);
    await rollbackFn();
    throw new DeploymentRolledBackError(error.message);
  }
}
```

## API Endpoints

### Deploy Agent API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/github` | GitHub webhook receiver |
| POST | `/api/deploy/:service` | Manual deployment trigger |
| GET | `/api/deployments` | List all deployments |
| GET | `/api/deployments/:id` | Get deployment details |
| POST | `/api/deployments/:id/rollback` | Manual rollback |
| GET | `/api/manifests` | List all service manifests |
| GET | `/api/health` | Deploy Agent health check |

## Integration with Swarm Tickets

When a deployment occurs, it can be tracked as a ticket:

```typescript
async function createDeploymentTicket(deployment: Deployment): Promise<string> {
  const ticket = {
    type: 'deployment',
    title: `Deploy ${deployment.service} (${deployment.commit_sha.slice(0, 7)})`,
    description: `Automated deployment triggered by ${deployment.trigger_type}`,
    metadata: {
      service: deployment.service,
      commit_sha: deployment.commit_sha,
      deployment_id: deployment.id
    }
  };
  
  return await ticketApi.create(ticket);
}
```

## Directory Structure

```
/opt/swarm-deploy/
├── src/
│   ├── index.ts              # Entry point
│   ├── webhook-receiver.ts    # GitHub webhook handler
│   ├── pipeline.ts           # Deployment pipeline
│   ├── executor.ts           # Command executor
│   ├── health-checker.ts     # Health check runner
│   ├── manifest-loader.ts    # YAML manifest parser
│   └── db.ts                 # SQLite operations
├── manifests/
│   ├── swarm-dashboard.yaml
│   ├── swarm-platform.yaml
│   ├── swarm-mcp-factory.yaml
│   └── swarm-verifier.yaml
├── data/
│   └── deployments.db        # SQLite database
├── logs/
│   └── deploy-agent.log
├── package.json
├── tsconfig.json
└── ecosystem.config.js       # PM2 config
```

## Deployment Flow Example

```
1. Developer merges PR to swarm-dashboard
   │
   ▼
2. GitHub sends webhook to Deploy Agent
   POST /api/webhooks/github
   {
     "action": "closed",
     "pull_request": { "merged": true },
     "repository": { "name": "swarm-dashboard" }
   }
   │
   ▼
3. Deploy Agent identifies affected service
   → swarm-dashboard manifest loaded
   │
   ▼
4. Sentinel gate check
   → Query: Was this PR approved by Sentinel?
   → If NO: Abort, create alert ticket
   → If YES: Continue
   │
   ▼
5. Git pull latest code
   $ cd /opt/swarm-dashboard && git pull origin main
   │
   ▼
6. Build
   $ npm ci --production=false
   $ npm run build
   │
   ▼
7. Deploy
   $ pm2 restart swarm-dashboard-dev
   │
   ▼
8. Health check
   GET http://localhost:3000 → 200 OK ✓
   │
   ▼
9. Finalize
   → Update deployment record: status = 'success'
   → Create success ticket
   → Log completion
```

## Future Enhancements

1. **Multi-Stage Deployments**: Dev → Staging → Prod pipeline
2. **Canary Deployments**: Gradual rollout with traffic splitting
3. **Dependency Ordering**: Deploy services in correct order
4. **Slack/Discord Notifications**: Real-time deployment alerts
5. **Dashboard Widget**: Live deployment status in Swarm dashboard
