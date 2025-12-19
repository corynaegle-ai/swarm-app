-- Migration 003: Consolidate swarm-api.db into swarm.db
-- Phase 1 of repository consolidation
-- 
-- Tables being added:
--   - sessions (auth sessions)
--   - hitl_session_states (state machine config)
--   - hitl_sessions (HITL approval workflow - renamed from design_sessions to avoid conflict)
--   - hitl_messages (conversation history - renamed from design_messages)
--   - hitl_state_transitions (audit trail)
--   - hitl_approvals (approval records)
--
-- NOTE: Users table NOT migrated - swarm.db users already has tenant_id support

-- ============================================
-- 1. Auth Sessions (from swarm-api.db sessions)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ============================================
-- 2. HITL Session States (state machine config)
-- ============================================
CREATE TABLE IF NOT EXISTS hitl_session_states (
  state TEXT PRIMARY KEY,
  description TEXT,
  allowed_ai_actions JSON,
  required_user_action TEXT,
  next_states JSON,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Insert reference data for state machine
INSERT OR IGNORE INTO hitl_session_states (state, description, required_user_action, next_states) VALUES
  ('input', 'Initial project description submission', 'submit_description', '["clarifying"]'),
  ('clarifying', 'AI gathering requirements through Q&A', 'answer_questions', '["clarifying", "ready_for_docs"]'),
  ('ready_for_docs', 'Ready to generate spec card', NULL, '["reviewing"]'),
  ('reviewing', 'User reviewing/editing spec card', 'approve_or_edit', '["approved", "clarifying"]'),
  ('approved', 'Spec approved, ready for build', 'confirm_build', '["building"]'),
  ('building', 'Autonomous agents executing', NULL, '["completed", "failed"]'),
  ('completed', 'Build finished successfully', NULL, '[]'),
  ('failed', 'Build failed', 'retry_or_cancel', '["building", "cancelled"]'),
  ('cancelled', 'Session cancelled by user', NULL, '[]');

-- ============================================
-- 3. HITL Sessions (approval workflow)
-- ============================================
CREATE TABLE IF NOT EXISTS hitl_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  project_name TEXT,
  description TEXT,
  state TEXT DEFAULT 'input' REFERENCES hitl_session_states(state),
  clarification_context JSON DEFAULT '{}',
  spec_card TEXT,
  progress_percent INTEGER DEFAULT 0,
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hitl_sessions_state ON hitl_sessions(state);
CREATE INDEX IF NOT EXISTS idx_hitl_sessions_tenant ON hitl_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hitl_sessions_created ON hitl_sessions(created_at);

-- Trigger to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS update_hitl_sessions_timestamp 
AFTER UPDATE ON hitl_sessions
BEGIN
  UPDATE hitl_sessions SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- 4. HITL Messages (conversation history)
-- ============================================
CREATE TABLE IF NOT EXISTS hitl_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'question', 'answer', 'system', 'spec_update')),
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hitl_messages_session ON hitl_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_messages_created ON hitl_messages(session_id, created_at);

-- ============================================
-- 5. HITL State Transitions (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS hitl_state_transitions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  from_state TEXT REFERENCES hitl_session_states(state),
  to_state TEXT NOT NULL REFERENCES hitl_session_states(state),
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'system' CHECK (actor IN ('user', 'system', 'ai')),
  user_id TEXT REFERENCES users(id),
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hitl_transitions_session ON hitl_state_transitions(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_transitions_created ON hitl_state_transitions(created_at);

-- ============================================
-- 6. HITL Approvals (approval records)
-- ============================================
CREATE TABLE IF NOT EXISTS hitl_approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  tenant_id TEXT REFERENCES tenants(id),
  approval_type TEXT NOT NULL CHECK (approval_type IN ('spec_approval', 'build_start', 'revision_request')),
  approved_by TEXT REFERENCES users(id),
  approval_data JSON DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hitl_approvals_session ON hitl_approvals(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_approvals_tenant ON hitl_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hitl_approvals_type ON hitl_approvals(approval_type);

-- ============================================
-- 7. Update schema version
-- ============================================
INSERT INTO schema_version (version) VALUES (3);

-- ============================================
-- Migration complete!
-- Next step: Run data migration script to copy data from swarm-api.db
-- ============================================
