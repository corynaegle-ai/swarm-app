# Investigation: Swarm Workflow Progression After Forge Assignment

**Date:** 2025-12-20
**Issue:** Workflow fails to progress after forge agent assignment
**Status:** Root cause identified

---

## Reproduction Steps

### Prerequisites
1. Platform service running on port 8080
2. Dashboard running on port 3000
3. PostgreSQL database (swarmdb) accessible
4. Engine service (docs/engine-pg.js) should be running

### Manual Reproduction Steps

1. **Start platform service**
   ```bash
   cd apps/platform && npm run dev
   ```

2. **Navigate to HITL new session page**
   ```
   http://localhost:3000/hitl/new
   ```

3. **Create a 'build_feature' project**
   - Enter project name
   - Select project type: `build_feature`
   - Provide repository URL
   - Add description

4. **Generate spec**
   - Click "Start Clarification" or "Generate Spec"
   - Wait for AI-generated specification

5. **Approve spec**
   - Review generated spec
   - Click "Approve"

6. **Click 'Start Build'**
   - Confirm the build start

7. **Observe ticket states in database**
   ```sql
   -- Check ticket states
   SELECT id, state, assignee_id, assignee_type, vm_id
   FROM tickets
   ORDER BY created_at DESC
   LIMIT 10;
   ```

### Expected Results
- Tickets should progress: `ready` → `assigned` → `in_progress` → `in_review` → `done`
- Forge agent should claim tickets
- PR URLs should be generated

### Actual Results
- Tickets remain in `ready` state indefinitely
- `assignee_id` is NULL
- Engine never picks up tickets

---

## Database Query Results

### Query to verify stuck tickets:
```sql
SELECT id, state, assignee_id, assignee_type, vm_id, created_at
FROM tickets
WHERE state IN ('ready', 'assigned', 'in_progress', 'blocked')
ORDER BY created_at DESC
LIMIT 10;
```

### Expected observations:
| id | state | assignee_id | assignee_type | vm_id |
|----|-------|-------------|---------------|-------|
| ticket-xxx | ready | NULL | NULL | NULL |

**Key Finding:** `assignee_id` is NULL for all tickets in `ready` state.

---

## Root Cause Analysis

### Issue Location
**File:** `apps/platform/routes/hitl.js`
**Function:** `activateTicketsForBuild()` (lines 434-460)

### The Problem

The `activateTicketsForBuild()` function sets tickets to `ready` state but **never assigns an `assignee_id`**:

```javascript
async function activateTicketsForBuild(sessionId) {
  const tickets = await queryAll(`
    SELECT id, depends_on, state FROM tickets WHERE design_session = $1
  `, [sessionId]);

  let readyCount = 0;

  for (const ticket of tickets) {
    // ... dependency check logic ...

    const newState = deps.length === 0 ? 'ready' : 'blocked';
    await execute(`
      UPDATE tickets SET state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND state = 'draft'
    `, [newState, ticket.id]);
    // ^^^ Missing assignee_id assignment!

    if (newState === 'ready') readyCount++;
  }

  return readyCount;
}
```

### Why This Causes Failure

The Engine (`docs/engine-pg.js`) looks for tickets with this query (line 138-148):

```javascript
async getReadyTickets(limit) {
    const result = await this.pgPool.query(`
        SELECT * FROM tickets
        WHERE state = 'ready'
          AND assignee_id IS NOT NULL    // <-- THIS FILTERS OUT ALL TICKETS!
          AND assignee_type = 'agent'
          AND vm_id IS NULL
        ORDER BY created_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

**The Engine never finds any tickets because `assignee_id IS NOT NULL` check fails.**

### Competing Claim Logic

There's also a `/claim` endpoint in `tickets-legacy.js` (lines 25-117) that allows agents to claim tickets:

```javascript
router.post('/claim', async (req, res) => {
  // ...
  const ticket = await queryOne(`
    SELECT ... FROM tickets t ...
    WHERE t.state = 'ready'   // No assignee_id check here
    ORDER BY ...
    LIMIT 1
  `, params);
  // ...
});
```

However, this requires an agent to actively poll and claim tickets. **There is no mechanism that automatically assigns forge agents to newly ready tickets.**

---

## Secondary Issue: Sentinel Agent Assignment

After a forge agent completes work (transitions to `in_review`), there's no mechanism to assign a sentinel agent for verification.

**File:** `apps/platform/routes/tickets-legacy.js` (lines 186-225)

The `/complete` endpoint sets tickets to `in_review` state:
```javascript
await execute(`
  UPDATE tickets
  SET state = 'in_review',
      completed_at = NOW(),
      ...
      verification_status = 'pending'
  WHERE id = $5
`, [...]);
```

But there's no:
1. Sentinel agent assignment
2. Event/trigger to notify sentinel
3. Queue mechanism for sentinel pickup

