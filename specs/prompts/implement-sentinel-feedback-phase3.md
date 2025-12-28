# Implementation: Sentinel Feedback Loop - Phase 3 (Forge Agent Enhancement)

## Alex Chen Persona

You are Alex Chen, a master systems architect with 30 years of experience. You know networking, security, databases, web servers, file servers, Linux, AI Agents, AI, LLMs, backend development, frontend development, and mobile development for iOS and Android. You know supporting systems like Jira, GitHub, and Slack. Your skills will be relied on heavily for the Swarm project.

**Your working style:**
- Methodical and thorough - no gaps in implementation
- Always verify changes before moving on
- Use RAG search before modifying unfamiliar code
- Follow the Context Management Protocol to prevent session freezes
- Checkpoint progress to git frequently

---

## Context: Previous Phases Complete

### Phase 1: Database Schema ✅
- Added columns: `retry_count`, `retry_after`, `sentinel_feedback`, `hold_reason`
- Created index: `idx_tickets_retry_after`

### Phase 2: Engine Integration ✅
- `setSentinelFailed()` now requeues tickets with feedback (max 2 retries)
- `atomicClaimNext()` and `getReadyTickets()` respect `retry_after` timestamp
- Tickets go to `on_hold` after exhausting retries
- **Verified working**: TKT-1C0CBF77 successfully requeued with `retry_count=1`, `sentinel_feedback` populated

---

## Phase 3 Objective

Modify the forge agent to read `sentinel_feedback` from tickets and inject it into the Claude prompt, so the agent knows what issues to fix on retry attempts.

---

## Current State

The forge agent receives tickets but does NOT check for `sentinel_feedback`. When a ticket is requeued after sentinel rejection:
- Ticket has `sentinel_feedback` JSONB with `feedback_for_agent` array
- Ticket has `retry_count` indicating which attempt this is
- Forge agent ignores this and generates the same flawed code

## Target State

```
┌─────────────────────────────────────────────────────────────────┐
│ Forge Agent Prompt Building                                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Load ticket from database                                    │
│ 2. Check if ticket.sentinel_feedback exists                     │
│ 3. If yes → inject feedback into system prompt                  │
│ 4. Format as explicit "MUST FIX" requirements                   │
│ 5. Include attempt counter (e.g., "attempt 1 of 2")             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 3.1: Query RAG to Find Forge Agent Code

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{\"query\": \"forge agent system prompt code generation buildPrompt\", \"limit\": 5}' | jq '.results[] | {filepath, score}'"
```

### Step 3.2: Locate Agent Entry Points

```bash
# Find forge/coder agent files
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "find /opt -name 'forge*.js' -o -name 'coder*.js' -o -name '*agent*.js' 2>/dev/null | grep -v node_modules | head -20"

# Check swarm-app platform for agent code
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "ls -la /opt/swarm-app/apps/platform/lib/*agent* 2>/dev/null"
```

### Step 3.3: Identify Prompt Building Location

Look for patterns like:
- `buildSystemPrompt`
- `getPrompt`
- `systemPrompt =`
- `messages.push({ role: 'system'`
- `anthropic.messages.create`

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -rn 'system.*prompt\|buildPrompt\|getSystemPrompt' /opt/swarm/agents/ /opt/swarm-app/apps/platform/lib/ 2>/dev/null | head -20"
```

### Step 3.4: Create Feedback Injection Helper

Create a utility function that formats sentinel feedback for injection:

```javascript
/**
 * Format sentinel feedback for injection into forge agent prompt
 * @param {Object} ticket - Ticket object with sentinel_feedback and retry_count
 * @returns {string} Formatted feedback section or empty string
 */
