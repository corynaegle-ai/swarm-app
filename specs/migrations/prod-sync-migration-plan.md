# PROD PostgreSQL Schema Migration Plan

**Date**: 2024-12-25  
**DEV**: 134.199.235.140  
**PROD**: 146.190.35.235  

---

## Executive Summary

| Category | DEV | PROD | Delta |
|----------|-----|------|-------|
| Tables (public) | 29 | 14 | **15 missing** |
| Schemas | 6 | 1 | **5 missing** |
| Extensions | 2 | 1 | **vector missing** |
| Tickets columns | 47 | 33 | **14 missing** |
| Projects columns | 20 | 12 | **8 missing** |
| HITL sessions columns | 30 | 23 | **7 missing** |

---

## Phase 1: Extensions (Required First)

```sql
-- 1.1 Install pgvector extension (required for RAG tables)
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Phase 2: Missing Tables (15 tables)

### 2.1 Core Agent Tables

```sql
-- agent_instances (replaces 'agents' table on PROD)
-- NOTE: PROD has 'agents' table, DEV has 'agent_instances' - need to rename or recreate
CREATE TABLE public.agent_instances (
    id SERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT '1',
    agent_type VARCHAR(50) NOT NULL DEFAULT 'worker',
    vm_id INTEGER,
    ticket_id TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'idle',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    branch_name VARCHAR(255),
    pr_url VARCHAR(500),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_agent_instances_status ON agent_instances(status);
CREATE INDEX idx_agent_instances_tenant ON agent_instances(tenant_id);
CREATE INDEX idx_agent_instances_ticket ON agent_instances(ticket_id);

-- agent_executions
CREATE TABLE public.agent_executions (
    id SERIAL PRIMARY KEY,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tenant_id UUID,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER GENERATED ALWAYS AS (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) STORED,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'timeout', 'blocked')),
    error_message TEXT,
    error_category TEXT,
    pr_url TEXT,
    files_changed JSONB,
    criteria_status JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agent_executions_task ON agent_executions(task_id);
CREATE INDEX idx_agent_executions_agent ON agent_executions(agent_id);
CREATE INDEX idx_agent_executions_outcome ON agent_executions(outcome);

-- execution_artifacts
CREATE TABLE public.execution_artifacts (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    artifact_type TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_execution_artifacts_ticket ON execution_artifacts(ticket_id);
```

### 2.2 Backlog Tables

```sql
-- backlog_items
CREATE TABLE public.backlog_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    enriched_description TEXT,
    priority INTEGER DEFAULT 0,
    rank INTEGER,
    labels JSONB DEFAULT '[]',
    project_id TEXT,
    hitl_session_id TEXT,
    state VARCHAR(50) DEFAULT 'draft' CHECK (state IN ('draft', 'chatting', 'refined', 'promoted', 'archived')),
    chat_transcript JSONB DEFAULT '[]',
    chat_summary TEXT,
    chat_started_at TIMESTAMP,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    promoted_at TIMESTAMP,
    repo_url TEXT
);
COMMENT ON TABLE backlog_items IS 'Lightweight idea staging area before HITL sessions';
CREATE INDEX idx_backlog_items_tenant ON backlog_items(tenant_id);
CREATE INDEX idx_backlog_items_project ON backlog_items(project_id);
CREATE INDEX idx_backlog_items_state ON backlog_items(state);

-- backlog_attachments
CREATE TABLE public.backlog_attachments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    backlog_item_id TEXT NOT NULL REFERENCES backlog_items(id),
    tenant_id TEXT NOT NULL,
    attachment_type VARCHAR(20) NOT NULL CHECK (attachment_type IN ('file', 'git_link', 'external_link')),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size BIGINT,
    git_metadata JSONB,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);
