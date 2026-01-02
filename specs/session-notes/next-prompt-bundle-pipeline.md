# Continue: Bundle Pipeline - Tasks 4-5 (Boot Script + Orchestrator)

## Context
You are a master systems architect continuing work on Swarm Stack's bundle pipeline. Tasks 1-3 are COMPLETE. Bundle API is fully functional and tested.

## Status Summary (as of 2026-01-02 ~09:35 UTC)

| Task | Status | Next Action |
|------|--------|-------------|
| Task 1: MinIO | ✅ COMPLETE | - |
| Task 2: PostgreSQL | ✅ COMPLETE | - |
| Task 3: Bundle API | ✅ COMPLETE | All endpoints working |
| Task 4: Boot Script | ⬜ **NEXT** | Create bundle fetch logic |
| Task 5: Orchestrator | ⬜ PENDING | Pass bundle metadata to VMs |

---

## COMPLETED: Bundle API (Task 3)

**Test Data Created**:
- Workflow ID: `c2dea386-b80b-4791-a105-ab4ec8374aed`
- Version ID: `6f3d189d-5e1e-4b9e-b6df-faed09ceed08`
- Bundle Hash: `8730650e6c4fb1b983cd44c388eae2ce745079334ef673b0b46b07a423389392`
- MinIO Path: `swarm-bundles/bundles/tenant-swarm/c2dea386.../8730650e...tar.gz`

**Endpoints verified**:
```
POST   /api/bundles                    ✅ Upload bundle
GET    /api/bundles/workflows          ✅ List workflows
POST   /api/bundles/workflows          ✅ Create workflow
GET    /api/bundles/workflows/:id/active  ✅ Get active version
POST   /api/bundles/.../activate       ✅ Activate version
GET    /api/internal/spawn/:workflowId ✅ Internal spawn config (no auth)
```

**Internal spawn response**:
```json
{
  "workflow_id": "c2dea386-b80b-4791-a105-ab4ec8374aed",
  "bundle_url": "http://localhost:9000/swarm-bundles/bundles/tenant-swarm/c2dea386.../873065...tar.gz",
  "bundle_hash": "8730650e6c4fb1b983cd44c388eae2ce745079334ef673b0b46b07a423389392",
  "runtime": "node20",
  "entrypoint": "src/index.js",
  "memory_mb": 512,
  "timeout_sec": 300
}
```

---

## This Session: Tasks 4-5

### Task 4: Boot Script Modifications

**Goal**: VM fetches bundle from MinIO on boot

**Steps**:
1. Investigate `/opt/swarm-engine/` for spawn logic
2. Find VM boot script location
3. Create bundle fetch script that:
   - Reads BUNDLE_URL and BUNDLE_HASH from env
   - Checks cache at `/var/cache/swarm/bundles/{hash}.tar.gz`
   - Fetches from MinIO on cache miss
   - Unpacks to `/opt/workflow`
   - Starts runtime

**Query RAG first**:
```bash
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"VM spawn boot script firecracker","limit":5}'
```

### Task 5: Orchestrator Integration

**Goal**: Orchestrator passes bundle metadata to VM

**Steps**:
1. Find spawn code in engine
2. Add call to `/api/internal/spawn/:workflowId`
3. Pass `BUNDLE_URL` and `BUNDLE_HASH` to VM env
4. Test end-to-end

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

## Start Commands

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Check engine structure
ls -la /opt/swarm-engine/

# Query RAG for spawn logic
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"spawn VM orchestrator firecracker","limit":5}'

# Test internal spawn endpoint
curl -s http://localhost:3002/api/internal/spawn/c2dea386-b80b-4791-a105-ab4ec8374aed | jq
```

---

## Constraints

- Dev droplet only (134.199.235.140), NOT prod
- Never use heredoc for file transfers
- Write files locally, rsync to droplet
- Query RAG before modifying code

---

## Success Criteria

By end of session:
1. ✅ Bundle routes mounted and responding
2. ✅ Can upload test bundle via API
3. ✅ Bundle appears in MinIO and PostgreSQL
4. ✅ Can activate workflow version
5. ⬜ Can spawn VM that fetches bundle from MinIO
6. ⬜ VM runs code from fetched bundle

---
*Updated: 2026-01-02 ~09:35 UTC*
