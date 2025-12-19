# Agent Learning System - Phase 2: Pattern Detection & Dashboard

## Context
**Phase 1 is COMPLETE** (2025-12-15). This prompt covers Phase 2: pattern detection, rule generation, and dashboard visualization.

## Phase 1 Summary (Complete)

| Step | Component | Location |
|------|-----------|----------|
| 1-3 | Database Schema | 3 tables in `/opt/swarm-platform/data/swarm.db` |
| 4 | Logging Module | `/opt/swarm-platform/lib/agent-learning.js` |
| 5 | Agent Instrumentation | `/opt/swarm/agents/pull-agent-v2.js` |
| 6 | Query Layer | `/opt/swarm-platform/lib/learning-queries.js` |
| 6 | API Routes | `/opt/swarm-platform/routes/learning.js` |
| 7-8 | Validation & Docs | Commit `5482342` |

### Live API Endpoints

```
GET /api/learning/stats        - Success rate, tokens, timing
GET /api/learning/errors       - Error frequency analysis
GET /api/learning/patterns     - High-performing combos
GET /api/learning/tokens       - Daily token trend
GET /api/learning/distribution - Error category breakdown
GET /api/learning/executions   - Recent activity feed
```

---

## Phase 2 Overview

### Goals
1. **Pattern Detection** - Identify recurring success/failure patterns
2. **Rule Generation** - Auto-create optimization rules from patterns
3. **Dashboard UI** - Visualize learning analytics
4. **Live Integration** - Wire agent runner to logging module

---

## Step 1: Wire Agent Runner to Logging (30 min)

The logging module exists but isn't called yet. Add actual telemetry calls.

### 1.1 Update pull-agent-v2.js

```javascript
// At top of file
const agentLearning = require('/opt/swarm-platform/lib/agent-learning.js');

// In executeTask() - after getting ticket
const executionId = await agentLearning.startExecution({
  taskId: ticket.id,
  agentId: VM_ID,
  tenantId: ticket.tenant_id || 'default',
  model: 'claude-sonnet-4-20250514'
});

// After successful PR creation
await agentLearning.completeExecution(executionId, {
  outcome: 'success',
  prUrl: prUrl,
  filesChanged: changedFiles,
  inputTokens: usage?.input_tokens || 0,
  outputTokens: usage?.output_tokens || 0
});

// In catch block
await agentLearning.completeExecution(executionId, {
  outcome: 'failure',
  errorMessage: error.message,
  errorCategory: classifyError(error)
});
```

### 1.2 Add Error Classification

```javascript
function classifyError(error) {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('rate limit') || msg.includes('429')) return 'api';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('syntax') || msg.includes('parse')) return 'syntax';
  if (msg.includes('undefined') || msg.includes('null')) return 'runtime';
  if (msg.includes('context') || msg.includes('token')) return 'context';
  return 'logic';
}
```

---

## Step 2: Pattern Detection Module (45 min)

Create `/opt/swarm-platform/lib/pattern-detector.js`:

```javascript
/**
 * Pattern Detector
 * Analyzes execution history to identify optimization opportunities
 */

const Database = require('better-sqlite3');
const DB_PATH = '/opt/swarm-platform/data/swarm.db';

class PatternDetector {
  constructor() {
    this.db = new Database(DB_PATH, { readonly: true });
  }

  /**
   * Find error patterns that repeat across executions
   */
  detectErrorPatterns(minOccurrences = 3, tenantId = null) {
    const params = { minOccurrences };
    let tenantFilter = tenantId ? 'AND ae.tenant_id = @tenantId' : '';
    if (tenantId) params.tenantId = tenantId;

    return this.db.prepare(`
      SELECT 
        ee.category,
        ee.subcategory,
        ee.error_message,
        COUNT(*) as occurrences,
        COUNT(DISTINCT ae.agent_id) as affected_agents,
        MIN(ee.created_at) as first_seen,
        MAX(ee.created_at) as last_seen
      FROM execution_errors ee
      JOIN agent_executions ae ON ee.execution_id = ae.id
      WHERE 1=1 ${tenantFilter}
      GROUP BY ee.category, ee.subcategory, ee.error_message
      HAVING occurrences >= @minOccurrences
      ORDER BY occurrences DESC
    `).all(params);
  }

  /**
   * Identify task types with consistently low success rates
   */
  detectProblematicTaskTypes(maxSuccessRate = 50, tenantId = null) {
    // Implementation: Group by ticket title patterns
  }

  /**
   * Find time-of-day patterns (API rate limits, etc.)
   */
  detectTemporalPatterns(tenantId = null) {
    // Implementation: Group by hour, identify failure spikes
  }

  /**
   * Identify model/agent combinations that perform well
   */
  detectSuccessfulCombos(minExecutions = 10, minSuccessRate = 80) {
    // Implementation: Use existing getSuccessPatterns query
  }

  close() {
    this.db.close();
  }
}

module.exports = PatternDetector;
```

