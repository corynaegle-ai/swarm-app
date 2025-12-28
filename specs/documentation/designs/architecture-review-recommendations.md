# Swarm Architecture Review: Critical Gaps & Strategic Opportunities

> Comprehensive review of Swarm architecture with prioritized recommendations

**Status:** Review Complete  
**Author:** Neural (Claude)  
**Date:** 2025-12-12  
**Scope:** Infrastructure, Reliability, Observability, Business Viability

---

## Executive Summary

Swarm's foundational architecture is sound. The agent-pull model, snapshot-based VM restoration, and multi-tenant isolation are excellent design choices. However, this review identified **5 critical gaps** that must be fixed before production and **9 high-impact opportunities** for differentiation.

### Priority Matrix

| # | Issue | Priority | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | Idempotency keys | P0 | 1 day | Data integrity |
| 2 | Dead letter queue | P0 | 0.5 day | Reliability |
| 3 | Webhook/event bus | P1 | 2 days | Enterprise sales |
| 4 | Tenant resource quotas | P0 | 1 day | Multi-tenancy |
| 5 | SQLite bottleneck | P1 | 2 days | Scalability |
| 6 | API cost tracking | P1 | 1 day | Monetization |
| 7 | Canary deployments | P2 | 2 days | Reliability |
| 8 | Agent tracing | P1 | 2 days | Debuggability |
| 9 | Time estimation | P2 | 1 day | UX |
| 10 | Project rollback | P2 | 1 day | UX |
| 11 | Agent collaboration | P3 | 2 weeks | Differentiation |
| 12 | Self-healing infra | P2 | 1 week | Operations |
| 13 | Learning from history | P3 | 1 week | Quality |
| 14 | Template marketplace | P3 | 2 weeks | Moat |

---

## 🔴 Critical Gaps (P0 - Fix Before Production)

### 1. No Idempotency Keys for Agent Operations

**Problem:** If an agent claims a ticket, starts work, then loses connectivity mid-execution, there's no mechanism to prevent duplicate work or data corruption.

**Failure Scenario:**
```
Agent A claims ticket-123 → starts work → network blip → reconnects
Agent A re-claims ticket-123 → duplicate PR, duplicate branch, chaos
```

**Impact:** Data corruption, duplicate PRs, wasted compute, confused users.

**Solution:**

```sql
-- Add to tickets table
ALTER TABLE tickets ADD COLUMN claim_token TEXT;
ALTER TABLE tickets ADD COLUMN claim_expires_at TEXT;
ALTER TABLE tickets ADD COLUMN claimed_by_agent_id TEXT REFERENCES agents(id);
```

```javascript
// Claim endpoint with idempotency
async function claimTicket(ticketId, agentId) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  
  const result = await db.run(`
    UPDATE tickets 
    SET status = 'assigned',
        claim_token = ?,
        claim_expires_at = ?,
        claimed_by_agent_id = ?
    WHERE id = ? 
      AND status = 'ready'
      AND (claim_expires_at IS NULL OR claim_expires_at < datetime('now'))
  `, [token, expiresAt.toISOString(), agentId, ticketId]);
  
  if (result.changes === 0) {
    throw new Error('Ticket not available or already claimed');
  }
  
  return { ticket_id: ticketId, claim_token: token, expires_at: expiresAt };
}

// All subsequent operations require the claim token
async function submitWork(ticketId, claimToken, workPayload) {
  const ticket = await db.get(`
    SELECT * FROM tickets WHERE id = ? AND claim_token = ?
  `, [ticketId, claimToken]);
  
  if (!ticket) {
    throw new Error('Invalid claim token - ticket may have been reassigned');
  }
  
  // Process work...
}
```

**Cleanup Job:**
```javascript
// Run every 5 minutes
async function expireAbandonedClaims() {
  await db.run(`
    UPDATE tickets
    SET status = 'ready',
        claim_token = NULL,
        claim_expires_at = NULL,
        claimed_by_agent_id = NULL
    WHERE status = 'assigned'
      AND claim_expires_at < datetime('now')
  `);
}
```

---

### 2. No Dead Letter Queue for Failed Tickets

**Problem:** If a ticket fails repeatedly (malformed spec, impossible task, dependency on missing resource), it stays in the queue and consumes agent resources indefinitely.

**Failure Scenario:**
```
Ticket has syntax error in spec → Agent fails → Retry → Fail → Retry → Fail...
Meanwhile: 100 agents wasting cycles on poison pill
```

**Impact:** Resource starvation, runaway costs, no visibility into systemic issues.

**Solution:**

```sql
-- Add to tickets table
ALTER TABLE tickets ADD COLUMN failure_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN last_failure_at TEXT;
ALTER TABLE tickets ADD COLUMN last_failure_reason TEXT;
ALTER TABLE tickets ADD COLUMN quarantined_at TEXT;
ALTER TABLE tickets ADD COLUMN quarantine_reason TEXT;
```

```javascript
const MAX_FAILURES = 3;
const QUARANTINE_STATES = ['quarantined', 'needs_human_review'];

async function recordFailure(ticketId, reason, errorDetails) {
  const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  const newFailureCount = (ticket.failure_count || 0) + 1;
  
  if (newFailureCount >= MAX_FAILURES) {
    // Quarantine the ticket
    await db.run(`
      UPDATE tickets
      SET status = 'quarantined',
          failure_count = ?,
          last_failure_at = datetime('now'),
          last_failure_reason = ?,
          quarantined_at = datetime('now'),
          quarantine_reason = ?
      WHERE id = ?
    `, [newFailureCount, reason, `Failed ${newFailureCount} times: ${reason}`, ticketId]);
    
    // Notify humans
    await sendAlert({
      type: 'ticket_quarantined',
      ticket_id: ticketId,
      failure_count: newFailureCount,
      reason: reason,
      details: errorDetails
    });
  } else {
    // Increment failure count, return to ready for retry
    await db.run(`
      UPDATE tickets
      SET status = 'ready',
          failure_count = ?,
          last_failure_at = datetime('now'),
          last_failure_reason = ?
      WHERE id = ?
    `, [newFailureCount, reason, ticketId]);
  }
  
  // Log to events table for audit
  await db.run(`
    INSERT INTO events (ticket_id, event_type, actor_type, new_value, rationale)
    VALUES (?, 'failure_recorded', 'system', ?, ?)
  `, [ticketId, JSON.stringify({ failure_count: newFailureCount }), reason]);
}
```

