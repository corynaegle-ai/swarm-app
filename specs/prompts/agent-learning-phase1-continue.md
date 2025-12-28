# Agent Learning System - Phase 1 Continuation Prompt

## Context
You are continuing implementation of the **Agent Learning System** for Project Swarm. This system enables Claude agents to improve through structured error correction and pattern learning.

## Completed Steps

| Step | Status | Summary |
|------|--------|---------|
| 1. Read Spec | ✅ | 4-phase system, 3 tables, 7 error categories |
| 2. Examine Agent Runner | ✅ | `/opt/swarm/agents/pull-agent-v2.js` (580 lines) |
| 3. Database Schema | ✅ | Tables exist: `agent_executions`, `execution_errors`, `learned_rules` |
| 4. Logging Infrastructure | ✅ | `/opt/swarm-platform/lib/agent-learning.js` deployed and tested |

## Key File Locations

```
Agent Runner:     /opt/swarm/agents/pull-agent-v2.js
Learning Module:  /opt/swarm-platform/lib/agent-learning.js
Database:         /opt/swarm-platform/data/swarm.db
Platform API:     /opt/swarm-platform/server.js
```

## Logging Module API

```javascript
const al = require('/opt/swarm-platform/lib/agent-learning.js');

// Log successful execution
al.logExecution({
  taskId: 'ticket-uuid',
  agentId: 'vm-agent-id',
  tenantId: null,              // optional
  model: 'claude-sonnet-4-20250514',
  inputTokens: 1500,
  outputTokens: 3200,
  startedAt: '2025-12-15T00:00:00Z',
  completedAt: '2025-12-15T00:00:05Z',
  durationMs: 5000,
  outcome: 'success',          // success|failure|timeout|cancelled
  prUrl: 'https://github.com/...',
  filesChanged: ['file1.js'],
  criteriaStatus: [{id: 'AC-1', status: 'SATISFIED'}]
});

// Log failure with auto error classification
al.logExecutionWithError({
  taskId, agentId, model, inputTokens, outputTokens,
  startedAt, durationMs,
  outcome: 'failure',
  errorMessage: 'Error 429: rate limit exceeded'
});

// Classify error manually
al.classifyError('ENOENT: file not found');
// → { category: 'runtime', subcategory: 'file', confidence: 0.8 }

// Clean shutdown
al.close();
```

## Remaining Steps

### Step 5: Instrument Agent Runner (30 min)

Modify `/opt/swarm/agents/pull-agent-v2.js` to call the logging module.

**Integration Points Identified:**

1. **At top of file** - Add import:
```javascript
const agentLearning = require('/opt/swarm-platform/lib/agent-learning.js');
```

2. **In `processTicket()` function** - Capture start time:
```javascript
async function processTicket(ticket, projectSettings = {}) {
  const executionStart = Date.now();
  const startedAt = new Date().toISOString();
  // ... existing code
}
```

3. **In `generateCode()` return** - Extract token usage from Claude API response:
```javascript
// After Claude API call, capture:
const inputTokens = res.data.usage?.input_tokens || 0;
const outputTokens = res.data.usage?.output_tokens || 0;
```

4. **After `completeTicket(true)` success path** (~line 497):
```javascript
agentLearning.logExecution({
  taskId: ticket.id,
  agentId: CONFIG.agentId,
  model: selectModel(ticket, projectSettings),
  inputTokens, outputTokens,
  startedAt,
  completedAt: new Date().toISOString(),
  durationMs: Date.now() - executionStart,
  outcome: 'success',
  prUrl,
  filesChanged: filesWritten,
  criteriaStatus: result.criteriaStatus
});
```

5. **In `catch` block** (~line 502):
```javascript
agentLearning.logExecutionWithError({
  taskId: ticket.id,
  agentId: CONFIG.agentId,
  model: selectModel(ticket, projectSettings),
  inputTokens: inputTokens || 0,
  outputTokens: outputTokens || 0,
  startedAt,
  durationMs: Date.now() - executionStart,
  outcome: 'failure',
  errorMessage: err.message
});
```

6. **On shutdown** - Close DB connection:
```javascript
function shutdown(signal) {
  log.info('Shutdown signal received', { signal });
  running = false;
  agentLearning.close();
}
```

**Important**: Make logging non-blocking - wrap in try/catch so failures don't crash the agent.

---

### Step 6: Query & Reporting Layer (45 min)

Create `/opt/swarm-platform/lib/learning-queries.js`:

```javascript
// Required queries:
getExecutionStats(startDate, endDate, tenantId)
getCommonErrors(limit, category, tenantId)
getSuccessPatterns(minSuccessRate, tenantId)
getTokenUsageTrend(days, tenantId)
```

Add dashboard endpoints to `/opt/swarm-platform/server.js`:

```javascript
// GET /api/learning/execution-summary
// GET /api/learning/error-distribution  
// GET /api/learning/success-patterns
// GET /api/learning/token-usage
```

---

### Step 7: Validation & Baseline (30 min)

1. Run 3-5 manual agent executions (or simulate with test data)
2. Verify logging captures ≥90% of executions
3. Check error classifier handles test cases correctly
4. Confirm views return expected data
5. Document baseline metrics

---

### Step 8: Checkpoint & Documentation (15 min)

1. Update session notes in git
2. Commit all changes
3. Document success criteria met

---

## Success Criteria Checklist

- [ ] Agent runner imports and uses agent-learning.js
- [ ] Success executions logged with tokens, timing, PR URL
- [ ] Failed executions logged with classified errors
- [ ] Logging is non-blocking (doesn't crash agent on DB errors)
- [ ] Query layer exposes execution stats via API
- [ ] Dashboard can display execution timeline
- [ ] Zero regressions in ticket orchestration

## SSH Access

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH
```

## Testing Commands

```bash
# Verify module works
cd /opt/swarm-platform && node -e "const al = require('./lib/agent-learning.js'); console.log(Object.keys(al));"

# Check current execution count
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT COUNT(*) FROM agent_executions"

# View execution summary
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT * FROM v_execution_summary"

# View error distribution
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT * FROM v_common_errors"
```

## Start Command

Begin with Step 5: Instrument the agent runner at `/opt/swarm/agents/pull-agent-v2.js`
