# SQLite to PostgreSQL Migration Plan

## Executive Summary

Migration of Swarm's distributed SQLite databases to a centralized PostgreSQL instance. Current data volume is minimal (~300KB total), making this an ideal time to migrate before production scale.

---

## Current State Analysis

### Active Databases

| Database | Location | Size | Tables | Rows |
|----------|----------|------|--------|------|
| **registry.db** | `/opt/swarm-registry/` | 168KB | 8 | ~10 |
| **deployments.db** | `/opt/swarm-deploy/data/` | 112KB | 4 | ~280 |
| **swarm.db** | `/opt/swarm-platform/data/` | 16KB | 5 | ~25 |

### Symlink Structure (Consolidation Opportunity)
```
/opt/swarm-tickets/data/swarm.db    → /opt/swarm-platform/data/swarm.db
/opt/swarm-tickets/tickets.db       → /opt/swarm-platform/data/swarm.db
/opt/swarm-platform/tickets.db      → /opt/swarm-platform/data/swarm.db
```

### Empty/Legacy Databases (Can Delete)
- `/opt/swarm-platform/data/platform.db` (0 bytes)
- `/opt/swarm-platform/data/swarm-platform.db` (0 bytes)
- `/opt/swarm-platform/swarm.db` (0 bytes)
- `/opt/swarm-app/apps/platform/data/swarm.db` (0 bytes)
- `/opt/swarm-mcp-factory.legacy/registry.db` (4KB, legacy)

---

## Target Schema Design

### Database: `swarm`

#### Schema: `auth`
```sql
CREATE SCHEMA auth;

CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role_id UUID REFERENCES auth.roles(id),
  tenant_id UUID,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auth.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  level INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auth.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE auth.role_permissions (
  role_id UUID REFERENCES auth.roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES auth.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);
```

#### Schema: `registry`
```sql
CREATE SCHEMA registry;

CREATE TABLE registry.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  capabilities JSONB DEFAULT '[]',
  inputs_schema JSONB,
  outputs_schema JSONB,
  runtime TEXT DEFAULT 'node',
  memory_mb INTEGER DEFAULT 128,
  timeout_seconds INTEGER DEFAULT 300,
  triggers JSONB,
  author TEXT,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, version)
);

CREATE TABLE registry.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT,
  trigger_config JSONB,
  steps JSONB NOT NULL,
  variables JSONB,
  on_error JSONB,
  on_success JSONB,
  enabled BOOLEAN DEFAULT TRUE,
  author TEXT,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, version)
);

CREATE TABLE registry.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES registry.workflows(id),
  workflow_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT,
  trigger_type TEXT,
  trigger_data JSONB,
  step_results JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  error_step TEXT,
  total_vm_time_ms INTEGER DEFAULT 0,
  total_api_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE registry.step_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES registry.workflow_runs(id),
  step_id TEXT NOT NULL,
  agent_id UUID REFERENCES registry.agents(id),
  agent_name TEXT,
  agent_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  vm_id TEXT,
  inputs JSONB,
  outputs JSONB,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  api_tokens_used INTEGER DEFAULT 0,
  error TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE TABLE registry.vm_assignments (
  vm_id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'running',
  heartbeat_at TIMESTAMPTZ
);

CREATE TABLE registry.triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES registry.workflows(id),
  type TEXT NOT NULL,
  webhook_path TEXT UNIQUE,
  webhook_secret TEXT,
  cron_expression TEXT,
  next_run_at TIMESTAMPTZ,
  event_source TEXT,
  event_type TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE registry.secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES registry.workflows(id),
  name TEXT NOT NULL,
  encrypted_value BYTEA,
  scope TEXT DEFAULT 'workflow',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, name)
);

CREATE TABLE registry.execution_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  artifact_type TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Schema: `deploy`
```sql
CREATE SCHEMA deploy;

CREATE TABLE deploy.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  build_log TEXT,
  deploy_log TEXT,
  health_check_result TEXT,
  rollback_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deploy.deployment_events (
  id SERIAL PRIMARY KEY,
  deployment_id UUID NOT NULL REFERENCES deploy.deployments(id),
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deploy.queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  parent_ticket_id TEXT,
  commit_sha TEXT NOT NULL,
  repo TEXT NOT NULL,
  service TEXT NOT NULL,
  pr_number INTEGER,
  status TEXT DEFAULT 'waiting',
  waiting_for TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ
);

