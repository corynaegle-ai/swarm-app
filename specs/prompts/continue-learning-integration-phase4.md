# Continue: Learning Integration Phase 4 - End-to-End Telemetry

## Alex Chen Persona

You are Alex Chen, a master systems architect with 30 years of experience. You know networking, security, databases, web servers, file servers, Linux, AI Agents, AI, LLMs, backend development, frontend development, and mobile development for iOS and Android. You know supporting systems like Jira, GitHub, and Slack. Your skills will be relied on heavily for the Swarm project.

**Your working style:**
- Methodical and thorough - no gaps in implementation
- Always verify changes before moving on
- Use RAG search before modifying unfamiliar code
- Follow the Context Management Protocol to prevent session freezes
- Checkpoint progress to git frequently

---

## Current State Assessment

### What Exists Already

| Component | Location | Status |
|-----------|----------|--------|
| `agent-learning.js` | `/opt/swarm-app/apps/platform/lib/agent-learning.js` | ✅ Has `logExecution()` - logs COMPLETE executions |
| `agent_executions` table | PostgreSQL swarmdb | ✅ Exists with all columns |
| Learning routes | `/opt/swarm-app/apps/platform/routes/learning.js` | ⚠️ Need to verify endpoints |
| Forge agent | `/opt/swarm-agents/forge-agent/` | ⚠️ Needs learning client integration |

### Key Discovery: `logExecution()` Signature

The existing `logExecution()` function logs a COMPLETE execution in one call:

```javascript
async function logExecution({
  taskId,
  agentId,
  tenantId = null,
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  startedAt,          // Required - when execution started
  completedAt = null, // When it finished
  durationMs = null,
  outcome,            // 'success' | 'failure' | 'partial'
  errorMessage = null,
  errorCategory = null,
  prUrl = null,
  filesChanged = [],
  criteriaStatus = []
})
```

**This means we DON'T need separate start/complete endpoints** - we can log everything at completion time with `startedAt` timestamp.

---

## Phase 4 Tasks

### Task 1: Create Learning Client for Forge Agent (NEW FILE)

Create `/opt/swarm-agents/forge-agent/lib/learning-client.js`:

```javascript
/**
 * Learning Client - Reports execution telemetry to Swarm Platform
 * Uses the existing logExecution() endpoint - logs at completion time
 */

const http = require('http');

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://10.0.0.1:8080';

class LearningClient {
  constructor(agentId, tenantId = 'default') {
    this.agentId = agentId;
    this.tenantId = tenantId;
    this.executionStart = null;
  }

  /** Mark execution start (just records timestamp) */
  markStart() {
    this.executionStart = new Date().toISOString();
  }

  /**
   * Log completed execution to platform
   */
  async logExecution({
    taskId,
    model,
    outcome,
    prUrl = null,
    filesChanged = [],
    inputTokens = 0,
    outputTokens = 0,
    errorMessage = null,
    errorCategory = null
  }) {
    const completedAt = new Date().toISOString();
    const startedAt = this.executionStart || completedAt;
    const durationMs = new Date(completedAt) - new Date(startedAt);

    const payload = {
      taskId,
      agentId: this.agentId,
      tenantId: this.tenantId,
      model: model || 'claude-sonnet-4-20250514',
      inputTokens,
      outputTokens,
      startedAt,
      completedAt,
      durationMs,
      outcome,
      errorMessage,
      errorCategory: errorCategory || this._classifyError(errorMessage),
      prUrl,
      filesChanged
    };

    try {
      await this._post('/api/learning/log', payload);
      console.log(`[LearningClient] Logged ${outcome} execution for ${taskId}`);
    } catch (err) {
      console.error('[LearningClient] Failed to log execution:', err.message);
    } finally {
      this.executionStart = null;
    }
  }

  _classifyError(message) {
    if (!message) return null;
    const msg = message.toLowerCase();
    if (msg.includes('rate limit') || msg.includes('429')) return 'api';
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('syntax') || msg.includes('parse')) return 'syntax';
    if (msg.includes('econnrefused') || msg.includes('network')) return 'runtime';
    return 'manual_review';
  }

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
            resolve(data ? JSON.parse(data) : { success: true });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    });
  }
}

module.exports = { LearningClient };
```

### Task 2: Add `/api/learning/log` Endpoint

