# Build Feature Workflow Remediation Plan

## Persona

You are a **master web application architect with 30 years experience**. You have deep expertise in:
- Linux systems, networking, security
- JavaScript/Node.js ecosystems
- Distributed systems and workflow engines
- AI Agents and LLM orchestration
- Database design (PostgreSQL, SQLite)
- Event-driven architectures

You have been working with AI Agent workflow engines like Swarm for 5+ years. Your task is to remediate critical issues in the build feature workflow identified during an architectural audit.

---

## Context: Audit Findings Summary

### Architecture Overview

The Swarm build feature workflow follows this state machine:

```
input → clarifying → ready_for_docs → reviewing → approved → building → completed/failed
```

**Ticket States During Build:**
```
draft → ready/blocked → assigned → in_progress → in_review → done/failed
```

**Key Components:**
| Component | Role | Location |
|-----------|------|----------|
| Clarification Agent | Requirements gathering | `apps/platform/agents/clarification-agent.js` |
| Forge Agent | Code generation, PR creation | `agents/coder/index.js` |
| Sentinel Agent | Code review, quality gate | `lib/phases/sentinel.js` |
| Engine | Ticket orchestration, polling | `engine/lib/engine.js` |
| Session Gate | State transition validation | `api/middleware/session-gate.js` |
| Agent Learning | Execution logging, retry strategies | `apps/platform/lib/agent-learning.js` |
| Ticket Routes | API endpoints for ticket ops | `apps/platform/routes/tickets.js`, `tickets-legacy.js` |

### Critical Issues Identified

#### 🔴 P0-1: No Dependency Cascade Unblocking
**Problem**: When a ticket completes, dependent tickets remain permanently blocked.
**Evidence**: `activateTicketsForBuild()` only runs once at build start. No `onTicketComplete()` cascade exists.
**Impact**: DAG-based execution is completely broken. Multi-ticket builds will stall.

#### 🔴 P0-2: Engine Error Handling Sets Wrong State
**Problem**: On verification error, tickets are marked `completed` instead of `failed`.
```javascript
} catch (e) {
  // BUG: Should be failed, not completed
  await this.completeTicket(outputJson, ticketId);
}
```
**Impact**: Failed work appears successful, corrupting build state.

#### 🔴 P0-3: No Distributed Locking on Ticket Claims
**Problem**: Multiple engine instances or forge agents can claim the same ticket.
**Impact**: Race conditions, duplicate work, inconsistent state.

#### 🟡 P1-1: Retry Queue Not Implemented
**Problem**: `needs_review` state is a dead end. Comments say "retry not yet impl".
**Evidence**: 
```javascript
log('WARN', `Verification failed for ${ticketId}, marking for review (retry not yet impl)`);
```
**Impact**: Failed tickets require manual intervention.

#### 🟡 P1-2: No Circuit Breaker Pattern
**Problem**: System can enter death spiral if agent or API repeatedly fails.
**Impact**: Resource exhaustion, cascading failures.

#### 🟡 P1-3: Dual State Management Confusion
**Problem**: Both Engine and API routes can transition ticket states.
**Impact**: Race conditions, audit trail gaps.

#### 🟡 P1-4: Agent Learning Not Integrated with Retry
**Problem**: `shouldRetryTicket()` and `getRetryStrategy()` exist but aren't called from retry flow.
**Impact**: Smart retry decisions not applied.

#### 🟠 P2-1: No Distributed Tracing
**Problem**: No correlation IDs or spans for ticket lifecycle.
**Impact**: Debugging production issues is difficult.

#### 🟠 P2-2: Missing Metrics/Alerting
**Problem**: No Prometheus metrics, no alerting on stuck tickets.
**Impact**: Silent failures in production.

---

## Current State Reference

### State Transitions (session-gate.js)
```javascript
export const STATE_TRANSITIONS = {
  'input': ['clarifying', 'ready_for_docs', 'cancelled'],
  'clarifying': ['clarifying', 'ready_for_docs', 'input', 'cancelled'],
  'ready_for_docs': ['reviewing', 'input', 'cancelled'],
  'reviewing': ['reviewing', 'ready_for_docs', 'approved', 'cancelled'],
  'approved': ['building', 'reviewing', 'cancelled'],
  'building': ['completed', 'failed', 'cancelled'],
  'completed': ['input'],
  'failed': ['building', 'input'],
  'cancelled': ['input']
};
```

