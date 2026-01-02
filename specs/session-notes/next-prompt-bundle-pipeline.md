# Continue: Bundle Pipeline - Production Testing

## Context
You are a master systems architect completing the Swarm Stack bundle pipeline. API layer is complete on dev. Now need to deploy and test end-to-end on prod.

## Status Summary

| Task | Status | Location |
|------|--------|----------|
| Task 1-3: MinIO/PG/API | ✅ COMPLETE | Both droplets |
| Task 4: boot-fetch.sh | ✅ COMPLETE | Dev only |
| Task 5: spawn service | ✅ COMPLETE | Dev only |
| Task 6: Deploy to prod | ⬜ **NEXT** | 146.190.35.235 |
| Task 7: E2E test | ⬜ PENDING | Prod only |

---

## This Session: Prod Deployment + E2E Test

### Task 6: Deploy to Prod

**Steps**:
1. Rsync spawn-service.js and spawn.js to prod
2. Update server.js on prod (same changes as dev)
3. Install bundle-fetch.sh into VM rootfs snapshot
4. Restart platform on prod

```bash
# SSH to prod
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH

# Rsync from dev
rsync -avz -e "ssh" root@134.199.235.140:/opt/swarm-app/apps/platform/services/spawn-service.js \
  /opt/swarm-app/apps/platform/services/
rsync -avz -e "ssh" root@134.199.235.140:/opt/swarm-app/apps/platform/routes/spawn.js \
  /opt/swarm-app/apps/platform/routes/

# Update server.js (add spawn routes)
# ... manual edit or sed commands

# Install bundle-fetch.sh into VM rootfs
# Mount rootfs, copy script, save snapshot
```

### Task 7: End-to-End Test

```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:3002/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r .token)

# Spawn VM with bundle
curl -X POST http://localhost:3002/api/spawn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "c2dea386-b80b-4791-a105-ab4ec8374aed"}'

# Check spawn status
curl -s http://localhost:3002/api/spawn -H "Authorization: Bearer $TOKEN" | jq

# Verify VM fetched bundle
swarm-vm-ssh 1 'ls -la /opt/workflow/'
```

---

## Infrastructure Reference

**Dev droplet**: 134.199.235.140 (API complete)
**Prod droplet**: 146.190.35.235 (Needs deployment)

**Test workflow**: c2dea386-b80b-4791-a105-ab4ec8374aed
**Bundle hash**: 8730650e6c4fb1b983cd44c388eae2ce745079334ef673b0b46b07a423389392

---

## Success Criteria

By end of session:
1. ⬜ spawn-service.js and spawn.js deployed to prod
2. ⬜ bundle-fetch.sh installed in VM rootfs
3. ⬜ Can spawn VM via API
4. ⬜ VM fetches bundle from MinIO
5. ⬜ Bundle code executes in VM

---

## Constraints

- Test on prod (146.190.35.235) for Firecracker
- Never use heredoc for file transfers
- Query RAG before modifying core spawn scripts

---
*Updated: 2026-01-02 ~19:05 UTC*
