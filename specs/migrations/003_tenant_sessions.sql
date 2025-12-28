-- Migration 003: Add tenant_id to session tables + tenant-aware views
-- Applied: 2025-01-16
-- Phase 2 of Multi-Tenant Schema

-- Step 1a: Add tenant_id to design_sessions
ALTER TABLE design_sessions ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

UPDATE design_sessions SET tenant_id = (
  SELECT p.tenant_id FROM projects p WHERE p.id = design_sessions.project_id
);

CREATE INDEX idx_design_sessions_tenant ON design_sessions(tenant_id);

-- Step 1b: Add tenant_id to spec_sessions
ALTER TABLE spec_sessions ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

UPDATE spec_sessions SET tenant_id = (
  SELECT p.tenant_id FROM projects p WHERE p.id = spec_sessions.project_id
);

CREATE INDEX idx_spec_sessions_tenant ON spec_sessions(tenant_id);

-- Step 2: Create tenant-aware views

CREATE VIEW IF NOT EXISTS tenant_tickets AS
SELECT 
  t.*,
  p.tenant_id
FROM tickets t
JOIN projects p ON t.project_id = p.id;

CREATE VIEW IF NOT EXISTS tenant_design_sessions AS
SELECT * FROM design_sessions;

CREATE VIEW IF NOT EXISTS tenant_spec_sessions AS
SELECT * FROM spec_sessions;