**Dashboard Widget:**
```
┌─────────────────────────────────────────┐
│  ⚠️  Quarantined Tickets: 3            │
├─────────────────────────────────────────┤
│  ticket-47: "Syntax error in spec"     │
│  ticket-89: "Missing dependency"        │
│  ticket-123: "API rate limit"          │
│                                         │
│  [Review All]  [Retry Selected]         │
└─────────────────────────────────────────┘
```

---

### 3. Missing Webhook/Event Bus for External Integrations

**Problem:** Everything is pull-based via HTTP polling. No way for external systems to subscribe to ticket lifecycle events.

**Impact:** Cannot integrate with Slack notifications, PagerDuty, custom monitoring, CI/CD pipelines, or enterprise event systems without expensive polling.

**Solution:**

```sql
-- Webhook subscriptions
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,  -- For HMAC signature verification
  events JSON NOT NULL,  -- ["ticket.created", "ticket.completed", "pr.merged"]
  active INTEGER DEFAULT 1,
  failure_count INTEGER DEFAULT 0,
  last_triggered_at TEXT,
  last_failure_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id);
CREATE INDEX idx_webhooks_active ON webhooks(active);

-- Delivery log for debugging
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT REFERENCES webhooks(id),
  event_type TEXT NOT NULL,
  payload JSON NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
```

```javascript
// Event types
const EVENT_TYPES = [
  'ticket.created',
  'ticket.assigned',
  'ticket.in_progress', 
  'ticket.completed',
  'ticket.failed',
  'ticket.quarantined',
  'pr.opened',
  'pr.merged',
  'pr.rejected',
  'agent.started',
  'agent.completed',
  'agent.failed',
  'project.design_complete',
  'collaboration.stage_complete'
];

// Event bus
class EventBus {
  async publish(eventType, payload, tenantId) {
    // 1. Store event for audit
    await this.storeEvent(eventType, payload, tenantId);
    
    // 2. Find matching webhooks
    const webhooks = await db.all(`
      SELECT * FROM webhooks 
      WHERE tenant_id = ? AND active = 1
    `, [tenantId]);
    
    // 3. Filter by subscribed events and deliver
    for (const webhook of webhooks) {
      const subscribedEvents = JSON.parse(webhook.events);
      if (subscribedEvents.includes(eventType) || subscribedEvents.includes('*')) {
        await this.deliverWebhook(webhook, eventType, payload);
      }
    }
    
    // 4. Broadcast via WebSocket for real-time UI
    this.broadcastToTenant(tenantId, eventType, payload);
  }
  
  async deliverWebhook(webhook, eventType, payload) {
    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload
    });
    
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');
    
    const startTime = Date.now();
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Swarm-Signature': `sha256=${signature}`,
          'X-Swarm-Event': eventType
        },
        body,
        timeout: 10000
      });
      
      await this.logDelivery(webhook.id, eventType, payload, response, Date.now() - startTime);
      
      if (!response.ok) {
        await this.handleWebhookFailure(webhook);
      } else {
        await this.resetWebhookFailures(webhook);
      }
    } catch (error) {
      await this.handleWebhookFailure(webhook, error);
    }
  }
}

// Usage in ticket service
await eventBus.publish('ticket.completed', {
  ticket_id: ticket.id,
  title: ticket.name,
  pr_url: prUrl,
  duration_seconds: completionTime
}, ticket.tenant_id);
```

**API Endpoints:**
```
POST   /api/webhooks           Create webhook subscription
GET    /api/webhooks           List tenant's webhooks
DELETE /api/webhooks/:id       Remove webhook
GET    /api/webhooks/:id/logs  View delivery history
POST   /api/webhooks/:id/test  Send test event
```

---

### 4. No Resource Quotas Per Tenant (Not Enforced)

**Problem:** The `tenants.limits` field exists but isn't enforced anywhere. A single tenant could spawn 100+ VMs and starve others.

**Impact:** DoS risk (accidental or malicious), unpredictable costs, resource contention, unhappy customers.

**Solution:**

```sql
-- Update tenants.limits with structured quotas
-- Example: {"max_vms": 10, "max_tickets_per_day": 100, "max_api_calls_per_hour": 1000}
```

```javascript
// Quota enforcement middleware
class QuotaEnforcer {
  
  async checkVMQuota(tenantId) {
    const tenant = await this.getTenant(tenantId);
    const limits = JSON.parse(tenant.limits || '{}');
    const maxVMs = limits.max_vms || this.getDefaultLimit(tenant.plan, 'max_vms');
    
    const activeVMs = await db.get(`
      SELECT COUNT(*) as count FROM agents 
      WHERE tenant_id = ? AND status IN ('idle', 'assigned', 'working')
    `, [tenantId]);
    
    if (activeVMs.count >= maxVMs) {
      throw new QuotaExceededError({
        resource: 'vms',
        current: activeVMs.count,
        limit: maxVMs,
        message: `VM limit reached (${activeVMs.count}/${maxVMs}). Upgrade plan or wait for VMs to complete.`
      });
    }
    
    return { allowed: true, current: activeVMs.count, limit: maxVMs };
  }
  
  async checkTicketQuota(tenantId) {
    const tenant = await this.getTenant(tenantId);
    const limits = JSON.parse(tenant.limits || '{}');
    const maxPerDay = limits.max_tickets_per_day || this.getDefaultLimit(tenant.plan, 'max_tickets_per_day');
    
    const todayCount = await db.get(`
      SELECT COUNT(*) as count FROM tickets t
      JOIN projects p ON t.project_id = p.id
      WHERE p.tenant_id = ? 
        AND t.created_at >= date('now', 'start of day')
    `, [tenantId]);
    
    if (todayCount.count >= maxPerDay) {
      throw new QuotaExceededError({
        resource: 'tickets_per_day',
        current: todayCount.count,
        limit: maxPerDay,
        resets_at: this.getEndOfDay()
      });
    }
  }
  
  getDefaultLimit(plan, resource) {
    const defaults = {
      free: { max_vms: 2, max_tickets_per_day: 10, max_api_calls_per_hour: 100 },
      pro: { max_vms: 20, max_tickets_per_day: 500, max_api_calls_per_hour: 5000 },
      enterprise: { max_vms: 100, max_tickets_per_day: 10000, max_api_calls_per_hour: 100000 }
    };
    return defaults[plan]?.[resource] || defaults.free[resource];
  }
}

// Apply in orchestrator before spawning VM
async function spawnVM(tenantId) {
  await quotaEnforcer.checkVMQuota(tenantId);  // Throws if exceeded
  // ... spawn VM logic
}
```