### Ticket Activation Logic (hitl.js)
```javascript
async function activateTicketsForBuild(sessionId) {
  const tickets = await queryAll(`
    SELECT id, depends_on, state FROM tickets WHERE design_session = $1
  `, [sessionId]);
  
  for (const ticket of tickets) {
    let deps = [];
    if (ticket.depends_on) {
      deps = JSON.parse(ticket.depends_on);
    }
    
    const newState = deps.length === 0 ? 'ready' : 'blocked';
    await execute(`
      UPDATE tickets
      SET state = $1,
          assignee_id = CASE WHEN $1 = 'ready' THEN 'forge-agent' ELSE NULL END,
          assignee_type = CASE WHEN $1 = 'ready' THEN 'agent' ELSE NULL END
      WHERE id = $2 AND state = 'draft'
    `, [newState, ticket.id]);
  }
}
```

### Engine Polling (engine.js)
```javascript
async getReadyTickets(limit) {
  const result = await this.pgPool.query(`
    SELECT * FROM tickets
    WHERE state = 'ready'
      AND assignee_id IS NOT NULL
      AND assignee_type = 'agent'
    ORDER BY created_at ASC
    LIMIT $1
  `, [limit]);
  return result.rows;
}
```

---

## Remediation Tasks

### Phase 1: P0 - Production Blockers

#### Task P0-1: Implement Dependency Cascade Unblocking

**Objective**: When a ticket completes successfully, automatically unblock any tickets that depend on it.

**Pre-Implementation RAG Query**:
```bash
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ticket complete depends_on blocked state transition unblock", "limit": 10}'
```

**Implementation Steps**:

1. **Create new module** `apps/platform/lib/ticket-lifecycle.js`:

```javascript
/**
 * Ticket Lifecycle Management
 * Handles state transitions and dependency cascading
 */

const { queryAll, queryOne, execute } = require('../db');
const { broadcast } = require('../websocket');

/**
 * Cascade unblock dependent tickets when a ticket completes
 * @param {string} completedTicketId - The ticket that just completed
 * @param {string} sessionId - Design session for scoping
 * @returns {Promise<{unblocked: string[], stillBlocked: string[]}>}
 */
async function cascadeUnblockDependents(completedTicketId, sessionId) {
  const result = { unblocked: [], stillBlocked: [] };
  
  // Find all blocked tickets in this session
  const blockedTickets = await queryAll(`
    SELECT id, title, depends_on FROM tickets
    WHERE design_session = $1 AND state = 'blocked'
  `, [sessionId]);
  
  for (const ticket of blockedTickets) {
    // Parse dependencies
    let deps = [];
    try {
      deps = ticket.depends_on ? JSON.parse(ticket.depends_on) : [];
    } catch (e) {
      deps = ticket.depends_on?.split(',').map(d => d.trim()).filter(Boolean) || [];
    }
    
    // Skip if this ticket doesn't depend on the completed one
    if (!deps.includes(completedTicketId)) {
      continue;
    }
    
    // Check if ALL dependencies are now satisfied (state = 'done' or 'completed')
    const unsatisfiedDeps = await queryAll(`
      SELECT id FROM tickets
      WHERE id = ANY($1::uuid[])
        AND state NOT IN ('done', 'completed')
    `, [deps]);
    
    if (unsatisfiedDeps.length === 0) {
      // All dependencies satisfied - unblock this ticket
      await execute(`
        UPDATE tickets
        SET state = 'ready',
            assignee_id = 'forge-agent',
            assignee_type = 'agent',
            unblocked_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [ticket.id]);
      
      result.unblocked.push(ticket.id);
      
      // Broadcast unblock event
      broadcast.ticketUnblocked(sessionId, {
        ticketId: ticket.id,
        title: ticket.title,
        unlockedBy: completedTicketId
      });
      
      // Log activity
      await logTicketActivity(ticket.id, 'unblocked', {
        triggeredBy: completedTicketId,
        previousState: 'blocked',
        newState: 'ready'
      });
      
    } else {
      result.stillBlocked.push({
        ticketId: ticket.id,
        waitingFor: unsatisfiedDeps.map(d => d.id)
      });
    }
  }
  
  console.log(`[cascade] Ticket ${completedTicketId} completed. Unblocked: ${result.unblocked.length}, Still blocked: ${result.stillBlocked.length}`);
  
  return result;
}

