# Continue Workflow Remediation: P2 Observability Phase

## Context

You are continuing the Build Feature Workflow Remediation. Reference the master plan at `/opt/swarm-specs/prompts/workflow-remediation-plan.md`.

## Completed Tasks

| Task | Description | Status | Commit |
|------|-------------|--------|--------|
| P0-1 | Dependency Cascade Unblocking | ✅ | ticket-lifecycle.js |
| P0-2 | Engine Error Handling | ✅ | `db4a643` |
| P0-3 | Distributed Locking | ✅ | `7a474a3` |
| P0-4 | Heartbeat + Reaper | ✅ | `8d35def` |
| P1-1 | Verification Retry w/ Backoff | ✅ | `e8d0d07` |
| P1-2 | Circuit Breaker Pattern | ✅ | `0fc3745` |
| P1-3 | Ticket Timeout Enforcement | ✅ | `0c14536` |
| P1-4 | Event Sourcing | ✅ | `44f8055` |

## Current Phase: P2 Observability

### P2-1: Distributed Tracing

**Objective**: Add correlation IDs and spans for ticket lifecycle debugging.

**Implementation**:
1. Add `trace_id UUID` column to tickets table
2. Generate trace_id on ticket creation
3. Propagate trace_id through:
   - Engine dispatch logs
   - Agent API calls (X-Trace-Id header)
   - Verification requests
   - Event sourcing records
4. Add trace_id to all log entries for correlation
5. Export format compatible with Jaeger/Zipkin (optional)

**Database Migration**:
```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS trace_id UUID DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_tickets_trace_id ON tickets(trace_id);
```

---

### P2-2: Metrics and Alerting

**Objective**: Add Prometheus-compatible metrics endpoint for monitoring.

**Implementation**:
1. Create `/metrics` endpoint on engine or platform API
2. Key metrics to expose:
   - `swarm_tickets_total{state}` - Gauge of tickets by state
   - `swarm_tickets_processed_total{status}` - Counter of processed tickets
   - `swarm_state_transition_duration_seconds` - Histogram of state transition times
   - `swarm_circuit_breaker_state{agent,project}` - Circuit breaker states
   - `swarm_vm_active` - Current active VM count
   - `swarm_error_rate` - Rolling error rate
3. Use `prom-client` npm package for Node.js
4. Add health check endpoint `/health` with readiness/liveness

**Alert Thresholds** (for future Grafana/Alertmanager):
- Tickets stuck in `in_progress` > 1 hour
- Error rate > 25% over 5 minutes
- Circuit breaker OPEN for > 10 minutes
- VM pool exhausted (active = max)

---

## Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/engine.js` | Core engine (~1100 lines) |
| `/opt/swarm-platform/server.js` | Platform API server |
| `/opt/swarm-platform/routes/` | API routes |

## Execution Protocol

1. Read session notes: `cat /opt/swarm-specs/session-notes/current.md`
2. Query RAG for existing patterns before implementing
3. Start with P2-1 (tracing), then P2-2 (metrics)
4. Test each component before moving on
5. Commit after each task completion
6. Update session notes in git

## RAG Query Examples

```bash
# Find existing trace/correlation patterns
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "trace correlation request id logging", "limit": 5}'

# Find metrics/monitoring patterns
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "prometheus metrics endpoint monitoring", "limit": 5}'
```

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
| Platform process | `pm2 restart swarm-platform-dev` |
| Database | `sudo -u postgres psql -d swarmdb` |

## Success Criteria

- [ ] P2-1: trace_id in tickets table and propagated through logs
- [ ] P2-2: `/metrics` endpoint returning Prometheus format
- [ ] P2-2: `/health` endpoint for container orchestration
- [ ] All changes committed and session notes updated