**Dashboard Quota Display:**
```
┌─────────────────────────────────────────┐
│  Resource Usage (Pro Plan)              │
├─────────────────────────────────────────┤
│  VMs:        ████████░░  8/20           │
│  Tickets:    ██░░░░░░░░  89/500 today   │
│  API Calls:  ███░░░░░░░  1.2k/5k /hr    │
│                                         │
│  [Upgrade Plan]                         │
└─────────────────────────────────────────┘
```

---

### 5. SQLite Single-Writer Bottleneck

**Problem:** SQLite has one writer at a time. With 100+ VMs hitting `/claim` simultaneously, you'll see lock contention and timeouts.

**Impact:** Under load, claim operations queue up. Agents timeout waiting for claims. Throughput degrades non-linearly.

**Short-Term Solution (Immediate):**

```javascript
// 1. Ensure WAL mode is enabled
await db.run('PRAGMA journal_mode=WAL');
await db.run('PRAGMA busy_timeout=5000');  // 5 second wait before SQLITE_BUSY

// 2. Implement exponential backoff on SQLITE_BUSY
async function withRetry(fn, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 100 + Math.random() * 100;
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

// 3. Batch claim operations
async function claimNextAvailableTicket(agentId, tenantId) {
  return withRetry(async () => {
    // Single atomic operation
    return db.get(`
      UPDATE tickets
      SET status = 'assigned', 
          claimed_by_agent_id = ?,
          claim_token = ?,
          claim_expires_at = datetime('now', '+15 minutes')
      WHERE id = (
        SELECT t.id FROM tickets t
        JOIN projects p ON t.project_id = p.id
        WHERE p.tenant_id = ?
          AND t.status = 'ready'
          AND NOT EXISTS (
            SELECT 1 FROM dependencies d
            JOIN tickets dt ON d.depends_on = dt.id
            WHERE d.ticket_id = t.id AND dt.status != 'done'
          )
        ORDER BY t.priority DESC, t.created_at ASC
        LIMIT 1
      )
      RETURNING *
    `, [agentId, crypto.randomUUID(), tenantId]);
  });
}
```

**Long-Term Solution (When Scaling Beyond 100 VMs):**

