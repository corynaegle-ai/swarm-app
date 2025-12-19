# Convex Self-Hosted Installation Guide

> **Status**: ✅ Successfully installed on DEV droplet (134.199.235.140)
> **Date**: December 18, 2024
> **Volume**: `/mnt/swarm_dev_convex` (100GB dedicated)

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Critical Configuration Discoveries](#critical-configuration-discoveries)
4. [Installation Steps](#installation-steps)
5. [Configuration Files](#configuration-files)
6. [PostgreSQL Setup](#postgresql-setup)
7. [Verification](#verification)
8. [Admin Key Generation](#admin-key-generation)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEV Droplet (134.199.235.140)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PRODUCTION (Express)              PARALLEL (Convex)            │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │ swarm-platform   │              │ convex-backend   │         │
│  │ :8080            │              │ :3210 (API)      │         │
│  │                  │              │ :3211 (HTTP)     │         │
│  └────────┬─────────┘              └────────┬─────────┘         │
│           │                                 │                   │
│           │         ┌──────────────────┐    │                   │
│           │         │ convex-dashboard │    │                   │
│           │         │ :6791            │    │                   │
│           │         └────────┬─────────┘    │                   │
│           │                  │              │                   │
│           └──────────┬───────┴──────────────┘                   │
│                      ▼                                          │
│           ┌──────────────────┐                                  │
│           │   PostgreSQL     │                                  │
│           │   :5432          │                                  │
│           │                  │                                  │
│           │ ┌──────────────┐ │                                  │
│           │ │   swarmdb    │ │ ← Express tables                 │
│           │ └──────────────┘ │                                  │
│           │ ┌──────────────┐ │                                  │
│           │ │convex_self_  │ │ ← Convex tables (separate)       │
│           │ │   hosted     │ │                                  │
│           │ └──────────────┘ │                                  │
│           └──────────────────┘                                  │
│                                                                 │
│  STORAGE                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ /mnt/swarm_dev_convex (100GB)                            │   │
│  │ └── /opt/convex (symlink)                                │   │
│  │     ├── data/           ← Convex internal data           │   │
│  │     ├── storage/        ← File storage                   │   │
│  │     ├── logs/           ← Application logs               │   │
│  │     ├── backups/        ← Backup files                   │   │
│  │     ├── docker-compose.yml                               │   │
│  │     └── .env            ← INSTANCE_SECRET                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

### System Requirements
- Docker and Docker Compose installed
- PostgreSQL 16+ running
- Dedicated storage volume (recommended 100GB+)
- Network access between Docker containers and PostgreSQL

### Required Ports
| Port | Service | Purpose |
|------|---------|---------|
| 3210 | Convex Backend | API endpoint |
| 3211 | Convex Backend | HTTP actions/site proxy |
| 6791 | Convex Dashboard | Admin UI |
| 5432 | PostgreSQL | Database |

---

## Critical Configuration Discoveries

> ⚠️ **READ THIS SECTION CAREFULLY** - These discoveries took significant debugging time.

### 1. INSTANCE_NAME Derives Database Name

**The INSTANCE_NAME environment variable determines which PostgreSQL database Convex connects to.**

```
INSTANCE_NAME=swarm-dev       → connects to database "swarm_dev"
INSTANCE_NAME=convex-self-hosted → connects to database "convex_self_hosted"
INSTANCE_NAME=my-app          → connects to database "my_app"
```

The convention:
- Hyphens (`-`) are replaced with underscores (`_`)
- Convex expects this database to exist
- **The standard/recommended name is `convex-self-hosted`** which maps to `convex_self_hosted`

### 2. POSTGRES_URL Format

**DO NOT include the database name in the URL.** Convex derives it from INSTANCE_NAME.

```bash
# ❌ WRONG - includes database name
POSTGRES_URL=postgresql://swarm:password@host:5432/swarmdb

# ❌ WRONG - includes database name
POSTGRES_URL=postgresql://swarm:password@host:5432/convex_self_hosted

# ✅ CORRECT - no database name, just host:port
POSTGRES_URL=postgresql://swarm:password@host:5432?sslmode=disable
```

### 3. SSL/TLS Configuration

For local PostgreSQL without SSL certificates:
```bash
# Add sslmode=disable to avoid TLS handshake errors
POSTGRES_URL=postgresql://user:pass@host:5432?sslmode=disable

# Also set this environment variable
DO_NOT_REQUIRE_SSL=true
```

### 4. Password URL Encoding

Passwords with special characters can cause parsing issues:
```bash
# ❌ May cause issues - underscore parsed as delimiter
POSTGRES_URL=postgresql://swarm:swarm_dev_2024@host:5432

# ✅ Use simple alphanumeric passwords
POSTGRES_URL=postgresql://swarm:convexpass123@host:5432
```

### 5. Docker-to-Host Networking

For containers to reach host PostgreSQL:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Then use `host.docker.internal` instead of `localhost` or `127.0.0.1`.

---

## Installation Steps

### Step 1: Create Directory Structure

```bash
# Create dedicated volume mount point (if not exists)
# This should be a mounted volume for persistence
mkdir -p /mnt/swarm_dev_convex/{data,storage,logs,backups,config}

# Create symlink for convenient access
ln -s /mnt/swarm_dev_convex /opt/convex

# Verify
ls -la /opt/convex
```

### Step 2: Configure PostgreSQL

```bash
# 1. Create the convex_self_hosted database
sudo -u postgres psql -c "CREATE DATABASE convex_self_hosted OWNER swarm;"

# 2. Create/update user password (use simple password)
sudo -u postgres psql -c "ALTER USER swarm WITH PASSWORD 'convexpass123';"

# 3. Allow Docker network connections
echo 'host    all    all    172.17.0.0/16    scram-sha-256' >> /etc/postgresql/16/main/pg_hba.conf

# 4. Listen on all interfaces
sed -i "s/listen_addresses = .*/listen_addresses = '*'/" /etc/postgresql/16/main/postgresql.conf

# 5. Restart PostgreSQL
systemctl restart postgresql

# 6. Verify connection
PGPASSWORD=convexpass123 psql -h 127.0.0.1 -U swarm -d convex_self_hosted -c 'SELECT 1;'
```

### Step 3: Generate Instance Secret

```bash
# Generate a random 32-byte hex secret
INSTANCE_SECRET=$(openssl rand -hex 32)
echo "INSTANCE_SECRET=$INSTANCE_SECRET" > /opt/convex/.env
chmod 600 /opt/convex/.env

# Verify
cat /opt/convex/.env
```

### Step 4: Create Docker Compose File

```bash
cat > /opt/convex/docker-compose.yml << 'EOF'
services:
  backend:
    image: ghcr.io/get-convex/convex-backend:latest
    container_name: convex-backend
    stop_grace_period: 10s
    stop_signal: SIGINT
    restart: unless-stopped
    ports:
      - "3210:3210"
      - "3211:3211"
    volumes:
      - /mnt/swarm_dev_convex/data:/convex/data
    environment:
      - INSTANCE_NAME=convex-self-hosted
      - INSTANCE_SECRET=${INSTANCE_SECRET}
      - CONVEX_CLOUD_ORIGIN=http://127.0.0.1:3210
      - CONVEX_SITE_ORIGIN=http://127.0.0.1:3211
      - POSTGRES_URL=postgresql://swarm:convexpass123@host.docker.internal:5432?sslmode=disable
      - DO_NOT_REQUIRE_SSL=true
      - RUST_LOG=info
      - DOCUMENT_RETENTION_DELAY=172800
      - DISABLE_BEACON=true
      - REDACT_LOGS_TO_CLIENT=false
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: curl -f http://localhost:3210/version || exit 1
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  dashboard:
    image: ghcr.io/get-convex/convex-dashboard:latest
    container_name: convex-dashboard
    stop_grace_period: 10s
    stop_signal: SIGINT
    restart: unless-stopped
    ports:
      - "6791:6791"
    environment:
      - NEXT_PUBLIC_DEPLOYMENT_URL=http://127.0.0.1:3210
    depends_on:
      backend:
        condition: service_healthy
EOF
```

### Step 5: Pull Images and Start

```bash
cd /opt/convex

# Pull latest images
docker pull ghcr.io/get-convex/convex-backend:latest
docker pull ghcr.io/get-convex/convex-dashboard:latest

# Start services
docker compose up -d

# Check status
docker ps | grep convex
```

---

## Configuration Files

### /opt/convex/.env
```bash
INSTANCE_SECRET=<32-byte-hex-string>
```

### /opt/convex/docker-compose.yml
See Step 4 above for complete file.

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `INSTANCE_NAME` | Yes | Derives database name (use `convex-self-hosted`) |
| `INSTANCE_SECRET` | Yes | 32-byte hex secret for encryption |
| `POSTGRES_URL` | Yes | PostgreSQL connection (NO database name) |
| `CONVEX_CLOUD_ORIGIN` | Yes | URL where backend API is accessible |
| `CONVEX_SITE_ORIGIN` | Yes | URL where HTTP actions are accessible |
| `DO_NOT_REQUIRE_SSL` | No | Set `true` for local PostgreSQL |
| `DISABLE_BEACON` | No | Set `true` to disable telemetry |
| `RUST_LOG` | No | Log level (info, debug, error) |
| `DOCUMENT_RETENTION_DELAY` | No | Document retention in seconds (default 172800 = 2 days) |
| `REDACT_LOGS_TO_CLIENT` | No | Redact PII from logs |

---

## PostgreSQL Setup

### Database Schema

Convex creates its own tables in the `convex_self_hosted` database. These are internal to Convex and should not be modified directly.

### Connection Configuration

**pg_hba.conf additions:**
```
# Allow Docker bridge network
host    all    all    172.17.0.0/16    scram-sha-256

# Allow all Docker networks (if using custom networks)
host    all    all    172.0.0.0/8      scram-sha-256
```

**postgresql.conf:**
```
listen_addresses = '*'
```

### User Permissions

```sql
-- Create user if needed
CREATE USER swarm WITH PASSWORD 'convexpass123';

-- Create database
CREATE DATABASE convex_self_hosted OWNER swarm;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE convex_self_hosted TO swarm;
```

---

## Verification

### Check Container Status
```bash
docker ps | grep convex
# Should show both convex-backend (healthy) and convex-dashboard
```

### Test API Endpoint
```bash
curl http://localhost:3210/version
# Returns: unknown (this is expected for fresh install)
```

### Test Dashboard
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:6791
# Should return: 200
```

### Check Logs
```bash
# Backend logs
docker logs convex-backend 2>&1 | tail -50

# Look for:
# - "Connected to Postgres" message
# - "backend listening on 0.0.0.0:3210"
# - No ERROR lines about database connection
```

### Verify PostgreSQL Connection
```bash
# Check Convex tables were created
PGPASSWORD=convexpass123 psql -h 127.0.0.1 -U swarm -d convex_self_hosted -c '\dt'
```

---

## Admin Key Generation

The admin key is required to deploy Convex functions and access the dashboard.

```bash
# Generate admin key
docker exec convex-backend ./generate_admin_key.sh

# Output will look like:
# convex-self-hosted|01c046ab1512d9306a6abda3eedec5dfe862f1fe0f66a5aee774fb9ae3fda87706facaf682b9d4f9209a05e038cbd6e9b8

# Save this key securely!
echo "CONVEX_ADMIN_KEY=<generated-key>" >> /opt/convex/.env
```

### Using the Admin Key

**Dashboard Login:**
1. Navigate to http://localhost:6791
2. Enter the admin key when prompted

**CLI Configuration:**
```bash
# In your Convex project
export CONVEX_SELF_HOSTED_URL=http://localhost:3210
export CONVEX_SELF_HOSTED_ADMIN_KEY=<your-admin-key>

# Or in .env.local
CONVEX_SELF_HOSTED_URL=http://localhost:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<your-admin-key>
```

---

## Troubleshooting

### Error: "cluster url already contains db name"
**Cause:** Database name included in POSTGRES_URL
**Solution:** Remove database name from URL
```bash
# Wrong
POSTGRES_URL=postgresql://user:pass@host:5432/dbname

# Correct
POSTGRES_URL=postgresql://user:pass@host:5432?sslmode=disable
```

### Error: "TLS handshake: invalid peer certificate"
**Cause:** PostgreSQL doesn't have valid SSL certificate
**Solution:** Disable SSL requirement
```bash
POSTGRES_URL=postgresql://user:pass@host:5432?sslmode=disable
DO_NOT_REQUIRE_SSL=true
```

### Error: "database X does not exist"
**Cause:** INSTANCE_NAME doesn't match existing database
**Solution:** Either create the database or change INSTANCE_NAME
```bash
# Option 1: Create database (name derived from INSTANCE_NAME)
sudo -u postgres psql -c "CREATE DATABASE convex_self_hosted;"

# Option 2: Use standard INSTANCE_NAME
INSTANCE_NAME=convex-self-hosted
```

### Error: "connection refused" to PostgreSQL
**Cause:** PostgreSQL not listening on Docker network
**Solution:**
1. Check `listen_addresses = '*'` in postgresql.conf
2. Add Docker network to pg_hba.conf
3. Restart PostgreSQL
4. Use `host.docker.internal` not `localhost`

### Container keeps restarting
```bash
# Check logs for specific error
docker logs convex-backend 2>&1 | grep -i error

# Common causes:
# - Wrong POSTGRES_URL format
# - Database doesn't exist
# - Network connectivity issues
```

---

## Production Deployment

### Nginx Configuration (Prepared but not activated)

Create `/etc/nginx/sites-available/convex.dev.swarmstack.net`:
```nginx
server {
    listen 80;
    server_name convex.dev.swarmstack.net;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name convex.dev.swarmstack.net;

    ssl_certificate /etc/letsencrypt/live/dev.swarmstack.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.swarmstack.net/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Update CONVEX_CLOUD_ORIGIN for Production
```yaml
environment:
  - CONVEX_CLOUD_ORIGIN=https://convex.dev.swarmstack.net
  - CONVEX_SITE_ORIGIN=https://convex-http.dev.swarmstack.net
```

### Security Checklist
- [ ] Change default passwords
- [ ] Restrict dashboard access (IP whitelist or VPN)
- [ ] Enable SSL for PostgreSQL in production
- [ ] Set up backup automation
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting

---

## Current DEV Installation Details

| Item | Value |
|------|-------|
| Droplet IP | 134.199.235.140 |
| Volume | /mnt/swarm_dev_convex (100GB) |
| Config Path | /opt/convex (symlink) |
| Backend Port | 3210 |
| HTTP Port | 3211 |
| Dashboard Port | 6791 |
| PostgreSQL Database | convex_self_hosted |
| PostgreSQL User | swarm |
| PostgreSQL Password | convexpass123 |
| INSTANCE_NAME | convex-self-hosted |
| INSTANCE_SECRET | (in /opt/convex/.env) |

### Quick Commands
```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Check status
docker ps | grep convex

# View logs
docker logs convex-backend 2>&1 | tail -50

# Restart services
cd /opt/convex && docker compose restart

# Stop services
cd /opt/convex && docker compose down

# Start services
cd /opt/convex && docker compose up -d
```

---

## References

- [Convex Self-Hosting Guide](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md)
- [Convex + Neon Integration](https://neon.com/guides/convex-neon)
- [Convex Docker Compose](https://github.com/get-convex/convex-backend/blob/main/self-hosted/docker/docker-compose.yml)
- [Convex Self-Hosting Blog](https://stack.convex.dev/self-hosted-develop-and-deploy)
