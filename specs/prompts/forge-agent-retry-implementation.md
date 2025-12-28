# Forge Agent Retry Implementation Prompt

## Objective

Replace the execution engine's direct `failTicket()` with intelligent retry logic that uses the existing `agent-learning.js` error classification system. Tickets should retry with exponential backoff for transient errors and go to `on_hold` state only after exhausting retries.

## Requirements

1. **Add `retry_after` column** to tickets table for backoff scheduling
2. **Create `retryOrFailTicket()` method** in engine that uses agent-learning.js
3. **Update `getReadyTickets()` query** to respect `retry_after` timestamp
4. **Replace all `failTicket()` calls** with `retryOrFailTicket()` 
5. **Add activity logging** for retry decisions
6. **Add WebSocket notifications** for retry events

## Implementation Steps

### Step 1: Add Schema Column

```sql
-- Run on PostgreSQL
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_strategy JSONB;
```

### Step 2: Create Retry Method in Engine

Add to `engine/lib/engine.js`:

```javascript
/**
 * Intelligently retry or fail a ticket based on error classification
 * @param {string} ticketId - Ticket ID
 * @param {string} error - Error message
 * @returns {Promise<{retried: boolean, onHold?: boolean, retryAfter?: Date}>}
 */
async retryOrFailTicket(ticketId, error) {
    // Import agent-learning dynamically
    const agentLearning = (await import('../lib/agent-learning.js')).default || 
                          await import('../lib/agent-learning.js');
    
    // Get current retry count
    const result = await this.pgPool.query(
        'SELECT retry_count, rejection_count FROM tickets WHERE id = $1',
        [ticketId]
    );
    
    if (!result.rows[0]) {
        log('ERROR', `Ticket ${ticketId} not found for retry decision`);
        return { retried: false };
    }
    
    const currentRetryCount = result.rows[0].retry_count || 0;
    
    // Use intelligent retry strategy from agent-learning.js
    const retryDecision = agentLearning.shouldRetryTicket(error, currentRetryCount);
    const { shouldRetry, classification, strategy, nextDelay, attemptsRemaining } = retryDecision;
    
    log('INFO', `Retry decision for ${ticketId}`, {
        errorCategory: classification.category,
        currentAttempt: currentRetryCount + 1,
        maxRetries: strategy.maxRetries,
        shouldRetry,
        nextDelayMs: nextDelay
    });
    
    // Log to activity system
    const activity = (await import('../lib/activity-logger.js')).default ||
                     await import('../lib/activity-logger.js');
    
    if (shouldRetry) {
        const retryAfter = new Date(Date.now() + nextDelay);
        
        await this.pgPool.query(`
            UPDATE tickets SET 
                state = 'ready',
                vm_id = NULL,
                assignee_id = NULL,
                assignee_type = NULL,
                retry_count = COALESCE(retry_count, 0) + 1,
                retry_after = $1,
                retry_strategy = $2,
                error = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [
            retryAfter,
            JSON.stringify({
                errorCategory: classification.category,
                errorSubcategory: classification.subcategory,
                maxRetries: strategy.maxRetries,
                backoffType: strategy.backoffType,
                nextDelayMs: nextDelay,
                attemptsRemaining
            }),
            error,
            ticketId
        ]);
        
        // Log activity
        try {
            await activity.log(ticketId, 'ticket_retry_scheduled', {
                errorCategory: classification.category,
                currentAttempt: currentRetryCount + 1,
                maxRetries: strategy.maxRetries,
                retryAfter: retryAfter.toISOString(),
                delayMs: nextDelay
            }, 'system');
        } catch (e) { /* activity logging non-critical */ }
        
        // WebSocket notification
        notifyTicketStateChange(ticketId, 'ready', {
            retry: true,
            retryAfter: retryAfter.toISOString(),
            attemptsRemaining,
            errorCategory: classification.category
        });
        
        return { retried: true, retryAfter };
        
    } else {
        const holdReason = `Max retries exceeded for ${classification.category} error (${strategy.maxRetries} attempts)`;
        
        await this.pgPool.query(`
            UPDATE tickets SET 
                state = 'on_hold',
                vm_id = NULL,
                assignee_id = NULL,
                assignee_type = NULL,
                hold_reason = $1,
                error = $2,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
        `, [holdReason, error, ticketId]);
        
        // Log activity
        try {
            await activity.log(ticketId, 'ticket_on_hold', {
                reason: 'max_retries_exceeded',
                errorCategory: classification.category,
                totalAttempts: currentRetryCount + 1,
                error: error.substring(0, 500)
            }, 'system');
        } catch (e) { /* activity logging non-critical */ }
        
        // WebSocket notification
        notifyTicketStateChange(ticketId, 'on_hold', {
            reason: 'max_retries',
            errorCategory: classification.category,
            totalAttempts: currentRetryCount + 1
        });
        
        return { retried: false, onHold: true };
    }
}
```

### Step 3: Update getReadyTickets Query

Modify the query in `engine/lib/engine.js`:

```javascript
async getReadyTickets(limit = 10) {
    const result = await this.pgPool.query(`
        SELECT t.*, d.definition, d.name as design_name
        FROM tickets t
        LEFT JOIN designs d ON t.design_id = d.id
        WHERE t.state = 'ready' 
          AND t.assignee_type = 'agent'
          AND (t.retry_after IS NULL OR t.retry_after <= NOW())
        ORDER BY t.priority DESC, t.created_at ASC
        LIMIT $1
    `, [limit]);
    return result.rows;
}
```

### Step 4: Replace failTicket Calls

Find and replace all calls to `failTicket()` with `retryOrFailTicket()`:

```javascript
// BEFORE
await this.failTicket(error.message, ticketId);