CREATE INDEX idx_backlog_attachments_item ON backlog_attachments(backlog_item_id);
```

### 2.3 MCP Factory Tables

```sql
-- mcp_migrations
CREATE TABLE public.mcp_migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- mcp_servers
CREATE TABLE public.mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT DEFAULT 'default',
    name TEXT NOT NULL,
    description TEXT,
    version TEXT DEFAULT '1.0.0',
    factory_job_id TEXT,
    source_dir TEXT,
    spec JSONB,
    status TEXT DEFAULT 'stopped' CHECK (status IN ('stopped', 'starting', 'running', 'error')),
    runtime TEXT DEFAULT 'node' CHECK (runtime IN ('node', 'python')),
    port INTEGER,
    pid INTEGER,
    subdomain TEXT UNIQUE,
    config_schema JSONB,
    config_values TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_started_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE(tenant_id, name)
);
CREATE INDEX idx_mcp_servers_tenant ON mcp_servers(tenant_id);
CREATE INDEX idx_mcp_servers_status ON mcp_servers(status);

-- mcp_server_logs
CREATE TABLE public.mcp_server_logs (
    id SERIAL PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES mcp_servers(id),
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mcp_server_logs_server ON mcp_server_logs(server_id);

-- mcp_test_runs
CREATE TABLE public.mcp_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES mcp_servers(id),
    tool_name TEXT NOT NULL,
    input JSONB,
    output JSONB,
    success BOOLEAN,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mcp_test_runs_server ON mcp_test_runs(server_id);
```


### 2.4 RAG/Vector Tables (Requires vector extension)

```sql
-- rag_repositories
CREATE TABLE public.rag_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    default_branch TEXT DEFAULT 'main',
    last_indexed_at TIMESTAMPTZ,
    index_status TEXT DEFAULT 'pending',
    chunk_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    indexing_progress JSONB DEFAULT '{}'
);
CREATE INDEX idx_rag_repositories_url ON rag_repositories(url);

-- code_chunks (requires vector extension)
CREATE TABLE public.code_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    embedding vector(1024),
    repo_id UUID NOT NULL REFERENCES rag_repositories(id),
    filepath TEXT NOT NULL,
    branch TEXT DEFAULT 'main',
    chunk_type TEXT NOT NULL,
    language TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_code_chunks_repo ON code_chunks(repo_id);
CREATE INDEX idx_code_chunks_filepath ON code_chunks(filepath);
-- Vector index (HNSW for fast similarity search)
CREATE INDEX idx_code_chunks_embedding ON code_chunks USING hnsw (embedding vector_cosine_ops);

-- raptor_nodes (hierarchical summaries for RAG)
CREATE TABLE public.raptor_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary TEXT NOT NULL,
    level INTEGER NOT NULL,
    embedding vector(1024),
    doc_id UUID,
    repo_id UUID NOT NULL REFERENCES rag_repositories(id),
    filepath TEXT,
    parent_id UUID REFERENCES raptor_nodes(id),
    children_ids UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_raptor_nodes_repo ON raptor_nodes(repo_id);
CREATE INDEX idx_raptor_nodes_level ON raptor_nodes(level);
CREATE INDEX idx_raptor_nodes_embedding ON raptor_nodes USING hnsw (embedding vector_cosine_ops);
```

### 2.5 Ticket Event & Dependency Tables

```sql
-- ticket_dependencies
CREATE TABLE public.ticket_dependencies (
    ticket_id TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id, depends_on)
);
CREATE INDEX idx_ticket_dependencies_depends ON ticket_dependencies(depends_on);

-- ticket_events (audit trail)
CREATE TABLE public.ticket_events (
    id SERIAL PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    actor_type TEXT CHECK (actor_type IN ('human', 'design_agent', 'worker_agent', 'review_agent', 'orchestrator', 'system')),
    previous_value TEXT,
    new_value TEXT,
    metadata JSONB,
    rationale TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trace_id UUID
);
CREATE INDEX idx_ticket_events_ticket ON ticket_events(ticket_id);
CREATE INDEX idx_ticket_events_type ON ticket_events(event_type);
CREATE INDEX idx_ticket_events_trace ON ticket_events(trace_id);

