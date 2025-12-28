# Observability Stack - Remaining Work Prompt

**Purpose:** Continue observability implementation from Phase 3 onwards  
**Created:** 2025-12-15  
**Prereqs:** Phase 1 (Logging) and Phase 2 (Metrics) designs complete  
**Design Doc:** /opt/swarm-specs/design-docs/observability/design.md

---

## Completed Phases

### Phase 1: Structured Logging ✅
- SwarmLogger class with AsyncLocalStorage context
- Express middleware (requestContext, requestLogger, errorLogger)
- JSON log format with trace_id, request_id, tenant_id
- PM2 log rotation configuration
- Migration guide from console.log

### Phase 2: Prometheus Metrics ✅
- lib/metrics.js with 12 metrics (VM, Ticket, API, Claude, Agent)
- metricsMiddleware with path normalization
- /metrics endpoint for Prometheus scraping
- Usage patterns for all metric types

---

## Remaining Work

### Phase 3: Distributed Tracing

**Goal:** Implement OpenTelemetry-style tracing for end-to-end request visibility.

**Reference Schema (from architecture-review-recommendations.md):**
```sql
CREATE TABLE agent_traces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  ticket_id TEXT REFERENCES tickets(id),
  agent_id TEXT REFERENCES agents(id),
  trace_id TEXT NOT NULL,
  parent_span_id TEXT,
  span_name TEXT NOT NULL,
  span_kind TEXT CHECK(span_kind IN ('internal', 'client', 'server')),
  status TEXT CHECK(status IN ('ok', 'error', 'unset')),
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_ms INTEGER,
  attributes JSON DEFAULT '{}',
  events JSON DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Deliverables:**
| Item | File | Description |
|------|------|-------------|
| 3.1 | lib/tracer.js | AgentTracer class with span management |
| 3.2 | middleware | Trace context propagation via X-Trace-ID |
| 3.3 | routes/traces.js | POST /api/traces collector endpoint |
| 3.4 | Schema migration | Add agent_traces table to swarm.db |
| 3.5 | Instrumentation guide | Where to add spans in codebase |

**Span Types to Instrument:**
| Span Name | Parent | Key Attributes |
|-----------|--------|----------------|
| http.request | (root) | method, path, status_code |
| ticket.claim | http.request | ticket_id, agent_id |
| vm.spawn | ticket.claim | vm_id, method |
| agent.execute | vm.spawn | agent_type |
| git.clone | agent.execute | repo_url, branch |
| llm.generate | agent.execute | model, tokens |
| file.write | agent.execute | file_count, bytes |
| git.commit | agent.execute | commit_sha |
| git.push | agent.execute | branch |
| pr.create | agent.execute | pr_number, pr_url |
| ticket.complete | http.request | duration_ms |

---

### Phase 4: Dashboards

**Goal:** Design Grafana dashboard JSON configurations.

**Deliverables:**
| Item | File | Description |
|------|------|-------------|
| 4.1 | dashboards/system-overview.json | Active VMs, throughput, error rate, latencies |
| 4.2 | dashboards/agent-performance.json | Execution times, success rates, token usage |
| 4.3 | dashboards/vm-health.json | Boot times, lifecycle events, resource usage |
| 4.4 | dashboards/ticket-pipeline.json | Queue depth, time in status, throughput |
| 4.5 | Grafana provisioning | docker-compose or install guide |

**System Overview Panels:**
- Active VMs gauge (swarm_vms_active)
- Tickets completed/hour (rate(swarm_tickets_total{status=completed}[1h]))
- API request rate (rate(swarm_api_requests_total[5m]))
- Error rate % (sum(rate(...{status=~5..})) / sum(rate(...)))
- P50/P95/P99 latencies (histogram_quantile)

---

### Phase 5: Alerting

**Goal:** Define Prometheus alerting rules and notification channels.

**Deliverables:**
| Item | File | Description |
|------|------|-------------|
| 5.1 | alerts/swarm-alerts.yml | Prometheus alerting rules |
| 5.2 | Alertmanager config | Slack/PagerDuty routing |
| 5.3 | Runbooks | Response procedures per alert |

**Alert Definitions:**
| Alert | Condition | Severity |
|-------|-----------|----------|
| HighErrorRate | error_rate > 5% for 5m | warning |
| CriticalErrorRate | error_rate > 20% for 5m | critical |
| VMSpawnFailure | spawn_failures > 3 in 5m | critical |
| HighLatency | p95 > 30s for 10m | warning |
| QueueBacklog | queue_depth > 100 for 15m | warning |
| ClaudeAPIErrors | errors > 10 in 5m | critical |
| DiskSpaceLow | usage > 85% | warning |
| DiskSpaceCritical | usage > 95% | critical |

---

## File Locations

```
/opt/swarm-platform/
├── lib/
│   ├── logger.js          # Phase 1 ✅
│   ├── metrics.js         # Phase 2 ✅
│   └── tracer.js          # Phase 3 (TODO)
├── routes/
│   ├── metrics.js         # Phase 2 ✅
│   └── traces.js          # Phase 3 (TODO)
└── data/
    └── swarm.db           # Add agent_traces table

/opt/swarm-specs/design-docs/observability/
├── design.md              # Main design document
├── dashboards/            # Phase 4 (TODO)
│   ├── system-overview.json
│   ├── agent-performance.json
│   ├── vm-health.json
│   └── ticket-pipeline.json
└── alerts/                # Phase 5 (TODO)
    ├── swarm-alerts.yml
    └── runbooks/
```

---

## Instructions

1. **Read current design state:**
   ```bash
   cat /opt/swarm-specs/design-docs/observability/design.md | tail -100
   ```

2. **Design next phase** by appending to design.md

3. **Update session notes:**
   ```bash
   cat >> /opt/swarm-specs/session-notes/current.md << 'EOF'
   ### Completed: Phase N - [Name]
   [summary of what was designed]
   EOF
   ```

4. **Commit progress:**
   ```bash
   cd /opt/swarm-specs && git add -A && git commit -m 'observability: Phase N complete' && git push
   ```

---

## Success Criteria

| Phase | Criteria |
|-------|----------|
| Phase 3 | AgentTracer class, span types defined, collector endpoint |
| Phase 4 | 4 Grafana dashboard JSONs with all key panels |
| Phase 5 | 8 alert rules with severity levels and runbook links |

**Total estimated effort:** 1-2 sessions per phase