// AFTER  
await this.retryOrFailTicket(ticketId, error.message);
```

### Step 5: Keep failTicket for Non-Retry Cases

Keep the original `failTicket()` for cases that should never retry (e.g., verification failures after approval):

```javascript
async failTicketNoRetry(ticketId, error) {
    await this.pgPool.query(`
        UPDATE tickets SET 
            state = 'cancelled',
            vm_id = NULL,
            error = $1,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $2
    `, [error, ticketId]);
    
    notifyTicketStateChange(ticketId, 'cancelled', { error: error?.substring?.(0, 200) });
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `engine/lib/engine.js` | Add `retryOrFailTicket()`, update `getReadyTickets()`, rename `failTicket()` to `failTicketNoRetry()` |
| `apps/platform/lib/agent-learning.js` | Ensure exported properly (may need `module.exports = { shouldRetryTicket, classifyError, ... }`) |
| Database schema | Add `retry_after` and `retry_strategy` columns |

## Acceptance Criteria

- [ ] `retry_after` column exists in tickets table
- [ ] Transient errors (rate limits, timeouts) retry 3 times with exponential backoff
- [ ] API errors retry 2 times with linear backoff
- [ ] Code errors retry once then go to `on_hold`
- [ ] Tickets don't get picked up before `retry_after` expires
- [ ] Activity log shows retry decisions with error classification
- [ ] WebSocket broadcasts retry events to dashboard
- [ ] Dashboard shows "Retrying in Xs" status for scheduled retries
- [ ] After max retries, ticket goes to `on_hold` (not `cancelled`)

## Testing Commands

```bash
# 1. Add schema columns
psql -U swarm -d swarm_dev -c "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;"
psql -U swarm -d swarm_dev -c "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_strategy JSONB;"

# 2. Restart engine
pm2 restart swarm-engine

# 3. Create test ticket that will fail
curl -X POST http://localhost:8080/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"title":"Test retry logic","description":"This should fail and retry"}'

# 4. Monitor retry behavior
tail -f /var/log/swarm-engine.log | grep -E "(retry|Retry|RETRY)"

# 5. Check ticket state transitions
psql -U swarm -d swarm_dev -c "SELECT id, state, retry_count, retry_after, error FROM tickets ORDER BY updated_at DESC LIMIT 5;"
```

## RAG Query

Before implementing, query the RAG system:
```bash
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "engine failTicket processTicket error handling", "limit": 8}'
```

This will show all current usages of `failTicket()` that need to be updated.
