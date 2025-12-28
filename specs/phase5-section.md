## Phase 5: Alerting

**Status:** ✅ Design Complete  
**Created:** 2025-12-15

### 5.1 Alert Overview

| Alert | Condition | Severity | Team |
|-------|-----------|----------|------|
| SwarmHighErrorRate | API 5xx > 5% for 5m | Critical | Platform |
| SwarmClaudeAPIDown | No API calls for 5m while VMs active | Critical | Platform |
| SwarmVMBootSlow | P95 boot > 100ms for 5m | Warning | Infrastructure |
| SwarmNoActiveVMs | Active VMs = 0 for 5m | Critical | Infrastructure |
| SwarmAgentSuccessLow | Success rate < 90% for 15m | Critical | Engineering |
| SwarmTicketQueueBacklog | Pending > 100 for 15m | Warning | Platform |
| SwarmTicketStuck | In progress > 1 hour | Warning | Engineering |
| SwarmCostSpike | Hourly cost > $10/hour | Warning | Platform |

### 5.2 File Structure

```
/opt/swarm-specs/design-docs/observability/alerting/
├── swarm-alerts.yaml      # Prometheus alerting rules
├── alertmanager.yaml      # Alertmanager configuration
├── slack.tmpl             # Slack notification templates
└── runbooks.md            # Operational runbooks
```

### 5.3 Notification Channels

| Channel | Severity | Response Time |
|---------|----------|---------------|
| #swarm-critical (Slack) | Critical | Immediate |
| #swarm-alerts (Slack) | All | 5 min group |
| PagerDuty | Critical | On-call page |
| Team channels | By team label | 5 min group |

### 5.4 Inhibition Rules

1. **SwarmNoActiveVMs** suppresses all SwarmVM* alerts
2. **SwarmClaudeAPIDown** suppresses SwarmAgent* and SwarmTicket* alerts
3. Critical alerts suppress related warnings (same alertname)

### 5.5 Recording Rules

Pre-computed metrics for dashboard efficiency:

| Rule | Expression |
|------|------------|
| swarm:error_rate:5m | 5xx / total requests |
| swarm:agent_success_rate:15m | success / total operations |
| swarm:vm_boot_p95:5m | P95 boot duration |
| swarm:tickets_per_hour:1h | Completed tickets per hour |

### 5.6 Deployment

```yaml
# docker-compose addition for alerting
services:
  alertmanager:
    image: prom/alertmanager:v0.26.0
    volumes:
      - ./alerting/alertmanager.yaml:/etc/alertmanager/alertmanager.yaml
      - ./alerting/slack.tmpl:/etc/alertmanager/templates/slack.tmpl
    environment:
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
      - PAGERDUTY_SERVICE_KEY=${PAGERDUTY_SERVICE_KEY}
    ports:
      - "9093:9093"
```

