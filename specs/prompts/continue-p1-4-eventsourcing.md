# Continue Workflow Remediation: P1-4 Event Sourcing

## Context

You are continuing the Build Feature Workflow Remediation. Reference the master plan at `/opt/swarm-specs/prompts/workflow-remediation-plan.md`.

## Completed Tasks

| Task | Status | Commit |
|------|--------|--------|
| P0-1: Dependency Cascade Unblocking | ✅ | Created `/opt/swarm-platform/lib/ticket-lifecycle.js` |
| P0-2: Engine Error Handling | ✅ | `db4a643` |
| P0-3: Distributed Locking | ✅ | `7a474a3` |
| P0-4: Heartbeat + Reaper | ✅ | `8d35def` |
| P1-1: Verification Retry w/ Backoff | ✅ | `e8d0d07` |
| P1-3: Ticket Timeout Enforcement | ✅ | `0c14536` |

## Current: P1-4 Event Sourcing (IN PROGRESS)

**Status**: Table created, need to add emitEvent() method and integrate into state transitions.

**Database Schema** (already created):
```sql
CREATE TABLE ticket_events (
    id SERIAL PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    event_type TEXT NOT NULL,  -- claimed, heartbeat, completed, failed, reclaimed, verifying, in_review, needs_review
    old_state TEXT,
    new_state TEXT,
    metadata JSONB,
    vm_id TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Implementation Needed**:

1. Add `emitEvent(ticketId, eventType, oldState, newState, metadata, vmId)` method to engine
2. Call emitEvent from:
   - `atomicClaimNext()` → event_type='claimed'
   - `completeTicket()` → event_type='completed'
   - `failTicket()` → event_type='failed'
   - `setVerifying()` → event_type='verifying'
   - `setInReview()` → event_type='in_review'
   - `setNeedsReview()` → event_type='needs_review'
   - `reclaimStaleTickets()` → event_type='reclaimed'
   - `heartbeatActiveTickets()` → event_type='heartbeat' (optional, may be noisy)

3. Test and verify events are logged

## Remaining P1 Task

| Task | Description |
|------|-------------|
| P1-2 | Better Claude API error handling (in agent/step-executor) |

## Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/engine.js` | Main engine (~1100 lines now) |
| `/opt/swarm/engine/lib/step-executor.js` | Agent execution (for P1-2) |

## Execution

1. Read session notes: `cat /opt/swarm-specs/session-notes/current.md`
2. Add `emitEvent()` method after line ~200 in engine.js
3. Integrate emitEvent calls into state transition methods
4. Test with: `sudo -u postgres psql -d swarmdb -c "SELECT * FROM ticket_events ORDER BY created_at DESC LIMIT 10;"`
5. Commit and update session notes

## Anti-Freeze Protocol

- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- Checkpoint progress to git frequently
- Max 3 chained commands per tool call

## Quick Reference

| Resource | Value |
|----------|-------|
| Dev droplet | 134.199.235.140 |
| Prod droplet | 146.190.35.235 |
| SSH key | `~/.ssh/swarm_key` |
| Node path (dev) | `/root/.nvm/versions/node/v22.21.1/bin` |
| Engine process | `pm2 restart swarm-engine` |
| Database | `sudo -u postgres psql -d swarmdb` |
