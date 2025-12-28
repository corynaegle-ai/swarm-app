-- Migration: 020_prod_schema_sync.sql
-- Description: Sync PROD PostgreSQL schema with DEV
-- Date: 2024-12-25
-- IMPORTANT: Run as postgres superuser

-- ============================================
-- PHASE 1: Extensions
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- PHASE 2: Missing Tables
-- ============================================

-- 2.1 Agent Tables
CREATE TABLE IF NOT EXISTS public.agent_executions (
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

CREATE INDEX IF NOT EXISTS idx_agent_executions_task ON agent_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent ON agent_executions(agent_id);

CREATE TABLE IF NOT EXISTS public.execution_artifacts (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    artifact_type TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_execution_artifacts_ticket ON execution_artifacts(ticket_id);

-- 2.2 Backlog Tables
CREATE TABLE IF NOT EXISTS public.backlog_items (
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
CREATE INDEX IF NOT EXISTS idx_backlog_items_tenant ON backlog_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_backlog_items_state ON backlog_items(state);

CREATE TABLE IF NOT EXISTS public.backlog_attachments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    backlog_item_id TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_backlog_attachments_item ON backlog_attachments(backlog_item_id);


-- 2.3 MCP Factory Tables
CREATE TABLE IF NOT EXISTS public.mcp_migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.mcp_servers (
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
CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(status);

CREATE TABLE IF NOT EXISTS public.mcp_server_logs (
    id SERIAL PRIMARY KEY,
    server_id UUID NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mcp_server_logs_server ON mcp_server_logs(server_id);

CREATE TABLE IF NOT EXISTS public.mcp_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL,
    tool_name TEXT NOT NULL,
    input JSONB,
    output JSONB,
    success BOOLEAN,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mcp_test_runs_server ON mcp_test_runs(server_id);


-- 2.4 RAG/Vector Tables
CREATE TABLE IF NOT EXISTS public.rag_repositories (
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
CREATE INDEX IF NOT EXISTS idx_rag_repositories_url ON rag_repositories(url);

CREATE TABLE IF NOT EXISTS public.code_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    embedding vector(1024),
    repo_id UUID NOT NULL,
    filepath TEXT NOT NULL,
    branch TEXT DEFAULT 'main',
    chunk_type TEXT NOT NULL,
    language TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_code_chunks_repo ON code_chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_chunks_filepath ON code_chunks(filepath);

CREATE TABLE IF NOT EXISTS public.raptor_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary TEXT NOT NULL,
    level INTEGER NOT NULL,
    embedding vector(1024),
    doc_id UUID,
    repo_id UUID NOT NULL,
    filepath TEXT,
    parent_id UUID,
    children_ids UUID[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_raptor_nodes_repo ON raptor_nodes(repo_id);
CREATE INDEX IF NOT EXISTS idx_raptor_nodes_level ON raptor_nodes(level);


-- 2.5 Ticket Event & Dependency Tables
CREATE TABLE IF NOT EXISTS public.ticket_dependencies (
    ticket_id TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticket_id, depends_on)
);
CREATE INDEX IF NOT EXISTS idx_ticket_dependencies_depends ON ticket_dependencies(depends_on);

CREATE TABLE IF NOT EXISTS public.ticket_events (
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
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_type ON ticket_events(event_type);

CREATE TABLE IF NOT EXISTS public.ticket_activity (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    ticket_id TEXT NOT NULL,
    action VARCHAR(50) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity(ticket_id);

-- 2.6 VM Assignment Table
CREATE TABLE IF NOT EXISTS public.vm_assignments (
    vm_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'running',
    heartbeat_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (vm_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS idx_vm_assignments_ticket ON vm_assignments(ticket_id);


-- ============================================
-- PHASE 3: Column Additions
-- ============================================

-- 3.1 tickets table columns
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

-- 3.2 projects table columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hitl_session_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_provider TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_owner TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS repo_mode TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS credentials_secret_id TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mcp_servers JSONB DEFAULT '[]';

-- 3.3 hitl_sessions table columns
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS clarification_context JSONB;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS spec_card TEXT;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'direct';
ALTER TABLE hitl_sessions ADD COLUMN IF NOT EXISTS backlog_item_id TEXT;

-- 3.4 hitl_messages table columns
ALTER TABLE hitl_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';


-- ============================================
-- PHASE 4: Table Rename (agents → agent_instances)
-- ============================================
-- PROD has 'agents', DEV has 'agent_instances'
-- Renaming to match DEV convention
ALTER TABLE IF EXISTS agents RENAME TO agent_instances;

-- Update sequence name if exists
ALTER SEQUENCE IF EXISTS agents_id_seq RENAME TO agent_instances_id_seq;

-- ============================================
-- PHASE 5: Verification
-- ============================================
-- Run these to verify migration success:
-- SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT COUNT(*) as ticket_cols FROM information_schema.columns WHERE table_name = 'tickets';
-- SELECT id, name FROM agent_definitions ORDER BY name;
-- SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- ============================================
-- Migration Complete
-- ============================================
