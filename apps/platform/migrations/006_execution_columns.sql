-- Migration: Add execution tracking columns for agent engine
-- Date: 2025-12-12

-- Add VM assignment tracking
ALTER TABLE tickets ADD COLUMN vm_id INTEGER;

-- Add execution timing
ALTER TABLE tickets ADD COLUMN started_at TEXT;
ALTER TABLE tickets ADD COLUMN completed_at TEXT;

-- Add execution results
ALTER TABLE tickets ADD COLUMN outputs TEXT;  -- JSON output from agent
ALTER TABLE tickets ADD COLUMN error TEXT;    -- Error message if failed

-- Add index for finding running tickets
CREATE INDEX IF NOT EXISTS idx_tickets_vm ON tickets(vm_id);
CREATE INDEX IF NOT EXISTS idx_tickets_started ON tickets(started_at);
