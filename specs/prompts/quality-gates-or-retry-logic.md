# Continuation Prompt: Test Quality Gates OR Implement Forge Retry Logic

## Context
Session: December 23, 2025
Commit `3dcb637` added ticket generator quality gates to prevent abstract tickets.

**What was implemented:**
- `validateTicketQuality()` rejects tickets without `files_hint`
- Rejects abstract patterns ("project setup") for existing repos
- Enhanced prompts with stricter file path requirements
- Skips infrastructure tickets for existing repositories

---

## Option A: Test Quality Gates

### Quick Validation Test

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Check logs for validation messages
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
pm2 logs swarm-platform-dev --lines 100 | grep -E "(TicketGenerator|REJECTED|validation)"
```

### Full Integration Test

1. **Open dashboard**: https://dashboard.dev.swarmstack.net
2. **Create new Build Feature session** with repo: `https://github.com/corynaegle-ai/swarm-app`
3. **Describe feature**: "Add a ticket priority field with high/medium/low options"
4. **Generate spec** and **Create Build**
5. **Verify tickets**:
   ```sql
   -- Check latest build tickets have files_hint
   sudo -u postgres psql -d swarmdb -c "
   SELECT id, title, 
          CASE WHEN files_hint IS NULL THEN 'MISSING' ELSE 'OK' END as files_status,
          LEFT(files_hint, 50) as files_preview
   FROM tickets 
   WHERE design_session = (SELECT id FROM hitl_sessions ORDER BY created_at DESC LIMIT 1)
   ORDER BY title;"
   ```

6. **Run build** and monitor for "No files generated" errors:
   ```bash
   pm2 logs swarm-engine --lines 50 | grep -E "(No files|generated|error)"
   ```

### Success Criteria
- [ ] All tickets have `files_hint` populated
- [ ] No "Project Setup" tickets for existing repo
- [ ] Zero "No files generated" agent failures
- [ ] Logs show rejected tickets (if any) with reasons

---

## Option B: Implement Forge Agent Retry Logic

### Background
Design complete in `designs/forge-agent-retry-logic.md`. Implementation prompt at `prompts/forge-agent-retry-implementation.md`.

### Task Overview
Replace direct `failTicket()` calls with `retryOrFailTicket()` that:
1. Uses `agent-learning.js` error classification
2. Calculates retry strategy based on error category
3. Sets `retry_after` for exponential backoff
4. Only goes to `on_hold` after max retries exhausted

### Pre-Implementation Steps

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Query RAG for current retry implementation
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "failTicket retryOrFailTicket agent-learning classifyError", "limit": 8}'

# Check agent-learning.js for error categories
head -100 /opt/swarm-app/apps/platform/lib/agent-learning.js

# Find engine execution code
grep -n "failTicket" /opt/swarm-app/engine/lib/engine.js | head -10
```

### Schema Changes Required

```sql
-- Add retry columns if not exist
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_strategy JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
```

### Key Files to Modify

| File | Changes |
|------|---------|
| `engine/lib/engine.js` | Replace `failTicket()` with `retryOrFailTicket()` |
| `apps/platform/lib/agent-learning.js` | Add `calculateRetryStrategy()` if missing |
| `apps/platform/routes/tickets.js` | Add endpoint for retrying on_hold tickets |

### Deployment Pattern

```bash
# Write file locally, rsync to droplet
rsync -avz -e "ssh -i ~/.ssh/swarm_key" \
  /local/path/file.js \
  root@134.199.235.140:/opt/swarm-app/path/

# Restart affected services
pm2 restart swarm-engine swarm-platform-dev
```

---

## Environment Reference

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| Node Path | /root/.nvm/versions/node/v22.21.1/bin |
| Database | `sudo -u postgres psql -d swarmdb` |
| RAG Endpoint | `http://localhost:8082/api/rag/search` |
| Platform Logs | `pm2 logs swarm-platform-dev` |
| Engine Logs | `pm2 logs swarm-engine` |

## Git Commits This Session

| Repo | Commit | Description |
|------|--------|-------------|
| swarm-app | `3dcb637` | feat(ticket-generator): Add quality gates |
| swarm-specs | `2ed33af` | docs: Session notes for quality gates |

---

## Session Notes
Update `/opt/swarm-specs/session-notes/current.md` before ending. Commit and push to git.

**Choose**: Reply with "Test" to validate quality gates, or "Retry" to implement forge agent retry logic.
