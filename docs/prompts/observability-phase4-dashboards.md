# Observability Phase 4: Grafana Dashboards

**Purpose:** Continue observability implementation - design Grafana dashboard JSON configurations  
**Prereqs:** Phases 1-3 complete (Logging, Metrics, Tracing)  
**Design Doc:** /opt/swarm-specs/design-docs/observability/design.md

---

## Context

You are a master systems architect continuing the Swarm observability stack implementation. Phases 1-3 are complete:

- **Phase 1:** Structured logging with SwarmLogger, AsyncLocalStorage context
- **Phase 2:** Prometheus metrics (12 metrics: VM, Ticket, API, Claude, Agent)
- **Phase 3:** Distributed tracing with AgentTracer, span hierarchy, /api/traces endpoint

Phase 4 designs Grafana dashboard JSON configurations that visualize the metrics from Phase 2.

---

## Phase 4 Deliverables

| Item | File | Description |
|------|------|-------------|
| 4.1 | dashboards/system-overview.json | Active VMs, throughput, error rate, latencies |
| 4.2 | dashboards/agent-performance.json | Execution times, success rates, token usage |
| 4.3 | dashboards/vm-health.json | Boot times, lifecycle events, resource usage |
| 4.4 | dashboards/ticket-pipeline.json | Queue depth, time in status, throughput |
| 4.5 | Grafana provisioning | docker-compose or install guide |

---

## Available Metrics (from Phase 2)

```
# VM Metrics
swarm_vms_active{tenant_id}                    - Gauge
swarm_vms_total{tenant_id, status}             - Counter
swarm_vm_boot_duration_ms{method}              - Histogram

# Ticket Metrics
swarm_tickets_total{tenant_id, status}         - Counter
swarm_ticket_duration_seconds{type, complexity} - Histogram
swarm_queue_depth{tenant_id, status}           - Gauge

# API Metrics
swarm_api_requests_total{method, path, status} - Counter
swarm_api_request_duration_ms{method, path}    - Histogram

# Claude API Metrics
swarm_claude_api_calls_total{model, status}    - Counter
swarm_claude_api_tokens{model, direction}      - Counter
swarm_claude_api_cost_usd{tenant_id, model}    - Counter

# Agent Metrics
swarm_agent_executions_total{agent_type, status} - Counter
```

---

## Dashboard Requirements

### 4.1 System Overview Dashboard
**Audience:** Operations team, quick health check

| Panel | Type | Query |
|-------|------|-------|
| Active VMs | Stat | swarm_vms_active |
| Tickets/Hour | Stat | rate(swarm_tickets_total{status="completed"}[1h]) * 3600 |
| Error Rate % | Gauge | sum(rate(...{status=~"5.."})) / sum(rate(...)) * 100 |
| API Latency P95 | Stat | histogram_quantile(0.95, ...) |
| Request Rate | Time series | rate(swarm_api_requests_total[5m]) |
| VM Boot Times | Time series | histogram_quantile(0.5/0.95/0.99, ...) |

### 4.2 Agent Performance Dashboard
**Audience:** Engineering team, optimization

| Panel | Type | Query |
|-------|------|-------|
| Execution Success Rate | Gauge | sum(...{status="success"}) / sum(...) * 100 |
| Avg Execution Time | Stat | avg(swarm_ticket_duration_seconds) |
| Token Usage | Time series | rate(swarm_claude_api_tokens[1h]) |
| Cost Accumulation | Time series | sum(swarm_claude_api_cost_usd) by (model) |
| Executions by Type | Bar chart | sum by (agent_type) |

### 4.3 VM Health Dashboard
**Audience:** Infrastructure team

| Panel | Type | Query |
|-------|------|-------|
| VM Lifecycle | State timeline | swarm_vms_total by status |
| Boot Time Distribution | Histogram | swarm_vm_boot_duration_ms |
| Restore vs Cold Boot | Pie | sum by (method) |
| Failed Spawns | Alert list | rate(...{status="failed"}) |

### 4.4 Ticket Pipeline Dashboard
**Audience:** Product/Engineering

| Panel | Type | Query |
|-------|------|-------|
| Queue Depth | Time series | swarm_queue_depth by status |
| Time in Status | Heatmap | swarm_ticket_duration_seconds |
| Throughput | Stat | rate(swarm_tickets_total{status="completed"}[1h]) |
| Backlog Trend | Time series | swarm_queue_depth{status="pending"} |

---

## Instructions

1. **Read current design state:**
   ```bash
   ssh -i ~/.ssh/swarm_key root@146.190.35.235 \
     "tail -50 /opt/swarm-specs/design-docs/observability/design.md"
   ```

2. **Create dashboard directory:**
   ```bash
   mkdir -p /opt/swarm-specs/design-docs/observability/dashboards
   ```

3. **Design each dashboard** as valid Grafana JSON with:
   - Proper panel layout (grid positions)
   - PromQL queries referencing Phase 2 metrics
   - Appropriate visualization types
   - Reasonable refresh intervals

4. **Append Phase 4 section** to design.md

5. **Update session notes** and commit:
   ```bash
   cd /opt/swarm-specs && git add -A && \
     git commit -m 'observability: Phase 4 Dashboards complete' && git push
   ```

---

## Success Criteria

- [ ] 4 dashboard JSON files created
- [ ] All Phase 2 metrics utilized
- [ ] PromQL queries are syntactically correct
- [ ] Grafana provisioning instructions included
- [ ] Design.md updated with Phase 4 section
- [ ] Session notes checkpointed
- [ ] Git committed and pushed

---

## Remaining After Phase 4

**Phase 5: Alerting** (~1 session)
- Prometheus alerting rules (8 alerts)
- Alertmanager configuration
- Runbook documentation
