# Implementation: Sentinel Feedback Loop Integration

## Objective

Complete the feedback loop so rejected tickets get requeued with sentinel feedback, allowing forge agents to fix issues and retry.

## Current State

- 19 tickets stuck in `sentinel_failed` state
- `agent-learning.js` exists at `/opt/swarm-app/apps/platform/lib/agent-learning.js` with full retry logic
- Engine's `setSentinelFailed()` is a dead end - no retry, no feedback injection
- Forge agents don't receive previous rejection feedback

## Target State

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ in_review   │────▶│  reviewing  │────▶│   merged    │ (success path)
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           │ sentinel rejects
                           ▼
                    ┌─────────────┐
                    │sentinel_fail│
                    └─────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼ retry_count < 2         ▼ retry_count >= 2
        ┌─────────────┐           ┌─────────────┐
        │   ready     │           │  on_hold    │
        │ + feedback  │           │   (HITL)    │
        └─────────────┘           └─────────────┘
              │
              ▼
        ┌─────────────┐
        │ in_progress │  (forge agent reads feedback)
        │ + feedback  │
        └─────────────┘
```

---

## Phase 1: Database Schema Update

### Step 1.1: Add Required Columns

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb << 'SQL'
-- Add retry tracking columns
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentinel_feedback JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hold_reason TEXT;

-- Add index for retry polling
CREATE INDEX IF NOT EXISTS idx_tickets_retry_after ON tickets(retry_after) WHERE retry_after IS NOT NULL;

-- Verify columns added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name IN ('retry_count', 'retry_after', 'sentinel_feedback', 'hold_reason');
SQL"
```

### Step 1.2: Reset Stuck Tickets for Testing

```bash
# Reset the 19 sentinel_failed tickets to test the new flow
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb << 'SQL'
UPDATE tickets 
SET state = 'in_review',
    assignee_id = 'sentinel-agent',
    assignee_type = 'agent',
    retry_count = 0,
    sentinel_feedback = NULL,
    vm_id = NULL
WHERE state = 'sentinel_failed'
AND project_id = 'proj-tenant-mgmt-page';

SELECT COUNT(*) as reset_count FROM tickets 
WHERE state = 'in_review' AND project_id = 'proj-tenant-mgmt-page';
SQL"
```

---

## Phase 2: Engine Integration

### Step 2.1: Create Engine Patch File

Create `/tmp/sentinel-retry-patch.py` locally then scp to droplet:

