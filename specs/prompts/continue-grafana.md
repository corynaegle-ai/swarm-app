# Continue: Grafana Dashboard Setup

## Context

Continuing Grafana implementation for Swarm Platform metrics visualization.

## Completed This Session

| Task | Status |
|------|--------|
| Install Prometheus | ✅ |
| Install Grafana | ✅ |
| Configure Prometheus to scrape `/metrics` | ✅ |
| Provision Prometheus datasource | ✅ |
| Create Swarm Platform dashboard JSON | ✅ |
| Deploy dashboard to Grafana | ✅ |
| Configure Grafana on port 3100 (3000 used by Swarm UI) | ✅ |

## Current State

| Component | URL | Status |
|-----------|-----|--------|
| Prometheus | http://134.199.235.140:9090 | Running, scraping swarm-platform |
| Grafana | http://134.199.235.140:3100 | Running, dashboard loaded |
| Swarm Metrics | http://134.199.235.140:8080/metrics | Exposing all metrics |

**Grafana Credentials**: admin / admin (default - CHANGE BEFORE PROD)

## Dashboard Panels Created

1. **Ticket States** - Stat panel showing Ready, In Progress, Completed, Failed counts
2. **Active VMs** - Gauge with thresholds (green < 5 < yellow < 10 < red)
3. **Error Rate** - Percentage with warning thresholds
4. **Memory Usage** - Time series of resident memory and heap
5. **CPU Usage Rate** - Time series of CPU consumption
6. **Event Loop Lag** - Stat with latency thresholds
7. **All Ticket States Over Time** - Stacked bar chart of all states
8. **Open File Descriptors** - Stat panel

## Next Steps

1. **Verify datasource connectivity** - Check Prometheus datasource is working in Grafana
2. **Test dashboard in browser** - Access http://134.199.235.140:3100
3. **Change admin password** - Security before any external access
4. **Add alerting rules** (optional) - Configure alerts for:
   - Error rate > 25%
   - Tickets stuck in `in_progress` > 1 hour
   - VM count > threshold
5. **Update session notes** - Commit progress to git
6. **Update Caddy** (optional) - Add grafana.swarmstack.net subdomain

## Verification Commands

```bash
# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'

# Check Grafana datasources
curl -s -u admin:admin http://localhost:3100/api/datasources

# Check dashboard exists
curl -s -u admin:admin http://localhost:3100/api/search

# Test a metric query via Prometheus
curl -s 'http://localhost:9090/api/v1/query?query=swarm_tickets_total'
```

## Quick Reference

| Resource | Value |
|----------|-------|
| Dev droplet | 134.199.235.140 |
| Grafana port | 3100 |
| Prometheus port | 9090 |
| Grafana config | /etc/grafana/grafana.ini |
| Dashboard JSON | /var/lib/grafana/dashboards/swarm-platform.json |
| Prometheus config | /etc/prometheus/prometheus.yml |

---

**Resume by verifying the Grafana datasource and testing the dashboard in a browser.**
