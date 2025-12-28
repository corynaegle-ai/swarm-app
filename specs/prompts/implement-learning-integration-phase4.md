# Implementation: Learning Integration Phase 4 - End-to-End Telemetry

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
- Learning tables: `agent_executions`, `agent_patterns`, `agent_rules`
- Logging module: `/opt/swarm-app/apps/platform/lib/agent-learning.js`
- Query layer: `/opt/swarm-app/apps/platform/lib/learning-queries.js`

### Phase 2: Pattern Detection & Dashboard (Partial)
- API routes: `/api/learning/*` endpoints for stats, errors, patterns
- Dashboard UI components exist but need wiring

### Phase 3: Sentinel Feedback Loop ✅
- Retry columns: `retry_count`, `retry_after`, `sentinel_feedback`, `hold_reason`
- Engine integration: `setSentinelFailed()` requeues with feedback (max 2 retries)
- Tickets go to `on_hold` after exhausting retries

---

## Phase 4 Objectives

**Wire the complete learning telemetry loop:**
1. Forge agent logs execution start/completion to learning system
2. Forge agent reads sentinel feedback and injects into Claude prompts
3. Learning patterns influence agent behavior (model selection, retry strategies)
4. Real-time metrics exposed via existing API endpoints

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          LEARNING TELEMETRY FLOW                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐          │
│  │ Forge Agent │────────▶│   Engine    │────────▶│  Sentinel   │          │
│  │  (VM)       │  start  │  (Host)     │ review  │   Agent     │          │
│  └─────────────┘         └─────────────┘         └─────────────┘          │
│         │                       │                       │                  │
│         │ telemetry             │                       │ verdict          │
│         ▼                       │                       ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     agent-learning.js                                │  │
│  │  • startExecution() → record execution start                         │  │
│  │  • completeExecution() → record outcome, tokens, timing              │  │
│  │  • getPatterns() → analyze success/failure patterns                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│         │                                                                  │
│         ▼                                                                  │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐          │
│  │ PostgreSQL  │────────▶│ Learning    │────────▶│  Dashboard  │          │
│  │ Tables      │  query  │ Queries     │   API   │    UI       │          │
│  └─────────────┘         └─────────────┘         └─────────────┘          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Add Telemetry to Forge Agent (45 min)

### 1.1 Create Learning Client Module

Create `/opt/swarm-agents/forge-agent/lib/learning-client.js`:

