# UI HITL Phase 2 Bugfix - Message Type Constraint

> **Location:** `/opt/swarm-specs/prompts/ui-hitl-phase2-bugfix.md`
> **Estimated Time:** 10 minutes
> **Prerequisites:** Phase 1 (Database) and Phase 2 (Middleware) complete

## Problem

The `design_messages` table has a CHECK constraint that doesn't match the message types used in `design-sessions.js`:

**Database Constraint:**
```sql
message_type TEXT CHECK (message_type IN ('chat', 'question', 'answer', 'system', 'spec_update'))
```

**Code Uses Invalid Types:**
- `'description'` - used in `submit_description` action
- `'clarification'` - used in `respond` action  
- `'ai_response'` - used in `/ai-response` endpoint

## Fix Options

### Option A: Update Code to Use Valid Types (Recommended)
Modify `/opt/swarm-api/routes/design-sessions.js`:

```javascript
// Line ~177: submit_description action
// CHANGE FROM:
addMessage(session.id, 'user', payload.description, 'description');
// CHANGE TO:
addMessage(session.id, 'user', payload.description, 'chat');

// Line ~183: respond action  
// CHANGE FROM:
addMessage(session.id, 'user', payload.response, 'clarification');
// CHANGE TO:
addMessage(session.id, 'user', payload.response, 'answer');
```

### Option B: Alter Database Constraint
Run migration to expand allowed types:

```sql
-- Create new table with expanded constraint
CREATE TABLE design_messages_new (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'chat' CHECK (message_type IN (
    'chat', 'question', 'answer', 'system', 'spec_update',
    'description', 'clarification', 'ai_response'
  )),
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Copy data
INSERT INTO design_messages_new SELECT * FROM design_messages;

-- Swap tables
DROP TABLE design_messages;
ALTER TABLE design_messages_new RENAME TO design_messages;
```

## Execution Steps

### Step 1: SSH to Droplet
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
```

### Step 2: Apply Fix (Option A - Code Change)
```bash
export PATH=/opt/swarm/.nvm/versions/node/v22.11.0/bin:$PATH
cd /opt/swarm-api

# Backup
cp routes/design-sessions.js routes/design-sessions.js.bak

# Edit file - change 'description' to 'chat' and 'clarification' to 'answer'
sed -i "s/'description'/'chat'/g" routes/design-sessions.js
sed -i "s/'clarification'/'answer'/g" routes/design-sessions.js
```

### Step 3: Restart Server
```bash
# Find and kill current process
pkill -f "node server.js" || true
sleep 2

# Start fresh
cd /opt/swarm-api
nohup node server.js > /tmp/swarm-api.log 2>&1 &
sleep 3
tail -20 /tmp/swarm-api.log
```

### Step 4: Verify Fix
```bash
API_KEY="sk-swarm-prod-7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a"

# Create test session
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"project_name":"Bugfix Test"}' \
  http://localhost:3000/api/design-sessions

# Note the session ID from response, then test submit_description:
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"submit_description","payload":{"description":"Test description"}}' \
  http://localhost:3000/api/design-sessions/<SESSION_ID>/action
```

### Step 5: Verify State Transition Logging
```bash
# Check state_transitions table has entries
curl -s -H "Authorization: Bearer $API_KEY" \
  http://localhost:3000/api/design-sessions/<SESSION_ID> | jq '.recent_transitions'
```

## Success Criteria

- [ ] `submit_description` action succeeds (no CHECK constraint error)
- [ ] `respond` action succeeds  
- [ ] Messages appear in `design_messages` table
- [ ] State transitions logged to `state_transitions` table
- [ ] Invalid actions still return 403 with helpful message

## Verification Commands

```bash
# Test invalid action (should return 403)
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}' \
  http://localhost:3000/api/design-sessions/<SESSION_ID>/action

# Expected response:
# {"error":"Action not allowed in current state","current_state":"clarifying",...}
```

## Related Files

- `/opt/swarm-api/routes/design-sessions.js` - Route handlers
- `/opt/swarm-api/middleware/session-gate.js` - Gate middleware
- `/opt/swarm-api/migrations/001_hitl_state_machine.sql` - Schema
- `/opt/swarm-specs/prompts/ui-hitl-implementation.md` - Full implementation spec
