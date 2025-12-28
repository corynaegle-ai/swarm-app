# Deploy Grafana to Production

## Context

Grafana + Prometheus monitoring stack has been tested on dev and is ready for production deployment.

## Pre-Deployment Status

| Component | Dev Status | Prod Status |
|-----------|------------|-------------|
| Prometheus | ✅ Running | ⏳ Pending |
| Grafana | ✅ Running | ⏳ Pending |
| Dashboard (8 panels) | ✅ Working | ⏳ Pending |
| Sidebar Menu Item | ✅ Deployed | ⏳ Pending |
| Caddy /grafana route | ✅ Configured | ⏳ Pending |

## Deployment Steps

### 1. Pull Latest Code on Prod

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH
cd /opt/swarm-app && git pull
cd /opt/swarm-specs && git pull
```

### 2. Install Prometheus + Grafana

```bash
# Add Grafana repo
wget -q -O /usr/share/keyrings/grafana.key https://apt.grafana.com/gpg.key
echo 'deb [signed-by=/usr/share/keyrings/grafana.key] https://apt.grafana.com stable main' > /etc/apt/sources.list.d/grafana.list

# Install packages
apt-get update
apt-get install -y prometheus grafana
```

### 3. Configure Prometheus

Add swarm-platform scrape job to /etc/prometheus/prometheus.yml:

```yaml
  - job_name: 'swarm-platform'
    scrape_interval: 10s
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
```

### 4. Configure Grafana

```bash
# Copy configs from swarm-specs
cp /opt/swarm-specs/infrastructure/grafana/datasource.yml /etc/grafana/provisioning/datasources/prometheus.yml
cp /opt/swarm-specs/infrastructure/grafana/dashboard-provider.yml /etc/grafana/provisioning/dashboards/default.yml
mkdir -p /var/lib/grafana/dashboards
cp /opt/swarm-specs/infrastructure/grafana/swarm-platform.json /var/lib/grafana/dashboards/
chown grafana:grafana /var/lib/grafana/dashboards/swarm-platform.json

# Update grafana.ini for production
sed -i 's/;http_port = 3000/http_port = 3100/' /etc/grafana/grafana.ini
sed -i 's|;root_url = %(protocol)s://%(domain)s:%(http_port)s/|root_url = https://dashboard.swarmstack.net/grafana/|' /etc/grafana/grafana.ini
sed -i 's|;serve_from_sub_path = false|serve_from_sub_path = true|' /etc/grafana/grafana.ini
```

### 5. Update Caddy for /grafana Route

Add to /etc/caddy/Caddyfile under dashboard.swarmstack.net block (right after opening brace):

```
	@grafana path /grafana /grafana/*
	handle @grafana {
		reverse_proxy localhost:3100
	}
```

### 6. Start Services

```bash
systemctl enable prometheus grafana-server
systemctl start prometheus grafana-server
systemctl reload caddy
```

### 7. Rebuild Dashboard UI

```bash
cd /opt/swarm-app/apps/dashboard
npm run build
pm2 restart swarm-dashboard  # Check actual PM2 process name with: pm2 list
```

## Verification Commands

```bash
# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | grep -o '"health":"[^"]*"'

# Check Grafana health
curl -s http://localhost:3100/api/health

# Check external access
curl -sI https://dashboard.swarmstack.net/grafana/login | head -5

# Check metrics being scraped
curl -s 'http://localhost:9090/api/v1/query?query=swarm_tickets_total' | head -20
```

## Post-Deployment Tasks

1. **Change Grafana admin password** - Login with admin/admin, set secure password
2. **Verify dashboard panels** - Check all 8 panels show data
3. **Test Metrics menu item** - Click from sidebar, should open Grafana in new tab

## Expected URLs

| Resource | URL |
|----------|-----|
| Production Dashboard | https://dashboard.swarmstack.net |
| Production Grafana | https://dashboard.swarmstack.net/grafana/ |
| Prometheus (internal) | http://localhost:9090 |

## Rollback

If issues occur:
```bash
systemctl stop prometheus grafana-server
systemctl disable prometheus grafana-server
# Remove /grafana route from Caddyfile
systemctl reload caddy
```

## Quick Reference

| Resource | Value |
|----------|-------|
| Prod droplet | 146.190.35.235 |
| SSH key | ~/.ssh/swarm_key |
| Node path (prod) | /root/.nvm/versions/node/v22.12.0/bin |
| Grafana port | 3100 |
| Prometheus port | 9090 |
| Default creds | admin / admin |

---

**Execute each step sequentially, verifying before proceeding to the next.**