```python
#!/usr/bin/env python3
"""
Patch engine.js to integrate agent-learning.js for sentinel retry logic
"""

ENGINE_PATH = '/opt/swarm/engine/lib/engine.js'

# 1. Add import at top of file (after existing requires)
IMPORT_PATCH = '''
// Agent Learning System for intelligent retry
let agentLearning = null;
try {
    agentLearning = require('/opt/swarm-app/apps/platform/lib/agent-learning');
    log('INFO', '[engine] Agent learning module loaded');
} catch (e) {
    log('WARN', '[engine] Agent learning module not available: ' + e.message);
}
'''

# 2. Replace setSentinelFailed with retry-aware version
NEW_SET_SENTINEL_FAILED = '''
    /**
     * Handle sentinel rejection with retry logic
     * Requeues ticket with feedback if under retry limit
     */
    async setSentinelFailed(ticketId, sentinelResult) {
        const MAX_SENTINEL_RETRIES = 2;
        
        // Parse feedback
        let feedback = sentinelResult;
        if (typeof sentinelResult === 'string') {
            try {
                feedback = JSON.parse(sentinelResult);
            } catch (e) {
                feedback = { raw: sentinelResult };
            }
        }
        
        // Get current retry count
        const ticketResult = await this.pgPool.query(
            'SELECT retry_count FROM tickets WHERE id = $1',
            [ticketId]
        );
        const currentRetryCount = ticketResult.rows[0]?.retry_count || 0;
        
        if (currentRetryCount < MAX_SENTINEL_RETRIES) {
            // Requeue for retry with feedback injected
            const retryDelay = (currentRetryCount + 1) * 5000; // 5s, 10s backoff
            const retryAfter = new Date(Date.now() + retryDelay);
            
            await this.pgPool.query(`
                UPDATE tickets 
                SET state = 'ready',
                    vm_id = NULL,
                    assignee_id = NULL,
                    assignee_type = NULL,
                    retry_count = retry_count + 1,
                    retry_after = $1,
                    sentinel_feedback = $2,
                    verification_status = 'sentinel_rejected',
                    updated_at = NOW()
                WHERE id = $3
            `, [retryAfter, JSON.stringify(feedback), ticketId]);
            
            notifyTicketStateChange(ticketId, 'ready', { 
                retry: true, 
                attempt: currentRetryCount + 1,
                maxAttempts: MAX_SENTINEL_RETRIES,
                feedbackProvided: true 
            });
            
            await this.emitEvent(ticketId, 'sentinel_retry', 'reviewing', 'ready', {
                attempt: currentRetryCount + 1,
                feedback: feedback.feedback_for_agent || []
            });
            
            log('INFO', `[SENTINEL] Ticket ${ticketId} requeued for retry (attempt ${currentRetryCount + 1}/${MAX_SENTINEL_RETRIES})`);
        } else {
            // Max retries exceeded - put on hold for human review
            await this.pgPool.query(`
                UPDATE tickets 
                SET state = 'on_hold',
                    vm_id = NULL,
                    sentinel_feedback = $1,
                    verification_status = 'sentinel_rejected',
                    hold_reason = 'Sentinel rejected after ' || $2 || ' attempts',
                    updated_at = NOW()
                WHERE id = $3
            `, [JSON.stringify(feedback), currentRetryCount, ticketId]);
            
            notifyTicketStateChange(ticketId, 'on_hold', { 
                reason: 'sentinel_max_retries',
                attempts: currentRetryCount 
            });
            
            await this.emitEvent(ticketId, 'sentinel_exhausted', 'reviewing', 'on_hold', {
                attempts: currentRetryCount,
                feedback: feedback.feedback_for_agent || []
            });
            
            log('WARN', `[SENTINEL] Ticket ${ticketId} on hold after ${currentRetryCount} sentinel rejections`);
        }
    }
'''

# 3. Modify atomicClaimNext to respect retry_after
CLAIM_FILTER_PATCH = '''
            -- Add retry_after filter
            AND (retry_after IS NULL OR retry_after <= NOW())
'''

def apply_patch():
    print("[1/4] Reading engine.js...")
    with open(ENGINE_PATH, 'r') as f:
        content = f.read()
    
    # Backup
    with open(ENGINE_PATH + '.bak-retry', 'w') as f:
        f.write(content)
    print("      Backup: engine.js.bak-retry")
    
    # Check if already patched
    if 'agentLearning = require' in content:
        print("[!] Engine already has agent-learning import. Checking other patches...")
    else:
        # Add import after first require block
        print("[2/4] Adding agent-learning import...")
        import_pos = content.find("const { verify }")
        if import_pos > 0:
            # Find end of line
            eol = content.find('\n', import_pos)
            content = content[:eol+1] + IMPORT_PATCH + content[eol+1:]
            print("      Added import after verify import")
    
    # Replace setSentinelFailed
    print("[3/4] Replacing setSentinelFailed with retry-aware version...")
    old_method_start = content.find('async setSentinelFailed(ticketId, reason)')
    if old_method_start == -1:
        old_method_start = content.find('async setSentinelFailed(ticketId,')
    
    if old_method_start > 0:
        # Find the end of the method (next async or closing brace pattern)
        method_end = content.find('\n    async ', old_method_start + 1)
        if method_end == -1:
            method_end = content.find('\n    /**\n     * ', old_method_start + 100)
        
        if method_end > old_method_start:
            old_method = content[old_method_start:method_end]
            content = content[:old_method_start] + NEW_SET_SENTINEL_FAILED.strip() + '\n\n    ' + content[method_end+5:]
            print("      Replaced setSentinelFailed method")
        else:
            print("[!] Could not find method end boundary")
    else:
        print("[!] Could not find setSentinelFailed method")
    
    # Add retry_after filter to atomicClaimNext
    print("[4/4] Adding retry_after filter to claim query...")
    claim_where = "WHERE state = 'ready'"
    if claim_where in content and 'retry_after IS NULL' not in content:
        content = content.replace(
            claim_where,
            claim_where + "\n              AND (retry_after IS NULL OR retry_after <= NOW())"
        )
        print("      Added retry_after filter")
    elif 'retry_after IS NULL' in content:
        print("      retry_after filter already present")
    
    # Write patched content
    print("\n[*] Writing patched engine.js...")
    with open(ENGINE_PATH, 'w') as f:
        f.write(content)
    
    print("[✓] Patch complete!")
    print("\nNext: Restart engine with 'pm2 restart swarm-engine'")

if __name__ == '__main__':
    apply_patch()
```