---

## Proposed Fix Strategy

### Option A: Auto-assign forge agent on ticket activation (Recommended)
- Modify `activateTicketsForBuild()` to assign forge agent when setting `ready` state
- Set `assignee_id = 'forge-agent'` and `assignee_type = 'agent'`

```javascript
const newState = deps.length === 0 ? 'ready' : 'blocked';
await execute(`
  UPDATE tickets
  SET state = $1,
      assignee_id = CASE WHEN $1 = 'ready' THEN 'forge-agent' ELSE NULL END,
      assignee_type = CASE WHEN $1 = 'ready' THEN 'agent' ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = $2 AND state = 'draft'
`, [newState, ticket.id]);
```

### Option B: Modify Engine query (Alternative)
- Remove `assignee_id IS NOT NULL` check from Engine
- Allow Engine to claim any `ready` ticket
- Less preferred as it changes Engine semantics

### Option C: Add auto-assignment service
- Create a background service that watches for `ready` tickets without assignees
- Automatically assigns forge agent
- More complex but decouples assignment logic

---

## Evidence

### Logging Added (Previous Subtasks)
- **subtask-1-1:** Added state transition logging to tickets-legacy.js `/claim`, `/start`, `/complete` endpoints
- **subtask-1-2:** Added logging to hitl.js `/start-build` endpoint showing ready ticket count

### Expected Log Output After Fix
```
[start-build] Ticket activation complete for session xxx: 3 tickets set to 'ready' state, awaiting forge agent pickup
[state transition] /claim: { ticketId: xxx, fromState: 'ready', toState: 'assigned', agent_id: 'forge-agent', timestamp: ... }
[state transition] /start: { ticketId: xxx, fromState: 'assigned', toState: 'in_progress', ... }
[state transition] /complete: { ticketId: xxx, fromState: 'in_progress', toState: 'in_review', ... }
```

---

## Next Steps

1. **subtask-2-1:** Verify Engine is running and polling ✅ **COMPLETED**
2. **subtask-2-2:** Trace engine dispatcher flow
3. **subtask-2-3:** Confirm forge-agent processTicket() is never called (because tickets are never found)
4. **subtask-2-4:** Confirm sentinel assignment logic is missing
5. **subtask-2-5:** Document complete root cause and fix strategy
6. **subtask-3-1:** Implement the fix (add assignee_id on activation)

---

## Subtask 2-1: Engine Status Verification

**Date:** 2025-12-20
**Status:** Completed

### Verification Method
```bash
ps aux | grep 'engine-pg.js'
ps aux | grep -E 'node.*engine|swarm.*engine' | grep -v grep
cat /var/run/swarm-engine.pid
```

### Results

**Engine is NOT running.**

1. **Process check:** No `engine-pg.js` process found
2. **PID file:** `/var/run/swarm-engine.pid` does not exist
3. **No systemd service:** No `.service` files found in repository
4. **PM2 config:** Only `docs/deploy-agent/ecosystem.config.js` exists (for deploy-agent, not engine)

### Engine Location & Startup

The engine code is located in `docs/engine-pg.js`. Key observations:

1. **Auto-start on direct execution:** The engine auto-starts when run directly (lines 762-776):
   ```javascript
   const engine = new SwarmEngine({
       maxVMs: 3,           // Conservative start
       pollInterval: 5000   // 5 second polling
   });
   engine.start().catch(err => {
       console.error('Engine failed to start:', err);
       process.exit(1);
   });
   ```

2. **Expected startup command:**
   ```bash
   node docs/engine-pg.js
   ```

3. **Required paths (production):**
   - Registry DB: `/opt/swarm-registry/registry.db`
   - PID file: `/var/run/swarm-engine.pid`
   - Log dir: `/var/log/swarm`

4. **Required environment:**
   - `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`

### Impact Assessment

Even if the engine were running, it would not find any tickets because:
1. **Primary issue:** `activateTicketsForBuild()` doesn't set `assignee_id`
2. **Engine query filters:** `WHERE assignee_id IS NOT NULL` would return 0 rows

However, **starting the engine is required** for the workflow to function after fixing the assignee issue.

### Recommendation

1. Create a startup script or PM2 config for the engine
2. Or modify the platform service to embed/start the engine
3. Fix the `assignee_id` issue first (primary root cause)

---

## Summary

**Root Cause:** Tickets are created in `ready` state without `assignee_id`, but the Engine filters for `assignee_id IS NOT NULL`.

**Impact:** No tickets are ever picked up by the Engine, causing complete workflow failure.

**Fix Complexity:** Low - Single line change in `activateTicketsForBuild()` function.

**Secondary Issue:** Sentinel agent assignment logic is also missing, but fixing the primary issue will at least allow forge agent execution to proceed.
