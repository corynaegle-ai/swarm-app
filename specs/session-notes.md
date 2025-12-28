# Swarm Development - Session Notes

---

## ⚙️ PERSISTENT INSTRUCTIONS (DO NOT ARCHIVE)

### Quick Reference

| Resource | Location |
|----------|----------|
| **Droplet** | `ssh -i ~/.ssh/swarm_key root@146.190.35.235` |
| **Tickets DB** | `/opt/swarm-platform/data/swarm.db` |
| **Registry DB** | `/opt/swarm-registry/registry.db` |
| **Platform** | `/opt/swarm-platform` (PM2: swarm-platform) |
| **Verifier** | `/opt/swarm-verifier` (PM2: swarm-verifier, port 8090) |
| **Specs Repo** | `/opt/swarm-specs` → `corynaegle-ai/swarm-specs` |

### SSH Template
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
```

### Dual Database Architecture
```
/opt/swarm-registry/registry.db    ← Execution telemetry
  • workflow_runs, step_executions
  • workflows, agents (definitions)

/opt/swarm-platform/data/swarm.db   ← Project management
  • tickets, projects, users, tenants
  • verification_attempts (verifier logging)
```

---

## 📝 LAST SESSION SUMMARY (2025-12-15)

**Observability Phase 5: Alerting - DESIGN COMPLETE ✅**

### Created Files
```
/opt/swarm-specs/design-docs/observability/alerting/
├── swarm-alerts.yaml    # 8 Prometheus alerting rules + 4 recording rules
├── alertmanager.yaml    # Routing, receivers, inhibition rules
├── slack.tmpl           # Slack notification templates
└── runbooks.md          # Operational runbooks for all 8 alerts
```

### Alert Summary
| Alert | Severity | Team |
|-------|----------|------|
| SwarmHighErrorRate | Critical | Platform |
| SwarmClaudeAPIDown | Critical | Platform |
| SwarmVMBootSlow | Warning | Infrastructure |
| SwarmNoActiveVMs | Critical | Infrastructure |
| SwarmAgentSuccessLow | Critical | Engineering |
| SwarmTicketQueueBacklog | Warning | Platform |
| SwarmTicketStuck | Warning | Engineering |
| SwarmCostSpike | Warning | Platform |

### Key Features
- Prometheus alerting rules with PromQL
- Alertmanager routing by severity and team
- Inhibition rules to prevent alert storms
- Recording rules for dashboard efficiency
- Comprehensive runbooks with diagnosis/resolution steps
- Slack + PagerDuty notification templates

---

## ✅ COMPLETED PHASES

### Verifier System
| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Service Scaffold | ✅ Complete |
| 2 | Static Analysis | ✅ Complete |
| 3 | Automated Tests | ✅ Complete |
| 4 | Git Integration | ✅ Complete |
| 5 | SENTINEL LLM Review | ✅ Complete |
| 6 | Database Logging | ✅ Complete |
| 7 | Agent Integration | ✅ Complete |
| 8 | Dashboard Verification UI | ✅ Complete |

### Observability Stack - ALL COMPLETE ✅
| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Structured Logging | ✅ Design Complete |
| 2 | Prometheus Metrics (12 metrics) | ✅ Design Complete |
| 3 | Distributed Tracing | ✅ Design Complete |
| 4 | Grafana Dashboards (4 dashboards) | ✅ Design Complete |
| 5 | Alerting (8 alerts + runbooks) | ✅ Design Complete |

---

## 📌 NEXT SESSION PRIORITIES

### Priority 1: HITL Phase 5 - Project Submission & Design Session UI
Complete the Human-in-the-Loop workflow for project creation.

### Priority 2: MCP Factory
Rapid Model Context Protocol server generation system.

### Priority 3: Observability Implementation
Begin implementing the completed observability designs into production.

---

## 📊 OBSERVABILITY DESIGN STATUS - COMPLETE ✅

**Design Doc:** `/opt/swarm-specs/design-docs/observability/design.md`

| Component | Status | Deliverables |
|-----------|--------|--------------|
| Logging (Phase 1) | ✅ Design | SwarmLogger, AsyncLocalStorage |
| Metrics (Phase 2) | ✅ Design | 12 Prometheus metrics |
| Tracing (Phase 3) | ✅ Design | AgentTracer, span hierarchy |
| Dashboards (Phase 4) | ✅ Design | 4 Grafana dashboards |
| Alerting (Phase 5) | ✅ Design | 8 alerts, runbooks, templates |

### File Summary
```
/opt/swarm-specs/design-docs/observability/
├── design.md                    # Main 3000+ line design doc
├── dashboards/
│   ├── system-overview.json     # Ops health check
│   ├── agent-performance.json   # Engineering metrics
│   ├── vm-health.json          # Infrastructure
│   └── ticket-pipeline.json    # Pipeline visibility
└── alerting/
    ├── swarm-alerts.yaml       # Prometheus rules
    ├── alertmanager.yaml       # Routing config
    ├── slack.tmpl              # Notification templates
    └── runbooks.md             # Operational procedures
```

