# Continue Workflow Remediation: P1 Priority Tasks

## Context

You are continuing the Build Feature Workflow Remediation. Reference the master plan at `/opt/swarm-specs/prompts/workflow-remediation-plan.md`.

## Completed Tasks

| Task | Status | Commit |
|------|--------|--------|
| P0-1: Dependency Cascade Unblocking | ✅ | Created `/opt/swarm-platform/lib/ticket-lifecycle.js` |
| P0-2: Engine Error Handling | ✅ | `db4a643` - failTicket instead of completeTicket |
| P0-3: Distributed Locking | ✅ | `7a474a3` - FOR UPDATE SKIP LOCKED atomic claiming |
| P0-4: Heartbeat + Reaper | ✅ | `8d35def` - 30s heartbeat, 5min stale reclaim |

**All P0 (Critical) tasks complete.**

## Current: P1 Priority Tasks

| Task | Description | Location |
|------|-------------|----------|
| P1-1 | Verification retry with exponential backoff | Engine verification flow |
| P1-2 | Better Claude API error handling | Agent execution |
| P1-3 | Ticket timeout enforcement | Engine + DB |
| P1-4 | Event sourcing for audit trail | New table + logging |

### P1-1: Verification Retry with Backoff

**Problem**: Single verification failure marks ticket as failed immediately.

**Solution**: Retry verification 3 times with exponential backoff (1s, 2s, 4s).

**Location**: `/opt/swarm/engine/lib/engine.js` - verification logic in `_executeAsync()`

### P1-2: Better Claude API Error Handling

**Problem**: Claude API errors (rate limits, network issues) cause ticket failures.

**Solution**: 
- Detect retryable errors (429, 503, network timeout)
- Retry with backoff before failing
- Log detailed error info for debugging

**Location**: Agent execution in step-executor or forge agent

### P1-3: Ticket Timeout Enforcement

**Problem**: Tickets can run indefinitely if agent hangs.

**Solution**:
- Add `timeout_at` column to tickets (set on claim: NOW() + timeout)
- Reaper checks `timeout_at < NOW()` in addition to stale heartbeat
- Configurable per-ticket or global default (e.g., 30 min)

**Location**: Engine claim + reaper logic

### P1-4: Event Sourcing for Audit Trail

**Problem**: No complete history of ticket state changes.

**Solution**:
- Create `ticket_events` table
- Log all state transitions with timestamps
- Enable replay and debugging

**Schema**:
```sql
CREATE TABLE ticket_events (
    id SERIAL PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    event_type TEXT NOT NULL,  -- claimed, heartbeat, completed, failed, reclaimed
    old_state TEXT,
    new_state TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_ticket_events_ticket_id ON ticket_events(ticket_id);
```

## Execution Order

Recommended: P1-1 → P1-3 → P1-4 → P1-2

1. **P1-1** (Verification retry) - Quick win, reduces flaky failures
2. **P1-3** (Timeout enforcement) - Builds on P0-4 reaper, prevents hangs
3. **P1-4** (Event sourcing) - Foundation for observability
4. **P1-2** (Claude API handling) - More complex, needs agent code review

## Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/engine.js` | Main engine (~1050 lines) |
| `/opt/swarm/engine/lib/step-executor.js` | Agent execution |
| `/opt/swarm-platform/lib/ticket-lifecycle.js` | Cascade unblocking |
| `/opt/swarm-specs/session-notes/current.md` | Session progress |

## Execution

1. Read session notes: `cat /opt/swarm-specs/session-notes/current.md`
2. Review master plan: `head -100 /opt/swarm-specs/prompts/workflow-remediation-plan.md`
3. Pick a P1 task and implement
4. Test and verify
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