---

## Step 3: Rule Generation (30 min)

### 3.1 Rule Types

| Type | Description | Example Action |
|------|-------------|----------------|
| `retry_strategy` | When to retry failed tasks | "Retry rate_limit errors after 60s" |
| `model_selection` | Optimal model for task type | "Use opus for complex refactors" |
| `time_avoidance` | When to avoid execution | "Don't run 2-4pm (rate limits)" |
| `context_limit` | Token management | "Split tasks >50k tokens" |

### 3.2 Create Rule Generator

```javascript
// In /opt/swarm-platform/lib/rule-generator.js

async function generateRulesFromPatterns(patterns, tenantId) {
  const rules = [];
  
  for (const pattern of patterns) {
    if (pattern.category === 'api' && pattern.subcategory === 'rate_limit') {
      rules.push({
        tenant_id: tenantId,
        rule_type: 'retry_strategy',
        pattern: JSON.stringify({ error_category: 'api', subcategory: 'rate_limit' }),
        action: JSON.stringify({ delay_ms: 60000, max_retries: 3 }),
        confidence: Math.min(pattern.occurrences / 10, 1.0)
      });
    }
    // Add more pattern-to-rule mappings
  }
  
  return rules;
}
```

---

## Step 4: Dashboard Components (45 min)

### 4.1 Create Learning Dashboard Page

Add to `/opt/swarm-dashboard/src/pages/LearningDashboard.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LearningDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [errors, setErrors] = useState([]);
  const [tokenTrend, setTokenTrend] = useState([]);

  useEffect(() => {
    fetchLearningData();
  }, []);

  const fetchLearningData = async () => {
    const headers = { Authorization: `Bearer ${token}` };
    const [statsRes, errorsRes, tokensRes] = await Promise.all([
      fetch('/api/learning/stats', { headers }),
      fetch('/api/learning/errors?limit=10', { headers }),
      fetch('/api/learning/tokens?days=7', { headers })
    ]);
    setStats(await statsRes.json());
    setErrors(await errorsRes.json());
    setTokenTrend(await tokensRes.json());
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Agent Learning Analytics</h1>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard title="Success Rate" value={`${stats?.success_rate || 0}%`} />
        <StatCard title="Total Executions" value={stats?.total_executions || 0} />
        <StatCard title="Avg Duration" value={`${(stats?.avg_duration_ms/1000).toFixed(1)}s`} />
        <StatCard title="Total Tokens" value={stats?.total_tokens?.toLocaleString() || 0} />
      </div>

      {/* Error Table */}
      <ErrorTable errors={errors} />
      
      {/* Token Chart */}
      <TokenTrendChart data={tokenTrend} />
    </div>
  );
}
```

### 4.2 Add Route to App.jsx

```jsx
import LearningDashboard from './pages/LearningDashboard';

// In routes
<Route path="/learning" element={<LearningDashboard />} />
```

### 4.3 Add Nav Link

```jsx
// In Sidebar.jsx
<NavLink to="/learning" icon={<ChartIcon />}>Learning</NavLink>
```

---

## Step 5: Validation (15 min)

### 5.1 Generate Real Data

```bash
# Run a test agent execution
curl -X POST http://localhost:8080/api/swarm/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ticketId": "test-ticket-001"}'
```

### 5.2 Verify Dashboard

1. Navigate to `dashboard.swarmstack.net/learning`
2. Confirm stats cards populate
3. Verify error table shows data
4. Check token trend chart renders

---

## Success Criteria

- [ ] Agent runner calls logging module on start/complete
- [ ] Errors classified into 7 categories
- [ ] Pattern detector identifies recurring issues
- [ ] At least 1 auto-generated rule from patterns
- [ ] Dashboard shows real-time analytics
- [ ] Token trend visualizes 7-day history

---

## File Locations

```
Agent Runner:      /opt/swarm/agents/pull-agent-v2.js
Learning Logger:   /opt/swarm-platform/lib/agent-learning.js
Query Layer:       /opt/swarm-platform/lib/learning-queries.js
Pattern Detector:  /opt/swarm-platform/lib/pattern-detector.js (new)
Rule Generator:    /opt/swarm-platform/lib/rule-generator.js (new)
Dashboard Page:    /opt/swarm-dashboard/src/pages/LearningDashboard.jsx (new)
```

## SSH Access

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH
```