-- ticket_activity
CREATE TABLE public.ticket_activity (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    ticket_id TEXT NOT NULL,
    action VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ticket_activity_ticket ON ticket_activity(ticket_id);
```

### 2.6 VM Assignment Table

```sql
-- vm_assignments
CREATE TABLE public.vm_assignments (
    vm_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'running',
    heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (vm_id, ticket_id)
);
CREATE INDEX idx_vm_assignments_ticket ON vm_assignments(ticket_id);
CREATE INDEX idx_vm_assignments_status ON vm_assignments(status);
```

---

## Phase 3: Column Additions to Existing Tables

### 3.1 tickets table (14 missing columns)

```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS epic TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS files_hint TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS rag_context JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS repo_url TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS unblocked_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS heartbeat_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS timeout_minutes INTEGER DEFAULT 30;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS trace_id UUID DEFAULT gen_random_uuid();
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentinel_feedback JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add comments
COMMENT ON COLUMN tickets.timeout_at IS 'Absolute deadline for ticket completion';
COMMENT ON COLUMN tickets.timeout_minutes IS 'Configurable timeout per ticket (default 30min)';
COMMENT ON COLUMN tickets.mcp_servers IS 'Array of MCP server IDs available to the agent';
COMMENT ON COLUMN tickets.user_id IS 'User ID for MCP client authentication';
```


### 3.2 projects table (8 missing columns)

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hitl_session_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_provider TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_owner TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_mode TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS credentials_secret_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]';

COMMENT ON COLUMN projects.mcp_servers IS 'Default MCP server IDs for all tickets in this project';
```

### 3.3 hitl_sessions table (7 missing columns)

```sql
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS clarification_context JSONB;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS spec_card TEXT;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'direct';
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS backlog_item_id TEXT;

COMMENT ON COLUMN hitl_sessions.source_type IS 'Origin: direct (legacy), backlog, api';
COMMENT ON COLUMN hitl_sessions.backlog_item_id IS 'Links to originating backlog_item if promoted';
```

### 3.4 hitl_messages table (1 missing column)

```sql
ALTER TABLE hitl_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';
```

---

## Phase 4: Optional Schemas (If Needed)

These schemas are on DEV but may not be required on PROD immediately:

```sql
-- Only create if deploying deploy-agent or auth features
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS deploy;
CREATE SCHEMA IF NOT EXISTS deploy_agent;
CREATE SCHEMA IF NOT EXISTS mcp_fabric;
CREATE SCHEMA IF NOT EXISTS registry;
```

---

## Phase 5: Table Rename (agents → agent_instances)

PROD has `agents` table, DEV has `agent_instances`. Decision needed:

**Option A**: Rename table (preserves data)
```sql
ALTER TABLE agents RENAME TO agent_instances;
```

**Option B**: Drop and recreate (loses data)
```sql
DROP TABLE IF EXISTS agents CASCADE;
-- Then create agent_instances from Phase 2.1
```

---

## Execution Order

1. **Phase 1**: Install vector extension
2. **Phase 2.1-2.3**: Create non-vector tables
3. **Phase 2.4**: Create RAG/vector tables (requires extension)
4. **Phase 2.5-2.6**: Create remaining tables
5. **Phase 3**: Add columns to existing tables
6. **Phase 5**: Handle agents → agent_instances rename
7. **Phase 4**: (Optional) Create additional schemas

---

## Migration Script Location

Save the consolidated SQL as:
```
/opt/swarm-app/apps/platform/migrations/020_prod_schema_sync.sql
```

---

## Verification Queries

After migration, run these to verify:

```sql
-- Check table count
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Expected: 29

-- Check tickets columns
SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tickets';
-- Expected: 47

-- Check vector extension
SELECT * FROM pg_extension WHERE extname = 'vector';
-- Expected: 1 row

-- Check agent_definitions data
SELECT id, name FROM agent_definitions;
-- Expected: sentinel-agent-001, deploy-agent-001
```

---

## Rollback Plan

Each phase should be reversible:
- Tables: `DROP TABLE IF EXISTS <table> CASCADE;`
- Columns: `ALTER TABLE <table> DROP COLUMN IF EXISTS <column>;`
- Extensions: `DROP EXTENSION IF EXISTS vector;`
