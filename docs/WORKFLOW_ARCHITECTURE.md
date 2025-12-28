# Workflow Architecture

> Comprehensive guide to Swarm's ticket execution workflow, state machine, and troubleshooting

**Status**: Active
**Last Updated**: 2025-12-20
**Related**: [Ticketing System Architecture](documentation/architecture/ticketing-system.md)

---

## Overview

This document describes how tickets flow through the Swarm execution system from creation to completion. It covers the complete ticket state machine, the Engine polling mechanism, agent invocation flow, and troubleshooting procedures for common failure scenarios.

**Key Components:**
- **HITL Session** - Human-in-the-Loop interface for creating and approving specs
- **Ticket Generator** - Breaks specs into executable tickets
- **Engine** - Polls for ready tickets and dispatches them to agents
- **Forge Agent** - Executes coding tasks
- **Sentinel Agent** - Reviews completed work (verification phase)
- **Verifier Service** - Runs static, automated, and sentinel verification phases

---

## 1. Ticket State Machine

### 1.1 States

| State | Description | Assignee |
|-------|-------------|----------|
| `draft` | Ticket created from spec, not yet activated | None |
| `ready` | Available for execution, assigned to forge-agent | `forge-agent` |
| `blocked` | Cannot proceed due to unmet dependencies | None |
| `assigned` | Agent has claimed the ticket | `forge-agent` or `sentinel-agent` |
| `in_progress` | Active work happening in VM | `forge-agent` |
| `verifying` | Code verification running | `forge-agent` |
| `in_review` | PR created, awaiting sentinel review | `sentinel-agent` |
| `needs_review` | Verification failed, needs human attention | `sentinel-agent` |
| `done` | Work complete, PR merged | None |
| `cancelled` | Ticket abandoned | None |
| `on_hold` | Human-paused for external reasons | Original assignee |

### 1.2 State Transition Diagram

```
                                HITL Session
                                     │
                                     ▼
                          ┌──────────────────┐
                          │  Ticket Generator │
                          └────────┬─────────┘
                                   │
                                   ▼
                              ┌────────┐
                              │  draft │
                              └───┬────┘
                                  │
           activateTicketsForBuild()
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
               ▼                  ▼                  ▼
         ┌─────────┐        ┌─────────┐        ┌─────────┐
         │ blocked │◄──────►│  ready  │        │  ready  │
         └─────────┘        └────┬────┘        └────┬────┘
               ▲                 │                  │
               │                 │ Engine claims    │
               │                 ▼                  ▼
               │           ┌──────────┐        ┌──────────┐
               └───────────│ assigned │        │ assigned │
                          └────┬─────┘        └────┬─────┘
                               │                   │
                               │ /start            │
                               ▼                   ▼
                        ┌─────────────┐      ┌─────────────┐
                        │ in_progress │      │ in_progress │
                        └──────┬──────┘      └──────┬──────┘
                               │                    │
                               │ Code + PR          │
                               ▼                    ▼
                        ┌───────────┐         ┌───────────┐
                        │ verifying │         │ verifying │
                        └─────┬─────┘         └─────┬─────┘
                              │                     │
              ┌───────────────┴───────────────┐     │
              │                               │     │
              ▼                               ▼     ▼
       ┌────────────┐                  ┌──────────────┐
       │ in_review  │                  │ needs_review │
       └─────┬──────┘                  └──────────────┘
             │                                ▲
             │ Sentinel approves              │
             ▼                                │
         ┌──────┐                             │
         │ done │                             │
         └──────┘                             │
                                              │
                                        Human fixes
```

### 1.3 Critical Transitions

| Transition | Trigger | Requirements | Files |
|------------|---------|--------------|-------|
| `draft` → `ready` | `activateTicketsForBuild()` | No dependencies, must set `assignee_id='forge-agent'` | `hitl.js:451-461` |
| `draft` → `blocked` | `activateTicketsForBuild()` | Has unmet dependencies | `hitl.js:451` |
| `ready` → `assigned` | Engine claims via `POST /claim` or `claimTicket()` | `assignee_id IS NOT NULL` | `tickets-legacy.js:26`, `engine-pg.js:154-160` |
| `assigned` → `in_progress` | `POST /start` or auto in Engine | Agent begins work | `tickets-legacy.js:158` |
| `in_progress` → `verifying` | `setVerifying()` | Forge agent completes code | `engine-pg.js:226-232` |
| `verifying` → `in_review` | `setInReview()` | Verification passes, PR created, `assignee_id='sentinel-agent'` | `engine-pg.js:202-210` |
| `verifying` → `needs_review` | `setNeedsReview()` | Verification fails | `engine-pg.js:214-222` |
| `in_review` → `done` | Sentinel approves, PR merged | Human or sentinel approval | TBD |