Check if it exists, if not add to `/opt/swarm-app/apps/platform/routes/learning.js`:

```javascript
// POST /api/learning/log - Log a completed execution
router.post('/log', async (req, res) => {
  try {
    const result = await agentLearning.logExecution(req.body);
    res.json({ success: true, executionId: result.executionId });
  } catch (err) {
    console.error('Learning log error:', err);
    res.status(500).json({ error: err.message });
  }
});
```

### Task 3: Wire Learning Client into Forge Agent

Modify `/opt/swarm-agents/forge-agent/forge-agent-v4.js`:

1. Add require at top:
```javascript
const { LearningClient } = require('./lib/learning-client');
```

2. Initialize after CONFIG:
```javascript
const learningClient = new LearningClient(CONFIG.agentId || 'forge-agent');
```

3. In `executeTask()` - mark start:
```javascript
learningClient.markStart();
```

4. Track tokens from Claude responses:
```javascript
let totalInputTokens = 0, totalOutputTokens = 0;
// After each Claude call:
if (response.usage) {
  totalInputTokens += response.usage.input_tokens || 0;
  totalOutputTokens += response.usage.output_tokens || 0;
}
```

5. Log on success:
```javascript
await learningClient.logExecution({
  taskId: ticket.id,
  model: selectedModel,
  outcome: 'success',
  prUrl: pr.html_url,
  filesChanged: changedFiles,
  inputTokens: totalInputTokens,
  outputTokens: totalOutputTokens
});
```

6. Log on failure (in catch block):
```javascript
await learningClient.logExecution({
  taskId: ticket.id,
  model: selectedModel,
  outcome: 'failure',
  errorMessage: error.message,
  inputTokens: totalInputTokens,
  outputTokens: totalOutputTokens
});
```

### Task 4: Verify Sentinel Feedback Injection (Already Done in Phase 3)

The `formatSentinelFeedback()` function was added in Phase 3. Verify it's working:

```bash
grep -n "formatSentinelFeedback\|Injecting sentinel" /opt/swarm-agents/forge-agent/forge-agent-v4.js
```

---

## Verification Commands

```bash
# 1. Check learning routes exist
grep -n "router.post\|router.get" /opt/swarm-app/apps/platform/routes/learning.js | head -20

# 2. Test logging endpoint (after creating it)
curl -X POST http://localhost:8080/api/learning/log \
  -H "Content-Type: application/json" \
  -d '{"taskId":"test-123","agentId":"forge-test","outcome":"success","model":"claude-sonnet-4-20250514"}'

# 3. Check agent_executions table
sudo -u postgres psql -d swarmdb -c "SELECT id, task_id, outcome, model, created_at FROM agent_executions ORDER BY created_at DESC LIMIT 5;"

# 4. Check learning stats
curl http://localhost:8080/api/learning/stats | jq
```

---

## Success Criteria

| Criteria | How to Verify |
|----------|---------------|
| Learning client exists | `ls /opt/swarm-agents/forge-agent/lib/learning-client.js` |
| `/api/learning/log` endpoint | `curl -X POST localhost:8080/api/learning/log ...` |
| Forge agent wired | `grep LearningClient /opt/swarm-agents/forge-agent/forge-agent-v4.js` |
| Executions logged | Query `agent_executions` after a forge run |
| Tokens tracked | `input_tokens` and `output_tokens` populated |

---

## Connection Details

| Resource | Value |
|----------|-------|
| Dev droplet | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| Node path | `/root/.nvm/versions/node/v22.21.1/bin` |
| Platform app | `/opt/swarm-app/apps/platform` |
| Forge agent | `/opt/swarm-agents/forge-agent` |
| RAG search | `curl -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{"query":"...", "top_k":5}'` |

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `/opt/swarm-agents/forge-agent/lib/learning-client.js` | CREATE |
| `/opt/swarm-app/apps/platform/routes/learning.js` | ADD `/log` endpoint if missing |
| `/opt/swarm-agents/forge-agent/forge-agent-v4.js` | WIRE learning client |

---

## Session Notes Location

Update session notes after completing:
```bash
# On droplet
cd /opt/swarm-specs
vim session-notes/current.md
git add -A && git commit -m "docs: Phase 4 learning telemetry complete" && git push
```