```javascript
// Abstract data layer for future PostgreSQL migration
class TicketRepository {
  constructor(driver) {
    this.driver = driver;  // 'sqlite' or 'postgres'
    this.pool = this.initializePool();
  }
  
  async claimTicket(agentId, tenantId) {
    if (this.driver === 'postgres') {
      // Use FOR UPDATE SKIP LOCKED for concurrent claims
      return this.pool.query(`
        UPDATE tickets
        SET status = 'assigned', claimed_by_agent_id = $1
        WHERE id = (
          SELECT id FROM tickets
          WHERE tenant_id = $2 AND status = 'ready'
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING *
      `, [agentId, tenantId]);
    } else {
      // SQLite path with retry
      return this.sqliteClaimWithRetry(agentId, tenantId);
    }
  }
}

// Environment-based driver selection
const ticketRepo = new TicketRepository(
  process.env.DATABASE_URL ? 'postgres' : 'sqlite'
);
```

---

## 🟡 High-Impact Missing Features (P1-P2)


### 6. No Agent Cost Tracking

**Problem:** Claude API calls from 100+ VMs with no per-tenant, per-ticket, or per-project cost attribution.

**Impact:** Cannot bill customers accurately, cannot identify runaway costs, no margin visibility.

**Solution:**

```sql
CREATE TABLE api_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  ticket_id TEXT REFERENCES tickets(id),
  agent_id TEXT REFERENCES agents(id),
  provider TEXT DEFAULT 'anthropic',
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  request_type TEXT,  -- 'coder', 'reviewer', 'security', 'judge', 'clarifier'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_api_usage_tenant ON api_usage(tenant_id);
CREATE INDEX idx_api_usage_ticket ON api_usage(ticket_id);
CREATE INDEX idx_api_usage_created ON api_usage(created_at);

-- Aggregation view for billing
CREATE VIEW tenant_usage_daily AS
SELECT 
  tenant_id,
  date(created_at) as usage_date,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost_usd) as total_cost_usd,
  COUNT(*) as request_count
FROM api_usage
GROUP BY tenant_id, date(created_at);
```

```javascript
// Wrap all Claude API calls
class TrackedAnthropicClient {
  constructor(tenantId, projectId, ticketId, agentId) {
    this.client = new Anthropic();
    this.context = { tenantId, projectId, ticketId, agentId };
  }
  
  async createMessage(params) {
    const startTime = Date.now();
    const response = await this.client.messages.create(params);
    
    // Calculate cost (Sonnet pricing as of 2024)
    const inputCost = (response.usage.input_tokens / 1_000_000) * 3.00;
    const outputCost = (response.usage.output_tokens / 1_000_000) * 15.00;
    
    await db.run(`
      INSERT INTO api_usage 
      (id, tenant_id, project_id, ticket_id, agent_id, model, input_tokens, output_tokens, cost_usd, request_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      crypto.randomUUID(),
      this.context.tenantId,
      this.context.projectId,
      this.context.ticketId,
      this.context.agentId,
      params.model,
      response.usage.input_tokens,
      response.usage.output_tokens,
      inputCost + outputCost,
      params.requestType || 'unknown'
    ]);
    
    return response;
  }
}
```

**Dashboard Widget:**
```
┌─────────────────────────────────────────┐
│  Cost This Month: $127.43               │
├─────────────────────────────────────────┤
│  By Project:                            │
│    webapp-redesign     $89.21  (70%)    │
│    api-refactor        $31.45  (25%)    │
│    docs-update          $6.77   (5%)    │
│                                         │
│  By Agent Type:                         │
│    Coders             $98.12  (77%)     │
│    Reviewers          $22.34  (18%)     │
│    Security            $6.97   (5%)     │
└─────────────────────────────────────────┘
```

---

### 7. No Canary/Gradual Rollout for Agent Templates

**Problem:** If you deploy a buggy agent template, all 100+ VMs execute broken code simultaneously.

**Impact:** Catastrophic failure mode—one bad deploy affects every ticket in flight.

**Solution:**

```sql
CREATE TABLE agent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('coder', 'reviewer', 'security', 'judge', 'clarifier', 'decomposer')),
  version TEXT NOT NULL,
  prompt_content TEXT NOT NULL,
  config JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE agent_template_deployments (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES agent_templates(id),
  tenant_id TEXT REFERENCES tenants(id),  -- NULL = all tenants
  rollout_percent INTEGER DEFAULT 0 CHECK(rollout_percent BETWEEN 0 AND 100),
  status TEXT DEFAULT 'canary' CHECK(status IN ('canary', 'rolling', 'full', 'rollback', 'disabled')),
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  promoted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_deployments_template ON agent_template_deployments(template_id);
CREATE INDEX idx_deployments_status ON agent_template_deployments(status);
```

```javascript
class TemplateRolloutManager {
  
  async getActiveTemplate(agentType, tenantId) {
    // 1. Check for tenant-specific deployment
    const tenantDeployment = await db.get(`
      SELECT d.*, t.prompt_content, t.config
      FROM agent_template_deployments d
      JOIN agent_templates t ON d.template_id = t.id
      WHERE t.type = ? AND d.tenant_id = ? AND d.status != 'disabled'
      ORDER BY d.created_at DESC
      LIMIT 1
    `, [agentType, tenantId]);
    
    // 2. Check for global deployment
    const globalDeployment = await db.get(`
      SELECT d.*, t.prompt_content, t.config
      FROM agent_template_deployments d
      JOIN agent_templates t ON d.template_id = t.id
      WHERE t.type = ? AND d.tenant_id IS NULL AND d.status != 'disabled'
      ORDER BY d.created_at DESC
      LIMIT 1
    `, [agentType]);
    
    const deployment = tenantDeployment || globalDeployment;
    if (!deployment) {
      throw new Error(`No active template for agent type: ${agentType}`);
    }
    
    // 3. Apply rollout percentage (canary logic)
    if (deployment.status === 'canary' || deployment.status === 'rolling') {
      const shouldUseNew = Math.random() * 100 < deployment.rollout_percent;
      if (!shouldUseNew) {
        // Fall back to previous stable version
        return this.getPreviousStableTemplate(agentType, tenantId);
      }
    }
    
    return deployment;
  }
  
  async recordOutcome(deploymentId, success) {
    const field = success ? 'success_count' : 'failure_count';
    await db.run(`
      UPDATE agent_template_deployments
      SET ${field} = ${field} + 1
      WHERE id = ?
    `, [deploymentId]);
    
    // Auto-rollback on high failure rate
    const deployment = await db.get(`
      SELECT * FROM agent_template_deployments WHERE id = ?
    `, [deploymentId]);
    
    const totalAttempts = deployment.success_count + deployment.failure_count;
    const failureRate = deployment.failure_count / totalAttempts;
    
    if (totalAttempts >= 10 && failureRate > 0.3) {
      await this.rollback(deploymentId, `Auto-rollback: ${(failureRate * 100).toFixed(1)}% failure rate`);
    }
    
    // Auto-promote on success
    if (deployment.status === 'canary' && deployment.success_count >= 20 && failureRate < 0.05) {
      await this.promote(deploymentId, 50);  // Promote to 50% rollout
    }
  }
  
  async promote(deploymentId, newPercent) {
    await db.run(`
      UPDATE agent_template_deployments
      SET rollout_percent = ?, status = 'rolling', promoted_at = datetime('now')
      WHERE id = ?
    `, [newPercent, deploymentId]);
  }
  
  async rollback(deploymentId, reason) {
    await db.run(`
      UPDATE agent_template_deployments
      SET status = 'rollback'
      WHERE id = ?
    `, [deploymentId]);
    
    await sendAlert({
      type: 'template_rollback',
      deployment_id: deploymentId,
      reason
    });
  }
}
```

**Rollout Workflow:**
```
1. Deploy at 5% (canary)  → Monitor for 20+ executions
2. Auto-promote to 25%    → If <5% failure rate
3. Manual promote to 50%  → After human review
4. Manual promote to 100% → Full rollout
```

---

### 8. Missing Structured Agent Logging/Tracing

**Problem:** When an agent fails, you have no structured way to understand what happened inside the VM.

**Impact:** Debugging is guesswork. Production incidents are black boxes. No performance profiling.

**Solution:**

```sql
CREATE TABLE agent_traces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  ticket_id TEXT REFERENCES tickets(id),
  agent_id TEXT REFERENCES agents(id),
  trace_id TEXT NOT NULL,  -- Correlates all spans in a request
  parent_span_id TEXT,
  span_name TEXT NOT NULL,
  span_kind TEXT CHECK(span_kind IN ('internal', 'client', 'server')),
  status TEXT CHECK(status IN ('ok', 'error', 'unset')),
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_ms INTEGER,
  attributes JSON DEFAULT '{}',
  events JSON DEFAULT '[]',  -- [{name, timestamp, attributes}]
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_traces_ticket ON agent_traces(ticket_id);
CREATE INDEX idx_traces_trace_id ON agent_traces(trace_id);
CREATE INDEX idx_traces_agent ON agent_traces(agent_id);
CREATE INDEX idx_traces_start ON agent_traces(start_time);
```

```javascript
// Lightweight tracer for agent VMs
class AgentTracer {
  constructor(ticketId, agentId, tenantId) {
    this.traceId = crypto.randomUUID();
    this.context = { ticketId, agentId, tenantId };
    this.spans = [];
  }
  
  startSpan(name, attributes = {}) {
    const span = {
      id: crypto.randomUUID(),
      name,
      startTime: new Date().toISOString(),
      attributes,
      events: [],
      status: 'unset'
    };
    this.spans.push(span);
    
    return {
      addEvent: (eventName, eventAttrs = {}) => {
        span.events.push({
          name: eventName,
          timestamp: new Date().toISOString(),
          attributes: eventAttrs
        });
      },
      setStatus: (status) => { span.status = status; },
      setAttribute: (key, value) => { span.attributes[key] = value; },
      end: () => {
        span.endTime = new Date().toISOString();
        span.durationMs = new Date(span.endTime) - new Date(span.startTime);
      }
    };
  }
  
  async flush() {
    // Send all spans to collector
    for (const span of this.spans) {
      await fetch(`${COLLECTOR_URL}/api/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...this.context,
          trace_id: this.traceId,
          ...span
        })
      });
    }
  }
}

// Usage in agent
const tracer = new AgentTracer(ticketId, agentId, tenantId);

const cloneSpan = tracer.startSpan('git.clone', { repo: repoUrl });
await gitClone(repoUrl);
cloneSpan.setStatus('ok');
cloneSpan.end();

const codeSpan = tracer.startSpan('llm.generate_code', { model: 'claude-sonnet-4-20250514' });
codeSpan.addEvent('prompt_sent', { tokens: 2500 });
const code = await generateCode(ticket);
codeSpan.addEvent('response_received', { tokens: 1200 });
codeSpan.setAttribute('files_generated', 3);
codeSpan.setStatus('ok');
codeSpan.end();

await tracer.flush();
```

**Dashboard Trace View:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Ticket #47 - Agent Execution Trace                             │
├─────────────────────────────────────────────────────────────────┤
│  Total Duration: 45.2s                                          │
│                                                                 │
│  ├─ vm.restore ─────────────  8ms                              │
│  ├─ git.clone ──────────────  2.3s                             │
│  ├─ llm.generate_code ──────  38.1s  ◀ 84% of time            │
│  │   ├─ prompt_sent (2.5k tokens)                              │
│  │   └─ response_received (1.2k tokens)                        │
│  ├─ file.write (3 files) ───  45ms                             │
│  ├─ git.commit ─────────────  890ms                            │
│  └─ git.push ───────────────  3.8s                             │
│                                                                 │
│  Attributes: { files_generated: 3, model: "claude-sonnet" }    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 9. No Ticket Time Estimation

**Problem:** No way to predict how long a ticket will take. Users submit a project and wait indefinitely with no expectations.

**Impact:** Poor UX, no capacity planning, cannot set customer expectations, no SLA tracking.

**Solution:**

```sql
-- Add to tickets table
ALTER TABLE tickets ADD COLUMN estimated_minutes INTEGER;
ALTER TABLE tickets ADD COLUMN actual_minutes INTEGER;
ALTER TABLE tickets ADD COLUMN complexity_score INTEGER;  -- 1-10

-- Historical data for estimation model
CREATE VIEW ticket_completion_stats AS
SELECT 
  complexity_score,
  type,
  AVG(actual_minutes) as avg_minutes,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY actual_minutes) as median_minutes,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY actual_minutes) as p90_minutes,
  COUNT(*) as sample_size
FROM tickets
WHERE actual_minutes IS NOT NULL
GROUP BY complexity_score, type;
```

```javascript
class TicketEstimator {
  
  async estimateTicket(ticket) {
    // 1. Determine complexity score from ticket content
    const complexityScore = await this.calculateComplexity(ticket);
    
    // 2. Look up historical averages
    const stats = await db.get(`
      SELECT * FROM ticket_completion_stats
      WHERE complexity_score = ? AND type = ?
    `, [complexityScore, ticket.type]);
    
    if (stats && stats.sample_size >= 10) {
      return {
        estimated_minutes: Math.round(stats.avg_minutes),
        confidence: 'high',
        range: {
          optimistic: Math.round(stats.median_minutes * 0.7),
          expected: Math.round(stats.median_minutes),
          pessimistic: Math.round(stats.p90_minutes)
        }
      };
    }
    
    // 3. Fall back to heuristic
    return this.heuristicEstimate(ticket, complexityScore);
  }
  
  async calculateComplexity(ticket) {
    // Factors: description length, file count hints, dependency count, keywords
    let score = 5;  // Base score
    
    const descLength = ticket.description.length;
    if (descLength > 2000) score += 2;
    else if (descLength > 1000) score += 1;
    else if (descLength < 200) score -= 1;
    
    // Keywords that indicate complexity
    const complexKeywords = ['refactor', 'migrate', 'integrate', 'security', 'performance'];
    const simpleKeywords = ['typo', 'rename', 'update text', 'fix style'];
    
    if (complexKeywords.some(k => ticket.description.toLowerCase().includes(k))) score += 2;
    if (simpleKeywords.some(k => ticket.description.toLowerCase().includes(k))) score -= 2;
    
    // Dependency count
    const depCount = await db.get(`
      SELECT COUNT(*) as count FROM dependencies WHERE ticket_id = ?
    `, [ticket.id]);
    if (depCount.count > 3) score += 1;
    
    return Math.max(1, Math.min(10, score));
  }
  
  heuristicEstimate(ticket, complexityScore) {
    const baseMinutes = {
      1: 5, 2: 10, 3: 15, 4: 25, 5: 40,
      6: 60, 7: 90, 8: 120, 9: 180, 10: 300
    };
    
    return {
      estimated_minutes: baseMinutes[complexityScore],
      confidence: 'low',
      range: {
        optimistic: Math.round(baseMinutes[complexityScore] * 0.5),
        expected: baseMinutes[complexityScore],
        pessimistic: Math.round(baseMinutes[complexityScore] * 2)
      }
    };
  }
}
```

**Dashboard Display:**
```
┌─────────────────────────────────────────┐
│  Project: webapp-redesign               │
│  Tickets: 47 total                      │
├─────────────────────────────────────────┤
│  Estimated Completion: ~4.5 hours       │
│  ████████████░░░░░░░░  58% complete     │
│                                         │
│  ⏱️  12 tickets in progress             │
│  ⏳  8 tickets queued                   │
│  ✅  27 tickets done                    │
│                                         │
│  ETA: Today 3:45 PM                     │
└─────────────────────────────────────────┘
```

---

### 10. Missing Project-Level Rollback

**Problem:** If a batch of tickets produces bad code, there's no "undo project" button. Users must manually revert each PR.

**Impact:** High friction recovery, risk of partial rollbacks, customer frustration.

**Solution:**

```sql
CREATE TABLE project_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  tenant_id TEXT REFERENCES tenants(id),
  commit_sha TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  snapshot_type TEXT CHECK(snapshot_type IN ('pre_design', 'checkpoint', 'manual', 'pre_rollback')),
  ticket_count INTEGER,
  description TEXT,
  created_by TEXT,  -- 'system' or user_id
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_snapshots_project ON project_snapshots(project_id);
CREATE INDEX idx_snapshots_created ON project_snapshots(created_at);
```

```javascript
class ProjectRollbackManager {
  
  async createSnapshot(projectId, type, description = null) {
    const project = await db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
    
    // Get current HEAD commit
    const headSha = await this.getHeadCommit(project.repo_url);
    
    await db.run(`
      INSERT INTO project_snapshots 
      (id, project_id, tenant_id, commit_sha, branch_name, snapshot_type, description, created_by)
      VALUES (?, ?, ?, ?, 'main', ?, ?, 'system')
    `, [crypto.randomUUID(), projectId, project.tenant_id, headSha, type, description]);
    
    return headSha;
  }
  
  async listSnapshots(projectId) {
    return db.all(`
      SELECT * FROM project_snapshots
      WHERE project_id = ?
      ORDER BY created_at DESC
    `, [projectId]);
  }
  
  async rollbackToSnapshot(projectId, snapshotId, userId) {
    const snapshot = await db.get(`
      SELECT * FROM project_snapshots WHERE id = ? AND project_id = ?
    `, [snapshotId, projectId]);
    
    if (!snapshot) throw new Error('Snapshot not found');
    
    const project = await db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
    
    // 1. Create a pre-rollback snapshot
    await this.createSnapshot(projectId, 'pre_rollback', `Before rollback to ${snapshot.commit_sha.slice(0, 7)}`);
    
    // 2. Cancel any in-progress tickets
    await db.run(`
      UPDATE tickets
      SET status = 'cancelled'
      WHERE project_id = ? AND status IN ('assigned', 'in_progress')
    `, [projectId]);
    
    // 3. Close any open PRs
    const openPRs = await this.getOpenPRs(project.repo_url);
    for (const pr of openPRs) {
      await this.closePR(project.repo_url, pr.number, 'Closed due to project rollback');
    }
    
    // 4. Reset branch to snapshot commit
    await this.resetBranch(project.repo_url, 'main', snapshot.commit_sha);
    
    // 5. Log the rollback
    await db.run(`
      INSERT INTO events (ticket_id, event_type, actor_id, actor_type, metadata, rationale)
      VALUES (NULL, 'project_rollback', ?, 'human', ?, ?)
    `, [
      userId,
      JSON.stringify({ project_id: projectId, snapshot_id: snapshotId, commit_sha: snapshot.commit_sha }),
      `Rolled back to ${snapshot.snapshot_type} snapshot from ${snapshot.created_at}`
    ]);
    
    return { success: true, rolled_back_to: snapshot.commit_sha };
  }
}

// Auto-snapshot before design agent runs
async function startDesignSession(projectId) {
  await rollbackManager.createSnapshot(projectId, 'pre_design', 'Before design agent');
  // ... continue with design
}
```

**Dashboard UI:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Project Snapshots                                              │
├─────────────────────────────────────────────────────────────────┤
│  📸 pre_design    abc1234   Dec 12 10:00   [Rollback]          │
│  📸 checkpoint    def5678   Dec 12 11:30   [Rollback]          │
│  📸 pre_rollback  ghi9012   Dec 12 12:00   [Rollback]          │
│                                                                 │
│  ⚠️  Rollback will:                                            │
│     • Cancel 3 in-progress tickets                             │
│     • Close 2 open PRs                                         │
│     • Reset main branch to selected commit                     │
│                                                                 │
│  [Cancel]  [Confirm Rollback]                                  │
└─────────────────────────────────────────────────────────────────┘
```



---

## 🟢 Strategic Opportunities (P3 - Future Differentiation)

### 11. Agent Collaboration Patterns

**Problem:** Current architecture is single-agent-per-ticket. Complex tickets benefit from multiple specialized agents working together.

**Impact:** Higher quality outputs, handles ambiguity better, enterprise-grade confidence.

**Solution:** See separate design document: `design/ticket-collaboration-patterns.md`

**Summary of patterns:**
- **Single (default):** Coder → Reviewer (90% of tickets)
- **Extended Pipeline:** Coder → Security → Tests → Reviewer (security-critical)
- **Ensemble:** 3 Coders (parallel) → Judge → Reviewer (ambiguous specs)

---

### 12. Self-Healing Infrastructure

**Problem:** When VMs fail, network partitions occur, or services crash, manual intervention is required.

**Impact:** Operations overhead, weekend pages, slow recovery, lost work.

**Solution:**

```javascript
// Health check system with automatic remediation
class SelfHealingMonitor {
  constructor() {
    this.checks = [
      { name: 'vm_health', interval: 30000, handler: this.checkVMHealth },
      { name: 'api_health', interval: 15000, handler: this.checkAPIHealth },
      { name: 'db_health', interval: 10000, handler: this.checkDBHealth },
      { name: 'network_health', interval: 30000, handler: this.checkNetworkHealth },
      { name: 'stale_tickets', interval: 60000, handler: this.checkStaleTickets }
    ];
  }
  
  async checkVMHealth() {
    const agents = await db.all(`
      SELECT * FROM agents 
      WHERE status IN ('assigned', 'working') 
        AND last_heartbeat < datetime('now', '-5 minutes')
    `);
    
    for (const agent of agents) {
      console.log(`[HEAL] Agent ${agent.id} missed heartbeat, recovering...`);
      
      // 1. Mark agent as failed
      await db.run(`UPDATE agents SET status = 'failed' WHERE id = ?`, [agent.id]);
      
      // 2. Release any claimed tickets back to ready
      await db.run(`
        UPDATE tickets 
        SET status = 'ready', claimed_by_agent_id = NULL, claim_token = NULL
        WHERE claimed_by_agent_id = ? AND status = 'assigned'
      `, [agent.id]);
      
      // 3. Terminate the VM
      await this.terminateVM(agent.vm_id);
      
      // 4. Spawn replacement if needed
      const activeCount = await this.getActiveAgentCount(agent.tenant_id);
      const targetCount = await this.getTargetAgentCount(agent.tenant_id);
      if (activeCount < targetCount) {
        await this.spawnReplacementVM(agent.tenant_id);
      }
      
      await this.alert('vm_recovered', { agent_id: agent.id });
    }
  }
  
  async checkStaleTickets() {
    // Tickets stuck in 'in_progress' for too long
    const staleTickets = await db.all(`
      SELECT t.*, 
             ROUND((julianday('now') - julianday(t.updated_at)) * 24 * 60) as minutes_stale
      FROM tickets t
      WHERE t.status = 'in_progress'
        AND t.updated_at < datetime('now', '-30 minutes')
    `);
    
    for (const ticket of staleTickets) {
      console.log(`[HEAL] Ticket ${ticket.id} stale for ${ticket.minutes_stale}min, recovering...`);
      
      // Increment failure count and return to ready
      await db.run(`
        UPDATE tickets
        SET status = 'ready',
            failure_count = failure_count + 1,
            last_failure_reason = 'Timed out after 30 minutes',
            claimed_by_agent_id = NULL
        WHERE id = ?
      `, [ticket.id]);
      
      // Check if should be quarantined
      if (ticket.failure_count + 1 >= 3) {
        await db.run(`
          UPDATE tickets
          SET status = 'quarantined', quarantine_reason = 'Timed out 3 times'
          WHERE id = ?
        `, [ticket.id]);
      }
    }
  }
  
  async checkNetworkHealth() {
    // Verify bridge network connectivity
    const testVMs = await this.getTestVMs();
    for (const vm of testVMs) {
      const canReachAPI = await this.pingFromVM(vm.id, 'http://10.0.0.1:8080/health');
      if (!canReachAPI) {
        console.log(`[HEAL] VM ${vm.id} cannot reach API, rebuilding network...`);
        await this.rebuildVMNetwork(vm.id);
      }
    }
  }
  
  start() {
    for (const check of this.checks) {
      setInterval(() => {
        check.handler.call(this).catch(err => {
          console.error(`[HEAL] Check ${check.name} failed:`, err);
        });
      }, check.interval);
    }
  }
}
```

**Remediation Actions:**
| Condition | Automatic Action |
|-----------|------------------|
| VM missed heartbeat | Terminate, release tickets, spawn replacement |
| Ticket stale >30min | Return to ready, increment failure count |
| Network partition | Rebuild VM network namespace |
| API unresponsive | Restart service, alert on-call |
| DB locked | Force checkpoint, alert if persists |
| Disk >90% | Purge old logs, alert for expansion |

---

### 13. Learning from Historical Executions

**Problem:** Each ticket starts from scratch. Agents don't learn from past successes or failures in the same codebase.

**Impact:** Repeated mistakes, no institutional knowledge, suboptimal solutions.

**Solution:**

```sql
-- Execution patterns that worked/failed
CREATE TABLE execution_learnings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  project_id TEXT REFERENCES projects(id),
  pattern_type TEXT CHECK(pattern_type IN ('success', 'failure', 'optimization')),
  context_hash TEXT NOT NULL,  -- Hash of ticket type + keywords for matching
  description TEXT NOT NULL,
  embedding BLOB,  -- Vector embedding for semantic search
  example_ticket_id TEXT REFERENCES tickets(id),
  times_applied INTEGER DEFAULT 0,
  effectiveness_score REAL,  -- Updated based on outcomes when applied
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_learnings_project ON execution_learnings(project_id);
CREATE INDEX idx_learnings_type ON execution_learnings(pattern_type);

-- Code patterns in this specific codebase
CREATE TABLE codebase_patterns (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  pattern_type TEXT,  -- 'api_style', 'test_convention', 'error_handling', 'naming'
  description TEXT NOT NULL,
  example_code TEXT,
  file_patterns TEXT,  -- Glob patterns where this applies
  confidence REAL DEFAULT 1.0,
  source TEXT,  -- 'inferred' or 'explicit'
  created_at TEXT DEFAULT (datetime('now'))
);
```

```javascript
class LearningSystem {
  
  async extractLearnings(ticketId, outcome) {
    const ticket = await this.getTicketWithHistory(ticketId);
    
    if (outcome === 'success') {
      // What made this work?
      const learnings = await this.analyzeSuccess(ticket);
      for (const learning of learnings) {
        await this.storeLearning({
          tenant_id: ticket.tenant_id,
          project_id: ticket.project_id,
          pattern_type: 'success',
          description: learning.description,
          context_hash: this.hashContext(ticket),
          example_ticket_id: ticketId
        });
      }
    } else if (outcome === 'failure') {
      // What went wrong?
      const antipatterns = await this.analyzeFailure(ticket);
      for (const pattern of antipatterns) {
        await this.storeLearning({
          tenant_id: ticket.tenant_id,
          project_id: ticket.project_id,
          pattern_type: 'failure',
          description: pattern.description,
          context_hash: this.hashContext(ticket),
          example_ticket_id: ticketId
        });
      }
    }
  }
  
  async getRelevantLearnings(ticket) {
    // 1. Get learnings from same project
    const projectLearnings = await db.all(`
      SELECT * FROM execution_learnings
      WHERE project_id = ?
        AND effectiveness_score > 0.5
      ORDER BY times_applied DESC, effectiveness_score DESC
      LIMIT 10
    `, [ticket.project_id]);
    
    // 2. Get codebase conventions
    const conventions = await db.all(`
      SELECT * FROM codebase_patterns
      WHERE project_id = ?
        AND confidence > 0.7
    `, [ticket.project_id]);
    
    // 3. Semantic search for similar contexts (if embeddings enabled)
    const similarLearnings = await this.semanticSearch(ticket.description, ticket.tenant_id);
    
    return {
      project_learnings: projectLearnings,
      conventions: conventions,
      similar_learnings: similarLearnings
    };
  }
  
  async injectLearningsIntoPrompt(ticket, basePrompt) {
    const learnings = await this.getRelevantLearnings(ticket);
    
    let contextAdditions = '';
    
    if (learnings.conventions.length > 0) {
      contextAdditions += '\n\n## Codebase Conventions\n';
      for (const conv of learnings.conventions) {
        contextAdditions += `- ${conv.pattern_type}: ${conv.description}\n`;
        if (conv.example_code) {
          contextAdditions += `  Example: \`${conv.example_code}\`\n`;
        }
      }
    }
    
    if (learnings.project_learnings.length > 0) {
      contextAdditions += '\n\n## Lessons from This Project\n';
      for (const learning of learnings.project_learnings) {
        const prefix = learning.pattern_type === 'failure' ? '❌ Avoid:' : '✅ Prefer:';
        contextAdditions += `- ${prefix} ${learning.description}\n`;
      }
    }
    
    return basePrompt + contextAdditions;
  }
}
```

**Example Injected Context:**
```
## Codebase Conventions
- api_style: Use camelCase for function names, PascalCase for classes
- test_convention: Tests go in __tests__ folder, use Jest with describe/it pattern
- error_handling: Always wrap async operations in try/catch, log to structured logger

## Lessons from This Project
- ✅ Prefer: Use the existing `ApiClient` class for HTTP requests rather than raw fetch
- ✅ Prefer: Add JSDoc comments for exported functions
- ❌ Avoid: Don't use `any` type - previous tickets failed review for this
- ❌ Avoid: Don't modify shared utility files without explicit instruction
```

---

### 14. Agent Template Marketplace

**Problem:** Users can only use Anthropic-provided agent templates. No way to share or monetize custom templates.

**Impact:** Limited differentiation, can't capture domain expertise, users build siloed solutions.

**Solution:**

```sql
-- Marketplace listings
CREATE TABLE marketplace_templates (
  id TEXT PRIMARY KEY,
  author_tenant_id TEXT REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  long_description TEXT,
  category TEXT,  -- 'security', 'testing', 'documentation', 'review', 'domain'
  tags JSON DEFAULT '[]',
  agent_type TEXT NOT NULL,
  prompt_content TEXT NOT NULL,  -- Encrypted for paid templates
  config_schema JSON,  -- JSON schema for user configuration
  version TEXT NOT NULL,
  visibility TEXT DEFAULT 'private' CHECK(visibility IN ('private', 'public', 'unlisted')),
  pricing_model TEXT DEFAULT 'free' CHECK(pricing_model IN ('free', 'one_time', 'per_use', 'subscription')),
  price_cents INTEGER DEFAULT 0,
  install_count INTEGER DEFAULT 0,
  rating_avg REAL,
  rating_count INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,  -- Anthropic-verified
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_marketplace_category ON marketplace_templates(category);
CREATE INDEX idx_marketplace_visibility ON marketplace_templates(visibility);
CREATE INDEX idx_marketplace_rating ON marketplace_templates(rating_avg DESC);

-- Installations (which tenants have which templates)
CREATE TABLE template_installations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  template_id TEXT REFERENCES marketplace_templates(id),
  installed_version TEXT NOT NULL,
  config JSON DEFAULT '{}',  -- User's configuration
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  installed_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, template_id)
);

-- Reviews
CREATE TABLE template_reviews (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES marketplace_templates(id),
  reviewer_tenant_id TEXT REFERENCES tenants(id),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Marketplace Categories:**
| Category | Description | Examples |
|----------|-------------|----------|
| Security | Security-focused agents | OWASP auditor, secrets scanner, dependency checker |
| Testing | Test generation/validation | Jest generator, E2E writer, mutation tester |
| Documentation | Docs and comments | JSDoc generator, README writer, changelog creator |
| Review | Code review specialists | Performance reviewer, accessibility checker |
| Domain | Industry-specific | HIPAA compliance, financial regulations, gaming |
| DevOps | Infrastructure agents | Dockerfile optimizer, K8s manifest generator |

**API Endpoints:**
```
GET    /api/marketplace/templates              List public templates
GET    /api/marketplace/templates/:slug        Template details
POST   /api/marketplace/templates/:slug/install   Install template
DELETE /api/marketplace/installations/:id      Uninstall
POST   /api/marketplace/templates              Publish template (authors)
PUT    /api/marketplace/templates/:id          Update template
POST   /api/marketplace/templates/:id/reviews  Leave review
```

**Revenue Model:**
| Model | Platform Cut | Author Receives |
|-------|--------------|-----------------|
| Free | - | - |
| One-time purchase | 20% | 80% |
| Per-use ($0.01-$1.00) | 25% | 75% |
| Subscription | 15% | 85% |

**Marketplace UI:**
```
┌─────────────────────────────────────────────────────────────────┐
│  🏪 Agent Template Marketplace                                  │
├─────────────────────────────────────────────────────────────────┤
│  Categories: [All] [Security] [Testing] [Documentation]        │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ 🛡️ OWASP Auditor    │  │ 🧪 Jest Generator   │              │
│  │ ⭐⭐⭐⭐⭐ (127)       │  │ ⭐⭐⭐⭐☆ (89)        │              │
│  │ FREE                │  │ $4.99 one-time     │              │
│  │ 2.3k installs       │  │ 891 installs       │              │
│  │ [Install]           │  │ [Purchase]         │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ 🏥 HIPAA Compliance │  │ 📝 Changelog Writer │              │
│  │ ⭐⭐⭐⭐⭐ (34)        │  │ ⭐⭐⭐⭐☆ (156)       │              │
│  │ $0.05/use           │  │ FREE                │              │
│  │ 156 installs        │  │ 5.1k installs       │              │
│  │ [Install]           │  │ [Install]          │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
- [ ] Idempotency keys + claim tokens
- [ ] Dead letter queue + quarantine UI
- [ ] Tenant quota enforcement

### Phase 2: Reliability (Week 2)
- [ ] Webhook system
- [ ] SQLite retry logic + PostgreSQL abstraction
- [ ] API cost tracking

### Phase 3: Observability (Week 3)
- [ ] Agent tracing
- [ ] Canary deployment system
- [ ] Self-healing monitor

### Phase 4: UX Enhancements (Week 4)
- [ ] Time estimation
- [ ] Project snapshots + rollback
- [ ] Dashboard widgets for all above

### Phase 5: Differentiation (Weeks 5-8)
- [ ] Collaboration patterns (pipeline, ensemble)
- [ ] Learning system
- [ ] Template marketplace MVP

---

## Appendix: Quick Wins

Items that can be implemented in <2 hours each:

1. **WAL mode + busy_timeout** - 15 min
2. **Basic failure_count column** - 30 min
3. **Tenant quota check (not full enforcement)** - 1 hour
4. **Pre-design snapshot creation** - 45 min
5. **Basic cost logging (no dashboard)** - 1 hour

---

*Document created: 2025-12-12*
*Last updated: 2025-12-12*
*Status: Complete - All 14 recommendations documented*
