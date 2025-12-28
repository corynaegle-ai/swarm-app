# Continue E2E Testing - Swarm Engine PostgreSQL Migration

## Context

You are a master systems architect continuing E2E testing of the Swarm Build Feature workflow. The engine has been migrated from SQLite to PostgreSQL.

## Environment

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| SSH Command | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| PATH Export | `export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH` |

## Completed Work

1. **Engine PostgreSQL Migration** ✅
   - `/opt/swarm/engine/lib/engine.js` - Converted from better-sqlite3 to pg
   - Added `pg` package to engine dependencies
   - Engine connects to `swarmdb` PostgreSQL database
   - Registry DB remains SQLite at `/opt/swarm-registry/registry.db`

2. **Services Running** ✅
   ```
   swarm-engine (PID 643440) - PostgreSQL connected
   swarm-platform-dev (port 3001)
   swarm-dashboard-dev (port 3000)  
   swarm-sentinel (port 8090)
   deploy-agent (port 3457)
   mcp-factory (port 3456)
   ```

## Current State

- Engine is polling PostgreSQL for tickets with `state='ready'`
- No tickets exist in database yet
- 4 HITL sessions exist (states: clarifying, input)
- Need to verify engine picks up tickets properly

## E2E Test Tasks

### Task 1: Check Agent Registry
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sqlite3 /opt/swarm-registry/registry.db 'SELECT id, name, status FROM agents LIMIT 5'"
```

### Task 2: Create Test Ticket
Insert a test ticket into PostgreSQL with proper fields:
- `state = 'ready'`
- `assignee_type = 'agent'`
- `assignee_id = <valid agent id>`

```sql
INSERT INTO tickets (id, title, description, state, assignee_id, assignee_type, project_id)
VALUES ('test-e2e-001', 'E2E Test Ticket', 'Test ticket for engine verification', 'ready', '<agent_id>', 'agent', NULL);
```

### Task 3: Monitor Engine Logs
```bash
pm2 logs swarm-engine --lines 30
```

Watch for: `Found X ready tickets` and `Dispatching ticket test-e2e-001`

### Task 4: Verify GAP #1 (HITL → Engine Trigger)
Check `/opt/swarm-platform/routes/hitl.js` start-build endpoint:
- After ticket generation, should tickets auto-transition to 'ready'?
- Is there a trigger to notify engine?

### Task 5: Verify GAP #5 (Session Completion)
Check `/opt/swarm-platform/routes/tickets.js`:
- When all tickets for a session are 'done', does session transition to 'completed'?

## Integration Gaps Reference

| Gap | Description | Status |
|-----|-------------|--------|
| GAP #1 | HITL building → Engine trigger | TODO |
| GAP #2 | Engine DB path + PM2 | ✅ DONE |
| GAP #3 | Worker → Verifier → PR chain | In engine.js |
| GAP #4 | Deploy → Ticket completion | TODO |
| GAP #5 | All tickets done → Session complete | TODO |

## Anti-Freeze Protocol

- SSH timeout: 15s checks, 30s max operations
- File reads: `head -50` or `tail -20`
- Max 3 commands per tool call
- Checkpoint to git every 15-20 min

## Quick Commands

```bash
# Check engine logs
pm2 logs swarm-engine --lines 20 --nostream

# Query tickets
sudo -u postgres psql swarmdb -c "SELECT id, title, state, assignee_id FROM tickets"

# Query agents
sqlite3 /opt/swarm-registry/registry.db 'SELECT id, name FROM agents'

# Restart engine
pm2 restart swarm-engine
```

## Start Here

1. Check if agents exist in registry
2. Create a test ticket with valid agent assignment
3. Watch engine logs for pickup
4. If engine processes ticket, verify full workflow
5. Update session notes and commit to git
