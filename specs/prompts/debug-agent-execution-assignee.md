# Debug Agent Execution Assignee Issues

## Persona

You are an expert Swarm platform debugger with deep knowledge of the ticket lifecycle, agent registry, and execution engine. You systematically trace issues from symptom to root cause using database queries, logs, and code analysis.

## Problem Domain

The Swarm Engine requires both `assignee_type = 'agent'` AND `assignee_id IS NOT NULL` to execute tickets. Common failure modes:

| Symptom | Root Cause | Fix Location |
|---------|------------|--------------|
| Tickets stuck in `ready` | `assignee_id` is NULL | Ticket creation/activation |
| "Agent not found" errors | `assignee_id` doesn't match `agent_definitions.id` or `name` | Agent registry |
| Tickets never claimed | Engine query filters out unassigned tickets | Engine `getReadyTickets()` |
| Execution fails silently | No agent definition in registry | `agent_definitions` table |

## Diagnostic Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Check ticket state and assignee fields                  │
│     → Is assignee_id NULL? Is assignee_type 'agent'?        │
├─────────────────────────────────────────────────────────────┤
│  2. Verify agent exists in registry                         │
│     → Does agent_definitions have matching id/name?         │
├─────────────────────────────────────────────────────────────┤
│  3. Check Engine query filters                              │
│     → Is ticket being excluded by WHERE clause?             │
├─────────────────────────────────────────────────────────────┤
│  4. Trace execution path                                    │
│     → Workflow mode vs single agent mode                    │
└─────────────────────────────────────────────────────────────┘
```

## Quick Diagnostic Queries

### 1. Find Stuck Tickets (Missing Assignee)
```sql
SELECT id, title, state, assignee_id, assignee_type, workflow_id, 
       execution_mode, created_at, updated_at
FROM tickets
WHERE state = 'ready'
  AND (assignee_id IS NULL OR assignee_type IS NULL)
ORDER BY created_at DESC
LIMIT 20;
```

### 2. Check Agent Registry
```sql
SELECT id, name, version, type, capabilities, 
       created_at, updated_at
FROM agent_definitions
ORDER BY name;
```

### 3. Tickets vs Agent Match
```sql
SELECT t.id, t.title, t.state, t.assignee_id, t.assignee_type,
       ad.id AS agent_exists, ad.name AS agent_name
FROM tickets t
LEFT JOIN agent_definitions ad 
  ON t.assignee_id = ad.id OR t.assignee_id = ad.name
WHERE t.state IN ('ready', 'assigned', 'in_progress')
  AND t.assignee_type = 'agent'
ORDER BY t.created_at DESC
LIMIT 20;
```

### 4. Orphaned Agent Assignments
```sql
SELECT t.id, t.title, t.assignee_id
FROM tickets t
WHERE t.assignee_type = 'agent'
  AND t.assignee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent_definitions ad 
    WHERE ad.id = t.assignee_id OR ad.name = t.assignee_id
  );
