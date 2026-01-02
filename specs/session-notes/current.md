# Session Notes - 2026-01-02 (Bundle Pipeline)

## Summary: Bundle API Implementation

### Completed This Session

| Task | Status | Details |
|------|--------|---------|
| Bundle Service | ✅ | `/apps/platform/services/bundle-service.js` created |
| Bundle Routes | ✅ | `/apps/platform/routes/bundles.js` created |
| Routes Mounted | ✅ | server.js updated with bundle routes |
| MinIO Dependency | ✅ | `pnpm add minio` installed |
| Platform Restart | ✅ | PM2 restart successful |

### Files Created

**bundle-service.js** (150 lines):
- `uploadBundle()` - Upload to MinIO + register in PostgreSQL
- `activateVersion()` - Set active workflow version
- `getActiveVersion()` - Get spawn config (for orchestrator)
- `getBundleByHash()` - Lookup by SHA256
- `listTenantWorkflows()` - List workflows for tenant
- `listWorkflowVersions()` - List versions for workflow
- `createWorkflow()` - Create new workflow
- `getPresignedUrl()` - Generate download URL for VMs

**bundles.js** (175 lines):
- `POST /api/bundles` - Upload bundle (multipart)
- `GET /api/bundles/:hash` - Get bundle by hash
- `GET /api/bundles/:hash/presigned` - Get presigned URL
- `GET /api/bundles/workflows` - List tenant workflows
- `POST /api/bundles/workflows` - Create workflow
- `GET /api/bundles/workflows/:id/versions` - List versions
- `GET /api/bundles/workflows/:id/active` - Get active version
- `POST /api/bundles/workflows/:id/versions/:vid/activate` - Activate
- `GET /api/internal/spawn/:workflowId` - Internal spawn config

### server.js Changes

```javascript
// Line 84: Import added
const { router: bundleRoutes, internalRouter: bundleInternalRoutes } = require('./routes/bundles');

// Line 113: Public routes mounted
app.use('/api/bundles', apiLimiter, bundleRoutes);

// Line 126: Internal routes mounted
app.use("/api/internal", bundleInternalRoutes);
```

---

## Next Steps

### Step 2: Test Bundle Upload (NOT DONE)
1. Create test tarball locally
2. Upload via API: `curl -X POST -F "bundle=@test.tar.gz" -F "workflow_id=..." -F "version=1.0.0" http://localhost:3002/api/bundles`
3. Verify in MinIO: `mc ls swarm/swarm-bundles/`
4. Verify in PostgreSQL

### Step 3: Boot Script Modifications (NOT DONE)
1. Check `/opt/swarm-engine/` for spawn logic
2. Create bundle fetch script for VM
3. Test VM boot with bundle fetch

### Step 4: Orchestrator Integration (NOT DONE)
1. Modify spawn to call `/api/internal/spawn/:workflowId`
2. Pass bundle_url and bundle_hash to VM
3. End-to-end test

---

## Infrastructure Reference

**Dev droplet**: 134.199.235.140
**Node path**: `/root/.nvm/versions/node/v22.21.1/bin`

**MinIO**:
- API: http://localhost:9000
- Bucket: swarm-bundles
- User: swarm_admin
- Pass: SwarmMinIO2025_Dev!

**PostgreSQL**:
- DB: swarmdb
- User: swarm
- Pass: swarm_dev_2024

---

## Test Commands

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Get auth token (use existing test user)
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r .token)

# Test list workflows
curl -s http://localhost:3002/api/bundles/workflows \
  -H "Authorization: Bearer $TOKEN" | jq

# Create test workflow first
curl -s -X POST http://localhost:3002/api/bundles/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Workflow","slug":"test-workflow","description":"Testing bundle pipeline"}' | jq
```

---
*Updated: 2026-01-02 ~09:22 UTC*
