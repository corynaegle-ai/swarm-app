-- Migration: Create hitl_events table for AI dispatcher audit trail
-- Date: 2025-12-12
-- Phase: HITL Phase 3 - AI Dispatcher Service

-- Event log for all HITL session activity
CREATE TABLE IF NOT EXISTS hitl_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES hitl_sessions(id) ON DELETE CASCADE,
  tenant_id TEXT REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  payload JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_hitl_events_session ON hitl_events(session_id);
CREATE INDEX IF NOT EXISTS idx_hitl_events_tenant ON hitl_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hitl_events_type ON hitl_events(event_type);
CREATE INDEX IF NOT EXISTS idx_hitl_events_created ON hitl_events(created_at);

-- Common event types:
-- 'session_created'     - New HITL session started
-- 'state_changed'       - Session state transition
-- 'ai_dispatch'         - AI action dispatched
-- 'approval_requested'  - Action requires human approval
-- 'approval_granted'    - Human approved action
-- 'approval_rejected'   - Human rejected action
-- 'message_sent'        - User or AI sent message
-- 'spec_generated'      - Specification document created
-- 'tickets_generated'   - Tickets created from spec
-- 'build_started'       - Autonomous build kicked off
-- 'build_completed'     - Build finished
-- 'error'               - Error occurred
