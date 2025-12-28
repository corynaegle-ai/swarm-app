# Observability Stack Design Prompt

**Purpose:** Design comprehensive observability infrastructure for Project Swarm  
**Created:** 2025-12-14  
**Estimated Effort:** 2-3 days implementation  
**Priority:** P2 (from REMAINING-WORK.md Track 7)

---

## System Context

You are a master systems architect designing the observability stack for **Project Swarm** — a distributed AI agent coordination system using Firecracker microVMs to run Claude-powered coding agents in parallel.

### Architecture Overview
```
┌─────────────────────────────────────────────────────────────┐
│                     Caddy (HTTPS)                           │
│  swarmstack.net | api.swarmstack.net | dashboard.swarmstack │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   swarm-platform    │
                    │   (PM2 on :8080)    │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  VM 0    │   │  VM 1    │   │  VM N    │
        │ (Agent)  │   │ (Agent)  │   │ (Agent)  │
        └──────────┘   └──────────┘   └──────────┘
```

### Key Stats
- **VM boot time:** <10ms (snapshot restore)
- **Tested capacity:** 100 VMs (806ms total restore)
- **Target capacity:** 1000+ VMs
- **Server:** DigitalOcean droplet (4 vCPU, 16GB RAM) at 146.190.35.235

### Technology Stack
- **Runtime:** Node.js v20/v22
- **Database:** SQLite with WAL mode
- **Process Manager:** PM2
- **Reverse Proxy:** Caddy
- **Frontend:** React + Vite
- **VMM:** Firecracker with network namespaces

---

## Current Observability State

| Component | Status | Details |
|-----------|--------|---------|
| Structured Logging | 🟡 Partial | Some JSON logs, no correlation IDs |
| Metrics | 🔲 None | No Prometheus endpoint |
| Tracing | 🔲 None | No distributed tracing |
| Dashboards | 🔲 None | No Grafana |
| Alerting | 🔲 None | No PagerDuty/Slack integration |

### What Exists Today
```bash
# Current logging approach
pm2 logs swarm-platform     # Stdout/stderr to files
pm2 logs swarm-verifier     # Basic console.log statements

# Log locations
/root/.pm2/logs/swarm-platform-out.log
/root/.pm2/logs/swarm-platform-error.log
```

---

## Already Designed (from architecture-review-recommendations.md)

### Agent Tracing Schema (Ready to Implement)

```sql
CREATE TABLE agent_traces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  ticket_id TEXT REFERENCES tickets(id),
  agent_id TEXT REFERENCES agents(id),
  trace_id TEXT NOT NULL,      -- Correlates all spans in a request
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

CREATE INDEX idx_traces_ticket ON agent_traces(ticket_id);
CREATE INDEX idx_traces_trace_id ON agent_traces(trace_id);
CREATE INDEX idx_traces_agent ON agent_traces(agent_id);
CREATE INDEX idx_traces_start ON agent_traces(start_time);
```

### AgentTracer Class (Reference Implementation)

