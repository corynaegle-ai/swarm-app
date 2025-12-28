# Continue Workflow Remediation: P0-4 Claim Timeout/Heartbeat

## Context

You are continuing the Build Feature Workflow Remediation. Reference the master plan at `/opt/swarm-specs/prompts/workflow-remediation-plan.md`.

## Completed Tasks

| Task | Status | Commit |
|------|--------|--------|
| P0-1: Dependency Cascade Unblocking | ✅ | Created `/opt/swarm-platform/lib/ticket-lifecycle.js` |
| P0-2: Engine Error Handling | ✅ | `db4a643` - failTicket instead of completeTicket |
| P0-3: Distributed Locking | ✅ | `7a474a3` - FOR UPDATE SKIP LOCKED atomic claiming |

## Current Task: P0-4 Claim Timeout/Heartbeat

### Problem

If an engine crashes or hangs mid-execution, tickets remain stuck in `in_progress` state forever:
- No way to detect stale claims
- Tickets never get reassigned
- Work is permanently blocked

### Solution Components

1. **Database Schema** - Add heartbeat tracking to tickets table:
   ```sql
   ALTER TABLE tickets ADD COLUMN last_heartbeat TIMESTAMP;
   ALTER TABLE tickets ADD COLUMN heartbeat_count INTEGER DEFAULT 0;
   ```

2. **Engine Heartbeat Loop** - Periodic updates while executing:
   ```javascript
   // Every 30 seconds, update heartbeat for all active tickets
   async heartbeatLoop() {
       for (const [ticketId, execution] of this.activeExecutions) {
           await this.pgPool.query(
               `UPDATE tickets SET last_heartbeat = NOW(), heartbeat_count = heartbeat_count + 1 WHERE id = $1`,
               [ticketId]
           );
       }
   }
   ```

3. **Stale Ticket Reaper** - Reclaim tickets with no heartbeat:
   ```sql
   -- Find tickets in_progress with stale heartbeat (>5 min)
   UPDATE tickets 
   SET state = 'ready', vm_id = NULL, started_at = NULL, last_heartbeat = NULL
   WHERE state = 'in_progress' 
     AND last_heartbeat < NOW() - INTERVAL '5 minutes'
   RETURNING id;
   ```

### Implementation Steps

1. Add `last_heartbeat` column to tickets table
2. Update `atomicClaimNext()` to set initial heartbeat
3. Add `heartbeatLoop()` method to Engine class
4. Start heartbeat interval in `start()`, stop in `stop()`
5. Add `reclaimStaleTickets()` method
6. Call reaper in poll loop or separate interval
7. Test crash recovery scenario
8. Commit and update session notes

### Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/engine.js` | Engine with heartbeat + reaper |
| `/opt/swarm-platform/lib/ticket-lifecycle.js` | May need stale reclaim event |
| `/opt/swarm-specs/session-notes/current.md` | Session progress |

### Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Heartbeat interval | 30 seconds | How often engine updates heartbeat |
| Stale threshold | 5 minutes | Time without heartbeat before reclaim |
| Reaper interval | 60 seconds | How often to check for stale tickets |

### Edge Cases

1. **Graceful shutdown**: Clear heartbeat on normal completion (already handled by state change)
2. **Multiple reapers**: Use FOR UPDATE SKIP LOCKED on reaper query too
3. **Ticket reassignment**: Log when ticket is reclaimed from stale engine
4. **Heartbeat failure**: If heartbeat UPDATE fails, log but don't crash engine

### Code Locations

**atomicClaimNext** (line ~180):
```javascript
// Add to UPDATE clause:
SET state = 'in_progress', vm_id = $1, started_at = NOW(), 
    last_heartbeat = NOW(), updated_at = NOW()
```

**Engine class** - Add methods:
- `startHeartbeat()` - Start setInterval
- `stopHeartbeat()` - Clear interval
- `heartbeatActiveTickets()` - Update heartbeat for all active
- `reclaimStaleTickets()` - Find and reset stale tickets

### Testing

1. Start engine, claim ticket
2. Kill engine with SIGKILL (not SIGTERM)
3. Wait 5+ minutes
4. Verify ticket returns to `ready` state
5. New engine claims and completes it

## Execution

1. Read session notes: `cat /opt/swarm-specs/session-notes/current.md`
2. Add database column via psql
3. Modify engine.js with heartbeat + reaper
4. Test and verify
5. Commit and update session notes

## Anti-Freeze Protocol

- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- Checkpoint progress to git frequently
- Max 3 chained commands per tool call
