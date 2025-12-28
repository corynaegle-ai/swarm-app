# Continue Build Feature Integration - GAPs #3 and #5

## Context

You are a master systems architect continuing Project Swarm integration work. GAPs #1, #2, and #4 are complete. The build feature pipeline is almost fully wired.

**Session Goal**: Complete GAP #3 (Worker → Verifier → PR chain) and GAP #5 (Session completion check).

---

## Environment

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| SSH Command | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| Node Setup | `source /root/.nvm/nvm.sh && nvm use 22` |

### Running Services (PM2)

| Service | Port | Status |
|---------|------|--------|
| swarm-platform | 3001 | ✅ Running |
| swarm-engine | N/A | ✅ Running |
| swarm-sentinel | 8090 | ✅ Running |
| deploy-agent | 3457 | ✅ Running |

---

## Completed Status

| Gap | Description | Status |
|-----|-------------|--------|
| GAP #1 | HITL → Engine trigger | ✅ Complete |
| GAP #2 | Engine DB path + PM2 | ✅ Complete |
| GAP #3 | Worker → Verifier → PR Chain | 🔴 **DO THIS** |
| GAP #4 | Deploy → Ticket Completion | ✅ Complete |
| GAP #5 | All Tickets Done → Session Complete | 🔴 **DO THIS** |

---

## GAP #3: Worker → Verifier → PR Chain (CRITICAL)

**Problem**: Worker agent generates code but doesn't call verifier or create PR.

**Current Flow** (broken):
```
Engine dispatches ticket → FORGE generates code → ??? (nothing happens)
```

**Target Flow**:
```
Engine dispatches ticket → FORGE generates code → Verifier checks → PR created → Ticket updated
```

### Files to Modify

| File | Purpose |
|------|---------|
| `/opt/swarm/engine/lib/executor.js` | Add post-generation verification |
| `/opt/swarm/engine/lib/verifier-client.js` | Already exists - import and use |

### Implementation Steps

1. **Review verifier-client.js API**:
```bash
head -60 /opt/swarm/engine/lib/verifier-client.js
```

2. **Review current executor.js structure**:
```bash
head -100 /opt/swarm/engine/lib/executor.js
```

3. **Add to executor.js** - Import verifier and add post-code-generation hook:
```javascript
import { verify, formatFeedbackForRetry, MAX_ATTEMPTS } from './verifier-client.js';

// Add after agent completes code generation:
async function postCodeGeneration(ticketId, branchName, repoUrl, attempt = 1) {
  // 1. Call verifier
  const result = await verify({
    ticketId,
    branchName, 
    repoUrl,
    attempt,
    phases: ['static', 'automated', 'sentinel']
  });
  
  // 2. Handle result
  if (result.status === 'passed') {
    await createPR(ticketId, branchName, repoUrl);
    await updateTicketState(ticketId, 'in_review');
  } else if (attempt < MAX_ATTEMPTS) {
    const feedback = formatFeedbackForRetry(result.feedback_for_agent);
    await retryCodeGeneration(ticketId, feedback, attempt + 1);
  } else {
    await updateTicketState(ticketId, 'needs_review');
  }
}
```

4. **Add GitHub PR creation** using `gh` CLI:
```javascript
import { execSync } from 'child_process';

async function createPR(ticketId, branchName, repoUrl) {
  const repoPath = `/tmp/swarm-repos/${ticketId}`;
  execSync(`cd ${repoPath} && gh pr create --title "feat: ${ticketId}" --body "Automated PR from Swarm" --base main --head ${branchName}`, {
    env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN }
  });
}
```

### Verification
```bash
# Watch verifier logs during test
pm2 logs swarm-sentinel --lines 20

# Check engine logs
pm2 logs swarm-engine --lines 20
```

---

## GAP #5: All Tickets Done → Session Complete

**Problem**: When all tickets for a session complete, HITL session should transition to `completed`.

**File to Modify**: `/opt/swarm-platform/routes/tickets.js`

### Implementation

Add this function and call it when ticket state changes to 'done':

```javascript
async function checkSessionCompletion(db, ticketId) {
  const ticket = db.prepare('SELECT design_session FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket?.design_session) return;
  
  // Check if all tickets for this session are done
  const incomplete = db.prepare(`
    SELECT COUNT(*) as count FROM tickets 
    WHERE design_session = ? AND state NOT IN ('done', 'cancelled')
  `).get(ticket.design_session);
  
  if (incomplete.count === 0) {
    // All done - update HITL session
    db.prepare(`
      UPDATE hitl_sessions SET state = 'completed', updated_at = datetime('now')
      WHERE id = ?
    `).run(ticket.design_session);
    
    console.log(`Session ${ticket.design_session} completed - all tickets done`);
  }
}

// Call in PATCH /api/tickets/:id when state changes to 'done'
```

### Find where to add the call:
```bash
grep -n "state.*done\|PATCH" /opt/swarm-platform/routes/tickets.js | head -20
```

---

## Execution Order

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Review verifier-client.js API | 5 min |
| 2 | Review executor.js structure | 5 min |
| 3 | Add verification call to executor.js | 30 min |
| 4 | Add PR creation function | 20 min |
| 5 | Test GAP #3 with engine logs | 15 min |
| 6 | Add checkSessionCompletion to tickets.js | 15 min |
| 7 | Test GAP #5 | 10 min |

---

## Testing Checklist

- [ ] **GAP #3**: Engine calls verifier after code generation (check logs)
- [ ] **GAP #3**: PR created on GitHub after verification passes
- [ ] **GAP #5**: Complete all tickets → session state = 'completed'

---

## Anti-Freeze Protocol

⚠️ Follow these rules:

1. **SSH Timeouts**: Max 15s for checks, 30s for operations
2. **File Reads**: Use `head -50` or `tail -20`, never cat entire files
3. **Session Length**: Checkpoint to git every 15-20 min
4. **Node Setup**: Always run `source /root/.nvm/nvm.sh && nvm use 22` first

---

## Quick Reference Commands

```bash
# SSH with node setup
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "source /root/.nvm/nvm.sh && nvm use 22 && <command>"

# View logs
pm2 logs swarm-engine --lines 20 --nostream
pm2 logs swarm-sentinel --lines 20 --nostream

# Restart services
pm2 restart swarm-engine
pm2 restart swarm-platform

# Update session notes
cd /opt/swarm-specs && git add -A && git commit -m 'message' && git push
```