```javascript
class AgentTracer {
  constructor(ticketId, agentId, tenantId) {
    this.traceId = crypto.randomUUID();
    this.context = { ticketId, agentId, tenantId };
    this.spans = [];
  }
  
  startSpan(name, attributes = {}) {
    const span = {
      id: crypto.randomUUID(),
      name,
      startTime: new Date().toISOString(),
      attributes,
      events: [],
      status: 'unset'
    };
    this.spans.push(span);
    
    return {
      addEvent: (eventName, eventAttrs = {}) => {
        span.events.push({
          name: eventName,
          timestamp: new Date().toISOString(),
          attributes: eventAttrs
        });
      },
      setStatus: (status) => { span.status = status; },
      setAttribute: (key, value) => { span.attributes[key] = value; },
      end: () => {
        span.endTime = new Date().toISOString();
        span.durationMs = new Date(span.endTime) - new Date(span.startTime);
      }
    };
  }
  
  async flush() {
    for (const span of this.spans) {
      await fetch(`${COLLECTOR_URL}/api/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...this.context,
          trace_id: this.traceId,
          ...span
        })
      });
    }
  }
}
```

---

## Design Requirements

### 1. Structured Logging

**Requirements:**
- JSON format for all logs
- Correlation ID (trace_id) on every log entry
- Request ID for HTTP requests
- Tenant ID for multi-tenant isolation
- Log levels: debug, info, warn, error, fatal
- Automatic context propagation

**Output Format:**
```json
{
  "timestamp": "2025-12-14T10:30:45.123Z",
  "level": "info",
  "message": "Ticket claimed by agent",
  "trace_id": "abc123",
  "request_id": "req_xyz",
  "tenant_id": "tenant_001",
  "ticket_id": "ticket_456",
  "agent_id": "agent_789",
  "duration_ms": 45,
  "metadata": {}
}
```

### 2. Metrics (Prometheus Format)

**Required Metrics:**

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| swarm_vms_active | Gauge | tenant_id | Currently running VMs |
| swarm_vms_total | Counter | tenant_id, status | Total VM spawns |
| swarm_vm_boot_duration_ms | Histogram | method | VM boot/restore time |
| swarm_tickets_total | Counter | tenant_id, status | Ticket state transitions |
| swarm_ticket_duration_seconds | Histogram | type, complexity | Time to complete ticket |
| swarm_api_requests_total | Counter | method, path, status | HTTP request counts |
| swarm_api_request_duration_ms | Histogram | method, path | HTTP latency |
| swarm_claude_api_calls_total | Counter | model, status | Claude API usage |
| swarm_claude_api_tokens | Counter | model, direction | Token usage (input/output) |
| swarm_claude_api_cost_usd | Counter | tenant_id, model | Cost tracking |
| swarm_agent_executions_total | Counter | agent_type, status | Agent outcomes |
| swarm_queue_depth | Gauge | tenant_id, status | Tickets by status |

**Endpoint:** `GET /metrics` (Prometheus scrape target)

### 3. Distributed Tracing

**Span Types to Instrument:**

| Span Name | Parent | Attributes |
|-----------|--------|------------|
| http.request | (root) | method, path, status_code |
| ticket.claim | http.request | ticket_id, agent_id |
| vm.spawn | ticket.claim | vm_id, method (boot/restore) |
| agent.execute | vm.spawn | agent_type |
| git.clone | agent.execute | repo_url, branch |
| llm.generate | agent.execute | model, input_tokens, output_tokens |
| file.write | agent.execute | file_count, total_bytes |
| git.commit | agent.execute | commit_sha |
| git.push | agent.execute | branch |
| pr.create | agent.execute | pr_number, pr_url |
| ticket.complete | http.request | duration_ms |

### 4. Dashboard Requirements

**Grafana Dashboards Needed:**

1. **System Overview**
   - Active VMs gauge
   - Ticket throughput (completed/hour)
   - API request rate
   - Error rate percentage
   - P50/P95/P99 latencies

2. **Agent Performance**
   - Execution duration by agent type
   - Success/failure rates
   - Claude API token usage
   - Cost per ticket

3. **VM Health**
   - Boot time histogram
   - Active VMs by tenant
   - VM lifecycle events
   - Resource utilization (if available)

4. **Ticket Pipeline**
   - Queue depth by status
   - Time in each status
   - Dependency wait time
   - Throughput by project

### 5. Alerting Rules

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| HighErrorRate | error_rate > 5% for 5m | warning | Slack |
| HighErrorRate | error_rate > 20% for 5m | critical | PagerDuty |
| VMSpawnFailure | spawn_failures > 3 in 5m | critical | PagerDuty |
| HighLatency | p95_latency > 30s for 10m | warning | Slack |
| QueueBacklog | queue_depth > 100 for 15m | warning | Slack |
| ClaudeAPIErrors | claude_errors > 10 in 5m | critical | PagerDuty |
| DiskSpaceLow | disk_usage > 85% | warning | Slack |
| DiskSpaceCritical | disk_usage > 95% | critical | PagerDuty |

---

## File Locations

```
/opt/swarm-platform/           # Main API server
├── server.js                  # Express app entry point
├── lib/
│   ├── logger.js              # CREATE: Structured logger
│   ├── metrics.js             # CREATE: Prometheus metrics
│   ├── tracer.js              # CREATE: Distributed tracing
│   └── middleware/
│       └── observability.js   # CREATE: Request instrumentation
├── routes/
│   └── metrics.js             # CREATE: /metrics endpoint
└── data/
    └── swarm.db               # SQLite database

