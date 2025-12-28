# Complete Build Feature Integration - GAPs #3, #4, #5

## Context

You are a master systems architect working on Project Swarm. GAPs #1 and #2 are complete - the execution engine is running and HITL sessions correctly trigger ticket processing. 

**Session Goal**: Wire the remaining integration points so code flows from generation → verification → PR → deployment → completion.

---

## Environment

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| SSH Command | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| PATH Export | `export PATH=/root/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:$PATH` |

### Running Services (PM2)

| Service | Port | Status |
|---------|------|--------|
| swarm-platform | 3001 | ✅ Running |
| swarm-engine | N/A | ✅ Running |
| swarm-verifier | 8090 | ✅ Running |
| deploy-agent | 3457 | ✅ Running |

---

## Completed Gaps

| Gap | Description | Status |
|-----|-------------|--------|
| GAP #1 | HITL → Engine trigger | ✅ Fixed (agent ID + PATH) |
| GAP #2 | Engine DB path + PM2 | ✅ Complete |

---

## Remaining Gaps

### GAP #3: Worker → Verifier → PR Chain (CRITICAL)

**Problem**: Worker agent generates code but doesn't call verifier or create PR.

**Current Flow** (broken):
```
Engine dispatches ticket → FORGE generates code → ??? (nothing happens)
```

**Target Flow**:
```
Engine dispatches ticket → FORGE generates code → Verifier checks → PR created → Ticket updated
```

**Files to Modify**:
- `/opt/swarm/engine/lib/executor.js` - Add post-generation verification

**The verifier-client already exists** at `/opt/swarm/engine/lib/verifier-client.js` but is NOT used.

**Implementation Steps**:

1. **Check verifier-client.js exists and review its API**:
```bash
head -50 /opt/swarm/engine/lib/verifier-client.js
```

2. **Modify executor.js** to import and use verifier after code generation:
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

3. **Add GitHub PR creation** using `gh` CLI or octokit:
```javascript
import { execSync } from 'child_process';

async function createPR(ticketId, branchName, repoUrl) {
  const repoPath = `/tmp/swarm-repos/${ticketId}`;
  execSync(`cd ${repoPath} && gh pr create --title "feat: ${ticketId}" --body "Automated PR from Swarm" --base main --head ${branchName}`, {
    env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN }
  });
}
```

**Verification**:
```bash
# Watch verifier logs during test
pm2 logs swarm-verifier --lines 20

# Check if PRs are created
gh pr list --repo <test-repo>
```

---

### GAP #4: Deploy → Ticket Completion

**Problem**: Deploy agent runs on webhook but doesn't update ticket status after deployment.

**File to Modify**: `/opt/swarm-deploy/src/pipeline.ts`

**Current State**: Check if callback endpoint exists:
```bash
grep -n 'ticket\|callback\|complete' /opt/swarm-deploy/src/pipeline.ts | head -20
```

**Implementation**:
```typescript
// After successful deployment:
async function onDeploymentSuccess(deployment: Deployment) {
  if (deployment.ticket_id) {
    try {
      await fetch('http://localhost:3001/api/tickets/' + deployment.ticket_id, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.PLATFORM_API_KEY
        },
        body: JSON.stringify({ state: 'done' })
      });
      console.log(`Ticket ${deployment.ticket_id} marked done`);
    } catch (err) {
      console.error('Failed to update ticket:', err);
    }
  }
}
```

**Note**: The platform already has `notifyDeployAgent` function in tickets.js - verify it's being called:
```bash
grep -A 15 'notifyDeployAgent' /opt/swarm-platform/routes/tickets.js
```

---

### GAP #5: All Tickets Done → Session Complete

**Problem**: When all tickets for a session complete, HITL session should transition to `completed`.

**File to Modify**: `/opt/swarm-platform/routes/tickets.js`

**Implementation** - Add after ticket state changes to 'done':
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
    
    // Broadcast to dashboard
    broadcast.custom({
      type: 'session_completed',
      session_id: ticket.design_session
    });
  }
}

// Call this in PATCH /api/tickets/:id when state changes to 'done'
```

---

## Execution Order

| Step | Gap | Task | Est. Time |
|------|-----|------|-----------|
| 1 | GAP #3 | Review verifier-client.js API | 10 min |
| 2 | GAP #3 | Add verification to executor.js | 45 min |
| 3 | GAP #3 | Add PR creation function | 30 min |
| 4 | GAP #3 | Test with real ticket | 20 min |
| 5 | GAP #4 | Wire deploy → ticket update | 30 min |
| 6 | GAP #5 | Add session completion check | 20 min |
| 7 | ALL | End-to-end integration test | 30 min |

---

## Testing Checklist

After each gap:

- [ ] **GAP #3**: Trigger HITL build, verify engine calls verifier (check logs)
- [ ] **GAP #3**: Verify PR created on GitHub after verification passes
- [ ] **GAP #4**: Merge a PR, verify ticket transitions to 'done'
- [ ] **GAP #5**: Complete all tickets for session, verify session state = 'completed'

**Full E2E Test**:
1. Create HITL session with 2 simple tickets
2. Start build
3. Watch engine logs: tickets dispatched
4. Watch verifier logs: code verified
5. Check GitHub: PRs created
6. Merge PRs
7. Check tickets: state = 'done'
8. Check session: state = 'completed'

---

## Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Executor (add verification) | `/opt/swarm/engine/lib/executor.js` |
| Verifier client (import this) | `/opt/swarm/engine/lib/verifier-client.js` |
| Deploy pipeline | `/opt/swarm-deploy/src/pipeline.ts` |
| Tickets API | `/opt/swarm-platform/routes/tickets.js` |
| HITL API | `/opt/swarm-platform/routes/hitl.js` |

---

## Anti-Freeze Protocol

⚠️ Follow these rules:

1. **SSH Timeouts**: Max 15s for checks, 30s for operations
2. **File Reads**: Use `head -50` or `tail -20`, never cat entire files
3. **Command Chains**: Max 3 commands per tool call
4. **Session Length**: Checkpoint to git every 15-20 minutes

---

## Session Notes

Read current state:
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'cat /opt/swarm-specs/session-notes/current.md | tail -50'
```

Update progress:
```bash
cd /opt/swarm-specs && git add -A && git commit -m "Progress: [description]" && git push
```

---

## Start Here

1. SSH to droplet
2. Review verifier-client.js to understand its API
3. Check executor.js current state
4. Implement GAP #3 verification integration
5. Test with a real ticket
6. Checkpoint progress to git
7. Continue to GAP #4 and #5

Good luck! 🚀