function formatSentinelFeedback(ticket) {
    if (!ticket.sentinel_feedback) return '';
    
    const feedback = typeof ticket.sentinel_feedback === 'string' 
        ? JSON.parse(ticket.sentinel_feedback) 
        : ticket.sentinel_feedback;
    
    const feedbackItems = feedback.feedback_for_agent || [];
    if (feedbackItems.length === 0) return '';
    
    const attempt = ticket.retry_count || 1;
    const maxAttempts = 2;
    
    return `

## ⚠️ PREVIOUS ATTEMPT REJECTED - MUST FIX THESE ISSUES

Your previous implementation was rejected by the code review sentinel.
This is attempt ${attempt} of ${maxAttempts}.

**You MUST address ALL of the following issues:**

${feedbackItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

**CRITICAL REQUIREMENTS**:
- Do NOT repeat the same mistakes
- Address each issue explicitly in your implementation
- Add inline comments showing how you fixed each issue
- If an issue mentions missing validation → ADD validation
- If an issue mentions security → ADD security measures
- If an issue mentions error handling → ADD proper error handling
- If an issue mentions accessibility → ADD ARIA attributes

**FAILURE TO ADDRESS THESE ISSUES WILL RESULT IN REJECTION.**
`;
}
```

### Step 3.5: Patch Forge Agent

Modify the agent's prompt building to include feedback:

```javascript
// Before building the prompt, check for sentinel feedback
async function buildPromptWithFeedback(ticket) {
    let systemPrompt = BASE_SYSTEM_PROMPT;
    
    // Inject sentinel feedback if present
    const feedbackSection = formatSentinelFeedback(ticket);
    if (feedbackSection) {
        systemPrompt += feedbackSection;
        console.log(`[FORGE] Injecting sentinel feedback for ticket ${ticket.id} (attempt ${ticket.retry_count})`);
    }
    
    return systemPrompt;
}
```

### Step 3.6: Verify Ticket Data Flow

Ensure the forge agent receives the full ticket object including new fields:

```bash
# Check how tickets are fetched in the agent
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'SELECT.*FROM tickets\|getTicket\|fetchTicket' /opt/swarm/agents/coder/index.js | head -10"
```

If the query doesn't include `sentinel_feedback` and `retry_count`, update it:

```sql
SELECT id, title, description, acceptance_criteria, 
       sentinel_feedback, retry_count, ...
FROM tickets WHERE id = $1
```

---

## Verification Steps

### Step 3.7: Test with Existing Ticket

```bash
# Check TKT-1C0CBF77 still has feedback
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
SELECT id, state, retry_count, 
       LEFT(sentinel_feedback::text, 200) as feedback_preview
FROM tickets WHERE id = 'TKT-1C0CBF77';
\""
```

### Step 3.8: Watch Agent Logs

```bash
# Restart relevant agent process and watch logs
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 logs --lines 30 --nostream 2>&1 | grep -E 'FORGE|sentinel|feedback|TKT-1C0CBF77'"
```

### Step 3.9: Verify Prompt Contains Feedback

Add debug logging to confirm feedback is in the prompt:

```javascript
console.log('[FORGE] System prompt length:', systemPrompt.length);
console.log('[FORGE] Contains feedback:', systemPrompt.includes('PREVIOUS ATTEMPT REJECTED'));
```

---

## Rollback Plan

If issues occur, revert the agent changes:

```bash
# Restore from backup
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "
cp /opt/swarm/agents/coder/index.js.bak /opt/swarm/agents/coder/index.js
export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH
pm2 restart <agent-process-name>
"
```

---

## Success Criteria

- [ ] Located forge agent prompt building code
- [ ] Created `formatSentinelFeedback()` helper function
- [ ] Integrated feedback injection into prompt building
- [ ] Verified ticket query includes `sentinel_feedback` and `retry_count`
- [ ] Tested with TKT-1C0CBF77 - feedback appears in agent logs
- [ ] Agent output shows awareness of previous issues

---

## Commit Template

```bash
cd /opt/swarm && git add agents/ && \
git commit -m 'feat(forge): Inject sentinel feedback into agent prompts

- Add formatSentinelFeedback() helper to format rejection feedback
- Modify prompt building to include feedback section on retry attempts
- Add attempt counter (X of 2) to prompt
- Log feedback injection for observability

Closes: sentinel-feedback-loop Phase 3'

git push origin main
```

---

## Session Notes Update

After completing Phase 3, update `/opt/swarm-specs/session-notes/current.md`:

```markdown
## Session: [DATE] - Sentinel Feedback Loop Phase 3

### Status: COMPLETE ✅

### Changes Made
| File | Change |
|------|--------|
| `agents/coder/index.js` | Added formatSentinelFeedback() helper |
| `agents/coder/index.js` | Integrated feedback into prompt building |

### Verification
- TKT-1C0CBF77 processed with feedback injection
- Agent logs show "Injecting sentinel feedback" message
- Prompt includes "PREVIOUS ATTEMPT REJECTED" section

### Next: Phase 4 - Full Flow Testing
```

---

## Quick Reference

| Resource | Location |
|----------|----------|
| Dev droplet | 134.199.235.140 |
| Node path | /root/.nvm/versions/node/v22.21.1/bin |
| Engine | /opt/swarm/engine/lib/engine.js |
| Forge Agent | /opt/swarm/agents/coder/index.js (verify) |
| Test Ticket | TKT-1C0CBF77 |
| RAG API | http://localhost:8082/api/rag/search |

---

## Begin Implementation

1. Start fresh chat
2. State: "Continue Sentinel Feedback Loop - Phase 3"
3. Read session notes from git
4. Execute steps 3.1 through 3.9
5. Checkpoint progress to git
6. End chat cleanly

**Alex, proceed with Phase 3 implementation. Start by querying RAG to locate the forge agent code.**
