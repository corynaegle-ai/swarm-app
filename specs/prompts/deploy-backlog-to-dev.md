# Deploy Backlog System to DEV

## Context
Deploy the new backlog system to the DEV droplet (134.199.235.140). The backlog provides lightweight idea capture before HITL sessions with ZERO breaking changes to existing workflows.

## Source Files (in git)
- `swarm-specs` repo: `migrations/2024_12_23_001_create_backlog_items.sql`
- `swarm-specs` repo: `implementations/backlog-routes.js`

## Target Locations
- Migration: Run against PostgreSQL `swarmdb`
- Routes: `/opt/swarm-platform/routes/backlog.js`
- Server: Add route to `/opt/swarm-platform/server.js`

---

## Deployment Steps

### Step 1: Pull latest specs on droplet
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

cd /opt/swarm-specs && git pull origin main
```

### Step 2: Run database migration
```bash
cd /opt/swarm-specs
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -f migrations/2024_12_23_001_create_backlog_items.sql
```

**Verify migration:**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "\d backlog_items" | head -20
```

### Step 3: Copy routes file to platform
```bash
cp /opt/swarm-specs/implementations/backlog-routes.js /opt/swarm-platform/routes/backlog.js
```

### Step 4: Add route to server.js
Find the routes section in `/opt/swarm-platform/server.js` and add:
```javascript
app.use('/api/backlog', require('./routes/backlog'));
```

**Use sed or manual edit** - place after other route declarations like:
```bash
# Check current routes
grep "app.use('/api" /opt/swarm-platform/server.js

# Add backlog route (after hitl route)
sed -i "/app.use('\/api\/hitl'/a app.use('/api/backlog', require('./routes/backlog'));" /opt/swarm-platform/server.js
```

### Step 5: Add WebSocket room broadcast helper (if needed)
Check if `broadcast.toRoom` exists in `/opt/swarm-platform/websocket.js`. If not, the routes will need adjustment to use existing broadcast methods.

### Step 6: Restart platform service
```bash
cd /opt/swarm-platform
pm2 restart swarm-platform
pm2 logs swarm-platform --lines 20
```

### Step 7: Verify deployment
```bash
# Test API endpoint
curl -s http://localhost:3000/api/backlog -H "Authorization: Bearer <test-token>" | head -5

# Check for errors
pm2 logs swarm-platform --lines 50 | grep -i error
```

---

## Rollback (if needed)
```bash
# Remove route from server.js
sed -i "/app.use('\/api\/backlog'/d" /opt/swarm-platform/server.js

# Drop table (CAUTION: loses data)
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "DROP TABLE IF EXISTS backlog_items;"

# Remove columns from hitl_sessions
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "ALTER TABLE hitl_sessions DROP COLUMN IF EXISTS source_type, DROP COLUMN IF EXISTS backlog_item_id;"

# Restart
pm2 restart swarm-platform
```

---

## Breaking Changes: NONE
- New table `backlog_items` - no existing data affected
- New columns on `hitl_sessions` have defaults - existing sessions unaffected
- New API routes - no changes to existing `/api/hitl/*` endpoints
- Existing HITL workflow unchanged - backlog is parallel entry point

## Dependencies
- PostgreSQL connection: `swarm_dev_2024` password
- Node path: `/root/.nvm/versions/node/v22.21.1/bin`
- Platform location: `/opt/swarm-platform`
- Specs repo: `/opt/swarm-specs`
