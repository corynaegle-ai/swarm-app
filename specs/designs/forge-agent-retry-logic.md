# Forge Agent Retry Logic Design

## Problem Statement

The execution engine's `failTicket()` method directly sets ticket state to `cancelled`, bypassing the intelligent retry system already built in `agent-learning.js`. This causes:
- All agent failures to immediately cancel tickets
- No automatic retries for transient errors (API rate limits, timeouts)
- Lost work requiring manual intervention

## Current Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  forge-agent-v4.js  │────▶│   engine.js          │
│  (runs in VM)       │     │  failTicket()        │
└─────────────────────┘     └──────────────────────┘
         │                           │
         │                           ▼
         │                  ┌──────────────────────┐
         │                  │ tickets.state =      │
         │                  │ 'cancelled'          │
         │                  │ (BYPASSES RETRY!)    │
         │                  └──────────────────────┘
         │
         ▼ (Not currently used by engine)
┌─────────────────────────────────────────────────────┐
│  tickets-legacy.js POST /fail                       │
│  - Uses agent-learning.js for error classification  │
│  - Calculates retry strategy with backoff           │
│  - Sets state to 'ready' for retry or 'on_hold'     │
└─────────────────────────────────────────────────────┘
```

## Proposed Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│  forge-agent-v4.js  │────▶│  engine.js                       │
│  (returns error)    │     │  retryOrFailTicket()             │
└─────────────────────┘     │  - classifyError()               │
                            │  - shouldRetryTicket()           │
                            │  - calculateBackoff()            │
                            └──────────────────────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
               ┌─────────────────┐            ┌─────────────────┐
               │ state = 'ready' │            │ state = 'on_hold'│
               │ retry_after set │            │ max retries hit  │
               │ retry_count++   │            │ needs human      │
               └─────────────────┘            └─────────────────┘
```

## Error Classification Categories

From `agent-learning.js`:

| Category | Max Retries | Backoff | Examples |
|----------|-------------|---------|----------|
| transient | 3 | exponential | Rate limits, 503s, timeouts |
| api_error | 2 | linear | API errors, auth failures |
| code_error | 1 | none | Syntax errors, logic issues |
| system_error | 2 | exponential | ENOENT, EACCES, git failures |
| unknown | 1 | linear | Unclassified errors |

## State Machine

```
         ┌────────────────────────────────────────────┐
         │                                            │
         ▼                                            │
    ┌─────────┐    claim    ┌─────────────┐          │
    │  ready  │────────────▶│ in_progress │          │
    └─────────┘             └─────────────┘          │
         ▲                        │                   │
         │                        │                   │
         │    ┌───────────────────┤                   │
         │    │                   │                   │
         │    │ success           │ failure           │
         │    │                   │                   │
         │    ▼                   ▼                   │
         │  ┌─────────────┐  ┌──────────────────┐    │
         │  │needs_review │  │ retryOrFail()    │    │
         │  └─────────────┘  │ classifyError()  │    │
         │                   └──────────────────┘    │
         │                        │                   │
         │         ┌──────────────┴──────────────┐   │
         │         │                             │   │
         │         ▼ shouldRetry=true            ▼   │
         │   retry_count < max          retry_count >= max
         │         │                             │
         └─────────┘                             │
                                                 ▼
                                          ┌──────────┐
                                          │ on_hold  │
                                          │ (HITL)   │
                                          └──────────┘
```

## Implementation Components

### 1. Engine Retry Method

**File**: `engine/lib/engine.js`

```javascript
async retryOrFailTicket(ticketId, error) {
    const agentLearning = await import('../lib/agent-learning.js');
    
    // Get current ticket state
    const ticket = await this.pgPool.query(
        'SELECT retry_count, rejection_count FROM tickets WHERE id = $1',
        [ticketId]
    );
    
    const currentRetryCount = ticket.rows[0]?.retry_count || 0;
    
    // Use intelligent retry strategy
    const retryDecision = agentLearning.shouldRetryTicket(error, currentRetryCount);
    
    if (retryDecision.shouldRetry) {
        // Return to ready queue with retry delay
        const retryAfter = new Date(Date.now() + retryDecision.nextDelay);
        
        await this.pgPool.query(`
            UPDATE tickets SET 
                state = 'ready',
                vm_id = NULL,
                retry_count = retry_count + 1,
                retry_after = $1,
                error = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [retryAfter, error, ticketId]);
        
        notifyTicketStateChange(ticketId, 'ready', { 
            retry: true, 
            retryAfter,
            attemptsRemaining: retryDecision.attemptsRemaining 
        });
        
        return { retried: true, retryAfter };
    } else {
        // Max retries exceeded - put on hold for HITL
        await this.pgPool.query(`
            UPDATE tickets SET 
                state = 'on_hold',
                vm_id = NULL,
                hold_reason = $1,
                error = $2,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
        `, [
            `Max retries exceeded: ${retryDecision.classification.category}`,
            error,
            ticketId
        ]);
        
        notifyTicketStateChange(ticketId, 'on_hold', { 
            reason: 'max_retries',
            errorCategory: retryDecision.classification.category
        });
        
        return { retried: false, onHold: true };
    }
}
```

### 2. Ready Ticket Query Update

**File**: `engine/lib/engine.js`

Add retry_after check to prevent picking up tickets before their backoff expires:

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

### 3. Schema Addition

```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_after TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS retry_strategy JSONB;
```

### 4. Activity Logging

Each retry/fail decision should log to activity:

```javascript
await activity.log(ticketId, 'retry_decision', {
    errorCategory: retryDecision.classification.category,
    currentAttempt: currentRetryCount + 1,
    maxRetries: retryDecision.strategy.maxRetries,
    shouldRetry: retryDecision.shouldRetry,
    nextDelayMs: retryDecision.nextDelay
}, 'system');
```

## Metrics to Track

| Metric | Description |
|--------|-------------|
| `tickets_retried_total` | Counter by error category |
| `tickets_retry_exhausted_total` | Counter for max retries hit |
| `retry_delay_seconds` | Histogram of backoff delays |
| `retry_success_rate` | % of retries that succeed |

## Testing Plan

1. **Unit Tests**
   - Error classification accuracy
   - Backoff calculation correctness
   - State transition validation

2. **Integration Tests**
   - Simulate API timeout → verify retry with backoff
   - Simulate syntax error → verify single retry then on_hold
   - Simulate transient error → verify 3 retries then on_hold

3. **E2E Test**
   - Create ticket that will fail with rate limit error
   - Verify it retries with exponential backoff
   - Verify after max retries it goes to on_hold
   - Verify human can release from on_hold

## Rollout Plan

1. Add `retry_after` column to tickets table
2. Update `getReadyTickets()` to respect `retry_after`
3. Replace `failTicket()` calls with `retryOrFailTicket()`
4. Add activity logging for retry decisions
5. Monitor metrics dashboard for retry patterns
