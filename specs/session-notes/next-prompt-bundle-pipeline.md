# Continue: Bundle Pipeline - Step 2 Testing

## Context
You are a master systems architect continuing work on Swarm Stack's bundle pipeline. Previous session COMPLETED Task 3 (Bundle API). Routes are mounted and platform restarted.

## Status Summary (as of 2026-01-02 ~09:22 UTC)

| Task | Status | Next Action |
|------|--------|-------------|
| Task 1: MinIO | ✅ COMPLETE | - |
| Task 2: PostgreSQL | ✅ COMPLETE | - |
| Task 3: Bundle API | ✅ COMPLETE | Routes mounted, platform restarted |
| Task 4: Boot Script | ❌ NOT STARTED | Create bundle fetch logic |
| Task 5: Orchestrator | ❌ NOT STARTED | Pass bundle metadata to VMs |

---

## COMPLETED: Bundle API Implementation

**Files created**:
- `/opt/swarm-app/apps/platform/services/bundle-service.js` (150 lines)
- `/opt/swarm-app/apps/platform/routes/bundles.js` (175 lines)

**server.js updated** (lines 84, 113, 126):
- Import: `const { router: bundleRoutes, internalRouter: bundleInternalRoutes } = require('./routes/bundles');`
- Mount: `app.use('/api/bundles', apiLimiter, bundleRoutes);`
- Mount: `app.use("/api/internal", bundleInternalRoutes);`

**Endpoints available**:
```
POST   /api/bundles                                    # Upload bundle
GET    /api/bundles/:hash                              # Get by hash
GET    /api/bundles/:hash/presigned                    # Presigned URL
GET    /api/bundles/workflows                          # List workflows
POST   /api/bundles/workflows                          # Create workflow
GET    /api/bundles/workflows/:id/versions             # List versions
GET    /api/bundles/workflows/:id/active               # Active version
POST   /api/bundles/workflows/:id/versions/:vid/activate
GET    /api/internal/spawn/:workflowId                 # For orchestrator
```

---

## This Session: Pick Up at Step 2

### Step 2: Test Bundle Upload (IMMEDIATE)

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Get auth token
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r .token)

# Test list workflows (should return empty)
curl -s http://localhost:3002/api/bundles/workflows \
  -H "Authorization: Bearer $TOKEN" | jq

# Create test workflow
curl -s -X POST http://localhost:3002/api/bundles/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Workflow","slug":"test-workflow","description":"Testing bundle pipeline"}' | jq

# Create test tarball
mkdir -p /tmp/test-bundle/src
echo 'console.log("Hello from bundle!");' > /tmp/test-bundle/src/index.js
echo '{"name":"test-bundle","version":"1.0.0"}' > /tmp/test-bundle/package.json
cd /tmp/test-bundle && tar -czf ../test-bundle.tar.gz . && cd -

# Upload bundle (use workflow_id from create response)
WORKFLOW_ID="<uuid-from-above>"
curl -s -X POST http://localhost:3002/api/bundles \
  -H "Authorization: Bearer $TOKEN" \
  -F "bundle=@/tmp/test-bundle.tar.gz" \
  -F "workflow_id=$WORKFLOW_ID" \
  -F "version=1.0.0" | jq

# Verify in MinIO
mc ls swarm/swarm-bundles/

# Verify in PostgreSQL
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb \
  -c "SELECT id, version, bundle_hash, is_active FROM workflow_versions;"
```

### Step 3: Boot Script Modifications (AFTER TESTING)
1. Investigate `/opt/swarm-engine/` for spawn logic
2. Create bundle fetch script for VM boot
3. Test VM boot with bundle fetch

### Step 4: Orchestrator Integration (FINAL)
1. Modify spawn to call `/api/internal/spawn/:workflowId`
2. Pass bundle_url and bundle_hash to VM environment
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

## Constraints

- Dev droplet only (134.199.235.140), NOT prod
- Never use heredoc for file transfers
- Write files locally, rsync to droplet
- Query RAG before modifying code: `POST http://localhost:8082/api/rag/search`

---

## Success Criteria

By end of session:
1. ✅ Bundle routes mounted and responding
2. ⬜ Can upload test bundle via API
3. ⬜ Bundle appears in MinIO and PostgreSQL
4. ⬜ Can activate workflow version
5. ⬜ Can spawn VM that fetches bundle from MinIO
6. ⬜ VM runs code from fetched bundle

---
*Updated: 2026-01-02 ~09:22 UTC*