---

## 2. Engine Polling Logic

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SWARM ENGINE                                   │
│                         (docs/engine-pg.js)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│   │  Poll Loop   │────►│   Dispatch   │────►│   Execute    │            │
│   │  (5s cycle)  │     │  Tickets     │     │  in VM       │            │
│   └──────┬───────┘     └──────────────┘     └──────┬───────┘            │
│          │                                         │                     │
│          ▼                                         ▼                     │
│   ┌──────────────┐                          ┌──────────────┐            │
│   │  PostgreSQL  │                          │  StepExecutor │           │
│   │  (tickets)   │                          │  (VM spawn)   │           │
│   └──────────────┘                          └──────┬───────┘            │
│                                                    │                     │
│                                                    ▼                     │
│                                             ┌──────────────┐            │
│                                             │ forge-agent  │            │
│                                             │    -v4.js    │            │
│                                             └──────────────┘            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Poll Query

**File**: `docs/engine-pg.js:138-148`

```javascript
async getReadyTickets(limit) {
    const result = await this.pgPool.query(`
        SELECT * FROM tickets
        WHERE state = 'ready'
          AND assignee_id IS NOT NULL     -- CRITICAL: Must have assignee
          AND assignee_type = 'agent'
          AND vm_id IS NULL               -- Not already being processed
        ORDER BY created_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

**Critical Filter**: `assignee_id IS NOT NULL`

Tickets in `ready` state without an `assignee_id` will **never be picked up** by the Engine. This was the root cause of the workflow stall bug fixed in this changeset.

### 2.3 Polling Behavior

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pollIntervalMs` | 5000 | Base polling interval |
| `maxConcurrentVMs` | 3 | Maximum parallel executions |
| `backoffMaxMs` | 30000 | Maximum backoff when no tickets |
| `ticketTimeoutMs` | 300000 | 5 minute execution timeout |

**Adaptive Backoff:**
- When tickets found: Reset to 5s
- When no tickets: Increase by 1.5x each poll (5s → 7.5s → 11.25s → ... → 30s max)

### 2.4 Claim Process

**File**: `docs/engine-pg.js:154-160`

```javascript
async claimTicket(vmId, ticketId) {
    const result = await this.pgPool.query(`
        UPDATE tickets
        SET state = 'in_progress', vm_id = $1, started_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND state = 'ready' AND vm_id IS NULL
    `, [vmId, ticketId]);
    return result.rowCount;  // 0 if race condition lost
}
```

**Atomic Claim**: Uses optimistic locking (`WHERE state = 'ready' AND vm_id IS NULL`) to prevent race conditions when multiple Engine instances poll simultaneously.

---

## 3. Agent Invocation Flow

### 3.1 Complete Flow Diagram

```
User clicks "Start Build"
         │
         ▼
┌─────────────────────────────┐
│  POST /hitl/:id/start-build │
│       (hitl.js:317)         │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  generateTicketsFromSpec()  │     Tickets created in 'draft' state
│  (ticket-generator.js)      │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│ activateTicketsForBuild()   │     Tickets transition to 'ready'
│     (hitl.js:434-467)       │     + assignee_id = 'forge-agent'
└────────────┬────────────────┘
             │
             │  (5 second delay - Engine poll cycle)
             ▼
┌─────────────────────────────┐
│  Engine.getReadyTickets()   │     Engine finds tickets
│   (engine-pg.js:138-148)    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  Engine.executeTicket()     │     Claim ticket atomically
│   (engine-pg.js:445-491)    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  StepExecutor.executeStep() │     Spawn VM with nsjail
│    (executor.js)            │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  forge-agent-v4.js          │     Agent executes in isolated VM
│    processTicket()          │
└────────────┬────────────────┘
             │
             │ (Clone repo, generate code, commit, push)
             ▼
┌─────────────────────────────┐
│  _postCodeGeneration()      │     Verification pipeline
│   (engine-pg.js:613-674)    │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│  verify() → sentinel-client │     Static + Automated + Sentinel
└────────────┬────────────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
┌─────────┐    ┌───────────┐
│ Passed  │    │  Failed   │
└────┬────┘    └─────┬─────┘
     │               │
     ▼               ▼
