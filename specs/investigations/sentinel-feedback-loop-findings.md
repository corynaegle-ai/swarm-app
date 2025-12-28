# Investigation: Sentinel Feedback Loop - FINDINGS

## Status: CODE EXISTS BUT NOT DEPLOYED

## Key Discovery

The retry logic and learning system code **ALREADY EXISTS** but is **NOT INTEGRATED** into the engine.

### Found Components

| Component | Location | Status |
|-----------|----------|--------|
| `agent-learning.js` | `/opt/swarm-app/apps/platform/lib/agent-learning.js` | ✅ EXISTS, NOT USED |
| Retry Strategy Design | `/opt/swarm-specs/designs/forge-agent-retry-logic.md` | ✅ DESIGN EXISTS |
| Learning System Design | `/opt/swarm-specs/design/agent-learning-system.md` | ✅ DESIGN EXISTS |
| `failTicket()` | `/opt/swarm/engine/lib/engine.js:312` | ❌ BYPASSES RETRY |
| `setSentinelFailed()` | `/opt/swarm/engine/lib/engine.js` | ❌ NO RETRY LOGIC |

### agent-learning.js Capabilities (UNUSED)

```javascript
// Already implemented in /opt/swarm-app/apps/platform/lib/agent-learning.js

// 1. Error Classification
classifyError(errorMessage) → { category, subcategory, confidence }

// 2. Retry Decision
shouldRetryTicket(errorMessage, currentAttempts) → {
  shouldRetry: boolean,
  strategy: object,
  nextDelay: number,
  attemptsRemaining: number
}

// 3. Backoff Calculation
calculateBackoffDelay(errorCategory, attemptNumber) → delayMs

// 4. Retry Strategies (already configured)
RETRY_STRATEGIES = {
  api: { maxRetries: 7, backoffType: 'exponential', baseDelayMs: 1000 },
  timeout: { maxRetries: 5, backoffType: 'exponential', baseDelayMs: 2000 },
  runtime: { maxRetries: 3, backoffType: 'linear', baseDelayMs: 5000 },
  logic: { maxRetries: 2, backoffType: 'linear', baseDelayMs: 3000 },
  syntax: { maxRetries: 0, backoffType: 'none', baseDelayMs: 0 },
  context: { maxRetries: 1, backoffType: 'linear', baseDelayMs: 5000 },
  manual_review: { maxRetries: 0, backoffType: 'none', baseDelayMs: 0 }
}
```

### Current Engine Gap

**Current `failTicket()` (BROKEN)**:
```javascript
async failTicket(error, ticketId) {
    // DIRECTLY CANCELS - NO RETRY LOGIC!
    await this.pgPool.query(`
        UPDATE tickets 
        SET state = 'cancelled', vm_id = NULL, completed_at = NOW(),
            error = $1, rejection_count = COALESCE(rejection_count, 0) + 1
        WHERE id = $2
    `, [error, ticketId]);
}
```

**Current `setSentinelFailed()` (BROKEN)**:
```javascript
async setSentinelFailed(ticketId, reason) {
    // DEAD END - NO RETRY, NO FEEDBACK INJECTION!
    await this.pgPool.query(`
        UPDATE tickets 
        SET state = 'sentinel_failed', vm_id = NULL,
            verification_status = 'sentinel_rejected'
        WHERE id = $1
    `, [ticketId]);
}
```

## Required Integration

### Step 1: Add columns to tickets table

```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentinel_feedback JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hold_reason TEXT;
```

### Step 2: Import agent-learning.js in engine

```javascript
// At top of /opt/swarm/engine/lib/engine.js
const agentLearning = require('/opt/swarm-app/apps/platform/lib/agent-learning');
```

### Step 3: Add retryOrFailTicket() method