CREATE TABLE deploy.commit_ticket_map (
  commit_sha TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Schema: `verification`
```sql
CREATE SCHEMA verification;

CREATE TABLE verification.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  branch_name TEXT NOT NULL,
  commit_sha TEXT,
  status TEXT NOT NULL,
  failed_phase TEXT,
  duration_ms INTEGER,
  static_result JSONB,
  automated_result JSONB,
  sentinel_result JSONB,
  sentinel_decision TEXT,
  sentinel_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Migration Phases

### Phase 1: Infrastructure Setup (Day 1)

**1.1 Install PostgreSQL on Dev Droplet**
```bash
# Install PostgreSQL 16
apt update && apt install -y postgresql-16 postgresql-contrib-16

# Start and enable service
systemctl enable postgresql
systemctl start postgresql

# Create database and user
sudo -u postgres psql <<EOF
CREATE USER swarm WITH PASSWORD 'secure_password_here';
CREATE DATABASE swarm OWNER swarm;
\c swarm
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOF
```

**1.2 Configure PostgreSQL**
```bash
# /etc/postgresql/16/main/postgresql.conf
listen_addresses = 'localhost'
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 4MB

# /etc/postgresql/16/main/pg_hba.conf
local   swarm   swarm   scram-sha-256
host    swarm   swarm   127.0.0.1/32   scram-sha-256
```

**1.3 Create Schemas**
```bash
psql -U swarm -d swarm -f /opt/swarm-specs/migrations/001_create_schemas.sql
```

### Phase 2: Create Shared Database Library (Day 2)

**2.1 Create `/opt/swarm-shared/db/`**
```
/opt/swarm-shared/
├── db/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── pool.ts
│   │   ├── schemas/
│   │   │   ├── auth.ts
│   │   │   ├── registry.ts
│   │   │   ├── deploy.ts
│   │   │   └── verification.ts
│   │   └── migrations/
│   │       └── runner.ts
│   └── migrations/
│       ├── 001_auth_schema.sql
│       ├── 002_registry_schema.sql
│       ├── 003_deploy_schema.sql
│       └── 004_verification_schema.sql
```

**2.2 Connection Pool Configuration**
```typescript
// /opt/swarm-shared/db/src/pool.ts
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'swarm',
  user: process.env.PGUSER || 'swarm',
  password: process.env.PGPASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export default pool;
```

### Phase 3: Data Migration Scripts (Day 3)

**3.1 Export SQLite Data**
```bash
# Export each table to JSON
sqlite3 /opt/swarm-registry/registry.db \
  "SELECT json_group_array(json_object(
    'id', id, 'name', name, 'version', version, 'path', path,
    'capabilities', capabilities, 'runtime', runtime
  )) FROM agents;" > /tmp/agents.json

# Repeat for all tables...
```

**3.2 Import to PostgreSQL**
```typescript
// Migration script for agents
const agents = JSON.parse(fs.readFileSync('/tmp/agents.json'));
for (const agent of agents) {
  await pool.query(`
    INSERT INTO registry.agents (id, name, version, path, capabilities, runtime)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (name, version) DO NOTHING
  `, [agent.id, agent.name, agent.version, agent.path, 
      JSON.parse(agent.capabilities || '[]'), agent.runtime]);
}
```

### Phase 4: Service Updates (Day 4-5)

**4.1 Update Order (Dependency-Based)**
1. `swarm-shared/db` - Create and publish shared library
2. `swarm-registry` - Uses registry schema
3. `swarm-deploy` - Uses deploy schema  
4. `swarm-tickets` - Uses auth + verification schemas
5. `swarm-platform` - Uses all schemas

**4.2 Code Changes per Service**

| Service | Current | Change Required |
|---------|---------|-----------------|
| swarm-registry | `better-sqlite3` | Replace with `pg` pool |
| swarm-deploy | `better-sqlite3` | Replace with `pg` pool |
| swarm-tickets | `better-sqlite3` | Replace with `pg` pool |
| swarm-platform | `better-sqlite3` | Replace with `pg` pool |

**4.3 Environment Variables**
```bash
# Add to each service's .env
PGHOST=localhost
PGPORT=5432
PGDATABASE=swarm
PGUSER=swarm
PGPASSWORD=secure_password_here
```

### Phase 5: Testing & Validation (Day 6)

**5.1 Validation Queries**
```sql
-- Count comparison
SELECT 'auth.users' as table_name, COUNT(*) FROM auth.users
UNION ALL SELECT 'registry.agents', COUNT(*) FROM registry.agents
UNION ALL SELECT 'deploy.deployments', COUNT(*) FROM deploy.deployments;
```

**5.2 Functional Tests**
- [ ] User login works
- [ ] Agent registration works
- [ ] Workflow execution persists
- [ ] Deployment tracking works
- [ ] Dashboard displays data

### Phase 6: Cleanup (Day 7)

**6.1 Remove SQLite Files**
```bash
# Backup first
tar -czf /opt/backups/sqlite-final-$(date +%Y%m%d).tar.gz \
  /opt/swarm-registry/registry.db \
  /opt/swarm-deploy/data/deployments.db \
  /opt/swarm-platform/data/swarm.db