/**
 * Log ticket activity for audit trail
 */
async function logTicketActivity(ticketId, action, metadata = {}) {
  await execute(`
    INSERT INTO ticket_activity (ticket_id, action, metadata, created_at)
    VALUES ($1, $2, $3, NOW())
  `, [ticketId, action, JSON.stringify(metadata)]);
}

module.exports = {
  cascadeUnblockDependents,
  logTicketActivity
};
```

2. **Integrate with Engine** - Update `engine/lib/engine.js`:

```javascript
// At top of file, add import
import { cascadeUnblockDependents } from '../../apps/platform/lib/ticket-lifecycle.js';

// In completeTicket method or after successful completion:
async completeTicket(outputJson, ticketId) {
  // Existing completion logic...
  await this.pgPool.query(`
    UPDATE tickets
    SET state = 'done', outputs = $1, completed_at = NOW()
    WHERE id = $2
  `, [outputJson, ticketId]);
  
  // Get session for cascade scope
  const ticket = await this.pgPool.query(
    'SELECT design_session FROM tickets WHERE id = $1',
    [ticketId]
  );
  
  // CASCADE UNBLOCK DEPENDENTS
  if (ticket.rows[0]?.design_session) {
    await cascadeUnblockDependents(ticketId, ticket.rows[0].design_session);
  }
  
  notifyTicketStateChange(ticketId, 'done', { outputs: outputJson });
}
```

3. **Integrate with API Routes** - Update `apps/platform/routes/tickets.js`:

```javascript
const { cascadeUnblockDependents } = require('../lib/ticket-lifecycle');

// In POST /complete handler:
router.post('/:id/complete', async (req, res) => {
  // ... existing completion logic ...
  
  // After successful state update to 'done':
  const cascadeResult = await cascadeUnblockDependents(ticketId, ticket.design_session);
  
  res.json({
    success: true,
    state: 'done',
    cascade: {
      unblocked: cascadeResult.unblocked.length,
      stillBlocked: cascadeResult.stillBlocked.length
    }
  });
});
```

4. **Add WebSocket broadcast method** - Update `apps/platform/websocket.js`:

```javascript
ticketUnblocked(sessionId, data) {
  this.broadcastToSession(sessionId, {
    type: 'ticket_unblocked',
    payload: data,
    timestamp: new Date().toISOString()
  });
}
```

5. **Add migration for unblocked_at column**:

```sql
-- migrations/YYYYMMDD_add_unblocked_at.sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS unblocked_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_tickets_unblocked_at ON tickets(unblocked_at);
```

**Test Scenarios**:
```javascript
// Test: Simple A → B dependency
// 1. Create ticket A (no deps) and ticket B (depends on A)
// 2. Complete ticket A
// 3. Verify B transitions from 'blocked' to 'ready'

// Test: Diamond dependency A → B, A → C, B+C → D
// 1. Complete A → B and C should unblock
// 2. Complete B → D still blocked (waiting for C)
// 3. Complete C → D should unblock

// Test: Circular dependency detection
// 1. Create A depends on B, B depends on A
// 2. Should NOT cause infinite loop (deps must be on completed tickets)
```

**Acceptance Criteria**:
- [ ] `cascadeUnblockDependents()` function exists and is exported
- [ ] Dependent tickets transition `blocked → ready` automatically
- [ ] WebSocket broadcasts `ticket_unblocked` events
- [ ] Activity log captures cascade events with `triggeredBy` reference
- [ ] No infinite loops on malformed dependency graphs
- [ ] Engine and API routes both trigger cascade

---

#### Task P0-2: Fix Engine Error Handling

**Objective**: Verification errors should set ticket state to `failed`, not `completed`.

**Pre-Implementation RAG Query**:
```bash
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "engine executeTicket catch error completeTicket verification failed", "limit": 10}'
```

**Implementation Steps**:

1. **Locate the bug** in `engine/lib/engine.js`:

Search for pattern:
```javascript
} catch (e) {
  log('ERROR', `Verification error for ${ticketId}: ${e.message}`);
  // On verification error, complete normally but log  <-- THIS IS THE BUG
  const outputJson = JSON.stringify(result || {});
  await this.completeTicket(outputJson, ticketId);
}
```

2. **Add `failTicket()` method** to engine:

```javascript
/**
 * Mark ticket as failed with error details
 */