/opt/swarm-agents/forge-agent/ # Agent code (runs in VMs)
├── main.js                    # Agent entry point
└── lib/
    └── tracer.js              # CREATE: Agent-side tracer

/opt/swarm-dashboard/          # React frontend
└── src/
    └── pages/
        └── Observability.jsx  # CREATE: Trace viewer UI

/opt/swarm-specs/              # Documentation
└── design-docs/
    └── observability/         # CREATE: This design doc
        └── design.md
```

---

## Technical Constraints

1. **SQLite Limitations:** Single writer, use WAL mode, batch trace inserts
2. **Memory:** 16GB total, keep in-memory buffers small
3. **No External Dependencies Initially:** Design for self-hosted first (SQLite + local files), add Prometheus/Grafana later
4. **Agent VMs Are Ephemeral:** Traces must be flushed before VM termination
5. **Multi-Tenant:** All observability data must be tenant-scoped

---

## Deliverables

### Phase 1: Logging Foundation (Day 1)
- [ ] Design `lib/logger.js` with correlation ID support
- [ ] Design logging middleware for Express
- [ ] Design log format specification
- [ ] Design log rotation strategy

### Phase 2: Metrics (Day 1-2)
- [ ] Design `lib/metrics.js` with Prometheus client
- [ ] Define all metric names, types, labels
- [ ] Design `/metrics` endpoint
- [ ] Design metric collection points in codebase

### Phase 3: Tracing (Day 2)
- [ ] Finalize trace schema (extend existing design)
- [ ] Design trace propagation across HTTP boundaries
- [ ] Design agent-side trace collection
- [ ] Design trace storage and querying

### Phase 4: Visualization (Day 2-3)
- [ ] Design Grafana dashboard JSON templates
- [ ] Design trace viewer UI component
- [ ] Design alert rule configurations

### Phase 5: Documentation
- [ ] Complete design document with diagrams
- [ ] Implementation prompt for each phase
- [ ] Runbook for common debugging scenarios

---

## Session Protocol

**Anti-Freeze Rules:**
- Maximum 60-second SSH timeouts
- Limit to 3 chained commands
- Checkpoint progress to git frequently
- Use `head -50` or `tail -20` for command output

**File Access:**
- Specs repo: `/Users/cory.naegle/swarm-specs-local` (local Mac)
- Droplet access: `ssh -i ~/.ssh/swarm_key root@146.190.35.235`
- Session notes: Update `/opt/swarm-specs/session-notes/current.md` via git

**Output Format:**
Create the design document at: `/opt/swarm-specs/design-docs/observability/design.md`

---

## Architectural Decision: Hybrid Approach

**Decision:** Custom Tracer + prom-client for Metrics + Custom Logger

After analyzing OpenTelemetry SDK vs custom lightweight solution, the hybrid approach was selected for Swarm's specific constraints.

### Why Not Full OpenTelemetry SDK

| Factor | Impact |
|--------|--------|
| Memory overhead | +10-20MB per VM × 1000 VMs = 10-20GB just for SDK |
| Startup time | +100-300ms per VM (less critical with snapshot restore) |
| Flush complexity | Default async batching risks losing traces when VMs terminate |
| Learning curve | Significant time investment for concepts (Exporters, Processors, Propagators) |

### Why Not Fully Custom

| Factor | Impact |
|--------|--------|
| Metrics reinvention | Prometheus format is standard; `prom-client` is tiny and battle-tested |
| Future migration | Custom traces can export to OTel later; custom metrics cannot |
| Grafana compatibility | Standard Prometheus metrics work with existing dashboards |

### Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OBSERVABILITY STACK                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   METRICS              TRACES               LOGS                │
│   ───────              ──────               ────                │
│   prom-client          Custom AgentTracer   Custom JSON Logger  │
│   (npm package)        (200 lines)          (100 lines)         │
│                                                                 │
│   • Standard format    • SQLite storage     • Correlation IDs   │
│   • Grafana-ready      • Sync flush         • Tenant isolation  │
│   • /metrics endpoint  • VM-optimized       • Structured JSON   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Components

```javascript
// 1. METRICS: Use prom-client (standard, lightweight)
const promClient = require('prom-client');
const httpRequestDuration = new promClient.Histogram({
  name: 'swarm_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [10, 50, 100, 500, 1000, 5000]
});

