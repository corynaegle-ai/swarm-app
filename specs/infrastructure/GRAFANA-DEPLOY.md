# Grafana + Prometheus Production Deployment

## Prerequisites

Production droplet: 146.190.35.235

## Installation Steps

### 1. Install Prometheus and Grafana

```bash
# Add Grafana repo
wget -q -O /usr/share/keyrings/grafana.key https://apt.grafana.com/gpg.key
echo 'deb [signed-by=/usr/share/keyrings/grafana.key] https://apt.grafana.com stable main' | tee /etc/apt/sources.list.d/grafana.list

# Install
apt-get update
apt-get install -y prometheus grafana
```

### 2. Copy Configuration Files

```bash
# From dev droplet or this repo:
cp prometheus.yml /etc/prometheus/prometheus.yml
cp grafana/grafana.ini /etc/grafana/grafana.ini
cp grafana/datasource.yml /etc/grafana/provisioning/datasources/prometheus.yml
cp grafana/dashboard-provider.yml /etc/grafana/provisioning/dashboards/default.yml
mkdir -p /var/lib/grafana/dashboards
cp grafana/swarm-platform.json /var/lib/grafana/dashboards/
chown grafana:grafana /var/lib/grafana/dashboards/swarm-platform.json
```

### 3. Update Grafana Config for Production

Edit /etc/grafana/grafana.ini:
```ini
root_url = https://dashboard.swarmstack.net/grafana/
```

### 4. Update Caddy Config

Add to /etc/caddy/Caddyfile under dashboard.swarmstack.net:
```
@grafana path /grafana /grafana/*
handle @grafana {
    reverse_proxy localhost:3100
}
```

### 5. Start Services

```bash
systemctl enable prometheus grafana-server
systemctl start prometheus grafana-server
systemctl reload caddy
```

### 6. Change Admin Password

Login to Grafana and change default password from admin/admin.

## Verification

```bash
curl -s http://localhost:9090/api/v1/targets | grep health
curl -s http://localhost:3100/api/health
curl -s https://dashboard.swarmstack.net/grafana/api/health
```

## Access URLs

- Production: https://dashboard.swarmstack.net/grafana/
- Dev: https://dashboard.dev.swarmstack.net/grafana/