async failTicket(ticketId, errorMessage, errorCategory = 'unknown') {
  const result = await this.pgPool.query(`
    UPDATE tickets 
    SET state = 'failed',
        error_message = $1,
        error_category = $2,
        failed_at = NOW(),
        updated_at = NOW()
    WHERE id = $3
    RETURNING design_session
  `, [errorMessage, errorCategory, ticketId]);
  
  // Notify via WebSocket
  notifyTicketStateChange(ticketId, 'failed', { 
    error: errorMessage, 
    category: errorCategory 
  });
  
  // Log to activity
  await this.pgPool.query(`
    INSERT INTO ticket_activity (ticket_id, action, metadata, created_at)
    VALUES ($1, 'failed', $2, NOW())
  `, [ticketId, JSON.stringify({ error: errorMessage, category: errorCategory })]);
  
  return result.rows[0];
}
```

3. **Fix the catch block**:

```javascript
// AFTER (correct):
} catch (e) {
  log('ERROR', `Verification error for ${ticketId}: ${e.message}`);
  await this.failTicket(ticketId, e.message, 'verification_error');
}
```

4. **Add migration for error columns** (if not exist):

```sql
-- migrations/YYYYMMDD_add_error_columns.sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS error_category VARCHAR(50);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_tickets_failed_at ON tickets(failed_at);
CREATE INDEX IF NOT EXISTS idx_tickets_error_category ON tickets(error_category);
```

**Acceptance Criteria**:
- [ ] Verification errors result in `state = 'failed'`
- [ ] Error message stored in `error_message` column
- [ ] Error category stored in `error_category` column
- [ ] WebSocket notification sent with error details
- [ ] Activity log captures failure event
- [ ] Dashboard shows failed tickets correctly

---

#### Task P0-3: Add Distributed Locking for Ticket Claims

**Objective**: Prevent race conditions when multiple engines/agents claim tickets.

**Pre-Implementation RAG Query**:
```bash
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "getReadyTickets poll claim SELECT UPDATE ticket engine", "limit": 10}'
```

**Implementation Steps**:

1. **Update `getReadyTickets()` method** in `engine/lib/engine.js`:

```javascript
/**
 * Get ready tickets with row-level locking to prevent race conditions
 * Uses FOR UPDATE SKIP LOCKED to allow concurrent engines
 */
