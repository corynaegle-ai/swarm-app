# Session Notes - 2026-01-02 (Bundle Pipeline Complete)

## Summary: Tasks 4-5 Implementation

### Completed This Session

| Task | Status | Details |
|------|--------|---------|
| Task 1: MinIO | ✅ DONE | Previous session |
| Task 2: PostgreSQL | ✅ DONE | Previous session |
| Task 3: Bundle API | ✅ DONE | Previous session |
| Task 4: Boot Script | ✅ DONE | bundle-fetch.sh created |
| Task 5: Orchestrator | ✅ DONE | spawn service + routes created |

### Files Created/Modified

**bundle-fetch.sh** (scripts/bundle-fetch.sh):
- Shell script to run inside VMs
- Fetches bundle from MinIO URL
- Verifies SHA256 hash
- Caches bundles in /var/cache/swarm/bundles/
- Unpacks to /opt/workflow
- Runs entrypoint with specified runtime

**spawn-service.js** (services/spawn-service.js):
- `getSpawnConfig(workflowId)` - Calls internal spawn API
- `execOnVM(vmId, command)` - SSH into VM with namespace
- `spawnWithBundle(vmId, workflowId)` - Full spawn flow
- `releaseVM(vmId)` - Cleanup VM after workflow

**spawn.js** (routes/spawn.js):
- `POST /api/spawn` - Spawn VM with workflow bundle
- `GET /api/spawn` - List active spawns
- `GET /api/spawn/:vmId/status` - Check spawn status
- `DELETE /api/spawn/:vmId` - Release VM

**server.js** (updated):
- Added spawn routes import (line 85)
- Mounted /api/spawn (line 116)

---

## Verified Working

```bash
# List active spawns
curl -s http://localhost:3002/api/spawn -H "Authorization: Bearer $TOKEN"
# Returns: {"spawns": []}

# Get spawn config for workflow
curl -s http://localhost:3002/api/internal/spawn/c2dea386-b80b-4791-a105-ab4ec8374aed
# Returns: {bundle_url, bundle_hash, runtime, entrypoint, etc.}
```

---

## Next Steps (Prod Testing)

The API layer is complete on dev. End-to-end testing requires prod droplet (146.190.35.235) with Firecracker:

### Step 1: Deploy to Prod
```bash
# Copy files to prod
rsync -avz -e "ssh -i ~/.ssh/swarm_key" \
  /opt/swarm-app/apps/platform/services/spawn-service.js \
  /opt/swarm-app/apps/platform/routes/spawn.js \
  /opt/swarm-app/apps/platform/scripts/bundle-fetch.sh \
  root@146.190.35.235:/opt/swarm-app/apps/platform/

# Install bundle-fetch.sh into VM rootfs snapshot
# ... (requires updating snapshots)
```

### Step 2: Test End-to-End on Prod
```bash
# Spawn VM with bundle
curl -X POST http://localhost:3002/api/spawn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "c2dea386-b80b-4791-a105-ab4ec8374aed"}'
```

### Step 3: VM Rootfs Modifications (Prod)
1. Mount rootfs
2. Copy bundle-fetch.sh to /opt/swarm/
3. Create snapshot with script included
4. Test spawn flow

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         SPAWN FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /api/spawn {workflow_id}                                  │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  Spawn Service  │                                           │
│  └────────┬────────┘                                           │
│           │                                                     │
│  1. swarm-spawn-ns <vmId>  ─────► VM boots in namespace        │
│           │                                                     │
│  2. GET /api/internal/spawn/:workflowId                        │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐   Returns:                                │
│  │  Bundle Service │   - bundle_url (presigned MinIO)          │
│  └────────┬────────┘   - bundle_hash                           │
│           │            - entrypoint                             │
│           │            - runtime                                │
│           ▼                                                     │
│  3. SSH into VM: bundle-fetch.sh <url> <hash> <entry> <runtime>│
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                           │
│  │  VM executes:   │                                           │
│  │  - Download     │                                           │
│  │  - Verify hash  │                                           │
│  │  - Unpack       │                                           │
│  │  - npm install  │                                           │
│  │  - Run entry    │                                           │
│  └─────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Infrastructure Reference

**Dev droplet**: 134.199.235.140 (API only, no Firecracker)
**Prod droplet**: 146.190.35.235 (Full Firecracker setup)
**Node path dev**: /root/.nvm/versions/node/v22.21.1/bin
**Node path prod**: /root/.nvm/versions/node/v22.12.0/bin

**Test workflow**:
- ID: c2dea386-b80b-4791-a105-ab4ec8374aed
- Bundle hash: 8730650e6c4fb1b983cd44c388eae2ce745079334ef673b0b46b07a423389392

---

*Updated: 2026-01-02 ~19:05 UTC*
