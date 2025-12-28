# Debug Agent Execution: assignee_id NULL + E2E Ticket→PR Flow

## Context

The Swarm platform has a working forge-sentinel feedback loop, but the Agent Execution Engine has an issue where `assignee_id` remains NULL after clicking "Start Build". This breaks the ticket→agent→VM→code→PR pipeline.

## Problem Statement

When a user clicks "Start Build" on a design session:
1. Tickets are created with `state: ready`
2. But `assignee_id` remains NULL
3. Agents poll `/api/tickets/claim` but tickets aren't being assigned
4. The full pipeline never completes

## Environment

- **Dev droplet**: 134.199.235.140
- **SSH**: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
- **Node path**: `/root/.nvm/versions/node/v22.21.1/bin`
- **Platform API**: swarm-platform-dev (port 3002)
- **Engine**: swarm-engine (handles ticket orchestration)

## Key Files to Investigate

```
/opt/swarm-app/apps/platform/routes/
├── tickets.js          # /claim, PATCH /:id endpoints
├── design.js           # Start Build logic
└── hitl.js             # HITL approval flow

/opt/swarm-app/apps/engine/
├── engine.js           # Main orchestration loop
├── ticket-client.js    # API calls to platform
└── agent-runner.js     # VM/agent spawning
```

## Debugging Steps

### Phase 1: Trace "Start Build" Flow

1. Find the "Start Build" handler in the codebase:
```bash
grep -rn "start.*build\|startBuild" /opt/swarm-app/apps/platform/routes/ | head -20
```

2. Check what happens when Start Build is triggered:
   - Does it create tickets?
   - Does it set initial state to `ready`?
   - Does it attempt to assign an agent?

3. Check the database after Start Build:
```sql
SELECT id, title, state, assignee_id, agent_id, created_at 
FROM tickets 
WHERE session_id = '<session_id>' 
ORDER BY created_at DESC;
```

### Phase 2: Trace /claim Endpoint

1. Find the claim logic:
```bash
grep -n "claim" /opt/swarm-app/apps/platform/routes/tickets.js | head -20
```

2. Verify claim endpoint:
   - What conditions must be met for a ticket to be claimable?
   - Does it check `state = 'ready'`?
   - Does it update `assignee_id` on successful claim?

3. Test claim manually:
```bash
curl -X POST http://localhost:3002/api/tickets/claim \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <agent_token>" \
  -d '{"agent_id": "forge-agent-001"}'
```

### Phase 3: Check Agent Registration

1. Verify agents are registered:
```bash
curl http://localhost:3002/api/agents/available
```

2. Check agent_definitions table:
```sql
SELECT id, name, type, ticket_filter, status FROM agent_definitions;
```

3. Verify agent has correct `ticket_filter`:
   - Forge agents should have `ticket_filter: 'ready'`
   - Sentinel agents should have `ticket_filter: 'in_review'`

### Phase 4: Check Engine Polling

1. Check engine logs:
```bash
pm2 logs swarm-engine --lines 50
```

2. Verify engine is polling for tickets:
   - Is it calling `/api/tickets/claim`?
   - What response is it getting?
   - Is there an error being swallowed?

3. Check engine configuration:
```bash
cat /opt/swarm-app/apps/engine/ecosystem.config.js
```

### Phase 5: E2E Test - Full Pipeline

Once assignee_id issue is fixed, test the complete flow:

1. **Create a test project/session**
2. **Generate tickets via Design Agent**
3. **Click Start Build**
4. **Verify tickets have state=ready**
5. **Watch agent claim a ticket** (assignee_id should populate)
6. **Agent generates code**
7. **Agent creates branch and commits**
8. **Agent creates PR**
9. **Sentinel reviews**
10. **Ticket marked done**

### Test Ticket for E2E

Use an existing ticket or create one:
```sql
INSERT INTO tickets (id, title, description, state, project_id, session_id, scope, acceptance_criteria)
VALUES (
  'TKT-E2E-TEST-001',
  'E2E Test: Simple Function',
  'Create a simple utility function',
  'ready',
  '<project_id>',
  '<session_id>',
  'small',
  '["Function returns expected output", "Has unit test"]'
);
```

## Expected Outcome

After debugging:
1. `assignee_id` is set when agent claims ticket
2. Ticket state transitions: `ready` → `assigned` → `in_progress` → `in_review` → `done`
3. Full pipeline completes with PR created

## Relevant Registered Agents

| Agent ID | Type | ticket_filter |
|----------|------|---------------|
| forge-agent-001 | forge | ready |
| forge-v3 | forge | ready |
| sentinel-agent-001 | sentinel | in_review |
| deploy-agent-001 | deploy | approved |

## Common Issues to Check

1. **Missing agent_id in claim request** - Agent must send its ID
2. **Ticket filter mismatch** - Agent's filter doesn't match ticket state
3. **Tenant isolation** - Agent token must have correct tenant_id
4. **Race condition** - Multiple agents claiming same ticket
5. **Transaction not committing** - DB update succeeds but not persisted

## Session Notes Location

Update progress in: `/opt/swarm-app/specs/session-notes/current.md`

---
*Created: 2025-12-28*
