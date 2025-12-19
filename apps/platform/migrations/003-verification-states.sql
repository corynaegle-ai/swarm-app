-- Migration 003: Add verification states and files_involved
-- Agent-foreman inspired: verifying state, needs_review state, file tracking for impact analysis
-- 
-- Changes:
--   1. Add 'verifying' and 'needs_review' to state CHECK constraint
--   2. Add 'files_involved' column (JSON array of files modified)
--
-- IMPORTANT: This migration handles dependent views properly by:
--   - Dropping views BEFORE table changes
--   - Recreating views AFTER table changes

-- SQLite doesn't support ALTER TABLE to modify CHECK constraints
-- So we recreate the table with the new constraint

BEGIN TRANSACTION;

-- Step 0: Drop dependent views FIRST (they reference tickets table)
DROP VIEW IF EXISTS ready_tickets;
DROP VIEW IF EXISTS tenant_tickets;

-- Step 1: Create new table with updated CHECK constraint
CREATE TABLE tickets_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  state TEXT DEFAULT 'draft' CHECK(state IN (
    'draft', 'ready', 'blocked', 'on_hold', 'assigned', 
    'in_progress', 'verifying', 'in_review', 'changes_requested', 
    'done', 'needs_review', 'cancelled'
  )),
  epic TEXT,
  estimated_scope TEXT CHECK(estimated_scope IN ('small', 'medium', 'large')),
  files_hint TEXT,
  files_involved TEXT,  -- NEW: JSON array of files modified by this ticket
  assignee_id TEXT,
  assignee_type TEXT CHECK(assignee_type IN ('agent', 'human')),
  branch_name TEXT,
  pr_url TEXT,
  hold_reason TEXT,
  rejection_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  lease_expires TEXT,
  last_heartbeat TEXT,
  design_session TEXT,
  verification_status TEXT DEFAULT 'unverified',
  verification_evidence TEXT,
  progress_log TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Step 2: Copy data from old table (files_involved gets NULL)
INSERT INTO tickets_new (
  id, project_id, title, description, acceptance_criteria, state,
  epic, estimated_scope, files_hint, files_involved,
  assignee_id, assignee_type, branch_name, pr_url, hold_reason,
  rejection_count, created_at, updated_at, lease_expires, last_heartbeat,
  design_session, verification_status, verification_evidence, progress_log
)
SELECT 
  id, project_id, title, description, acceptance_criteria, state,
  epic, estimated_scope, files_hint, NULL,
  assignee_id, assignee_type, branch_name, pr_url, hold_reason,
  rejection_count, created_at, updated_at, lease_expires, last_heartbeat,
  design_session, verification_status, verification_evidence, progress_log
FROM tickets;

-- Step 3: Drop old table
DROP TABLE tickets;

-- Step 4: Rename new table
ALTER TABLE tickets_new RENAME TO tickets;

-- Step 5: Recreate indexes
CREATE INDEX idx_tickets_project ON tickets(project_id);
CREATE INDEX idx_tickets_state ON tickets(state);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX idx_tickets_verification ON tickets(verification_status);

-- Step 6: Recreate dependent views
CREATE VIEW ready_tickets AS
SELECT 
  t.id,
  t.project_id,
  t.title,
  t.state,
  t.epic,
  t.estimated_scope,
  t.assignee_id,
  p.tenant_id
FROM tickets t
JOIN projects p ON t.project_id = p.id
WHERE t.state = 'ready'
  AND NOT EXISTS (
    SELECT 1 FROM dependencies d
    JOIN tickets blocker ON d.depends_on = blocker.id
    WHERE d.ticket_id = t.id
      AND blocker.state NOT IN ('done', 'cancelled')
  );

CREATE VIEW tenant_tickets AS
SELECT 
  t.*,
  p.tenant_id
FROM tickets t
JOIN projects p ON t.project_id = p.id;

-- Step 7: Update schema version
INSERT OR REPLACE INTO schema_version (id, version, applied_at) 
VALUES (1, 3, datetime('now'));

COMMIT;
