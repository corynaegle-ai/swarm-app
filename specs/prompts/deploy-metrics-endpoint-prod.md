# Deploy Metrics Endpoint to Production

## Context

Grafana and Prometheus are running on prod but the `/metrics` endpoint is not exposed on swarm-platform. This prompt completes the monitoring stack deployment.

## Pre-Deployment Status

| Component | Status |
|-----------|--------|
| Prometheus | ✅ Running, 3 targets healthy |
| Grafana | ✅ Running v12.3.1 |
| Dashboard UI | ✅ Rebuilt and serving |
| /metrics endpoint | ❌ Returns 404 |
| Grafana admin password | ❌ Still default (admin/admin) |
| Metrics sidebar link | ⏳ Needs verification |

## Deployment Steps

### 1. Check Dev Implementation

First, verify how metrics are implemented on dev droplet:

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Check if metrics endpoint works on dev
curl -s http://localhost:8080/metrics | head -20

# Find metrics middleware implementation
grep -r "metrics" /opt/swarm-app/apps/platform/src --include="*.ts" | head -10
```

### 2. Query RAG for Metrics Implementation

```bash
# On dev droplet - find relevant code patterns
curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "prometheus metrics endpoint middleware"}' | head -50
```

### 3. Pull Latest Code on Prod

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH

cd /opt/swarm-app && git pull
```

### 4. Verify Metrics Middleware Exists

```bash
# Check for metrics route in platform
grep -r "metrics" /opt/swarm-app/apps/platform/src --include="*.ts" | head -10

# Check package.json for prom-client
grep "prom-client" /opt/swarm-app/apps/platform/package.json
```

### 5. Install prom-client (if missing)

```bash
cd /opt/swarm-app/apps/platform
npm install prom-client
```

### 6. Rebuild and Restart Platform

```bash
cd /opt/swarm-app/apps/platform
npm run build
pm2 restart swarm-platform
```

### 7. Verify Metrics Endpoint

```bash
# Test metrics endpoint
curl -s http://localhost:8080/metrics | head -30

# Check Prometheus is scraping
curl -s http://localhost:9090/api/v1/targets | grep -A5 "swarm-platform"

# Query a metric
curl -s 'http://localhost:9090/api/v1/query?query=up{job="swarm-platform"}'
```

### 8. Change Grafana Admin Password

```bash
# Reset admin password via CLI
grafana-cli admin reset-admin-password <NEW_SECURE_PASSWORD>

# Or via API (while still using default creds)
curl -X PUT -H "Content-Type: application/json" \
  -d '{"oldPassword":"admin","newPassword":"<NEW_SECURE_PASSWORD>"}' \
  http://admin:admin@localhost:3100/api/user/password
```

**Store new password securely** - add to secrets management or password manager.

### 9. Verify Metrics Sidebar Menu Item

```bash
# Check the sidebar component has Metrics link
grep -A5 "Metrics" /opt/swarm-app/apps/dashboard/src/components/Sidebar.tsx

# Verify link target
grep -B2 -A2 "grafana" /opt/swarm-app/apps/dashboard/src/components/Sidebar.tsx
```

Then manually test:
1. Open https://dashboard.swarmstack.net
2. Login with test credentials
3. Click "Metrics" in sidebar
4. Verify it opens https://dashboard.swarmstack.net/grafana/ in new tab

## Verification Commands

```bash
# All-in-one health check
echo "=== Metrics Endpoint ===" && \
curl -s http://localhost:8080/metrics | head -5 && \
echo -e "\n=== Prometheus Targets ===" && \
curl -s http://localhost:9090/api/v1/targets | grep -o '"health":"[^"]*"' && \
echo -e "\n=== Grafana Health ===" && \
curl -s http://localhost:3100/api/health && \
echo -e "\n=== Sample Query ===" && \
curl -s 'http://localhost:9090/api/v1/query?query=up' | head -20
```

## Expected Metrics Format

After implementation, `/metrics` should return Prometheus format:

```
# HELP swarm_http_requests_total Total HTTP requests
# TYPE swarm_http_requests_total counter
swarm_http_requests_total{method="GET",path="/api/tickets",status="200"} 42

# HELP swarm_tickets_total Total tickets by status
# TYPE swarm_tickets_total gauge
swarm_tickets_total{status="pending"} 5
swarm_tickets_total{status="claimed"} 2
swarm_tickets_total{status="completed"} 10
```

## Troubleshooting

### Metrics endpoint still 404
```bash
# Check route registration
grep -r "app.get.*metrics" /opt/swarm-app/apps/platform/src

# Check if middleware is imported
grep -r "prom-client\|prometheus" /opt/swarm-app/apps/platform/src/index.ts
```

### Prometheus not scraping
```bash
# Check prometheus config
cat /etc/prometheus/prometheus.yml | grep -A10 "swarm-platform"

# Restart prometheus
systemctl restart prometheus
```

### Grafana password reset fails
```bash
# Check grafana service
systemctl status grafana-server

# View logs
journalctl -u grafana-server -n 50
```

## Quick Reference

| Resource | Value |
|----------|-------|
| Prod droplet | 146.190.35.235 |
| Dev droplet | 134.199.235.140 |
| SSH key | ~/.ssh/swarm_key |
| Node path (prod) | /root/.nvm/versions/node/v22.12.0/bin |
| Node path (dev) | /root/.nvm/versions/node/v22.21.1/bin |
| Grafana port | 3100 |
| Prometheus port | 9090 |
| Platform port | 8080 |

## Post-Deployment Checklist

- [ ] `/metrics` endpoint returns Prometheus format data
- [ ] Prometheus shows swarm-platform target as "up"
- [ ] Grafana admin password changed from default
- [ ] New password stored securely
- [ ] Metrics sidebar link opens Grafana in new tab
- [ ] Grafana dashboard panels show real data

---

**Execute each step sequentially, verifying before proceeding to the next.**
