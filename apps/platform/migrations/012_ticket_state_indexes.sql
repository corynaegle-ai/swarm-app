-- Migration 012: Add database indexes on ticket state and assignee fields
-- Run: sudo -u postgres psql swarmdb -f /opt/swarm-platform/migrations/012_ticket_state_indexes.sql
--
-- Purpose: Improve query performance for Engine polling and ticket state queries
-- These indexes support the following common query patterns:
--   - Engine polls: WHERE state='ready' AND assignee_id IS NOT NULL AND assignee_type='agent'
--   - Ticket state queries: WHERE state = ?
--   - Assignee lookups: WHERE assignee_id = ?
--   - Claim endpoint: WHERE state IN ('ready', 'in_review') AND assignee_id IS NOT NULL

-- Index on ticket state column for state-based queries
CREATE INDEX IF NOT EXISTS idx_tickets_state ON tickets(state);

-- Index on assignee_id for agent ticket lookups
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);

-- Index on assignee_type for filtering by agent vs human assignees
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_type ON tickets(assignee_type);

-- Composite index for Engine polling query pattern (most common query)
-- Covers: WHERE state = 'ready' AND assignee_id IS NOT NULL AND assignee_type = 'agent'
CREATE INDEX IF NOT EXISTS idx_tickets_engine_poll ON tickets(state, assignee_id, assignee_type)
WHERE assignee_id IS NOT NULL;

-- Composite index for ticket state + project lookups (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_tickets_state_project ON tickets(state, project_id);