┌─────────┐    ┌────────────┐
│ _createPR│    │ setNeeds   │
└────┬────┘    │ Review()   │
     │         └────────────┘
     ▼
┌─────────────────────────────┐
│  setInReview()              │     PR created, sentinel assigned
│  assignee_id = sentinel     │
│   (engine-pg.js:202-210)    │
└─────────────────────────────┘
```

### 3.2 Forge Agent Entry Point

**File**: `apps/platform/code/forge-agent-v4.js:processTicket()`

The forge agent receives:
- Ticket data (title, description, acceptance criteria)
- Project context (repo URL, branch)
- Project settings

**Agent Responsibilities:**
1. Clone repository
2. Create feature branch
3. Analyze codebase
4. Generate code changes
5. Run local tests
6. Commit and push changes
7. Return result to Engine

### 3.3 Sentinel Agent Assignment

**File**: `docs/engine-pg.js:202-210`

After forge agent completes and PR is created:
```javascript
async setInReview(prUrl, evidence, ticketId) {
    await this.pgPool.query(`
        UPDATE tickets
        SET state = 'in_review', pr_url = $1, verification_status = 'passed',
            assignee_id = 'sentinel-agent', assignee_type = 'agent',
            updated_at = NOW()
        WHERE id = $2
    `, [prUrl, ticketId]);
}
```

**Important**: The sentinel-agent is assigned here to enable future sentinel polling (to be implemented).

---

## 4. Troubleshooting Guide

### 4.1 Stuck Tickets Diagnostic

#### Quick Check Query
```sql
-- Find tickets stuck in intermediate states
SELECT id, state, assignee_id, assignee_type, vm_id,
       created_at, updated_at,
       EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_stuck
FROM tickets
WHERE state IN ('ready', 'assigned', 'in_progress', 'verifying')
  AND updated_at < NOW() - INTERVAL '5 minutes'
ORDER BY updated_at ASC;
```

#### Use Monitoring Endpoint
```bash
curl http://localhost:8080/api/tickets/stuck?threshold_minutes=5
```

### 4.2 Common Issues and Solutions

#### Issue: Tickets Stuck in `ready` State

**Symptoms:**
- Tickets show `state = 'ready'`
- `assignee_id = NULL`
- Engine logs show "Found 0 ready tickets"

**Root Cause:** `activateTicketsForBuild()` was not setting `assignee_id`.

**Solution:** Fixed in this changeset. Verify with:
```sql
SELECT id, state, assignee_id, assignee_type
FROM tickets
WHERE state = 'ready';
```

All `ready` tickets should have `assignee_id = 'forge-agent'`.

**Manual Fix (if needed):**
```sql
UPDATE tickets
SET assignee_id = 'forge-agent', assignee_type = 'agent'
WHERE state = 'ready' AND assignee_id IS NULL;
```

---

#### Issue: Tickets Stuck in `in_progress` State

**Symptoms:**
- Tickets show `state = 'in_progress'` for >5 minutes
- No PR URL generated
- Engine not processing ticket

**Possible Causes:**

1. **VM execution timeout**
   - Check: `SELECT vm_id, started_at FROM tickets WHERE id = 'xxx'`
   - Solution: Engine auto-fails after timeout. Manual: `UPDATE tickets SET state = 'ready', vm_id = NULL WHERE id = 'xxx'`

2. **Agent crash**
   - Check: Engine logs for "Async execution error"
   - Check: `/var/log/swarm/engine.log`
   - Solution: Ticket should auto-fail. Check `error` column.

3. **Missing repo/branch**
   - Check: `SELECT repo_url, branch_name FROM tickets WHERE id = 'xxx'`
   - Solution: Ensure project has `repo_url` set

---

#### Issue: Tickets Stuck in `in_review` State

**Symptoms:**
- Tickets show `state = 'in_review'`
- PR URL exists
- No progression to `done`

**Root Cause:** Sentinel workflow not fully implemented.

**Current State:**
- `assignee_id` is now set to `sentinel-agent` when entering `in_review`
- Sentinel polling in Engine is pending implementation

**Workaround:**
```sql
-- Manual completion after PR merge
UPDATE tickets SET state = 'done', completed_at = NOW()
WHERE id = 'xxx' AND state = 'in_review';
```

---

#### Issue: Engine Not Running

**Symptoms:**
- No "Found X ready tickets" in logs
- Tickets accumulate in `ready` state
- Process not visible: `ps aux | grep engine`

**Diagnosis:**
```bash
# Check if engine process exists
ps aux | grep 'engine-pg.js'

