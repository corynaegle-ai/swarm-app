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

## Subtask 2-2: Engine Dispatcher Flow Analysis

**Date:** 2025-12-20
**Status:** Completed

### Overview

This analysis traces how the Engine (`docs/engine-pg.js`) polls for tickets, dispatches them to VMs, and invokes `forge-agent-v4.js`.

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  SwarmEngine    │     │  StepExecutor   │     │    VM (nsjail)  │     │ forge-agent-v4  │
│  (engine-pg.js) │────▶│  (executor.js)  │────▶│   Isolated Env  │────▶│   processTicket │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                                                         │
        ▼                                                                         ▼
   PostgreSQL                                                              GitHub PR
   (tickets)                                                               Created
```

### 1. Poll Query for 'ready' Tickets

**Location:** `docs/engine-pg.js` lines 138-148

```javascript
async getReadyTickets(limit) {
    const result = await this.pgPool.query(`
        SELECT * FROM tickets
        WHERE state = 'ready'
          AND assignee_id IS NOT NULL      // ⚠️ This filter causes tickets to be missed!
          AND assignee_type = 'agent'
          AND vm_id IS NULL
        ORDER BY created_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

**Key Observations:**
- Polls every 5 seconds (configurable via `pollIntervalMs`)
- Uses adaptive backoff: `5s → 7.5s → 11.25s → ...` up to `30s` max when no tickets found
- **CRITICAL FILTER:** `assignee_id IS NOT NULL` - This is why tickets are never found!
- Returns oldest tickets first (`ORDER BY created_at ASC`)
- Respects concurrency limit (`maxConcurrentVMs = 3` by default)

### 2. Dispatch Mechanism to VMs

**Location:** `docs/engine-pg.js` lines 443-489 (`executeTicket()`)

**Dispatch Flow:**
1. **Claim ticket atomically** (lines 469-474)
   ```javascript
   const claimed = await this.claimTicket(vmId, ticketId);
   // Updates: state='in_progress', vm_id=vmId, started_at=NOW()
   ```

2. **Track in registry** (lines 477-483)
   ```javascript
   this.registryStmts.assignVm.run(vmId, ticketId);  // SQLite registry
   this.activeExecutions.set(ticketId, { vmId, executor, startTime, runId });
   ```

3. **Execute asynchronously** (lines 486-488)
   ```javascript
   this._executeAsync(ticket, executor, vmId, inputs).catch(...)
   // Non-blocking - allows polling to continue
   ```

### 3. Forge Agent Invocation Chain

**Location:** `docs/engine-pg.js` lines 494-586 (`_executeAsync()`)

**Two Execution Modes:**

#### Mode A: Workflow Execution (if `execution_mode === 'workflow'`)
```javascript
const dispatcher = new WorkflowDispatcher({ useVm: true });
const workflowResult = await dispatcher.runWorkflowForTicket(
    ticket.workflow_id,
    ticketId,
    { ...inputs, ticket, projectSettings: {} }
);
```

#### Mode B: Single Agent Execution (if `assignee_type === 'agent'`)
```javascript
// Step 1: Get agent from SQLite registry
const agent = this.registryStmts.getAgent.get(ticket.assignee_id, ticket.assignee_id);
// Query: SELECT * FROM agents WHERE id = ? OR name = ?

// Step 2: Execute via StepExecutor
result = await executor.executeStep({
    id: ticketId,
    agent: agent.name,          // e.g., 'forge-agent-v4'
    agent_version: agent.version,
    inputs: { ...inputs, ticket, projectSettings: {} }
}, { trigger: inputs });
```

**StepExecutor (external `/opt/swarm-engine/lib/executor.js`):**
- Acquires VM slot (file-based locking)
- Runs agent in nsjail sandbox
- Agent entry point determined by `agent.capabilities.entry` in registry

### 4. How forge-agent-v4.js Gets Invoked

**Agent Registry (SQLite `/opt/swarm-registry/registry.db`):**
```sql
-- Expected agent registration
INSERT INTO agents (id, name, version, capabilities, status)
VALUES (
    'forge-agent',
    'forge-agent-v4',
    '4.0.0',
    '{"entry": "node /opt/swarm-agents/forge-agent-v4.js"}',
    'active'
);
```

**Invocation Chain:**
1. Engine calls `executor.executeStep({ agent: 'forge-agent-v4', ... })`
2. Executor looks up agent in registry by name
3. Executor reads `capabilities.entry` (e.g., `node /path/to/forge-agent-v4.js`)
4. Executor spawns VM with nsjail, executes entry command
5. Agent receives ticket data via stdin/environment
6. Agent calls `processTicket(ticket)` from `apps/platform/code/forge-agent-v4.js`
7. Agent outputs result to stdout, executor captures it

### 5. Post-Execution Flow

**Location:** `docs/engine-pg.js` lines 549-671

After `processTicket()` completes:
1. Store artifacts (stdout, stderr) in registry
2. If `repo_url` exists: Run verification via `verify()` client
3. If verification passes: Create PR via GitHub CLI
4. Set ticket state to `in_review` (or `needs_review` on failure)

```javascript
// Success path (lines 635-640)
const prUrl = await this._createPR(ticketId, branchName, repoUrl, ticket);
await this.setInReview(prUrl, evidence, ticketId);
// Updates: state='in_review', pr_url=prUrl, verification_status='passed'
```

### 6. Why Forge Agent Never Executes

**Root Cause Chain:**

```
1. User clicks "Start Build"
   └─▶ hitl.js:/start-build → activateTicketsForBuild()

2. activateTicketsForBuild() sets state='ready' but assignee_id=NULL
   └─▶ Tickets in DB: state='ready', assignee_id=NULL

3. Engine polls with: WHERE state='ready' AND assignee_id IS NOT NULL
   └─▶ Returns 0 rows (assignee_id IS NULL fails the filter)

4. Engine.executeTicket() never called
   └─▶ StepExecutor never invoked
   └─▶ forge-agent-v4.js processTicket() never called

5. Tickets remain stuck in 'ready' state forever
```

### 7. Visualization of Expected vs Actual Flow

**Expected Flow (After Fix):**
```
start-build → activateTicketsForBuild()
    │
    ▼
tickets SET state='ready', assignee_id='forge-agent', assignee_type='agent'
    │
    ▼
Engine.getReadyTickets() → Returns ticket
    │
    ▼
Engine.executeTicket() → Engine.claimTicket() → state='in_progress'
    │
    ▼
StepExecutor.executeStep() → VM spawned → forge-agent-v4.js
    │
    ▼
processTicket() → Clone repo → Generate code → Create PR
    │
    ▼
_postCodeGeneration() → verify() → setInReview() → state='in_review'
```

**Actual Flow (Current Bug):**
```
start-build → activateTicketsForBuild()
    │
    ▼
tickets SET state='ready', assignee_id=NULL  // ⚠️ Missing assignment!
    │
    ▼
Engine.getReadyTickets() → Returns 0 rows (assignee_id IS NULL)
    │
    ▼
❌ STUCK - Nothing happens, tickets never picked up
```

### Summary

| Component | File | Function | Status |
|-----------|------|----------|--------|
| Poll Query | `docs/engine-pg.js:138-148` | `getReadyTickets()` | ✅ Works correctly |
| Dispatch | `docs/engine-pg.js:443-489` | `executeTicket()` | ✅ Works correctly |
| Agent Lookup | `docs/engine-pg.js:530` | `getAgent.get()` | ✅ Works correctly |
| Executor | `/opt/swarm-engine/lib/executor.js` | `executeStep()` | ✅ External dependency |
| Forge Agent | `apps/platform/code/forge-agent-v4.js` | `processTicket()` | ✅ Code is correct |
| **Root Cause** | `apps/platform/routes/hitl.js:434-460` | `activateTicketsForBuild()` | ❌ Missing `assignee_id` |

---

## Subtask 2-4: Sentinel Agent Assignment Logic Analysis

**Date:** 2025-12-20
**Status:** Completed

### Overview

This analysis identifies whether sentinel agent assignment logic exists and where it should be implemented for proper workflow progression from forge agent to sentinel agent after code completion.

### Key Finding: Sentinel Assignment Logic Is Missing

After comprehensive search of the codebase, **there is NO mechanism to assign a sentinel agent to tickets after forge agent completion**.

### What Exists

#### 1. SENTINEL as a Verification Phase (Not a Ticket Assignee)

SENTINEL exists as a **verification phase** within the verifier service, NOT as an agent that claims tickets:

**Location:** `/opt/swarm-app/apps/agents/sentinel/lib/phases/sentinel.js` (external service)

```javascript
// From docs/engine-pg.js lines 624-631
const verifyResult = await verify({
    ticketId,
    branchName,
    repoUrl,
    attempt,
    acceptanceCriteria: ticket.acceptance_criteria,
    phases: ['static', 'automated', 'sentinel']  // SENTINEL is a phase here
});
```

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    SWARM VERIFICATION PIPELINE                   │
├─────────────────────────────────────────────────────────────────┤
│  Phase 1: STATIC     → Phase 2: AUTOMATED   → Phase 3: SENTINEL │
│  (ESLint, syntax)       (Unit tests)           (LLM review)     │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. Ticket State After Forge Agent Completes

**Two Paths After Forge Agent Execution:**

| Verification Result | Ticket State | Next Actor |
|---------------------|--------------|------------|
| Passed | `in_review` | **None assigned!** |
| Failed | `needs_review` | **None assigned!** |

**From `docs/engine-pg.js` lines 635-664:**
```javascript
if (verifyResult.status === 'passed' || verifyResult.ready_for_pr) {
    // Create PR and set to in_review
    const prUrl = await this._createPR(...);
    await this.setInReview(prUrl, evidence, ticketId);
    // ⚠️ No sentinel agent assigned!
} else {
    // Mark as needs_review
    await this.setNeedsReview(evidence, ticketId);
    // ⚠️ No sentinel agent assigned!
}
```

#### 3. No Polling for `in_review` or `needs_review` Tickets

**Search Results:**
- Engine only polls for `state = 'ready'` tickets (lines 138-148)
- No mechanism polls for `in_review` tickets
- No mechanism polls for `needs_review` tickets
- No `/claim` endpoint variant for sentinel-type agents

### What Is Missing

#### 1. Sentinel Agent Assignment After `in_review` State

**Current Flow (Broken):**
```
forge-agent → code gen → verify() → PR created → state='in_review'
                                                        │
                                                        └─→ STUCK (no one picks up)
```

**Expected Flow (Per Spec):**
```
forge-agent → code gen → verify() → PR created → state='in_review'
                                                        │
                                                        └─→ sentinel-agent assigned → review → approve/reject → state='done'
```

#### 2. Missing Components for Sentinel Workflow

| Missing Component | Purpose | Where to Add |
|-------------------|---------|--------------|
| Sentinel polling query | Find `in_review` tickets | `docs/engine-pg.js` |
| Sentinel assignment | Set `assignee_id = 'sentinel-agent'` | After `setInReview()` |
| Sentinel execution | Run sentinel review agent | `docs/engine-pg.js` |
| `in_review → done` transition | Complete ticket after sentinel approval | After sentinel passes |

### Code Evidence

#### No Sentinel Assignment After `setInReview()`

**File:** `docs/engine-pg.js` lines 198-208
```javascript
async setInReview(prUrl, evidence, ticketId) {
    await this.pgPool.query(`
        UPDATE tickets
        SET state = 'in_review', pr_url = $1, verification_status = 'passed',
            updated_at = NOW()
        WHERE id = $2
    `, [prUrl, ticketId]);
    // ⚠️ Missing: assignee_id = 'sentinel-agent', assignee_type = 'agent'
}
```

#### No Polling for Review Tickets

**File:** `docs/engine-pg.js` lines 138-148
```javascript
async getReadyTickets(limit) {
    const result = await this.pgPool.query(`
        SELECT * FROM tickets
        WHERE state = 'ready'   // ⚠️ Only polls 'ready', not 'in_review'
          AND assignee_id IS NOT NULL
          AND assignee_type = 'agent'
          AND vm_id IS NULL
        ORDER BY created_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

#### No `/claim` Variant for Sentinel

**File:** `apps/platform/routes/tickets-legacy.js` lines 25-117
```javascript
router.post('/claim', async (req, res) => {
    // Only claims tickets WHERE t.state = 'ready'
    // ⚠️ No option to claim 'in_review' tickets
    // ⚠️ No agent_type filter for sentinel
});
```

### Proposed Fixes

#### Option A: Auto-assign Sentinel After PR Creation (Recommended)

Modify `_postCodeGeneration()` to assign sentinel agent after successful verification:

```javascript
// In docs/engine-pg.js after line 639
if (verifyResult.status === 'passed' || verifyResult.ready_for_pr) {
    const prUrl = await this._createPR(ticketId, branchName, repoUrl, ticket);
    await this.setInReview(prUrl, evidence, ticketId);

    // NEW: Assign sentinel agent for final review
    await this.pgPool.query(`
        UPDATE tickets
        SET assignee_id = 'sentinel-agent',
            assignee_type = 'agent'
        WHERE id = $1
    `, [ticketId]);
}
```

#### Option B: Add Sentinel Polling Loop

Add a second polling method specifically for `in_review` tickets:

```javascript
async getReviewTickets(limit) {
    const result = await this.pgPool.query(`
        SELECT * FROM tickets
        WHERE state = 'in_review'
          AND (assignee_id IS NULL OR assignee_id = 'sentinel-agent')
          AND vm_id IS NULL
        ORDER BY updated_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

#### Option C: Combined Engine Poll (Most Complete)

Modify engine to handle both forge and sentinel execution phases:

```javascript
async _pollOnce() {
    // Poll for ready tickets (forge agent)
    const readyTickets = await this.getReadyTickets(available);
    for (const ticket of readyTickets) {
        await this.executeTicket(ticket);
    }

    // Poll for in_review tickets (sentinel agent)
    const reviewTickets = await this.getReviewTickets(available);
    for (const ticket of reviewTickets) {
        await this.executeSentinelReview(ticket);
    }
}
```

### Summary of Sentinel Issues

| Issue | Description | Priority |
|-------|-------------|----------|
| No sentinel assignment | Tickets reach `in_review` but no agent assigned | High |
| No sentinel polling | Engine doesn't look for `in_review` tickets | High |
| No `in_review → done` transition | Even if sentinel ran, no completion logic | Medium |
| SENTINEL is a phase, not agent | Current architecture uses sentinel as verifier phase only | Design |

### Relationship to Primary Root Cause

The sentinel assignment issue is a **secondary root cause** that will block tickets at `in_review` state:

1. **Primary Issue (subtask-2-1 through 2-3):** Tickets stuck at `ready` state
   - Cause: `assignee_id = NULL` when activating tickets
   - Fix: Set `assignee_id = 'forge-agent'` in `activateTicketsForBuild()`

2. **Secondary Issue (this subtask):** Tickets will stuck at `in_review` state
   - Cause: No sentinel agent assignment after forge completes
   - Fix: Add sentinel assignment logic after `setInReview()`

### Next Steps

1. **Phase 3 subtask-3-1:** Fix forge agent assignment (primary)
2. **Phase 3 subtask-3-2:** Add sentinel agent assignment (secondary)
3. Both fixes required for complete `ready → done` workflow

---

## Root Cause Summary

### Primary Root Cause: Missing `assignee_id` on Ticket Activation

**Failure Point:** `apps/platform/routes/hitl.js` → `activateTicketsForBuild()` (lines 434-460)

**Description:** When users click "Start Build" in the HITL workflow, tickets are transitioned from `draft` to `ready` state, but `assignee_id` and `assignee_type` are not set. The Engine (`docs/engine-pg.js`) queries for tickets with `WHERE assignee_id IS NOT NULL`, causing all tickets to be invisible to the Engine.

**Evidence:**
- Code reference: `activateTicketsForBuild()` lines 434-460 - UPDATE statement missing assignee fields
- Engine query: `getReadyTickets()` lines 138-148 - WHERE clause requires `assignee_id IS NOT NULL`
- Database observation: Tickets in `ready` state have `assignee_id = NULL`

**Severity:** Critical - Blocks ALL autonomous builds from executing

---

### Secondary Root Cause: Missing Sentinel Agent Assignment

**Failure Point:** `docs/engine-pg.js` → `setInReview()` (lines 198-208)

**Description:** After forge agent completes work and a PR is created, tickets are set to `in_review` state without assigning a sentinel agent. The Engine only polls for `state = 'ready'` tickets, not `in_review` tickets.

**Evidence:**
- Code reference: `setInReview()` - Does not set `assignee_id` for sentinel agent
- Engine poll: `getReadyTickets()` - Only queries `WHERE state = 'ready'`
- No `getReviewTickets()` method exists
- SENTINEL is a verification phase, not a ticket assignee

**Severity:** High - Even if primary issue is fixed, tickets will stall at `in_review`

---

## Fix Implementation Checklist

### Phase 3: Required Fixes

| Priority | Issue | File | Function | Fix |
|----------|-------|------|----------|-----|
| P0 | Missing forge agent assignment | `apps/platform/routes/hitl.js` | `activateTicketsForBuild()` | Set `assignee_id='forge-agent', assignee_type='agent'` when state='ready' |
| P1 | Missing sentinel assignment | `docs/engine-pg.js` | `setInReview()` or `_postCodeGeneration()` | Set `assignee_id='sentinel-agent'` after PR creation |
| P2 | Engine needs to poll review tickets | `docs/engine-pg.js` | `_pollOnce()` | Add `getReviewTickets()` query and execution |

### Recommended Fix (Option A - Minimal Change)

**Step 1:** Fix forge agent assignment in `activateTicketsForBuild()`:
```javascript
// apps/platform/routes/hitl.js line ~445
await execute(`
  UPDATE tickets
  SET state = $1,
      assignee_id = CASE WHEN $1 = 'ready' THEN 'forge-agent' ELSE NULL END,
      assignee_type = CASE WHEN $1 = 'ready' THEN 'agent' ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = $2 AND state = 'draft'
`, [newState, ticket.id]);
```

**Step 2:** Fix sentinel assignment after PR creation:
```javascript
// docs/engine-pg.js after line 639
await this.pgPool.query(`
  UPDATE tickets
  SET assignee_id = 'sentinel-agent',
      assignee_type = 'agent'
  WHERE id = $1
`, [ticketId]);
```

**Step 3:** Add sentinel polling and execution (optional - depends on architecture decision):
```javascript
// docs/engine-pg.js new method
async getReviewTickets(limit) {
  return (await this.pgPool.query(`
    SELECT * FROM tickets
    WHERE state = 'in_review'
      AND assignee_type = 'agent'
      AND vm_id IS NULL
    ORDER BY updated_at ASC
    LIMIT $1
  `, [limit])).rows;
}
```

---

## Impact Assessment

| State | Before Fix | After Fix |
|-------|------------|-----------|
| `draft` → `ready` | Tickets stuck, Engine never sees them | Engine finds and executes tickets |
| `ready` → `in_progress` | Never happens | Engine claims ticket, VM spawned |
| `in_progress` → `in_review` | Never happens | Forge agent completes, PR created |
| `in_review` → `done` | N/A (never reached) | Sentinel reviews, approves, completes |

---

## Verification After Fix

### Database Query to Verify Workflow Progression:
```sql
SELECT id, state, assignee_id, assignee_type, pr_url, created_at, updated_at
FROM tickets
WHERE design_session = '<session_id>'
ORDER BY created_at;
```

**Expected Output After Fix:**
| state | assignee_id | assignee_type | pr_url |
|-------|-------------|---------------|--------|
| done | sentinel-agent | agent | https://github.com/... |

### Expected Log Output:
```
[start-build] Ticket activation complete: 3 tickets set to 'ready', assigned to forge-agent
[engine] Found 3 ready tickets, dispatching...
[state transition] /claim: ticketId=xxx, ready → assigned, agent=forge-agent
[state transition] /start: ticketId=xxx, assigned → in_progress
[FORGE] Processing ticket - processTicket() invoked: ticketId=xxx
[state transition] /complete: ticketId=xxx, in_progress → in_review
[engine] Assigned sentinel-agent to ticket xxx for review
[engine] Ticket xxx completed successfully, state → done
```

---

## Conclusion

**Root Cause Identified:** The swarm workflow fails because `activateTicketsForBuild()` does not set `assignee_id` when transitioning tickets to `ready` state, causing the Engine's polling query to return zero results.

**Secondary Issue:** Even if forge agent completes, no sentinel agent is assigned for review, causing tickets to stall at `in_review`.

**Fix Complexity:** Low to Medium - Primary fix is a single UPDATE statement change; secondary fix requires additional assignment logic and potentially engine polling updates.

**Ready for Phase 3:** Yes - Root cause is definitively identified with clear code references and proposed solutions.
