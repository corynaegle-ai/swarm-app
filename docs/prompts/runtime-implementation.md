# Swarm Runtime Implementation Prompt

**Purpose:** Complete implementation guide for building the Swarm agent/workflow runtime system. This prompt contains all specifications, schemas, and implementation details needed to build the entire system from scratch.

**Estimated Sessions:** 4-6 focused sessions (15-20 min each)

---

## Context & Background

### What is Swarm?

Swarm is a distributed AI agent coordination system using Firecracker microVMs. It enables autonomous software development where agents run in isolated VMs, execute tasks, and coordinate via a workflow engine.

### Current Infrastructure (Already Built)

- **Droplet:** 146.190.35.235 (DigitalOcean, Ubuntu 22.04)
- **Firecracker VMM:** Kernel 5.10.225, sub-10ms boot times
- **VM Spawning:** `swarm-spawn-ns` creates namespaced VMs at 10.0.0.2
- **Cleanup:** `swarm-cleanup-ns --all` tears down all VMs
- **API Server:** Port 8080 (dashboard), Port 3000 (dev API)
- **Repositories:** `/opt/swarm`, `/opt/swarm-tickets` (GitHub)

### What We're Building

A runtime system that:
1. **Stores agents** as portable packages with defined I/O schemas
2. **Stores workflows** as DAGs connecting agents
3. **Executes workflows** by spawning VMs for each step
4. **Tracks runs** with full execution history

---

## Access & Credentials

```bash
# SSH Access
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin

# Dev API
API_URL="https://api.swarmstack.net"
```

---

## Phase 1: Directory Structure & Registry Database

### Task 1.1: Create Directory Structure

```bash
# Create all directories
mkdir -p /opt/swarm-agents/.registry
mkdir -p /opt/swarm-agents/_templates/basic-agent
mkdir -p /opt/swarm-agents/_templates/claude-agent
mkdir -p /opt/swarm-workflows/.registry
mkdir -p /opt/swarm-workflows/_templates/linear-workflow
mkdir -p /opt/swarm-workflows/_templates/parallel-workflow
mkdir -p /opt/swarm-registry/secrets/credentials
mkdir -p /opt/swarm-registry/logs/workflow-runs
mkdir -p /opt/swarm-engine/lib
mkdir -p /opt/swarm-engine/triggers
mkdir -p /opt/swarm-engine/cli

# Set permissions
chmod 700 /opt/swarm-registry/secrets
```

### Task 1.2: Create Registry Database

Create `/opt/swarm-registry/registry.db` with this schema:

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Agents table
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    path TEXT NOT NULL,
    description TEXT,
    capabilities JSON,
    inputs_schema JSON,
    outputs_schema JSON,
    runtime TEXT DEFAULT 'node',
    memory_mb INTEGER DEFAULT 128,
    timeout_seconds INTEGER DEFAULT 300,
    triggers JSON,
    author TEXT,
    tags JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, version)
);

CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_capabilities ON agents(capabilities);

-- Workflows table
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    path TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT,
    trigger_config JSON,
    steps JSON NOT NULL,
    variables JSON,
    on_error JSON,
    on_success JSON,
    enabled BOOLEAN DEFAULT 1,
    author TEXT,
    tags JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, version)
);

CREATE INDEX idx_workflows_name ON workflows(name);
CREATE INDEX idx_workflows_trigger ON workflows(trigger_type);
CREATE INDEX idx_workflows_enabled ON workflows(enabled);

-- Workflow runs table
CREATE TABLE workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    workflow_version TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    current_step TEXT,
    trigger_type TEXT,
    trigger_data JSON,
    step_results JSON DEFAULT '{}',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error TEXT,
    error_step TEXT,
    total_vm_time_ms INTEGER DEFAULT 0,
    total_api_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX idx_runs_status ON workflow_runs(status);
CREATE INDEX idx_runs_started ON workflow_runs(started_at);

-- Step executions table
CREATE TABLE step_executions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES workflow_runs(id),
    step_id TEXT NOT NULL,
    agent_id TEXT REFERENCES agents(id),
    agent_name TEXT,
    agent_version TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    vm_id TEXT,
    inputs JSON,
    outputs JSON,
    queued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    api_tokens_used INTEGER DEFAULT 0,
    error TEXT,
    retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_steps_run ON step_executions(run_id);
CREATE INDEX idx_steps_status ON step_executions(status);

-- Secrets table
CREATE TABLE secrets (
    id TEXT PRIMARY KEY,
    workflow_id TEXT REFERENCES workflows(id),
    name TEXT NOT NULL,
    encrypted_value BLOB,
    scope TEXT DEFAULT 'workflow',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workflow_id, name)
);

