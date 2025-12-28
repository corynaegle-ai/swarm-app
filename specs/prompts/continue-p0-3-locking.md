# Continue Workflow Remediation: P0-3 Distributed Locking

## Context

You are continuing the Build Feature Workflow Remediation. Reference the master plan at `/opt/swarm-specs/prompts/workflow-remediation-plan.md`.

## Completed Tasks

| Task | Status | Commit |
|------|--------|--------|
| P0-1: Dependency Cascade Unblocking | ✅ | Created `/opt/swarm-platform/lib/ticket-lifecycle.js` |
| P0-2: Engine Error Handling | ✅ | `db4a643` - failTicket instead of completeTicket |

## Current Task: P0-3 Distributed Locking

### Problem

Multiple engine instances or forge agents can claim the same ticket simultaneously, causing:
- Race conditions
- Duplicate work
- Inconsistent state

### Location

`/opt/swarm/engine/lib/engine.js` - `claimTicket()` method and ticket polling

### Solution Options

1. **PostgreSQL Advisory Locks** (Recommended)
   ```sql
   SELECT pg_try_advisory_lock(hashtext(ticket_id))
   ```

2. **SELECT FOR UPDATE SKIP LOCKED**
   ```sql
   SELECT * FROM tickets 
   WHERE state = ready 
   FOR UPDATE SKIP LOCKED 
   LIMIT 1
   ```

3. **Atomic UPDATE with RETURNING**
   ```sql
   UPDATE tickets 
   SET state = assigned, assignee_id = $1 
   WHERE id = (
     SELECT id FROM tickets 
     WHERE state = ready AND assignee_id IS NULL 
     LIMIT 1 FOR UPDATE SKIP LOCKED
   )
   RETURNING *
   ```

### Implementation Steps

1. Review current `getReadyTickets()` and `claimTicket()` methods
2. Implement atomic claim with `FOR UPDATE SKIP LOCKED`
3. Add claim timeout/heartbeat to prevent stuck claims
4. Test concurrent claim scenarios
5. Update session notes and commit

### Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/engine.js` | Engine with claim logic |
| `/opt/swarm-platform/lib/ticket-lifecycle.js` | Ticket state helpers |
| `/opt/swarm-specs/session-notes/current.md` | Session progress |

## Execution

1. Read session notes: `cat /opt/swarm-specs/session-notes/current.md`
2. Review current claim logic in engine.js
3. Implement atomic locking
4. Test and verify
5. Commit and update session notes

## Anti-Freeze Protocol

- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- Checkpoint progress to git frequently
- Max 3 chained commands per tool call
