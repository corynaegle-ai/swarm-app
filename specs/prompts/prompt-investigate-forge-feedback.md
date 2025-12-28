# Prompt: Investigate Forge Agent Feedback Integration

## Context

During E2E testing of the Sentinel → Forge retry loop, we observed that:
1. Sentinel correctly identified 4 CRITICAL + 2 MAJOR issues in the generated code
2. Ticket was requeued to `ready` with `sentinel_feedback` populated
3. Forge agent claimed the ticket and regenerated code
4. The new code STILL failed verification 3 times
5. Ticket escalated to `needs_review` (human intervention)

**Key Question**: Is Forge receiving and utilizing the Sentinel feedback, or is it regenerating code blind?

## Investigation Areas

### 1. Data Flow Analysis

**Sentinel Feedback Written:**
```sql
-- Check what feedback was stored
SELECT id, state, sentinel_feedback, retry_count 
FROM tickets WHERE id = 'TKT-E2E-IMPL-001';
```

**Expected sentinel_feedback structure:**
```json
{
  "status": "failed",
  "sentinel_decision": "REJECT",
  "sentinel_score": 25,
  "feedback_for_agent": [
    "CRITICAL [src/middleware/jwt.js:3]: Weak fallback JWT secret...",
    "CRITICAL [src/routes/auth.js:7]: Hardcoded admin credentials...",
    "CRITICAL [src/routes/auth.js:18]: Password is never verified...",
    "CRITICAL [src/routes/auth.js:3]: Same weak JWT secret fallback...",
    "MAJOR [src/routes/auth.js:11]: Function is marked async but no error handling...",
    "MAJOR [src/routes/auth.js:12]: No input validation on email format..."
  ]
}
```

### 2. Forge Agent Input Investigation

**Location of Forge agent code:**
```bash
# Find forge agent implementation
find /opt -name "*forge*" -type f 2>/dev/null | grep -E '\.(js|ts)$'
ls -la /opt/swarm/agents/forge/
cat /opt/swarm/agents/forge/index.js | head -100
```

**Check how Forge receives ticket data:**
```bash
# Look for how ticket is passed to agent
grep -rn "sentinel_feedback" /opt/swarm/agents/forge/
grep -rn "feedback" /opt/swarm/agents/forge/
grep -rn "retry" /opt/swarm/agents/forge/
```

**Check executor that invokes Forge:**
```bash
# How does executor pass data to agent?
grep -n "sentinel_feedback\|feedback" /opt/swarm/engine/lib/executor*.js
sed -n '1,100p' /opt/swarm/engine/lib/executor.js
```

### 3. Prompt Construction Analysis

**Key questions:**
1. Does Forge's system prompt include instructions to check for prior feedback?
2. Is `sentinel_feedback` included in the inputs passed to the agent?
3. Is the feedback formatted in a way the LLM can understand and act on?

**Check agent prompt template:**
```bash
# Find prompt templates
find /opt -name "*.prompt" -o -name "*prompt*.md" -o -name "*template*" 2>/dev/null | head -20
cat /opt/swarm/agents/forge/prompt.md 2>/dev/null || cat /opt/swarm/agents/forge/system-prompt.txt 2>/dev/null
```

**Check if executor injects feedback:**
```bash
# Look for feedback injection in executor
grep -B5 -A10 "runAgentInVm\|executeAgent" /opt/swarm/engine/lib/executor*.js | head -50
```

### 4. Specific Code Paths to Trace

**Engine → Executor → Agent data flow:**

```
1. Engine._executeAsync(ticket)
   ├── ticket.sentinel_feedback  <-- Is this passed?
   └── executor.runAgentInVm()
       ├── inputs = { ...ticket, sentinel_feedback? }
       └── Agent receives inputs
           └── LLM prompt includes feedback?
```

**Files to examine:**
| File | What to check |
|------|---------------|
| `/opt/swarm/engine/lib/engine.js` | How ticket is passed to executor |
| `/opt/swarm/engine/lib/executor.js` | How inputs are constructed for agent |
| `/opt/swarm/agents/forge/index.js` | How agent uses inputs |
| `/opt/swarm/agents/forge/*.md` | Prompt template - does it mention feedback? |

### 5. Test Commands

**Verify ticket has feedback:**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT sentinel_feedback FROM tickets WHERE id = 'TKT-E2E-IMPL-001'" | head -50
```

**Check engine logs for input construction:**
```bash
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
pm2 logs swarm-engine --lines 100 | grep -E "inputs|feedback|TKT-E2E-IMPL"
```

**Trace a retry execution:**
```bash
# Reset ticket for fresh test with verbose logging
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "UPDATE tickets SET state = 'ready', vm_id = NULL, verification_status = 'pending', 
   assignee_id = 'forge-agent-001', assignee_type = 'agent'
   WHERE id = 'TKT-E2E-IMPL-001'"

# Watch with debug logging
DEBUG=* pm2 restart swarm-engine
pm2 logs swarm-engine --lines 200
```

## Potential Root Causes

### Hypothesis A: Feedback Not Passed to Agent
The executor constructs inputs but doesn't include `sentinel_feedback` from the ticket.

**Fix:** Update executor to include feedback:
```javascript
const inputs = {
  ...ticket.inputs,
  sentinel_feedback: ticket.sentinel_feedback,
  retry_count: ticket.retry_count,
  is_retry: ticket.retry_count > 0
};
```

### Hypothesis B: Agent Prompt Ignores Feedback
Forge's prompt template doesn't instruct the LLM to check for and address prior feedback.

**Fix:** Update Forge prompt:
```markdown
## Prior Review Feedback (if retry)

{{#if sentinel_feedback}}
⚠️ THIS IS A RETRY. Previous code was rejected by Sentinel review.

You MUST address ALL of the following issues:

{{#each sentinel_feedback.feedback_for_agent}}
- {{this}}
{{/each}}

Do NOT regenerate code with the same issues. Each issue above MUST be fixed.
{{/if}}
```

### Hypothesis C: Feedback Format Mismatch
Sentinel stores feedback in a format Forge can't parse (e.g., nested JSON vs flat array).

**Fix:** Normalize feedback format in `setSentinelFailed()` or in executor before passing to agent.

### Hypothesis D: Context Window Overflow
Ticket description + acceptance criteria + feedback exceeds context, and feedback gets truncated.

**Fix:** Prioritize feedback in prompt, summarize if needed.

## Acceptance Criteria for Fix

1. [ ] Forge agent logs show sentinel_feedback in received inputs
2. [ ] LLM prompt includes explicit feedback section when retry_count > 0
3. [ ] Generated code addresses each CRITICAL issue from feedback
4. [ ] Retry success rate improves (track metrics)
5. [ ] Add test: inject known feedback, verify agent response references it

## Implementation Steps

1. **Diagnose**: Run investigation commands above to identify exact failure point
2. **Instrument**: Add logging at executor input construction
3. **Fix**: Update identified component (executor input, agent prompt, or both)
4. **Test**: Reset TKT-E2E-IMPL-001 and run through full cycle
5. **Verify**: Check generated code addresses original 6 issues

## Reference Data

- Test Ticket: `TKT-E2E-IMPL-001`
- Dev Droplet: `134.199.235.140`
- Engine: `/opt/swarm/engine/lib/engine.js`
- Executor: `/opt/swarm/engine/lib/executor.js`
- Forge Agent: `/opt/swarm/agents/forge/`

---
*Created: 2025-12-26 | Post Phase 4 E2E Debug*
