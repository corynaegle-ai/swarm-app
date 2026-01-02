# Continue: Bundle Pipeline Implementation

## Context
You are a master systems architect continuing work on Swarm Stack's multi-tenant workflow system. Previous sessions have completed MinIO setup and PostgreSQL schema. A gap was discovered: bundle routes exist but are NOT mounted in server.js.

## Status Summary (as of 2025-01-02)

| Task | Status | Next Action |
|------|--------|-------------|
| Task 1: MinIO | ✅ COMPLETE | - |
| Task 2: PostgreSQL | ✅ COMPLETE | - |
| Task 3: Bundle API | ⚠️ GAP FOUND | Mount routes in server.js |
| Task 4: Boot Script | ❌ NOT STARTED | Create bundle fetch logic |
| Task 5: Orchestrator | ❌ NOT STARTED | Pass bundle metadata to VMs |

---

## CRITICAL GAP: Bundle Routes Not Mounted

**Problem**: Routes file exists but is not loaded by server.js

**Files exist**:
- `/opt/swarm-app/apps/platform/routes/bundles.js` (261 lines)
- `/opt/swarm-app/apps/platform/services/bundle-service.js` (290 lines)

**Endpoints in bundles.js**:
```
POST /bundles                     # Upload + register
GET  /bundles/:hash               # Get bundle URL
GET  /workflows/:id/active        # Get active version
POST /workflows/:id/versions/:versionId/activate
GET  /tenants/:slug/workflows
```

**Fix needed** - Add to `/opt/swarm-app/apps/platform/server.js`:
```javascript
const bundleRoutes = require('./routes/bundles');
app.use('/api/internal', bundleRoutes);
```

---

## This Session: Pick Up Tasks

### Step 1: Mount Bundle Routes (5 min)
1. SSH to dev droplet
2. Edit server.js to add bundle routes
3. Restart platform: `pm2 restart swarm-platform-dev`
4. Verify routes: `curl http://localhost:8080/api/internal/tenants/test/workflows`

### Step 2: Test Bundle Upload (10 min)
1. Create test tarball locally
2. Upload via API
3. Verify in MinIO: `mc ls swarm/swarm-bundles/`
4. Verify in PostgreSQL: `SELECT * FROM workflow_versions;`

### Step 3: Boot Script Modifications (30 min)
1. Check `/opt/swarm-engine/` for spawn logic
2. Create bundle fetch script for VM
3. Test VM boot with bundle fetch

### Step 4: Orchestrator Integration (20 min)
1. Modify spawn to look up active version
2. Pass bundle_url and bundle_hash to VM
3. End-to-end test

---

## Infrastructure Reference

**Dev droplet**: 134.199.235.140
**Node path**: `/root/.nvm/versions/node/v22.21.1/bin`

**MinIO**:
- API: http://localhost:9000
- Console: http://localhost:9001
- User: swarm_admin
- Pass: SwarmMinIO2025_Dev!
- Bucket: swarm-bundles

**PostgreSQL**:
- Host: localhost:5432
- DB: swarmdb
- User: swarm
- Pass: swarm_dev_2024

---

## Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm-app/apps/platform/server.js` | Mount bundle routes HERE |
| `/opt/swarm-app/apps/platform/routes/bundles.js` | Bundle API endpoints |
| `/opt/swarm-app/apps/platform/services/bundle-service.js` | MinIO + DB operations |
| `/opt/swarm-engine/` | VM spawn logic (investigate) |

---

## Constraints

- Dev droplet only (134.199.235.140), NOT prod
- Never use heredoc for file transfers
- Write files locally, rsync to droplet
- Query RAG before modifying code: `POST http://localhost:8082/api/rag/search`

---

## Success Criteria

By end of session:
1. ✅ Bundle routes mounted and responding
2. ✅ Can upload test bundle via API
3. ✅ Bundle appears in MinIO and PostgreSQL
4. ✅ Can spawn VM that fetches bundle from MinIO
5. ✅ VM runs code from fetched bundle

---

## Start Commands

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Set PATH
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Check status
pm2 list

# Query RAG for spawn logic
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"spawn VM orchestrator engine","limit":5}'
```
