-- Missing tables for ai.js routes
-- Run: sudo -u postgres psql swarmdb -f /opt/swarm-platform/migrations/add-hitl-tables.sql

-- hitl_approvals table
CREATE TABLE IF NOT EXISTS hitl_approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hitl_approvals_session ON hitl_approvals(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_approvals_status ON hitl_approvals(status);

-- hitl_events table
CREATE TABLE IF NOT EXISTS hitl_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hitl_events_session ON hitl_events(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_events_type ON hitl_events(event_type);
