# Database Schema Reference

> **Moved to Git**: https://github.com/corynaegle-ai/swarm-specs/blob/main/specs/schemas/database-schema.md

SQLite schemas for Swarm Runtime system. Location: /opt/swarm-registry/registry.db

---

## agents table

```sql
CREATE TABLE agents (
    id TEXT PRIMARY KEY,           -- UUID
    name TEXT NOT NULL,            -- "email-reader"
    version TEXT NOT NULL,         -- semver "1.0.0"
    path TEXT NOT NULL,            -- "/opt/swarm-agents/email-reader"
    description TEXT,
    
    -- Capability system
    capabilities JSON,             -- ["network:http", "claude:api"]
    
    -- I/O schema
    input_schema JSON,             -- JSON Schema for expected inputs
    output_schema JSON,            -- JSON Schema for outputs
    
    -- Runtime requirements
    runtime_type TEXT DEFAULT 'node',  -- node, python, binary
    memory_mb INTEGER DEFAULT 128,
    timeout_seconds INTEGER DEFAULT 300,
    
    -- Metadata
    author TEXT,
    tags JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(name, version)
);

CREATE INDEX idx_agents_name ON agents(name);
CREATE INDEX idx_agents_capabilities ON agents(capabilities);
```

---

## workflows table

```sql
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,           -- UUID
    name TEXT NOT NULL,            -- "email-auto-reply"
    version TEXT NOT NULL,         -- semver
    path TEXT NOT NULL,            -- "/opt/swarm-workflows/email-auto-reply"
    description TEXT,
    
    -- Trigger configuration
    trigger_type TEXT,             -- webhook, schedule, event, manual
    trigger_config JSON,           -- cron expression, webhook path, etc.
    
    -- DAG definition
    steps JSON NOT NULL,           -- Array of step definitions
    
    -- Error handling
    on_error JSON,                 -- Notification/retry config
    
    -- State
    enabled BOOLEAN DEFAULT true,
    
    -- Metadata
    author TEXT,
    tags JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(name, version)
);

CREATE INDEX idx_workflows_trigger ON workflows(trigger_type);
CREATE INDEX idx_workflows_enabled ON workflows(enabled);
```

---

## workflow_runs table

```sql
CREATE TABLE workflow_runs (
    id TEXT PRIMARY KEY,           -- UUID
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    workflow_version TEXT,         -- Snapshot of version at run time
    
    -- Execution state
    status TEXT NOT NULL,          -- pending, running, completed, failed, cancelled
    current_step TEXT,             -- Currently executing step ID
    
    -- Trigger data
    trigger_type TEXT,             -- What triggered this run
    trigger_data JSON,             -- Incoming webhook payload, etc.
    
    -- Step execution results
    step_results JSON,             -- {step_id: {status, output, duration_ms, vm_id}}
    
    -- Timing
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Error info
    error TEXT,
    error_step TEXT,               -- Which step failed
    
    -- Resource tracking
    total_vm_time_ms INTEGER,
    total_api_tokens INTEGER
);

CREATE INDEX idx_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX idx_runs_status ON workflow_runs(status);
CREATE INDEX idx_runs_started ON workflow_runs(started_at);
```

---

## step_executions table

```sql
CREATE TABLE step_executions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES workflow_runs(id),
    step_id TEXT NOT NULL,         -- From workflow definition
    agent_id TEXT REFERENCES agents(id),
    
    -- Execution details
    status TEXT NOT NULL,          -- pending, running, completed, failed, skipped
    vm_id TEXT,                    -- Which VM executed this
    
    -- I/O
    inputs JSON,                   -- Resolved inputs passed to agent
    outputs JSON,                  -- Agent outputs
    
    -- Timing
    queued_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Metrics
    duration_ms INTEGER,
    api_tokens_used INTEGER,
    
    -- Errors
    error TEXT,
    retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_steps_run ON step_executions(run_id);
CREATE INDEX idx_steps_status ON step_executions(status);
```

---

## secrets table

```sql
CREATE TABLE secrets (
    id TEXT PRIMARY KEY,
    workflow_id TEXT REFERENCES workflows(id),
    name TEXT NOT NULL,            -- "email_creds", "api_key"
    encrypted_value BLOB,          -- AES-256-GCM encrypted
    
    -- Access control
    scope TEXT DEFAULT 'workflow', -- workflow, global
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(workflow_id, name)
);
```

---

## triggers table

```sql
CREATE TABLE triggers (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    
    type TEXT NOT NULL,            -- webhook, schedule, event
    
    -- Webhook specific
    webhook_path TEXT UNIQUE,      -- "/hooks/email-incoming"
    webhook_secret TEXT,           -- HMAC verification
    
    -- Schedule specific  
    cron_expression TEXT,          -- "*/5 * * * *"
    next_run_at TIMESTAMP,
    
    -- Event specific
    event_source TEXT,             -- Agent or external system
    event_type TEXT,               -- "new_email", "task_complete"
    
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_triggers_webhook ON triggers(webhook_path);
CREATE INDEX idx_triggers_schedule ON triggers(next_run_at) WHERE type = 'schedule';
```