-- Triggers table
CREATE TABLE triggers (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    type TEXT NOT NULL,
    webhook_path TEXT UNIQUE,
    webhook_secret TEXT,
    cron_expression TEXT,
    next_run_at TIMESTAMP,
    event_source TEXT,
    event_type TEXT,
    enabled BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_triggers_webhook ON triggers(webhook_path);
CREATE INDEX idx_triggers_schedule ON triggers(next_run_at) WHERE type = 'schedule';
CREATE INDEX idx_triggers_event ON triggers(event_source, event_type) WHERE type = 'event';
```

### Task 1.3: Verify Setup

```bash
# Verify directories
ls -la /opt/swarm-agents/
ls -la /opt/swarm-workflows/
ls -la /opt/swarm-registry/
ls -la /opt/swarm-engine/

# Verify database
sqlite3 /opt/swarm-registry/registry.db ".tables"
sqlite3 /opt/swarm-registry/registry.db ".schema agents"
```

---

## Phase 2: Agent Package System

### Task 2.1: Create Agent Template

Create `/opt/swarm-agents/_templates/basic-agent/agent.yaml`:

```yaml
name: template-agent
version: 1.0.0
description: Basic agent template
author: swarm

runtime:
  type: node
  entry: main.js
  memory_mb: 128
  timeout_seconds: 300

capabilities: []

inputs:
  - name: input_data
    type: string
    required: true
    description: Input data for the agent

outputs:
  - name: result
    type: object
    description: Agent output

triggers:
  - type: manual

tags: []
```

### Task 2.2: Create Example Agents

See `/opt/swarm-agents/` directory for:
- **echo** - Simple echo agent
- **http-fetch** - HTTP request agent
- **claude-chat** - Claude API agent

### Task 2.3: Create Agent CLI

The `swarm-agent` CLI provides:
- `list` - List all registered agents
- `info <name>` - Show agent details
- `register <path>` - Register an agent
- `register --all` - Register all agents

---

## Phase 3: Workflow System

### Task 3.1: Workflow Templates

Create `/opt/swarm-workflows/_templates/linear-workflow/workflow.yaml`:

```yaml
name: template-workflow
version: 1.0.0
description: Linear workflow template
author: swarm

trigger:
  type: manual

variables: {}

steps:
  - id: step1
    name: First Step
    agent: echo@1.0.0
    inputs:
      message: "Step 1 complete"

  - id: step2
    name: Second Step  
    agent: echo@1.0.0
    inputs:
      message: "Step 2 received: ${steps.step1.outputs.echoed}"

on_error:
  - notify:
      type: log
      message: "Workflow failed: ${error.message}"

tags: []
```

### Task 3.2: Workflow CLI

The `swarm-workflow` CLI provides:
- `list` - List workflows
- `info <name>` - Show workflow details
- `register <path>` - Register workflow
- `enable/disable <name>` - Toggle workflow
- `runs <name>` - Show run history

---

## Phase 4: Execution Engine

### Task 4.1: Variable Resolver

Supports `${...}` variable resolution:
- `trigger.*` - Trigger data
- `config.*` - Configuration
- `secrets.*` - Encrypted secrets
- `steps.*.outputs.*` - Step outputs
- `variables.*` - Workflow variables

### Task 4.2: Workflow Run CLI

```bash
swarm-run <workflow-name> [input-json]

# Examples:
swarm-run echo-chain '{"message": "Hello World"}'
swarm-run email-auto-reply
```

---

## Phase 5: Webhook Trigger Server

Port 8090 provides:
- `GET /health` - Health check
- `GET /webhooks` - List webhooks
- `POST /workflows/:path/trigger` - Trigger workflow

---

## Phase 6: Integration & Testing

```bash
# Register all
swarm-agent register --all
swarm-workflow register --all

# Test
swarm-agent list
swarm-workflow list
swarm-run echo-chain '{"message": "Hello Swarm!"}'
```

---

## Verification Checklist

- [ ] Directory structure created
- [ ] registry.db with all tables
- [ ] Agent templates created
- [ ] Workflow templates created
- [ ] CLI tools working
- [ ] Trigger server running
- [ ] End-to-end workflow execution

---

## Quick Reference

```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin

# Key directories
/opt/swarm-agents/      # Agent packages
/opt/swarm-workflows/   # Workflow definitions
/opt/swarm-registry/    # SQLite DB + secrets
/opt/swarm-engine/      # Execution engine code

# CLI commands
swarm-agent list|info|register
swarm-workflow list|info|register|enable|disable|runs
swarm-run <workflow> [input-json]

# Services
systemctl status swarm-triggers    # Webhook server (8090)
```
