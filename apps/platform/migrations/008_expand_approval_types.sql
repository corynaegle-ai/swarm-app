-- Migration: Expand approval_type constraint for AI dispatcher
-- Date: 2025-12-12
-- Phase: HITL Phase 3 - AI Dispatcher Service

-- SQLite doesn't support ALTER CONSTRAINT, so we need to:
-- 1. Create new table with expanded constraint
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

-- Create new table with expanded approval types
CREATE TABLE hitl_approvals_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  tenant_id TEXT REFERENCES tenants(id),
  approval_type TEXT NOT NULL CHECK (approval_type IN (
    'spec_approval',      -- User approves generated spec
    'build_start',        -- User confirms build start  
    'revision_request',   -- User requests changes
    'action_approval'     -- Generic AI action approval from dispatcher
  )),
  action TEXT,            -- The specific action being approved
  context JSON DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT REFERENCES users(id),
  approval_data JSON DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Copy existing data
INSERT INTO hitl_approvals_new (id, session_id, tenant_id, approval_type, action, context, status, approved_by, approval_data, ip_address, user_agent, created_at)
SELECT id, session_id, tenant_id, approval_type, action, context, COALESCE(status, 'approved'), approved_by, approval_data, ip_address, user_agent, created_at
FROM hitl_approvals;

-- Drop old table
DROP TABLE hitl_approvals;

-- Rename new table
ALTER TABLE hitl_approvals_new RENAME TO hitl_approvals;

-- Recreate indexes
CREATE INDEX idx_hitl_approvals_session ON hitl_approvals(session_id);
CREATE INDEX idx_hitl_approvals_tenant ON hitl_approvals(tenant_id);
CREATE INDEX idx_hitl_approvals_type ON hitl_approvals(approval_type);
CREATE INDEX idx_hitl_approvals_status ON hitl_approvals(status);
