# Build Feature Integration - Complete the Agent Chain

## Context

You are a master systems architect working on Project Swarm - a distributed AI agent coordination system. The "Build Feature" workflow has all individual components built but they are NOT chained together for end-to-end autonomous execution.

**Session Goal**: Wire the agents together so a feature request flows automatically from design → tickets → code generation → verification → PR → deployment → completion.

---

## Environment

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| SSH Key | `~/.ssh/swarm_key` |
| SSH Command | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| PATH Export | `export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH` |

### Running Services (PM2)

| Service | Port | Location |
|---------|------|----------|
| swarm-platform | 3001 | /opt/swarm-platform |
| swarm-dashboard | 3000 | /opt/swarm-dashboard |
| swarm-verifier | 8090 | /opt/swarm-verifier |
| deploy-agent | 3457 | /opt/swarm-deploy |
| mcp-factory | 3456 | /opt/swarm-mcp-factory |
| **swarm-engine** | N/A | /opt/swarm/engine (NOT RUNNING) |

---

## The 5 Integration Gaps

### GAP #1: HITL → Execution Engine (NO TRIGGER)

**Problem**: When HITL session transitions to `building` state and tickets are in `ready` state, nothing triggers the execution engine.

**Files to Modify**:
- `/opt/swarm-platform/routes/hitl.js` - Add trigger after ticket generation
- `/opt/swarm-platform/services/ai-dispatcher.js` - Wire up `start_build` action

**Solution Approach**:
```javascript
// After tickets_generated transition in hitl.js:
// Option A: HTTP call to engine API
// Option B: Set flag in DB that engine polls
// Option C: WebSocket event to engine
```

---

### GAP #2: Execution Engine Not Running + Wrong DB

**Problem**: The execution engine exists but is not running and points to wrong database.

**Files to Modify**:
- `/opt/swarm/engine/lib/engine.js` - Fix DB path
- Create PM2 config for engine

**Current (Wrong)**:
```javascript
const TICKETS_DB = '/opt/swarm-tickets/data/swarm.db';
```

**Should Be**:
```javascript
const TICKETS_DB = '/opt/swarm-platform/data/swarm.db';
```

**Tasks**:
1. Update DB path in engine.js
2. Create `/opt/swarm/engine/pm2.config.js`
3. Start with PM2: `pm2 start pm2.config.js`
4. Save: `pm2 save`

---

### GAP #3: Worker → Verifier → PR Chain (MISSING)

**Problem**: Worker agent (FORGE) generates code but doesn't call verifier or create PR.

**Files to Modify**:
- `/opt/swarm/engine/lib/executor.js` - Add verification step after code generation

**The verifier-client.js already exists** at `/opt/swarm/engine/lib/verifier-client.js` but is NOT imported or used.

**Solution Approach**:
```javascript
// In executor.js, after agent completes:
import { verify, formatFeedbackForRetry, MAX_ATTEMPTS } from './verifier-client.js';

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
    await createPR(ticketId, branchName);
    await updateTicketState(ticketId, 'in_review');
  } else if (attempt < MAX_ATTEMPTS) {
    // Retry with feedback
    const feedback = formatFeedbackForRetry(result.feedback_for_agent);
    await retryCodeGeneration(ticketId, feedback, attempt + 1);
  } else {
    await updateTicketState(ticketId, 'needs_review');
  }
}
```

**Also Need**: GitHub PR creation function using octokit or gh CLI.

---

### GAP #4: Deploy → Ticket Completion (MISSING)

**Problem**: Deploy agent runs on webhook but doesn't update ticket status after successful deployment.

**Files to Modify**:
- `/opt/swarm-deploy/src/pipeline.ts` - Add ticket update after deployment

**Solution Approach**:
```typescript
// After successful deployment in pipeline.ts:
async function onDeploymentSuccess(deployment: Deployment) {
  if (deployment.ticket_id) {
    await fetch('http://localhost:3001/api/tickets/' + deployment.ticket_id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'done' })
    });
  }
}
```

---

### GAP #5: All Tickets Done → HITL Session Complete (MISSING)

**Problem**: When all tickets for a session complete, the HITL session should transition to `completed`.

**Files to Modify**:
- `/opt/swarm-platform/routes/tickets.js` - Add completion check on ticket state change

**Solution Approach**:
```javascript
// In PATCH /api/tickets/:id when state changes to 'done':
async function checkSessionCompletion(ticketId) {
  const ticket = db.prepare('SELECT design_session FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket.design_session) return;
  
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
    
    broadcast({ type: 'session_completed', sessionId: ticket.design_session });
  }
}
```

---

## Recommended Execution Order

| Step | Gap | Task | Effort |
|------|-----|------|--------|
| 1 | GAP #2 | Fix engine DB path + create PM2 config + start | 30 min |
| 2 | GAP #1 | Wire HITL building state → engine trigger | 1 hour |
| 3 | GAP #3 | Import verifier-client, add post-gen verification | 2 hours |
| 4 | GAP #3 | Add GitHub PR creation after verification pass | 1 hour |
| 5 | GAP #4 | Deploy agent → ticket completion update | 1 hour |
| 6 | GAP #5 | Ticket done → session completion check | 30 min |

---

## Testing Checklist

After each gap is fixed, verify:

- [ ] **GAP #2**: `pm2 list` shows swarm-engine running
- [ ] **GAP #2**: Engine logs show it polling from correct DB
- [ ] **GAP #1**: Creating tickets in HITL triggers engine activity
- [ ] **GAP #3**: Code generation calls verifier (check verifier logs)
- [ ] **GAP #3**: Passed verification creates GitHub PR
- [ ] **GAP #4**: Merged PR deployment updates ticket to 'done'
- [ ] **GAP #5**: All tickets done transitions session to 'completed'

---

## Anti-Freeze Protocol

⚠️ **CRITICAL**: Follow these rules to prevent session crashes:

1. **SSH Timeouts**: Max 15s for checks, 30s for operations
2. **File Reads**: Use `head -50` or `tail -20`, never cat entire files
3. **Command Chains**: Max 3 commands per tool call
4. **Session Length**: Checkpoint to git every 15-20 minutes
5. **Cleanup First**: Run `swarm-cleanup` before VM operations

---

## Session Notes Location

Read current state: 
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'cat /opt/swarm-specs/session-notes/current.md | head -100'
```

Update and commit progress:
```bash
# On droplet
cd /opt/swarm-specs
git add -A && git commit -m "Progress: [description]" && git push
```

---

## Start Here

1. First, read current session notes to understand latest state
2. Check PM2 status: `pm2 list`
3. Start with GAP #2 (quickest win - get engine running)
4. Then GAP #1 (wire the trigger)
5. Checkpoint progress to git before moving to GAP #3

Good luck! 🚀