### Step 2.2: Apply Engine Patch

```bash
# Transfer and run patch
scp -i ~/.ssh/swarm_key /tmp/sentinel-retry-patch.py root@134.199.235.140:/tmp/
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "python3 /tmp/sentinel-retry-patch.py"
```

### Step 2.3: Restart Engine

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 restart swarm-engine && sleep 2 && pm2 logs swarm-engine --lines 20 --nostream"
```

---

## Phase 3: Forge Agent Enhancement

### Step 3.1: Find Forge Agent Prompt Location

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"forge agent system prompt code generation task\", \"limit\": 5}' | jq '.results[] | .filepath' | head -5"
```

### Step 3.2: Locate Agent Entry Point

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "find /opt -name 'forge*.js' -o -name 'coder*.js' 2>/dev/null | head -10"
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "head -100 /opt/swarm/agents/coder/index.js"
```

### Step 3.3: Create Feedback Injection Patch

The forge agent needs to check for `sentinel_feedback` and inject it into the prompt:

```javascript
// Add to forge agent's task preparation (before calling Claude API)

async function buildPromptWithFeedback(ticket) {
    let systemPrompt = BASE_SYSTEM_PROMPT;
    
    // Check for previous sentinel feedback
    if (ticket.sentinel_feedback) {
        const feedback = typeof ticket.sentinel_feedback === 'string' 
            ? JSON.parse(ticket.sentinel_feedback) 
            : ticket.sentinel_feedback;
        
        const feedbackItems = feedback.feedback_for_agent || [];
        
        if (feedbackItems.length > 0) {
            systemPrompt += `

## ⚠️ PREVIOUS ATTEMPT REJECTED - MUST FIX THESE ISSUES

Your previous implementation was rejected by the code review sentinel. 
This is attempt ${ticket.retry_count || 1} of 2.

**You MUST address ALL of the following issues:**

${feedbackItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

**IMPORTANT**: 
- Do NOT repeat the same mistakes
- Address each issue explicitly in your implementation
- Add comments showing how you fixed each issue
- If an issue mentions missing validation, ADD validation
- If an issue mentions security, ADD security measures
- If an issue mentions error handling, ADD proper error handling
`;
        }
    }
    
    return systemPrompt;
}
```

### Step 3.4: Apply Forge Agent Patch

```bash
# Find the exact location to patch
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'system.*prompt\|buildPrompt\|getPrompt' /opt/swarm/agents/coder/index.js | head -10"

# Create patch based on what we find
# (Exact patch depends on current agent structure)
```

---

## Phase 4: Verification & Testing

### Step 4.1: Verify Database Schema

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tickets' 
AND column_name IN ('retry_count', 'retry_after', 'sentinel_feedback', 'hold_reason');
\""
```