```javascript
async retryOrFailTicket(ticketId, error) {
    const ticket = await this.getTicket(ticketId);
    const currentRetryCount = ticket.retry_count || 0;
    
    const decision = agentLearning.shouldRetryTicket(error, currentRetryCount);
    
    if (decision.shouldRetry) {
        const retryAfter = new Date(Date.now() + decision.nextDelay);
        await this.pgPool.query(`
            UPDATE tickets SET 
                state = 'ready',
                vm_id = NULL,
                assignee_id = NULL,
                retry_count = retry_count + 1,
                retry_after = $1,
                error = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [retryAfter, error, ticketId]);
        
        notifyTicketStateChange(ticketId, 'ready', { retry: true, retryAfter });
        return { retried: true, retryAfter };
    } else {
        await this.pgPool.query(`
            UPDATE tickets SET 
                state = 'on_hold',
                vm_id = NULL,
                hold_reason = 'Max retries exceeded',
                error = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [error, ticketId]);
        
        notifyTicketStateChange(ticketId, 'on_hold', { reason: 'max_retries' });
        return { retried: false, reason: 'max_retries' };
    }
}
```

### Step 4: Modify setSentinelFailed() for retry

```javascript
async setSentinelFailed(ticketId, sentinelFeedback) {
    // Store feedback for next attempt
    const feedbackJson = typeof sentinelFeedback === 'string' 
        ? sentinelFeedback 
        : JSON.stringify(sentinelFeedback);
    
    // Check retry eligibility (sentinel rejections should allow 2 retries)
    const ticket = await this.getTicket(ticketId);
    const retryCount = ticket.retry_count || 0;
    const MAX_SENTINEL_RETRIES = 2;
    
    if (retryCount < MAX_SENTINEL_RETRIES) {
        // Requeue for retry with feedback
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'ready',
                vm_id = NULL,
                assignee_id = NULL,
                retry_count = retry_count + 1,
                sentinel_feedback = $1,
                verification_status = 'sentinel_rejected',
                updated_at = NOW()
            WHERE id = $2
        `, [feedbackJson, ticketId]);
        
        notifyTicketStateChange(ticketId, 'ready', { 
            retry: true, 
            reason: 'sentinel_rejection',
            feedbackProvided: true 
        });
        log('INFO', `[SENTINEL] Ticket ${ticketId} requeued for retry (attempt ${retryCount + 1})`);
    } else {
        // Max retries - put on hold for HITL
        await this.pgPool.query(`
            UPDATE tickets 
            SET state = 'on_hold',
                vm_id = NULL,
                sentinel_feedback = $1,
                verification_status = 'sentinel_rejected',
                hold_reason = 'Sentinel rejected after max retries',
                updated_at = NOW()
            WHERE id = $2
        `, [feedbackJson, ticketId]);
        
        notifyTicketStateChange(ticketId, 'on_hold', { reason: 'sentinel_max_retries' });
        log('WARN', `[SENTINEL] Ticket ${ticketId} on hold after ${retryCount} rejections`);
    }
}
```

### Step 5: Modify forge agent to use sentinel_feedback

In the forge agent prompt injection:

```javascript
// When claiming a ticket, check for previous feedback
const ticket = await getTicket(ticketId);

let systemPrompt = BASE_SYSTEM_PROMPT;

if (ticket.sentinel_feedback) {
    const feedback = JSON.parse(ticket.sentinel_feedback);
    systemPrompt += `

## PREVIOUS ATTEMPT FEEDBACK

Your previous implementation was rejected by the sentinel reviewer. Here is the feedback:

${feedback.feedback_for_agent?.join('\n') || 'No specific feedback'}

IMPORTANT: Address ALL issues listed above in your new implementation.
`;
}
```

## Implementation Checklist

- [ ] Add database columns (retry_count, retry_after, sentinel_feedback, hold_reason)
- [ ] Import agent-learning.js in engine
- [ ] Replace failTicket() calls with retryOrFailTicket()
- [ ] Modify setSentinelFailed() to requeue with feedback
- [ ] Modify forge agent to read and use sentinel_feedback
- [ ] Add poll filter for retry_after (don't claim if retry_after > NOW())
- [ ] Test full loop: sentinel_failed → ready (with feedback) → in_progress → ...

## Commands to Deploy

```bash
# 1. Add database columns
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb << 'SQL'
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sentinel_feedback JSONB;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hold_reason TEXT;
SQL"

# 2. Apply engine patch (create patch file with all changes)
# 3. Restart engine: pm2 restart swarm-engine
# 4. Test with a stuck ticket
```