async getReadyTickets(limit) {
  const client = await this.pgPool.connect();
  try {
    await client.query('BEGIN');
    
    // Select and lock tickets atomically
    const result = await client.query(`
      SELECT * FROM tickets
      WHERE state = 'ready'
        AND assignee_id IS NOT NULL
        AND assignee_type = 'agent'
      ORDER BY priority DESC NULLS LAST, created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `, [limit]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return [];
    }
    
    // Immediately transition to 'assigned' while we hold the lock
    const ticketIds = result.rows.map(t => t.id);
    await client.query(`
      UPDATE tickets
      SET state = 'assigned',
          claimed_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($1::uuid[])
    `, [ticketIds]);
    
    await client.query('COMMIT');
    
    // Log claims
    for (const ticket of result.rows) {
      console.log(`[engine] Claimed ticket ${ticket.id}: ${ticket.title}`);
    }
    
    return result.rows;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

2. **Add `claimed_at` column migration**:

```sql
-- migrations/YYYYMMDD_add_claimed_at.sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_tickets_claimed_at ON tickets(claimed_at);
```

3. **Update API claim endpoint** for agent-initiated claims:

```javascript
// In routes/tickets.js or tickets-legacy.js
router.post('/claim', async (req, res) => {
  const { agent_id, project_id } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Build query with optional project filter
    let whereClause = `state = 'ready' AND assignee_id = $1`;
    const params = [agent_id];
    
    if (project_id) {
      whereClause += ` AND project_id = $2`;
      params.push(project_id);
    }
    
    // Try to claim one ticket with lock
    const result = await client.query(`
      SELECT * FROM tickets
      WHERE ${whereClause}
      ORDER BY priority DESC NULLS LAST, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `, params);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ status: 'no_work' });
    }
    
    const ticket = result.rows[0];
    
    // Claim it
    await client.query(`
      UPDATE tickets
      SET state = 'assigned',
          claimed_at = NOW(),
          last_heartbeat = NOW()
      WHERE id = $1
    `, [ticket.id]);
    
    await client.query('COMMIT');
    
    // Get project settings if needed
    const projectSettings = await getProjectSettings(ticket.project_id);
    
    res.json({
      status: 'claimed',
      ticket: ticket,
      project_settings: projectSettings
    });
    
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Claim error:', e);
    res.status(500).json({ error: 'Claim failed' });
  } finally {
    client.release();
  }
});
```

**Load Test Script** (save as `test-concurrent-claims.js`):
```javascript
const { Pool } = require('pg');

async function testConcurrentClaims() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Create test ticket
  const { rows: [ticket] } = await pool.query(`
    INSERT INTO tickets (id, title, state, assignee_id, assignee_type, design_session)
    VALUES (gen_random_uuid(), 'Test Ticket', 'ready', 'forge-agent', 'agent', gen_random_uuid())
    RETURNING id
  `);
  
  console.log(`Created test ticket: ${ticket.id}`);
  
  // Simulate 10 concurrent claim attempts
  const claimPromises = Array(10).fill().map(async (_, i) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(`
        SELECT id FROM tickets WHERE id = $1 AND state = 'ready'
        FOR UPDATE NOWAIT
      `, [ticket.id]);
      
      if (result.rows.length > 0) {
        await client.query(`UPDATE tickets SET state = 'assigned' WHERE id = $1`, [ticket.id]);
        await client.query('COMMIT');
        return { agent: i, success: true };
      } else {
        await client.query('ROLLBACK');
        return { agent: i, success: false, reason: 'not_available' };
      }
    } catch (e) {
      await client.query('ROLLBACK');
      return { agent: i, success: false, reason: e.code === '55P03' ? 'lock_contention' : e.message };
    } finally {
      client.release();
    }
  });
  
  const results = await Promise.all(claimPromises);
  
  const successful = results.filter(r => r.success);
  console.log(`Results: ${successful.length} successful claims (should be exactly 1)`);
  console.log(JSON.stringify(results, null, 2));
  
  // Cleanup
  await pool.query('DELETE FROM tickets WHERE id = $1', [ticket.id]);
  await pool.end();
}

testConcurrentClaims().catch(console.error);
```

**Acceptance Criteria**:
- [ ] `FOR UPDATE SKIP LOCKED` used in all ticket claim queries
- [ ] No duplicate ticket claims under concurrent load
- [ ] Failed lock attempts return gracefully (not 500 error)
- [ ] Transaction rollback on any failure
- [ ] Load test passes: exactly 1 successful claim out of 10 concurrent attempts
- [ ] `claimed_at` timestamp recorded

---

### Phase 2: P1 - Stability Improvements (Next Session)

#### Task P1-1: Implement Retry Queue

**Objective**: Create automatic retry mechanism for failed tickets with exponential backoff.

**New State**: Add `pending_retry` to state machine.

**Implementation Overview**:
1. Add columns: `retry_at TIMESTAMP`, `retry_count INTEGER DEFAULT 0`
2. Create `scheduleRetry(ticketId, delayMs)` function
3. Add state transition: `failed → pending_retry`
4. Engine polls for `state = 'pending_retry' AND retry_at <= NOW()`
5. Integrate with `agent-learning.js` `getRetryStrategy()`
6. Max retries configurable (default: 3)

**State Machine Update**:
```javascript
export const STATE_TRANSITIONS = {
  // ... existing ...
  'failed': ['building', 'input', 'pending_retry'],  // ADD pending_retry
  'pending_retry': ['ready', 'needs_human'],  // NEW STATE
};
```

---

#### Task P1-2: Add Circuit Breaker

**Objective**: Prevent cascading failures by pausing work when error rate exceeds threshold.

**Implementation Overview**:
1. Track error rate per agent/project in sliding 5-minute window
2. Trip circuit if error rate > 50% with minimum 5 attempts
3. Half-open state after 2-minute cooldown
4. Dashboard indicator for circuit status
5. WebSocket notification when circuit trips/resets

---

#### Task P1-3: Single State Owner (Engine)

**Objective**: Engine becomes the only component that mutates ticket state.

**Implementation Overview**:
1. Create `engine/lib/state-manager.js` with all transition logic
2. API routes call state manager via internal HTTP or direct import
3. Validate all transitions against state machine
4. Single audit point for all changes
5. Remove direct state updates from API routes

---

#### Task P1-4: Integrate Agent Learning with Retry

**Objective**: Use learned error patterns to make smart retry decisions.

**Implementation Overview**:
1. On ticket failure, call `agentLearning.shouldRetryTicket()`
2. Use `getRetryStrategy()` for backoff calculation
3. Skip retry for non-retryable errors (auth, invalid_input)
4. Store retry decision rationale in activity log
5. Dashboard shows retry eligibility and reasoning

---

### Phase 3: P2 - Observability (Future Session)

#### Task P2-1: Add Distributed Tracing
- Add `trace_id UUID` to tickets table
- Propagate trace through agent API calls
- Export to Jaeger/Zipkin compatible format

#### Task P2-2: Add Metrics and Alerting
- Prometheus `/metrics` endpoint
- Key metrics: `swarm_tickets_by_state`, `swarm_state_transition_duration_seconds`, `swarm_error_rate`
- Alerts: tickets stuck > 1hr, error_rate > 25%, cascade depth > 5

---

## Execution Protocol

### Before Starting Each Task

1. **Query RAG** to find relevant existing code:
   ```bash
   ssh -i ~/.ssh/swarm_key root@134.199.235.140 \
     'curl -s -X POST http://localhost:8082/api/rag/search \
       -H "Content-Type: application/json" \
       -d '\''{"query": "<relevant search terms>", "limit": 10}'\'''
   ```

2. **Check current state** of files you'll modify:
   ```bash
   head -50 /path/to/file.js
   ```

3. **Create feature branch** for changes:
   ```bash
   git checkout -b fix/workflow-p0-remediation
   ```

### During Implementation

1. **Follow anti-freeze protocol**: Max 3 chained commands, checkpoint frequently
2. **Test incrementally**: Verify each function works before integration
3. **Update session notes**: Document progress in `/opt/swarm-specs/session-notes/current.md`

### After Each Task

1. **Run tests** if they exist:
   ```bash
   node apps/platform/tests/test-workflow-progression.js
   ```
2. **Verify state transitions** in dashboard
3. **Commit with conventional commit message**:
   ```bash
   git add -A
   git commit -m "fix(engine): implement dependency cascade unblocking

   - Add cascadeUnblockDependents() to ticket-lifecycle.js
   - Integrate with engine completeTicket flow
   - Add WebSocket broadcast for unblock events
   - Add migration for unblocked_at column
   
   Refs: workflow-remediation-plan.md P0-1"
   ```

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Dependent tickets auto-unblock | 0% | 100% |
| Failed tickets in correct state | ~50% | 100% |
| Race condition on claims | Possible | Impossible |
| Retry automation | Manual | Automatic with backoff |
| Mean time to detect stuck ticket | Unknown | < 5 min |

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `apps/platform/lib/ticket-lifecycle.js` | CREATE | Cascade logic, activity logging |
| `engine/lib/engine.js` | MODIFY | Fix error handling, add locking, integrate cascade |
| `apps/platform/routes/tickets.js` | MODIFY | Add cascade call on complete, update claim |
| `apps/platform/websocket.js` | MODIFY | Add ticketUnblocked broadcast |
| `migrations/YYYYMMDD_add_lifecycle_columns.sql` | CREATE | Add unblocked_at, claimed_at, error columns |
| `api/middleware/session-gate.js` | MODIFY | Add pending_retry state (P1) |
| `apps/platform/lib/agent-learning.js` | MODIFY | Wire up retry integration (P1) |

---

## DEV Environment Reference

| Resource | Value |
|----------|-------|
| DEV Droplet IP | 134.199.235.140 |
| PROD Droplet IP | 146.190.35.235 |
| SSH Key | ~/.ssh/swarm_key |
| Node Path (DEV) | /root/.nvm/versions/node/v22.21.1/bin |
| RAG Endpoint | http://localhost:8082/api/rag/search |
| Platform Path | /opt/swarm-platform |
| Engine Path | /opt/swarm/engine |

---

## Start Command

Begin with Task P0-1: Implement Dependency Cascade Unblocking

This task has the highest impact on production usability - without it, any build with dependencies will stall permanently.

```
Ready to execute Task P0-1: Implement Dependency Cascade Unblocking
```
