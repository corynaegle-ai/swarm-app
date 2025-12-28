-- Migration: 2024_12_23_001_create_backlog_items.sql
-- Purpose: Add backlog system for lightweight idea capture before HITL sessions
-- Breaking Changes: NONE - purely additive
--
-- Rollback: DROP TABLE backlog_items; ALTER TABLE hitl_sessions DROP COLUMN source_type, DROP COLUMN backlog_item_id;

BEGIN;

-- ============================================================================
-- STEP 1: Create backlog_items table
-- ============================================================================

CREATE TABLE IF NOT EXISTS backlog_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL,
    
    -- Core content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    enriched_description TEXT,  -- AI-refined version after chat
    
    -- Organization
    priority INTEGER DEFAULT 0,  -- Higher = more important (0=low, 1=medium, 2=high)
    rank INTEGER,  -- For drag-drop ordering within priority tier
    labels JSONB DEFAULT '[]',  -- ["urgent", "frontend", "Q1-2025"]
    
    -- Linkages (nullable - set when relationships exist)
    project_id TEXT,  -- Optional: pre-assign to project
    hitl_session_id TEXT,  -- Set when promoted to HITL session
    
    -- State machine
    state VARCHAR(50) DEFAULT 'draft' CHECK (state IN (
        'draft',      -- Initial capture, not yet refined
        'chatting',   -- User is in active chat with Clarifying Agent
        'refined',    -- Chat completed, ready for promotion
        'promoted',   -- Converted to HITL session
        'archived'    -- Soft delete / completed elsewhere
    )),
    
    -- Chat context
    chat_transcript JSONB DEFAULT '[]',  -- Array of {role, content, timestamp}
    chat_summary TEXT,  -- AI-generated summary of key decisions
    chat_started_at TIMESTAMP,  -- For timeout tracking
    
    -- Metadata
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    promoted_at TIMESTAMP
);

-- ============================================================================
-- STEP 2: Create indexes for common query patterns
-- ============================================================================

-- Tenant isolation (CRITICAL for security)
CREATE INDEX IF NOT EXISTS idx_backlog_tenant ON backlog_items(tenant_id);

-- State filtering within tenant
CREATE INDEX IF NOT EXISTS idx_backlog_state ON backlog_items(tenant_id, state);

-- Priority/rank ordering for backlog board view
CREATE INDEX IF NOT EXISTS idx_backlog_priority ON backlog_items(tenant_id, priority DESC, rank ASC);

-- Labels filtering (GIN for JSONB array containment)
CREATE INDEX IF NOT EXISTS idx_backlog_labels ON backlog_items USING GIN(labels);

-- Full-text search on title and description
CREATE INDEX IF NOT EXISTS idx_backlog_search ON backlog_items USING GIN(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);

-- ============================================================================
-- STEP 3: Add source tracking to hitl_sessions (NON-BREAKING)
-- ============================================================================

-- Add source_type column with default 'direct' (existing sessions unaffected)
ALTER TABLE hitl_sessions 
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'direct';

-- Add backlog_item_id for tracking origin (nullable)
ALTER TABLE hitl_sessions 
    ADD COLUMN IF NOT EXISTS backlog_item_id TEXT;

-- Index for reverse lookup (find session from backlog item)
CREATE INDEX IF NOT EXISTS idx_hitl_backlog_source 
    ON hitl_sessions(backlog_item_id) 
    WHERE backlog_item_id IS NOT NULL;

-- ============================================================================
-- STEP 4: Create trigger for updated_at auto-update
-- ============================================================================

CREATE OR REPLACE FUNCTION update_backlog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS backlog_updated_at ON backlog_items;
CREATE TRIGGER backlog_updated_at
    BEFORE UPDATE ON backlog_items
    FOR EACH ROW
    EXECUTE FUNCTION update_backlog_updated_at();

-- ============================================================================
-- STEP 5: Add comments for documentation
-- ============================================================================

COMMENT ON TABLE backlog_items IS 'Lightweight idea staging area before HITL sessions';
COMMENT ON COLUMN backlog_items.state IS 'draft→chatting→refined→promoted OR archived';
COMMENT ON COLUMN backlog_items.chat_transcript IS 'Array of {role, content, timestamp} from Clarifying Agent chat';
COMMENT ON COLUMN backlog_items.priority IS '0=low, 1=medium, 2=high';
COMMENT ON COLUMN hitl_sessions.source_type IS 'Origin: direct (legacy), backlog, api';
COMMENT ON COLUMN hitl_sessions.backlog_item_id IS 'Links to originating backlog_item if promoted';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY (run after migration)
-- ============================================================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'backlog_items' 
-- ORDER BY ordinal_position;
