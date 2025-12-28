# Migrate PROD to PostgreSQL

## Context

DEV environment (134.199.235.140) has been fully migrated to PostgreSQL and is running clean with no SQLite/getDb references. PROD (146.190.35.235) still needs the PostgreSQL migration applied.

## Pre-Migration Checklist

### 1. Verify PostgreSQL is installed on PROD
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "which psql && psql --version"
```

### 2. Check if PostgreSQL service is running
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "systemctl status postgresql"
```

### 3. Check if swarmdb database exists
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sudo -u postgres psql -c '\\l' | grep swarmdb"
```

## Migration Steps

### Step 1: Install PostgreSQL (if not installed)
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "apt update && apt install -y postgresql postgresql-contrib"
```

### Step 2: Create database and user
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sudo -u postgres psql << 'EOF'
CREATE USER swarm WITH PASSWORD 'swarm_prod_2024';
CREATE DATABASE swarmdb OWNER swarm;
GRANT ALL PRIVILEGES ON DATABASE swarmdb TO swarm;
\\c swarmdb
GRANT ALL ON SCHEMA public TO swarm;
EOF"
```

### Step 3: Pull latest swarm-platform code
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "cd /opt/swarm-platform && git pull origin main"
```

### Step 4: Set environment variables in PM2
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/root/.nvm/versions/node/v22.12.0/bin:\$PATH && cd /opt/swarm-platform && cat > .env << 'EOF'
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=swarmdb
PG_USER=swarm
PG_PASSWORD=swarm_prod_2024
JWT_SECRET=prod-jwt-secret-change-this
EOF"
```

### Step 5: Initialize database schema
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/root/.nvm/versions/node/v22.12.0/bin:\$PATH && cd /opt/swarm-platform && node init-swarm-db.js"
```

### Step 6: Seed initial data (users, etc.)
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/root/.nvm/versions/node/v22.12.0/bin:\$PATH && cd /opt/swarm-platform && node seed-pg.js"
```

### Step 7: Restart swarm-platform
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/root/.nvm/versions/node/v22.12.0/bin:\$PATH && pm2 restart swarm-platform"
```

### Step 8: Verify clean startup
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/root/.nvm/versions/node/v22.12.0/bin:\$PATH && pm2 flush swarm-platform && pm2 restart swarm-platform && sleep 3 && pm2 logs swarm-platform --lines 20 --nostream"
```

Expected output:
```
PostgreSQL client connected
PostgreSQL connected successfully
Swarm Platform running on port 8080
```

No `DEPRECATED: getDb() called` warnings should appear.

## Post-Migration Verification

### Test authentication
```bash
curl -X POST https://api.swarmstack.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}'
```

### Test health endpoint
```bash
curl https://api.swarmstack.net/health
```

### Check database connectivity
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sudo -u postgres psql -d swarmdb -c 'SELECT COUNT(*) FROM users;'"
```

## Rollback Plan

If migration fails, restore SQLite operation:

```bash
# Revert to pre-PostgreSQL commit
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "cd /opt/swarm-platform && git checkout 6a4581b && pm2 restart swarm-platform"
```

## Environment Reference

| Environment | Droplet IP | Node Path | Database |
|-------------|------------|-----------|----------|
| DEV | 134.199.235.140 | /root/.nvm/versions/node/v22.21.1/bin | PostgreSQL ✅ |
| PROD | 146.190.35.235 | /root/.nvm/versions/node/v22.12.0/bin | SQLite → PostgreSQL |

## Important Notes

1. **NEVER deploy directly to PROD** - Always test on DEV first
2. **Backup SQLite before migration** - `cp /opt/swarm-platform/data/swarm.db /opt/swarm-platform/data/swarm.db.backup`
3. **PROD uses different node path** than DEV - v22.12.0 vs v22.21.1
4. **COOKIE_DOMAIN** - PROD uses default `.swarmstack.net`, no env var needed

## Data Migration (Optional)

If you need to migrate existing SQLite data to PostgreSQL:

```bash
# Export from SQLite
sqlite3 /opt/swarm-platform/data/swarm.db ".dump users" > users_dump.sql

# Transform SQLite syntax to PostgreSQL (manual review needed)
# Then import to PostgreSQL
psql -U swarm -d swarmdb -f users_dump.sql
```

For fresh PROD deployment, use seed-pg.js to create initial admin user instead.