```javascript
/**
 * Learning Client - Reports execution telemetry to Swarm Platform
 * 
 * Communicates with host's platform API to record:
 * - Execution starts (task claim)
 * - Execution completions (success/failure with metrics)
 * - Error categorization for pattern analysis
 */

const http = require('http');

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://10.0.0.1:8080';

class LearningClient {
  constructor(agentId, tenantId = 'default') {
    this.agentId = agentId;
    this.tenantId = tenantId;
    this.currentExecutionId = null;
  }

  /**
   * Record execution start
   * @param {Object} params - { taskId, model, projectId }
   * @returns {Promise<string>} executionId
   */
  async startExecution({ taskId, model, projectId }) {
    const payload = {
      taskId,
      agentId: this.agentId,
      tenantId: this.tenantId,
      model: model || 'claude-sonnet-4-20250514',
      projectId
    };

    try {
      const result = await this._post('/api/learning/executions/start', payload);
      this.currentExecutionId = result.executionId;
      return result.executionId;
    } catch (err) {
      console.error('[LearningClient] Failed to start execution:', err.message);
      return null;
    }
  }

  /**
   * Record execution completion
   * @param {Object} params - outcome, metrics, errors
   */
  async completeExecution({
    outcome, // 'success' | 'failure' | 'partial'
    prUrl = null,
    filesChanged = [],
    inputTokens = 0,
    outputTokens = 0,
    errorMessage = null,
    errorCategory = null
  }) {
    if (!this.currentExecutionId) {
      console.warn('[LearningClient] No active execution to complete');
      return;
    }

    const payload = {
      executionId: this.currentExecutionId,
      outcome,
      prUrl,
      filesChanged,
      inputTokens,
      outputTokens,
      errorMessage,
      errorCategory: errorCategory || this._classifyError(errorMessage)
    };

    try {
      await this._post('/api/learning/executions/complete', payload);
    } catch (err) {
      console.error('[LearningClient] Failed to complete execution:', err.message);
    } finally {
      this.currentExecutionId = null;
    }
  }

  /**
   * Classify error into category for pattern analysis
   */
  _classifyError(message) {
    if (!message) return 'unknown';
    const msg = message.toLowerCase();
    
    if (msg.includes('rate limit') || msg.includes('429')) return 'rate_limit';
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (msg.includes('auth') || msg.includes('401') || msg.includes('403')) return 'auth';
    if (msg.includes('network') || msg.includes('econnrefused')) return 'network';
    if (msg.includes('merge conflict') || msg.includes('conflict')) return 'git_conflict';
    if (msg.includes('test') && msg.includes('fail')) return 'test_failure';
    if (msg.includes('syntax') || msg.includes('parse')) return 'syntax';
    if (msg.includes('import') || msg.includes('require')) return 'dependency';
    
    return 'unknown';
  }

  /**
   * HTTP POST helper
   */
  _post(path, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, PLATFORM_URL);
      const body = JSON.stringify(data);
      
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 5000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ success: true });
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(body);
      req.end();
    });
  }
}

module.exports = { LearningClient };
```


### 1.2 Verify API Endpoints Exist

Before integrating, confirm the platform has learning endpoints:

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'grep -n "executions/start\|executions/complete" /opt/swarm-app/apps/platform/routes/*.js 2>/dev/null | head -20'
```

If endpoints don't exist, create them (see Step 1.3).

### 1.3 Add Learning API Endpoints (if missing)

Add to `/opt/swarm-app/apps/platform/routes/learning.js`:

```javascript
const express = require('express');
const router = express.Router();
const agentLearning = require('../lib/agent-learning');

