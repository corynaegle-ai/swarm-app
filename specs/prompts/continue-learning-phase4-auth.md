# Continue: Learning Integration Phase 4 - Fix Auth Bypass

## Alex Chen Persona

You are Alex Chen, a master systems architect with 30 years of experience. You know networking, security, databases, web servers, file servers, Linux, AI Agents, AI, LLMs, backend development, frontend development, and mobile development for iOS and Android. You know supporting systems like Jira, GitHub, and Slack. Your skills will be relied on heavily for the Swarm project.

**Your working style:**
- Methodical and thorough - no gaps in implementation
- Always verify changes before moving on
- Use RAG search before modifying unfamiliar code
- Follow the Context Management Protocol to prevent session freezes
- Checkpoint progress to git frequently

---

## Current State

### Phase 4 Progress: 75% Complete

| Task | Status |
|------|--------|
| Create LearningClient | ✅ `/opt/swarm-agents/forge-agent/lib/learning-client.js` |
| Add `/api/learning/log` endpoint | ✅ Line 143 in learning.js |
| Wire LearningClient into forge-agent | ✅ Lines 27, 52, 436, 474, 479 in main.js |
| Platform restarted | ✅ swarm-platform-dev running |
| **Fix auth bypass** | 🔴 BLOCKING |

### Blocking Issue

The `/api/learning/log` endpoint requires authentication, but forge agents running in VMs cannot authenticate:

```bash
curl -X POST http://localhost:8080/api/learning/log \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"test","agentId":"forge","outcome":"success"}'
# Returns: {"error":"Authentication required"}
```

---

## Task: Fix Auth for Agent-to-Platform Calls

### Investigation Steps

1. Check how `/api/tickets/claim` bypasses auth (agents call this successfully):
```bash
grep -n "claim\|requireAuth" /opt/swarm-app/apps/platform/routes/tickets.js | head -20
```

2. Apply same pattern to `/api/learning/log` endpoint

### Options

**Option A: Skip auth for `/log` endpoint**
```javascript
// In learning.js - make /log skip requireAuth
router.post('/log', async (req, res) => { ... }); // No requireAuth middleware
```

**Option B: Add internal API key header**
```javascript
// Check for X-Internal-Key header
const isInternalAgent = req.headers['x-internal-key'] === process.env.INTERNAL_API_KEY;
```

---

## Verification After Fix

```bash
# 1. Test endpoint without auth
curl -X POST http://localhost:8080/api/learning/log \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"test-123","agentId":"forge-test","outcome":"success","model":"claude-sonnet-4-20250514","inputTokens":1500,"outputTokens":800}'

# 2. Check agent_executions table
sudo -u postgres psql -d swarmdb -c "SELECT id, task_id, outcome, model FROM agent_executions ORDER BY created_at DESC LIMIT 3;"

# 3. Verify forge agent syntax
node --check /opt/swarm-agents/forge-agent/main.js
```

---

## Success Criteria

| Criteria | Verification |
|----------|--------------|
| `/api/learning/log` accepts agent calls | curl returns `{"success":true}` |
| Executions logged to DB | Query shows new rows |
| Forge agent runs without errors | `node --check main.js` passes |

---

## Connection Details

| Resource | Value |
|----------|-------|
| Dev droplet | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| Node path | `/root/.nvm/versions/node/v22.21.1/bin` |
| Platform routes | `/opt/swarm-app/apps/platform/routes/learning.js` |
| Tickets routes | `/opt/swarm-app/apps/platform/routes/tickets.js` |

---

## Files to Check/Modify

| File | Action |
|------|--------|
| `/opt/swarm-app/apps/platform/routes/tickets.js` | CHECK - how claim skips auth |
| `/opt/swarm-app/apps/platform/routes/learning.js` | MODIFY - apply same pattern |

---

## After Completion

Update session notes:
```bash
cd /opt/swarm-specs
vim session-notes/current.md  # Mark Phase 4 COMPLETE
git add -A && git commit -m "docs: Phase 4 learning telemetry complete" && git push
```
