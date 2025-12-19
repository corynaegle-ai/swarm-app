#!/bin/bash
# Data migration script: Copy data from swarm-api.db to swarm.db
# Run AFTER 003_consolidate_databases.sql creates the schema

set -e

SWARM_DB="/opt/swarm-tickets/data/swarm.db"
API_DB="/opt/swarm-api/swarm-api.db"
BACKUP_DIR="/opt/swarm-tickets/data/backups"

echo "=== Phase 1: Database Consolidation Migration ==="
echo "Source: $API_DB"
echo "Target: $SWARM_DB"
echo ""

# Create backup
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
echo "Creating backup: swarm.db.pre-consolidation-$TIMESTAMP"
cp "$SWARM_DB" "$BACKUP_DIR/swarm.db.pre-consolidation-$TIMESTAMP"

# Build user ID mapping (email -> new ID)
# swarm-api.db users have hex IDs, swarm.db users have UUIDs
echo "Building user ID mapping..."

# Get the mapping as a temp table approach
sqlite3 "$SWARM_DB" << 'EOF'
-- Attach the source database
ATTACH DATABASE '/opt/swarm-api/swarm-api.db' AS api;

-- Create temp mapping table
CREATE TEMP TABLE user_id_map AS
SELECT api.users.id AS old_id, main.users.id AS new_id
FROM api.users
JOIN main.users ON api.users.email = main.users.email;

SELECT 'User mappings:';
SELECT old_id || ' -> ' || new_id FROM user_id_map;

DETACH DATABASE api;
EOF

echo ""
echo "Migrating data..."

# Main data migration
sqlite3 "$SWARM_DB" << 'EOF'
-- Attach the source database
ATTACH DATABASE '/opt/swarm-api/swarm-api.db' AS api;

-- Create temp mapping table for user IDs
CREATE TEMP TABLE user_id_map AS
SELECT api.users.id AS old_id, main.users.id AS new_id
FROM api.users
JOIN main.users ON api.users.email = main.users.email;

-- 1. Migrate sessions (map user_id to new format)
INSERT OR IGNORE INTO main.sessions (id, user_id, token, expires_at, created_at)
SELECT 
  s.id,
  COALESCE(m.new_id, s.user_id) as user_id,
  s.token,
  s.expires_at,
  s.created_at
FROM api.sessions s
LEFT JOIN user_id_map m ON s.user_id = m.old_id;

SELECT 'Migrated sessions: ' || changes();

-- 2. Migrate HITL sessions (design_sessions -> hitl_sessions)
INSERT OR IGNORE INTO main.hitl_sessions (
  id, tenant_id, project_name, description, state, 
  clarification_context, spec_card, progress_percent,
  approved_at, approved_by, created_at, updated_at
)
SELECT 
  ds.id,
  'default' as tenant_id,  -- Assign to default tenant
  ds.project_name,
  ds.description,
  ds.state,
  ds.clarification_context,
  ds.spec_card,
  ds.progress_percent,
  ds.approved_at,
  COALESCE(m.new_id, ds.approved_by) as approved_by,
  ds.created_at,
  ds.updated_at
FROM api.design_sessions ds
LEFT JOIN user_id_map m ON ds.approved_by = m.old_id;

SELECT 'Migrated hitl_sessions: ' || changes();

-- 3. Migrate HITL messages (design_messages -> hitl_messages)
INSERT OR IGNORE INTO main.hitl_messages (
  id, session_id, role, content, message_type, metadata, created_at
)
SELECT id, session_id, role, content, message_type, metadata, created_at
FROM api.design_messages;

SELECT 'Migrated hitl_messages: ' || changes();

-- 4. Migrate state transitions
INSERT OR IGNORE INTO main.hitl_state_transitions (
  id, session_id, from_state, to_state, action, actor, user_id, metadata, created_at
)
SELECT 
  st.id,
  st.session_id,
  st.from_state,
  st.to_state,
  st.action,
  st.actor,
  COALESCE(m.new_id, st.user_id) as user_id,
  st.metadata,
  st.created_at
FROM api.state_transitions st
LEFT JOIN user_id_map m ON st.user_id = m.old_id;

SELECT 'Migrated hitl_state_transitions: ' || changes();

-- 5. Migrate approvals
INSERT OR IGNORE INTO main.hitl_approvals (
  id, session_id, tenant_id, approval_type, approved_by, 
  approval_data, ip_address, user_agent, created_at
)
SELECT 
  a.id,
  a.session_id,
  'default' as tenant_id,
  a.approval_type,
  COALESCE(m.new_id, a.approved_by) as approved_by,
  a.approval_data,
  a.ip_address,
  a.user_agent,
  a.created_at
FROM api.approvals a
LEFT JOIN user_id_map m ON a.approved_by = m.old_id;

SELECT 'Migrated hitl_approvals: ' || changes();

-- Cleanup
DROP TABLE user_id_map;
DETACH DATABASE api;

SELECT '';
SELECT '=== Migration Summary ===';
SELECT 'sessions: ' || COUNT(*) FROM main.sessions;
SELECT 'hitl_sessions: ' || COUNT(*) FROM main.hitl_sessions;
SELECT 'hitl_messages: ' || COUNT(*) FROM main.hitl_messages;
SELECT 'hitl_state_transitions: ' || COUNT(*) FROM main.hitl_state_transitions;
SELECT 'hitl_approvals: ' || COUNT(*) FROM main.hitl_approvals;
EOF

echo ""
echo "=== Migration Complete ==="
echo "Backup saved to: $BACKUP_DIR/swarm.db.pre-consolidation-$TIMESTAMP"
echo ""
echo "Next steps:"
echo "1. Verify data integrity"
echo "2. Update API code to use consolidated schema"
echo "3. Archive swarm-api.db"