// 2. TRACES: Custom AgentTracer (matches existing design)
const { AgentTracer } = require('./lib/tracer');
const tracer = new AgentTracer(ticketId, agentId, tenantId);
const span = tracer.startSpan('git.clone', { repo: repoUrl });
// ... work ...
span.end();
await tracer.flush();  // Synchronous flush before VM termination

// 3. LOGS: Custom structured logger with trace correlation
const logger = require('./lib/logger');
logger.info('Ticket claimed', { 
  trace_id: tracer.traceId,
  ticket_id: '123',
  agent_id: 'agent_456'
});
```

### Key Benefits

1. **VM Memory:** ~1MB overhead vs ~15MB for full OTel SDK
2. **Flush Guarantee:** Synchronous `await tracer.flush()` ensures traces saved before VM dies
3. **SQLite Native:** Traces go directly to existing database, no external collector needed
4. **Grafana Works:** Standard Prometheus metrics render in any Grafana dashboard
5. **Migration Path:** Can export custom traces to OTel format later via batch job
6. **Fast Implementation:** Ship in 1-2 days vs 3-5 for full OTel learning curve

### NPM Dependencies

```json
{
  "prom-client": "^15.1.0"
}
```

That's it. One dependency for metrics. Traces and logs are pure Node.js.

### Future Migration Path (When Scaling Beyond 1 Droplet)

```
Phase 1 (Now):     Custom tracer → SQLite
Phase 2 (Scale):   Custom tracer → OTel Collector → Jaeger/Tempo
Phase 3 (Growth):  Full OTel SDK with auto-instrumentation
```

The custom trace format is designed to be OTel-compatible (trace_id, span_id, parent_span_id, attributes, events), so migration is a backend change, not a rewrite.

---

## Remaining Questions to Address

1. ~~Should we use OpenTelemetry SDK or build lightweight custom solution?~~ **DECIDED: Hybrid**
2. What's the trace retention policy? (7 days? 30 days?)
3. ~~Should metrics be stored in SQLite or use Prometheus?~~ **DECIDED: prom-client + /metrics endpoint**
4. How do we handle trace collection from VMs that crash mid-execution?
5. What's the authentication model for /metrics endpoint?
6. Should we integrate with external services (Datadog, Honeycomb) or self-host only?

---

## Start Here

1. Read this prompt completely
2. Review the existing agent tracing design in `/design/architecture-review-recommendations.md` (lines 800-900)
3. Examine current logging in `/opt/swarm-platform/server.js`
4. Begin with Phase 1: Logging Foundation design
5. Create design document incrementally, committing to git after each phase

---

## Progress Tracker

### Phase 1: Logging Foundation ✅ COMPLETE
- [x] Design `lib/logger.js` with correlation ID support
- [x] Design logging middleware for Express
- [x] Design log format specification
- [x] Design log rotation strategy

**Design Doc:** `/opt/swarm-specs/design-docs/observability/design.md`

**Key Decisions Made:**
- AsyncLocalStorage for automatic context propagation
- X-Trace-ID header for distributed trace correlation
- JSON format (prod) / Pretty format (dev)
- PM2-native log rotation (no external dependencies)

### Phase 2: Metrics 🔲 IN PROGRESS
- [ ] Design `lib/metrics.js` with Prometheus client
- [ ] Define all metric names, types, labels
- [ ] Design `/metrics` endpoint
- [ ] Design metric collection points in codebase

### Phase 3: Tracing 🔲 PENDING
- [ ] Finalize trace schema (extend existing design)
- [ ] Design trace propagation across HTTP boundaries
- [ ] Design agent-side trace collection
- [ ] Design trace storage and querying

### Phase 4: Visualization 🔲 PENDING
- [ ] Design Grafana dashboard JSON templates
- [ ] Design trace viewer UI component
- [ ] Design alert rule configurations

### Phase 5: Documentation 🔲 PENDING
- [ ] Complete design document with diagrams
- [ ] Implementation prompt for each phase
- [ ] Runbook for common debugging scenarios

---

## Start Here (Updated)

1. Read the design doc: `/opt/swarm-specs/design-docs/observability/design.md`
2. Continue with **Phase 2: Metrics** design
3. Add metrics section to the existing design doc
4. Commit after completing Phase 2
