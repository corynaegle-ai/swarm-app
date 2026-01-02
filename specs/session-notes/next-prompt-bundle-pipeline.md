# Continue: Bundle Pipeline Implementation

## Context
You are a master systems architect continuing work on Swarm Stack's multi-tenant workflow system. Last session designed the architecture for running customer workflows without per-tenant file system bloat.

**Key decisions made:**
- Static UI on CDN, not VMs
- Code bundles (tar.gz) fetched at VM boot, not baked into snapshots
- PostgreSQL for workflow registry (not SQLite)
- Internal bundle API (not customer-facing uploads)

## Documents to Reference

**Obsidian:**
- `/Users/cory.naegle/Documents/Obsidian Vault/business-ideas/cfa/multi-tenant-workflow-architecture.md`
- `/Users/cory.naegle/Documents/Obsidian Vault/business-ideas/cfa/swarm-entry-points.md`

**Session notes:**
- `/Users/cory.naegle/swarm-specs-local/session-notes/current.md`

## PostgreSQL Schema (Already Designed)

Tables: `tenants`, `workflows`, `workflow_versions`, `executions`, `execution_events`
View: `active_workflow_versions`

The full schema is in the Obsidian architecture doc.

---

## This Session: Implementation Tasks

### Task 1: MinIO Setup on Dev Droplet

**Dev droplet:** 134.199.235.140
**Goal:** Object storage for workflow bundles

Steps:
1. Install MinIO server
2. Create `swarm-bundles` bucket
3. Configure access credentials
4. Test upload/download

### Task 2: PostgreSQL Migration

**Goal:** Create workflow management tables

Steps:
1. Create migration file: `016_workflow_bundles.sql`
2. Run on dev droplet PostgreSQL
3. Verify tables created

### Task 3: Internal Bundle Registration API

**Location:** Add to swarm-platform or create new service

Endpoints needed:
```
POST /internal/bundles           # Upload + register new version
GET  /internal/bundles/:hash     # Get bundle URL by hash
GET  /internal/workflow/:id/active  # Get active version for spawning
```

### Task 4: Boot Script Modifications

**Current:** VM boots with baked-in code
**Target:** VM boots, fetches bundle from MinIO, unpacks, runs

Modify `/opt/swarm/boot.sh` or equivalent to:
1. Read `BUNDLE_URL` and `BUNDLE_HASH` from metadata
2. Check `/var/cache/swarm/bundles/{hash}.tar.gz`
3. Fetch from MinIO if cache miss
4. Unpack to `/opt/workflow`
5. Start runtime

### Task 5: Orchestrator Integration

Modify spawn logic to:
1. Look up active workflow version from PostgreSQL
2. Pass `bundle_url` and `bundle_hash` to VM metadata
3. Pass secrets via orchestrator (not baked in)

---

## Key Files to Modify

| File | Change |
|------|--------|
| `swarm-platform/routes/` | Add internal bundle endpoints |
| `swarm-platform/migrations/` | Add 016 migration |
| VM rootfs `/opt/swarm/boot.sh` | Bundle fetch logic |
| Orchestrator spawn logic | Pass bundle metadata |

---

## Constraints

- Use dev droplet (134.199.235.140) not prod
- Node path on dev: `/root/.nvm/versions/node/v22.21.1/bin`
- Query RAG before modifying existing code: `POST http://localhost:8082/api/rag/search`
- Never use heredoc for file transfers - write locally, scp to droplet

---

## Success Criteria

By end of session:
1. ✅ MinIO running on dev with test bucket
2. ✅ PostgreSQL tables created
3. ✅ Can upload a test bundle via API
4. ✅ Can spawn VM that fetches bundle from MinIO
5. ✅ VM successfully runs code from fetched bundle

---

## Start Here

1. Read session notes: `cat /Users/cory.naegle/swarm-specs-local/session-notes/current.md`
2. SSH to dev: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
3. Check what's running: `pm2 list`
4. Begin with MinIO installation