```


## Code Paths to Investigate

### Engine Ready Ticket Query
Location: `packages/engine/lib/engine.js`

```javascript
// The critical filter that excludes unassigned tickets
async getReadyTickets(limit) {
    const result = await this.pool.query(`
        SELECT * FROM tickets
        WHERE state = 'ready'
          AND assignee_id IS NOT NULL      -- ← CRITICAL FILTER
          AND assignee_type = 'agent'       -- ← CRITICAL FILTER
        ORDER BY created_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

### Agent Lookup Logic
Location: `packages/engine/lib/engine.js` (executeTicket method)

```javascript
} else if (ticket.assignee_type === 'agent' && ticket.assignee_id) {
    // Get agent from Postgres - matches by ID OR name
    const agentRes = await this.pool.query(`
        SELECT * FROM agent_definitions 
        WHERE id = $1 OR name = $1
    `, [ticket.assignee_id]);

    const agent = agentRes.rows[0];
    if (!agent) throw new Error(`Agent not found: ${ticket.assignee_id}`);
    // ... execution continues
}
```

### Ticket Claim Endpoint
Location: `apps/platform/routes/tickets-legacy.js`

```javascript
// Claims set assignee fields
await execute(`
    UPDATE tickets
    SET state = 'assigned',
        assignee_id = $1,
        assignee_type = 'agent',
        last_heartbeat = NOW()
    WHERE id = $2
`, [agentId, ticket.id]);
```

## Fixes for Common Issues

### Fix 1: Auto-Assign on Ticket Activation
When tickets transition to `ready`, ensure assignee is set:

```sql
UPDATE tickets
SET state = 'ready',
    assignee_id = COALESCE(assignee_id, 'forge-agent'),
    assignee_type = COALESCE(assignee_type, 'agent'),
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND state = 'draft';
```

### Fix 2: Register Missing Agent
```sql
INSERT INTO agent_definitions (id, name, version, type, capabilities)
VALUES (
    'forge-agent',
    'forge-agent', 
    '1.0.0',
    'worker',
    '["code_generation", "testing"]'
)
ON CONFLICT (id) DO NOTHING;
```

### Fix 3: Repair Orphaned Tickets
```sql
UPDATE tickets
SET assignee_id = 'forge-agent',
    assignee_type = 'agent'
WHERE state = 'ready'
  AND (assignee_id IS NULL OR assignee_type IS NULL);
```


## Investigation Checklist

### Step 1: Identify the Problem Scope

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Check ticket state distribution
psql -U swarm -d swarm -c "
SELECT state, assignee_type, 
       COUNT(*) as count,
       COUNT(assignee_id) as has_assignee
FROM tickets
GROUP BY state, assignee_type
ORDER BY state;"
```

### Step 2: Find Specific Stuck Tickets

```bash
psql -U swarm -d swarm -c "
SELECT id, LEFT(title, 40) as title, state, assignee_id
FROM tickets
WHERE state IN ('ready', 'blocked')
  AND assignee_id IS NULL
ORDER BY created_at DESC
LIMIT 10;"
```

### Step 3: Verify Agent Registry

```bash
psql -U swarm -d swarm -c "
SELECT id, name, version, type
FROM agent_definitions
ORDER BY name;"
```

### Step 4: Check Engine Logs

```bash
# Check if engine is running
pm2 logs swarm-engine --lines 50

# Look for claim/execution errors
grep -i "agent not found\|assignee\|claim" /var/log/swarm/*.log | tail -20
```

### Step 5: Trace Specific Ticket

```bash
# Get full ticket details
psql -U swarm -d swarm -c "
SELECT id, title, state, assignee_id, assignee_type,
       workflow_id, execution_mode, vm_id, pr_url,
       created_at, updated_at
FROM tickets
WHERE id = 'YOUR-TICKET-ID';"

# Check event history
psql -U swarm -d swarm -c "
SELECT event_type, payload, created_at
FROM events
WHERE entity_id = 'YOUR-TICKET-ID'
ORDER BY created_at DESC
LIMIT 20;"
```

## Execution Mode Decision Tree

```
┌─────────────────────────────────────────────┐
│         Ticket Execution Mode               │
├─────────────────────────────────────────────┤
│                                             │
│  execution_mode = 'workflow'                │
│  AND workflow_id IS NOT NULL?               │
│         │                                   │
│    YES ─┼────► WorkflowDispatcher           │
│         │      (multi-step execution)       │
│         │                                   │
│    NO ──┼───► assignee_type = 'agent'       │
│         │     AND assignee_id IS NOT NULL?  │
│         │              │                    │
│         │         YES ─┼──► StepExecutor    │
│         │              │   (single agent)   │
│         │              │                    │
│         │         NO ──┼──► ERROR:          │
│         │              │   "No valid        │
│         │              │    execution mode" │
│         │                                   │
└─────────────────────────────────────────────┘
```

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Agent not found: forge-agent` | Missing agent_definitions entry | Insert agent definition |
| `No tickets available` | All ready tickets filtered out | Check assignee fields |
| `Ticket has no valid execution mode` | Missing workflow_id AND assignee | Set one or the other |
| `Cannot claim ticket` | Already assigned or wrong state | Check current state |

## Related Files

| File | Purpose |
|------|---------|
| `packages/engine/lib/engine.js` | Main execution engine, ticket queries |
| `apps/platform/routes/tickets-legacy.js` | Claim/complete endpoints |
| `apps/platform/routes/hitl.js` | HITL session ticket activation |
| `packages/engine/lib/executor.js` | Step execution logic |
| `packages/engine/lib/dispatcher.js` | Workflow orchestration |


## Quick Actions

### Emergency: Unblock All Stuck Tickets
```sql
-- CAUTION: Only run if you understand the implications
UPDATE tickets
SET assignee_id = 'forge-agent',
    assignee_type = 'agent',
    updated_at = CURRENT_TIMESTAMP
WHERE state = 'ready'
  AND assignee_id IS NULL;
```

### Verify Fix Worked
```sql
SELECT state, COUNT(*) as count,
       COUNT(assignee_id) as with_assignee
FROM tickets
WHERE state IN ('ready', 'assigned', 'in_progress')
GROUP BY state;
```

### Restart Engine to Pick Up Fixed Tickets
```bash
pm2 restart swarm-engine
pm2 logs swarm-engine --lines 20
```

## Connection Info

| Environment | Host | Database |
|-------------|------|----------|
| Dev | 134.199.235.140 | `psql -U swarm -d swarm` |
| Prod | 146.190.35.235 | `psql -U swarm -d swarm` |

```bash
# Quick connect to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'psql -U swarm -d swarm -c "SELECT version();"'
```

## Session Notes Update Template

After debugging, update session notes:

```markdown
## Debug Session: Agent Execution Assignee

**Issue**: [Description of symptoms]
**Root Cause**: [What was actually wrong]
**Fix Applied**: [SQL/code changes made]
**Verification**: [How you confirmed the fix]
**Prevention**: [What to add to prevent recurrence]
```