# Remove after 7-day monitoring
rm -f /opt/swarm-registry/registry.db
rm -f /opt/swarm-deploy/data/deployments.db
rm -f /opt/swarm-platform/data/*.db
rm -f /opt/swarm-tickets/data/swarm.db
rm -f /opt/swarm-tickets/tickets.db
```

**6.2 Remove SQLite Dependencies**
```bash
# From each service package.json
npm uninstall better-sqlite3
```

---

## Rollback Plan

If issues arise, SQLite databases remain intact until Phase 6.

**Quick Rollback:**
```bash
# Revert environment
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

# Restart services
pm2 restart all
```

---

## Benefits of PostgreSQL

| Feature | SQLite | PostgreSQL |
|---------|--------|------------|
| Concurrent writes | Single writer | Many writers |
| Connection pooling | N/A | Built-in |
| JSON operations | Basic | Advanced (JSONB) |
| Full-text search | Limited | Excellent |
| Scaling | Limited | Horizontal ready |
| Backup/Replication | Manual | Built-in |
| Monitoring | Limited | Rich tooling |

---

## Timeline Summary

| Day | Phase | Duration |
|-----|-------|----------|
| 1 | Infrastructure Setup | 2 hours |
| 2 | Shared DB Library | 4 hours |
| 3 | Data Migration Scripts | 3 hours |
| 4-5 | Service Updates | 6 hours |
| 6 | Testing & Validation | 4 hours |
| 7 | Cleanup | 1 hour |

**Total Estimated Effort: 20 hours**

---

## Open Questions

1. **DigitalOcean Managed PostgreSQL?** - Could use managed DB for prod instead of self-hosted
2. **Connection String Format?** - Standard `postgresql://` or individual env vars?
3. **Migration Timing?** - Dev first, then prod after validation period?
4. **Backup Strategy?** - pg_dump cron or managed backups?


---

## Appendix: Index Definitions

```sql
-- Auth indexes
CREATE INDEX idx_users_email ON auth.users(email);
CREATE INDEX idx_users_tenant ON auth.users(tenant_id);
CREATE INDEX idx_role_permissions_role ON auth.role_permissions(role_id);
CREATE INDEX idx_role_permissions_perm ON auth.role_permissions(permission_id);
CREATE INDEX idx_permissions_category ON auth.permissions(category);

-- Registry indexes
CREATE INDEX idx_agents_name ON registry.agents(name);
CREATE INDEX idx_agents_runtime ON registry.agents(runtime);
CREATE INDEX idx_workflows_name ON registry.workflows(name);
CREATE INDEX idx_workflows_enabled ON registry.workflows(enabled);
CREATE INDEX idx_runs_workflow ON registry.workflow_runs(workflow_id);
CREATE INDEX idx_runs_status ON registry.workflow_runs(status);
CREATE INDEX idx_runs_created ON registry.workflow_runs(created_at);
CREATE INDEX idx_steps_run ON registry.step_executions(run_id);
CREATE INDEX idx_steps_status ON registry.step_executions(status);
CREATE INDEX idx_vm_ticket ON registry.vm_assignments(ticket_id);

-- Deploy indexes
CREATE INDEX idx_deployments_service ON deploy.deployments(service);
CREATE INDEX idx_deployments_status ON deploy.deployments(status);
CREATE INDEX idx_deployments_created ON deploy.deployments(created_at);
CREATE INDEX idx_events_deployment ON deploy.deployment_events(deployment_id);
CREATE INDEX idx_queue_status ON deploy.queue(status);
CREATE INDEX idx_queue_parent ON deploy.queue(parent_ticket_id);
CREATE INDEX idx_commit_ticket ON deploy.commit_ticket_map(ticket_id);

-- Verification indexes
CREATE INDEX idx_verify_ticket ON verification.attempts(ticket_id);
CREATE INDEX idx_verify_status ON verification.attempts(status);
CREATE INDEX idx_verify_created ON verification.attempts(created_at);
```

---

*Document created: $(date)*
*Author: Claude (Systems Architect)*
