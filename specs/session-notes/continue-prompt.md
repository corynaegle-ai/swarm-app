# Continue: Ticket Activity Logging - Testing & Agent Integration

## Context
Building real-time agent observability. Activity endpoints are deployed, need testing then agent instrumentation.

## Architecture
```
Agent (in VM) ──POST /activity──→ Platform API ──broadcast──→ WebSocket ──→ Dashboard
                                       │
                                       ▼
                                 ticket_events table
```

## Status Summary

### ✅ Step 1: Activity Endpoints - DEPLOYED, NEEDS TESTING
- Code integrated into `/opt/swarm-app/apps/platform/routes/tickets.js` (lines 719+)
- Fixed broadcast: `broadcast.toTenant(ticket.tenant_id, 'ticket:activity', {...})`
- Platform restarted and running

**Test commands to run:**
```bash
# 1. Get a test ticket ID
PGPASSWORD=swarm_dev_password psql -U swarm -d swarm_dev -h 127.0.0.1 -c "SELECT id FROM tickets LIMIT 1"

# 2. Test POST (agent auth) - replace TICKET_ID
curl -X POST http://localhost:8080/api/tickets/TICKET_ID/activity \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: agent-internal-key-dev" \
  -d '{"agent_id":"forge-test-001","category":"test_event","message":"Testing activity logging"}'

# 3. Test GET (user auth) - need JWT token
# Login first, then use token
curl http://localhost:8080/api/tickets/TICKET_ID/activity \
  -H "Authorization: Bearer JWT_TOKEN"
```

### 🔲 Step 2: Agent Logging Helper - TODO
Create `/opt/swarm-app/apps/agents/lib/activity-logger.js`:
```javascript
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:8080';
const AGENT_KEY = process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev';

async function logActivity(ticketId, category, message, metadata = {}) {
  try {
    await fetch(`${PLATFORM_URL}/api/tickets/${ticketId}/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': AGENT_KEY
      },
      body: JSON.stringify({ agent_id: process.env.AGENT_ID, category, message, metadata })
    });
  } catch (err) {
    console.error('[Activity] Failed to log:', err.message);
  }
}

module.exports = { logActivity };
```

### 🔲 Step 3: Instrument forge-agent - TODO
Query RAG first: `POST http://localhost:8082/api/rag/search` with query "forge-agent ticket claim code generation"

Add logging calls at strategic points:
- After claiming ticket: `ticket_claimed`
- Before Claude API: `code_generation`
- After file create: `file_created`
- After PR: `git_operation`

## DEV Droplet Info
- IP: 134.199.235.140
- Node path: /root/.nvm/versions/node/v22.21.1/bin
- Platform port: 8080
- Agent key: agent-internal-key-dev

## Key Files
| File | Purpose |
|------|---------|
| `/opt/swarm-app/apps/platform/routes/tickets.js` | Activity endpoints (lines 719+) |
| `/opt/swarm-app/apps/agents/lib/activity-logger.js` | Helper to create |
| `/opt/swarm-app/apps/agents/forge-agent.js` | Agent to instrument |
