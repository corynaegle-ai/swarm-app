# Phase 2: Agent Logging Helper Library

## Context

Phase 1 validated the activity logging endpoints are fully operational:

| Endpoint | Method | Auth | Status |
|----------|--------|------|--------|
| `/api/tickets/:id/activity` | POST | `X-Agent-Key: agent-internal-key-dev` | ✅ Working |
| `/api/tickets/:id/activity` | GET | JWT Bearer Token | ✅ Working |

**Test ticket**: `TKT-TEST-ACTIVITY` (tenant: `tenant-swarm`)

**POST Request Format**:
```json
{
  "agent_id": "forge-agent-1",
  "category": "ticket_claimed",
  "message": "Agent claimed ticket for processing",
  "metadata": {"vm_id": "vm-001"}
}
```

---

## Objective

Create a reusable logging helper library that agents can import to log activity without duplicating HTTP call logic.

---

## Work Items

### 2.1 Create Directory Structure
```bash
mkdir -p /opt/swarm-app/apps/agents/lib
```

### 2.2 Create `activity-logger.js`

**Location**: `/opt/swarm-app/apps/agents/lib/activity-logger.js`

**Requirements**:
- `logActivity(ticketId, agentId, category, message, metadata)` function
- Environment-based configuration:
  - `PLATFORM_URL` (default: `http://localhost:8080`)
  - `AGENT_SERVICE_KEY` (default: `agent-internal-key-dev`)
- **Non-blocking**: Fire-and-forget pattern - logging failures must NOT break agent execution
- **Error handling**: Catch and log errors to console, never throw
- Optional: Retry with exponential backoff (can be v2)

**Template**:
```javascript
const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:8080';
const AGENT_SERVICE_KEY = process.env.AGENT_SERVICE_KEY || 'agent-internal-key-dev';

const CATEGORIES = {
  TICKET_CLAIMED: 'ticket_claimed',
  CODE_GENERATION: 'code_generation',
  FILE_CREATED: 'file_created',
  FILE_MODIFIED: 'file_modified',
  GIT_OPERATION: 'git_operation',
  PR_CREATED: 'pr_created',
  API_CALL: 'api_call',
  API_RESPONSE: 'api_response',
  ERROR: 'error',
  COMPLETION: 'completion'
};

async function logActivity(ticketId, agentId, category, message, metadata = {}) {
  // Implementation here
  // Fire-and-forget: don't await in caller, catch all errors
}

module.exports = { logActivity, CATEGORIES };
```

### 2.3 Create Constants/Categories

Export category constants so agents use consistent values:
```javascript
const CATEGORIES = {
  TICKET_CLAIMED: 'ticket_claimed',
  CODE_GENERATION: 'code_generation',
  FILE_CREATED: 'file_created',
  FILE_MODIFIED: 'file_modified',
  GIT_OPERATION: 'git_operation',
  PR_CREATED: 'pr_created',
  API_CALL: 'api_call',
  API_RESPONSE: 'api_response',
  ERROR: 'error',
  COMPLETION: 'completion'
};
```

---

## Validation Commands

After creating the library, test it:

```bash
# Test from Node REPL on dev droplet
cd /opt/swarm-app/apps/agents
node -e "
const { logActivity, CATEGORIES } = require('./lib/activity-logger');
logActivity('TKT-TEST-ACTIVITY', 'test-agent', CATEGORIES.CODE_GENERATION, 'Testing logger from REPL', { test: true })
  .then(() => console.log('Logged!'))
  .catch(e => console.error('Failed:', e));
"

# Verify in database
sudo -u postgres psql -d swarmdb -c "SELECT event_type, new_value, metadata FROM ticket_events WHERE ticket_id = 'TKT-TEST-ACTIVITY' ORDER BY created_at DESC LIMIT 3;"
```

---

## Success Criteria

- [ ] `/opt/swarm-app/apps/agents/lib/activity-logger.js` exists
- [ ] `logActivity()` function works without throwing
- [ ] `CATEGORIES` object exported with all standard categories
- [ ] Test log appears in `ticket_events` table
- [ ] Failures are logged to console but don't throw

---

## Files to Create

| File | Purpose |
|------|---------|
| `/opt/swarm-app/apps/agents/lib/activity-logger.js` | Main logging helper |

---

## Environment Reference

- **DEV Droplet**: 134.199.235.140
- **Node Path**: `/root/.nvm/versions/node/v22.21.1/bin`
- **Platform API**: `http://localhost:8080`
- **Agent Auth Key**: `agent-internal-key-dev`
- **Database**: `swarmdb` (PostgreSQL)

---

## Estimated Time: 30 minutes
