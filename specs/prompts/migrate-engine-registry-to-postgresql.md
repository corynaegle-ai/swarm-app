# Migrate Swarm Engine Registry from SQLite to PostgreSQL

## Objective
Migrate the last SQLite database (`/opt/swarm-registry/registry.db`) to PostgreSQL, completing the full database unification.

## Current State

### SQLite Registry Location
- **File**: `/opt/swarm-registry/registry.db`
- **Used by**: `swarm-engine` (PM2 process, `/opt/swarm/engine/lib/engine.js`)

### SQLite Schema (8 tables)

```sql
-- agents: Registered agent definitions
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

-- workflows: Workflow definitions
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

-- workflow_runs: Execution history
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

-- step_executions: Individual step tracking
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

-- vm_assignments: VM-to-ticket mapping
CREATE TABLE vm_assignments (
    vm_id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    heartbeat_at TEXT
);

-- execution_artifacts: Output artifacts
CREATE TABLE execution_artifacts (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    artifact_type TEXT,
    content TEXT,
    created_at TEXT
);

-- secrets: Encrypted workflow secrets
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

-- triggers: Workflow triggers (webhook, cron, event)
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
```

### Files to Migrate

| File | SQLite Usage |
|------|--------------|
| `/opt/swarm/engine/lib/engine.js` | `new Database(REGISTRY_DB)` for agent/workflow queries |
| `/opt/swarm/engine/lib/executor.js` | Step execution tracking, artifacts |
| `/opt/swarm/engine/lib/dispatcher.js` | Workflow dispatch, run management |
| `/opt/swarm/engine/lib/template-queries.js` | Template/agent lookups |
| `/opt/swarm/engine/cli/swarm-engine.js` | CLI queries |
| `/opt/swarm/engine/cli/swarm-workflow.js` | Workflow CLI |
| `/opt/swarm/engine/cli/register-templates.js` | Template registration |
| `/opt/swarm/engine/cli/init-registry.js` | Schema initialization |

### Package.json Location
`/opt/swarm/engine/package.json` - contains `better-sqlite3` dependency

## Migration Steps

### Step 1: Create PostgreSQL Schema
Create `engine_registry` schema in PostgreSQL with all 8 tables, converting:
- `JSON` → `JSONB`
- `BOOLEAN` → `BOOLEAN` (PostgreSQL native)
- `BLOB` → `BYTEA`
- `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMPTZ DEFAULT NOW()`

### Step 2: Create db.js Module
Create `/opt/swarm/engine/lib/db.js` with:
- PostgreSQL pool connection using `pg`
- Async wrapper functions for all registry operations
- Connection string from `DATABASE_URL` env var

### Step 3: Update Engine Files
Convert all files from synchronous SQLite to async PostgreSQL:
- Replace `Database` import with `db.js` module
- Convert `.prepare().run()` → `await pool.query()`
- Convert `.prepare().get()` → `await pool.query()` + `rows[0]`
- Convert `.prepare().all()` → `await pool.query()` + `rows`

### Step 4: Update package.json
- Remove `better-sqlite3`
- Add `pg` if not present

### Step 5: Migrate Existing Data
```bash
# Export from SQLite
sqlite3 /opt/swarm-registry/registry.db ".dump agents" > /tmp/agents.sql
# Transform and import to PostgreSQL
# (May need manual conversion of INSERT statements)
```

### Step 6: Update PM2 Config
Update ecosystem.config.js to include `DATABASE_URL` env var

### Step 7: Test & Deploy
```bash
cd /opt/swarm/engine
npm install
npm run build  # if TypeScript
pm2 restart swarm-engine --update-env
pm2 logs swarm-engine --lines 20
```

### Step 8: Cleanup
```bash
rm /opt/swarm-registry/registry.db
rmdir /opt/swarm-registry  # if empty
```

## PostgreSQL Connection
```
DATABASE_URL=postgresql://swarm:swarm_dev_2024@localhost:5432/swarmdb
```

## Success Criteria
1. ✅ `swarm-engine` starts without errors
2. ✅ `pm2 logs swarm-engine` shows "Database initialized (PostgreSQL)"
3. ✅ No `.db` files remain in `/opt`
4. ✅ `grep -r "better-sqlite3" /opt/swarm` returns nothing
5. ✅ All 8 tables exist in `engine_registry` schema

## Reference: deploy-agent Migration
The deploy-agent was just migrated using the same pattern. See:
- `/opt/swarm-deploy/src/db.ts` - PostgreSQL database class
- Commit `4d62b6f` in swarm-deploy repo

## Rollback Plan
If migration fails:
1. Stop engine: `pm2 stop swarm-engine`
2. Restore SQLite file from backup
3. Revert code changes: `git checkout .`
4. Restart: `pm2 start swarm-engine`