### Step 4.2: Verify Engine Changes

```bash
# Check new method exists
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'MAX_SENTINEL_RETRIES\|retry_count < MAX\|sentinel_retry' /opt/swarm/engine/lib/engine.js | head -10"

# Check retry_after filter in claim
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -A5 \"WHERE state = 'ready'\" /opt/swarm/engine/lib/engine.js | head -10"
```

### Step 4.3: Test with Single Ticket

```bash
# Pick one ticket and watch it flow through
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
SELECT id, state, retry_count, 
       LEFT(sentinel_feedback::text, 100) as feedback_preview
FROM tickets 
WHERE project_id = 'proj-tenant-mgmt-page'
ORDER BY updated_at DESC
LIMIT 5;
\""
```

### Step 4.4: Monitor Engine Logs

```bash
# Watch for SENTINEL retry messages
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 logs swarm-engine --lines 50 --nostream 2>&1 | grep -i 'sentinel\|retry\|requeue'"
```

### Step 4.5: Full Flow Test

```sql
-- After implementation, watch a ticket go through:
-- 1. in_review (assigned to sentinel-agent)
-- 2. reviewing (sentinel processing)
-- 3. ready + sentinel_feedback (if rejected, retry_count = 1)
-- 4. in_progress (forge agent with feedback)
-- 5. verifying
-- 6. in_review (second sentinel review)
-- 7. merged (if approved) OR on_hold (if rejected again)

SELECT id, state, retry_count, 
       created_at, updated_at,
       LEFT(sentinel_feedback::text, 50) as feedback
FROM tickets 
WHERE id = 'TKT-XXXXXXXX'
ORDER BY updated_at;
```

---

## Rollback Plan

If issues occur:

```bash
# Restore engine backup
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "
cp /opt/swarm/engine/lib/engine.js.bak-retry /opt/swarm/engine/lib/engine.js
export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH
pm2 restart swarm-engine
"

# DB columns are safe to keep (no data loss if unused)
```

---

## Success Criteria

- [ ] DB columns added: retry_count, retry_after, sentinel_feedback, hold_reason
- [ ] Engine imports agent-learning.js
- [ ] setSentinelFailed() requeues with feedback on first rejection
- [ ] setSentinelFailed() sets on_hold after 2 rejections  
- [ ] atomicClaimNext() respects retry_after timestamp
- [ ] Forge agent receives and uses sentinel_feedback in prompt
- [ ] At least one ticket successfully retries and gets different review result
- [ ] Metrics: retry_count properly incremented
- [ ] on_hold tickets have proper hold_reason

---

## Commit Checklist

After successful testing:

```bash
# Engine changes
cd /opt/swarm && git add engine/lib/engine.js && \
git commit -m 'feat(engine): Add sentinel retry logic with feedback injection

- Integrate agent-learning.js for intelligent retry decisions
- setSentinelFailed() now requeues tickets with feedback (max 2 retries)
- Add retry_after filter to atomicClaimNext() to respect backoff
- Tickets go to on_hold after exhausting retries'

# Agent changes (if modified)
cd /opt/swarm && git add agents/ && \
git commit -m 'feat(forge): Inject sentinel feedback into agent prompts

- Read sentinel_feedback from ticket
- Format feedback as explicit fix requirements
- Add attempt counter to prompt'

git push origin main
```

---

## Reference: Key File Locations

| Component | Path |
|-----------|------|
| Engine | `/opt/swarm/engine/lib/engine.js` |
| Agent Learning | `/opt/swarm-app/apps/platform/lib/agent-learning.js` |
| Forge Agent | `/opt/swarm/agents/coder/index.js` |
| Design Doc | `/opt/swarm-specs/designs/forge-agent-retry-logic.md` |
| Investigation | `/opt/swarm-specs/investigations/sentinel-feedback-loop-findings.md` |