// POST /api/learning/executions/start
router.post('/executions/start', async (req, res) => {
  try {
    const { taskId, agentId, tenantId, model, projectId } = req.body;
    
    const executionId = await agentLearning.startExecution({
      taskId,
      agentId,
      tenantId: tenantId || 'default',
      model: model || 'claude-sonnet-4-20250514',
      projectId
    });
    
    res.json({ executionId, success: true });
  } catch (err) {
    console.error('Learning start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/learning/executions/complete
router.post('/executions/complete', async (req, res) => {
  try {
    const {
      executionId,
      outcome,
      prUrl,
      filesChanged,
      inputTokens,
      outputTokens,
      errorMessage,
      errorCategory
    } = req.body;
    
    await agentLearning.completeExecution(executionId, {
      outcome,
      prUrl,
      filesChanged,
      inputTokens: inputTokens || 0,
      outputTokens: outputTokens || 0,
      errorMessage,
      errorCategory
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Learning complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

---

## Step 2: Wire Telemetry into Forge Agent Main Loop (30 min)

### 2.1 Modify main.js to Use Learning Client

Add to forge agent's `/opt/swarm-agents/forge-agent/main.js`:

```javascript
// At top of file, after other requires
const { LearningClient } = require('./lib/learning-client');

// After CONFIG definition
const learningClient = new LearningClient(CONFIG.agentId);

// In executeTask() function - after claiming ticket:
async function executeTask(ticket) {
  // Start learning telemetry
  await learningClient.startExecution({
    taskId: ticket.id,
    model: selectModel(ticket),
    projectId: ticket.project_id
  });
  
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let filesChanged = [];
  
  try {
    // ... existing Claude API call logic ...
    
    // Track token usage from each API call
    if (response.usage) {
      totalInputTokens += response.usage.input_tokens || 0;
      totalOutputTokens += response.usage.output_tokens || 0;
    }
    
    // ... existing PR creation logic ...
    
    // On success:
    await learningClient.completeExecution({
      outcome: 'success',
      prUrl: pullRequest.html_url,
      filesChanged: filesChanged,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    });
    
  } catch (error) {
    // On failure:
    await learningClient.completeExecution({
      outcome: 'failure',
      errorMessage: error.message,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    });
    throw error;
  }
}
```

---

## Step 3: Inject Sentinel Feedback into Prompts (30 min)

### 3.1 Create Feedback Injector

Add to forge agent's prompt building logic:

```javascript
/**
 * Build system prompt with sentinel feedback injection
 * @param {Object} ticket - Ticket with potential sentinel_feedback
 * @returns {string} Enhanced system prompt
 */
function buildSystemPrompt(ticket) {
  let prompt = FORGE_PERSONA;
  
  // Check for sentinel feedback (retry scenario)
  if (ticket.sentinel_feedback && ticket.retry_count > 0) {
    const feedback = typeof ticket.sentinel_feedback === 'string' 
      ? JSON.parse(ticket.sentinel_feedback) 
      : ticket.sentinel_feedback;
    
    prompt += `\n\n## ⚠️ RETRY ATTEMPT ${ticket.retry_count}/2 - MUST FIX ISSUES\n\n`;
    prompt += `This ticket was previously rejected by code review. You MUST address these issues:\n\n`;
    
    if (feedback.feedback_for_agent && Array.isArray(feedback.feedback_for_agent)) {
      feedback.feedback_for_agent.forEach((item, i) => {
        prompt += `### Issue ${i + 1}: ${item.issue || 'Unspecified'}\n`;
        if (item.suggestion) {
          prompt += `**Fix required:** ${item.suggestion}\n`;
        }
        if (item.file) {
          prompt += `**File:** ${item.file}\n`;
        }
        prompt += '\n';
      });
    }
    
    if (feedback.summary) {
      prompt += `### Summary\n${feedback.summary}\n\n`;
    }
    
    prompt += `**IMPORTANT:** Do not repeat the same mistakes. The PR will be rejected again if these issues persist.\n`;
  }
  
  return prompt;
}
```

### 3.2 Update Ticket Claiming to Include Feedback Fields

Ensure ticket query includes sentinel feedback:

```javascript
// When fetching ticket details, include retry fields
const ticket = await fetch(`${CONFIG.apiUrl}/api/tickets/${ticketId}`)
  .then(r => r.json());

// Ticket should now have:
// - ticket.retry_count (0, 1, or 2)
// - ticket.sentinel_feedback (JSONB or null)
// - ticket.hold_reason (if on_hold)
```

---

## Step 4: Add Model Selection Based on Patterns (20 min)

### 4.1 Intelligent Model Selection

```javascript
/**
 * Select model based on ticket characteristics and historical patterns
 */
function selectModel(ticket) {
  // Default model
  let model = 'claude-sonnet-4-20250514';
  
  // Upgrade to Opus for:
  // 1. Retry attempts (need more capable model)
  if (ticket.retry_count > 0) {
    model = 'claude-opus-4-20250514';
  }
  
  // 2. Large scope tickets
  if (ticket.scope === 'large' || ticket.story_points >= 8) {
    model = 'claude-opus-4-20250514';
  }
  
  // 3. Architecture/design tickets
  const title = (ticket.title || '').toLowerCase();
  if (title.includes('architect') || title.includes('design') || title.includes('refactor')) {
    model = 'claude-opus-4-20250514';
  }
  
  return model;
}
```

---

## Step 5: Verification & Testing (20 min)

### 5.1 Deploy Learning Client to Agent

```bash
# Copy learning client to forge agent
scp /path/to/learning-client.js root@134.199.235.140:/opt/swarm-agents/forge-agent/lib/

# Or via git
cd /opt/swarm-agents/forge-agent
git add lib/learning-client.js
git commit -m "feat: add learning telemetry client"
git push
```

### 5.2 Test Telemetry Flow

```bash
# 1. Create a test ticket
curl -X POST http://localhost:8080/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Learning Integration","description":"Test ticket for telemetry","project_id":"test-project"}'

# 2. Check learning executions table
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"SELECT * FROM agent_executions ORDER BY created_at DESC LIMIT 5;\""

# 3. Check learning stats API
curl http://localhost:8080/api/learning/stats | jq
```

### 5.3 Test Sentinel Feedback Injection

```bash
# 1. Manually add sentinel feedback to a ticket
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb << 'SQL'
UPDATE tickets 
SET retry_count = 1,
    sentinel_feedback = '{
      "feedback_for_agent": [
        {"issue": "Missing error handling", "suggestion": "Add try-catch blocks around async operations", "file": "src/api.js"},
        {"issue": "No input validation", "suggestion": "Validate user input before processing"}
      ],
      "summary": "Code lacks defensive programming patterns"
    }'::jsonb
WHERE id = 'YOUR_TICKET_ID';
SQL"

# 2. Claim the ticket and verify prompt includes feedback
# (Check agent logs for the enhanced prompt)
```

---

## Step 6: Platform API Updates (if needed) (15 min)

### 6.1 Ensure agent-learning.js Has Required Methods

Verify `/opt/swarm-app/apps/platform/lib/agent-learning.js` exports:

```javascript
module.exports = {
  startExecution,    // (params) → executionId
  completeExecution, // (executionId, metrics) → void
  getPatterns,       // () → patterns array
  getStats,          // () → stats object
  // ... other methods
};
```

### 6.2 Add Missing Methods if Needed

```javascript
async function startExecution({ taskId, agentId, tenantId, model, projectId }) {
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.query(`
    INSERT INTO agent_executions (id, task_id, agent_id, tenant_id, model, project_id, started_at, state)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'running')
  `, [executionId, taskId, agentId, tenantId, model, projectId]);
  
  return executionId;
}

async function completeExecution(executionId, {
  outcome,
  prUrl,
  filesChanged,
  inputTokens,
  outputTokens,
  errorMessage,
  errorCategory
}) {
  await db.query(`
    UPDATE agent_executions SET
      completed_at = NOW(),
      state = $2,
      pr_url = $3,
      files_changed = $4,
      input_tokens = $5,
      output_tokens = $6,
      error_message = $7,
      error_category = $8
    WHERE id = $1
  `, [executionId, outcome, prUrl, JSON.stringify(filesChanged), inputTokens, outputTokens, errorMessage, errorCategory]);
}
```

---

## Success Criteria

| Criteria | Verification |
|----------|--------------|
| Learning client exists | `ls /opt/swarm-agents/forge-agent/lib/learning-client.js` |
| Telemetry recorded | Query `agent_executions` table after forge run |
| Sentinel feedback injected | Check agent logs for enhanced prompts on retry |
| Model upgraded on retry | Verify Opus used when `retry_count > 0` |
| API endpoints work | `curl /api/learning/stats` returns data |
| Token usage tracked | `inputTokens` and `outputTokens` populated |

---

## Files Modified

| File | Purpose |
|------|---------|
| `/opt/swarm-agents/forge-agent/lib/learning-client.js` | New: Telemetry client |
| `/opt/swarm-agents/forge-agent/main.js` | Wire learning client |
| `/opt/swarm-app/apps/platform/routes/learning.js` | Add start/complete endpoints |
| `/opt/swarm-app/apps/platform/lib/agent-learning.js` | Ensure methods exist |

---

## Next Steps After This Phase

1. **Phase 5: Pattern Analysis** - Auto-detect failure patterns and generate rules
2. **Phase 6: Dashboard Wiring** - Connect learning APIs to UI charts
3. **Phase 7: Proactive Optimization** - Apply learned rules before execution