# Check PID file
cat /var/run/swarm-engine.pid

# Check logs
tail -f /var/log/swarm/engine.log
```

**Solution:**
```bash
# Start engine manually
node docs/engine-pg.js

# Or with nohup for background
nohup node docs/engine-pg.js > /var/log/swarm/engine.log 2>&1 &
```

---

#### Issue: Claim Race Conditions

**Symptoms:**
- Logs show "Ticket xxx already claimed"
- Multiple engines running

**This is normal behavior.** The atomic claim prevents duplicate processing.

**If causing issues:**
- Ensure only one Engine instance runs per deployment
- Or use distributed locking (future enhancement)

---

### 4.3 Database Verification Queries

#### Full Ticket State Audit
```sql
SELECT
    t.id,
    t.title,
    t.state,
    t.assignee_id,
    t.assignee_type,
    t.vm_id,
    t.pr_url,
    t.branch_name,
    t.created_at,
    t.started_at,
    t.completed_at,
    CASE
        WHEN t.state IN ('ready', 'assigned', 'in_progress')
             AND t.updated_at < NOW() - INTERVAL '5 minutes'
        THEN 'STUCK'
        ELSE 'OK'
    END as health
FROM tickets t
WHERE t.design_session = 'your-session-id'
ORDER BY t.created_at;
```

#### Workflow Progression Summary
```sql
SELECT
    state,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))/60)::int as avg_age_minutes
FROM tickets
WHERE design_session = 'your-session-id'
GROUP BY state
ORDER BY
    CASE state
        WHEN 'draft' THEN 1
        WHEN 'blocked' THEN 2
        WHEN 'ready' THEN 3
        WHEN 'assigned' THEN 4
        WHEN 'in_progress' THEN 5
        WHEN 'verifying' THEN 6
        WHEN 'in_review' THEN 7
        WHEN 'done' THEN 8
        ELSE 9
    END;
```

### 4.4 Log Locations

| Component | Log Location | Key Messages |
|-----------|--------------|--------------|
| Engine | `/var/log/swarm/engine.log` | "Found X ready tickets", "Dispatching ticket", "Ticket X completed" |
| Platform | Console (dev) | "[state transition]", "[start-build]" |
| Forge Agent | Captured by Engine | "[FORGE] Processing ticket" |

### 4.5 Health Checks

```bash
# Platform API health
curl http://localhost:8080/api/health

# Database connection
psql -h localhost -d swarmdb -c "SELECT NOW();"

# Engine status (if implemented)
curl http://localhost:8080/api/engine/status
```

---

## 5. Configuration Reference

### 5.1 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PG_HOST` | `localhost` | PostgreSQL host |
| `PG_PORT` | `5432` | PostgreSQL port |
| `PG_DATABASE` | `swarmdb` | Database name |
| `PG_USER` | `swarm` | Database user |
| `PG_PASSWORD` | - | Database password |

### 5.2 Engine Configuration

```javascript
// docs/engine-pg.js
const engine = new SwarmEngine({
    maxVMs: 3,              // Max concurrent ticket executions
    pollInterval: 5000,     // Polling interval in ms
    ticketTimeout: 300000,  // 5 minute execution timeout
    backoffMax: 30000       // Max backoff when idle
});
```

### 5.3 Key File Paths

| Path | Purpose |
|------|---------|
| `/opt/swarm-registry/registry.db` | SQLite registry for VM tracking |
| `/var/run/swarm-engine.pid` | Engine PID file |
| `/var/log/swarm/engine.log` | Engine log file |

---

## 6. Related Documentation

- [Ticketing System Architecture](documentation/architecture/ticketing-system.md) - State machine details
- [E2E Workflow Gaps](documentation/designs/e2e-workflow-gaps.md) - Known gaps
- [Swarm Sequence Diagrams](documentation/designs/swarm-sequence-diagrams.md) - Detailed sequences
- [INVESTIGATION.md](../INVESTIGATION.md) - Root cause analysis from this fix

---

*Document created: 2025-12-20*
*Part of: Fix Swarm Workflow Progression After Forge Assignment*
