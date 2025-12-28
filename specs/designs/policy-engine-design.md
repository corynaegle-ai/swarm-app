# Policy Engine Design Document

**Status**: Draft  
**Priority**: P2  
**Author**: Neural / Cory Naegle  
**Created**: 2024-12-23  
**Target Release**: Post-MVP

---

## Executive Summary

The Policy Engine provides declarative, fine-grained authorization controls for autonomous AI agents operating within Swarm. Using a Cedar-like policy language, it enables organizations to define what agents can and cannot do—critical for enterprise adoption in regulated industries.

---

## Problem Statement

Autonomous agents executing code present inherent risks:

| Risk Category | Example Scenario | Impact |
|---------------|------------------|--------|
| **Scope Creep** | Agent modifies files outside assigned repo | Code corruption, security breach |
| **Resource Abuse** | Agent spawns infinite API calls | Cost explosion, rate limiting |
| **Data Exfiltration** | Agent sends code to unauthorized endpoints | IP theft, compliance violation |
| **Dangerous Operations** | Agent runs `rm -rf /` or `DROP TABLE` | System destruction |
| **Privilege Escalation** | Agent accesses production secrets | Security breach |

Current Swarm has basic controls (HITL gates, tenant isolation) but lacks:
- Declarative policy definitions
- Fine-grained action-level permissions
- Audit trails for policy decisions
- Runtime policy enforcement

---

## Goals

1. **Declarative Policies**: Define agent permissions in human-readable policy files
2. **Fine-Grained Control**: Restrict at action/resource/context level
3. **Zero-Trust Default**: Deny by default, explicitly permit
4. **Audit Everything**: Log every policy decision for compliance
5. **Hot Reload**: Update policies without restarting services
6. **HITL Integration**: Escalate policy violations to human review

## Non-Goals

- Building a full Cedar implementation (use subset)
- Real-time policy editing UI (CLI/file-based first)
- Cross-tenant policy sharing (tenant isolation maintained)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Request                            │
│  (e.g., "write file /repo/src/auth.js")                        │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Policy Evaluation Point (PEP)               │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   Request   │───▶│   Policy    │───▶│  Decision   │        │
│  │   Context   │    │   Engine    │    │  (Allow/    │        │
│  │             │    │   (PDP)     │    │   Deny/     │        │
│  │ • agent_id  │    │             │    │   Escalate) │        │
│  │ • action    │    │ Evaluates   │    │             │        │
│  │ • resource  │    │ policies    │    └──────┬──────┘        │
│  │ • context   │    │ in order    │           │               │
│  └─────────────┘    └─────────────┘           │               │
└──────────────────────────────────────────────┼────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────┐
                    │                          │                  │
                    ▼                          ▼                  ▼
             ┌──────────┐              ┌──────────┐       ┌──────────┐
             │  ALLOW   │              │   DENY   │       │ ESCALATE │
             │          │              │          │       │  (HITL)  │
             │ Execute  │              │  Block   │       │  Queue   │
             │ action   │              │  + log   │       │ approval │
             └──────────┘              └──────────┘       └──────────┘
                                               │
                                               ▼
                                       ┌──────────────┐
                                       │  Audit Log   │
                                       │  (immutable) │
                                       └──────────────┘
```

---

## Policy Language

### Syntax (Cedar-Inspired Subset)

```
policy := (permit | forbid | escalate) "(" 
            "principal" principal_constraint ","
            "action" action_constraint ","
            "resource" resource_constraint
          ")" 
          ["when" "{" condition+ "}"]
          ["unless" "{" condition+ "}"]
          ";"
```

### Principal Types

| Type | Description | Example |
|------|-------------|---------|
| `Agent::` | Specific agent | `Agent::"worker-vm-042"` |
| `AgentGroup::` | Group of agents | `AgentGroup::"code-reviewers"` |
| `Tenant::` | Entire tenant | `Tenant::"acme-corp"` |
| `Role::` | Role-based | `Role::"senior-developer"` |

### Action Types

| Category | Actions |
|----------|---------|
| **File** | `file:read`, `file:write`, `file:delete`, `file:execute` |
| **Git** | `git:clone`, `git:commit`, `git:push`, `git:branch`, `git:merge` |
| **Network** | `net:http_get`, `net:http_post`, `net:connect` |
| **Shell** | `shell:execute`, `shell:spawn` |
| **API** | `api:claude`, `api:github`, `api:external` |
| **Secret** | `secret:read`, `secret:write` |

### Resource Attributes

```javascript
resource = {
  type: "file" | "repo" | "endpoint" | "secret" | "shell",
  path: "/opt/repo/src/...",
  repo: "acme-corp/backend",
  branch: "feature/auth",
  domain: "api.example.com",
  environment: "development" | "staging" | "production"
}
```

---

## Policy Examples

### 1. Basic File Scope Restriction

```cedar
// Agents can only write to their assigned repository
permit (
  principal in AgentGroup::"workers",
  action == Action::"file:write",
  resource
)
when {
  resource.repo == principal.assignedRepo &&
  resource.path.startsWith("/src/")
};
```

### 2. Dangerous Command Blocklist

```cedar
// Block destructive shell commands for all agents
forbid (
  principal,
  action == Action::"shell:execute",
  resource
)
when {
  resource.command.matches("rm -rf|DROP TABLE|DELETE FROM|mkfs|dd if=")
};
```

### 3. Production Environment Protection

```cedar
// No agent can touch production without explicit approval
escalate (
  principal in AgentGroup::"workers",
  action,
  resource
)
when {
  resource.environment == "production"
};
```

### 4. API Rate Limiting

```cedar
// Limit Claude API calls per agent per hour
forbid (
  principal,
  action == Action::"api:claude",
  resource
)
when {
  context.hourlyApiCalls[principal.id] > 100
};
```

### 5. Secret Access Control

```cedar
// Only senior agents can read production secrets
forbid (
  principal,
  action == Action::"secret:read",
  resource
)
when {
  resource.environment == "production"
}
unless {
  principal in Role::"senior-developer" ||
  principal in Role::"security-admin"
};
```

### 6. Network Egress Control

```cedar
// Whitelist allowed external domains
forbid (
  principal,
  action in [Action::"net:http_get", Action::"net:http_post"],
  resource
)
unless {
  resource.domain in [
    "api.github.com",
    "api.anthropic.com",
    "registry.npmjs.org",
    "pypi.org"
  ]
};
```

### 7. Git Branch Protection

```cedar
// Prevent direct commits to main/master
forbid (
  principal,
  action == Action::"git:push",
  resource
)
when {
  resource.branch in ["main", "master", "production"]
};

// Require PR workflow
permit (
  principal,
  action == Action::"git:push",
  resource
)
when {
  resource.branch.startsWith("feature/") ||
  resource.branch.startsWith("fix/") ||
  resource.branch.startsWith("agent/")
};
```

---

## Data Model

### PostgreSQL Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Policy definitions
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  policy_text TEXT NOT NULL,           -- Cedar-like policy source
  policy_ast JSONB NOT NULL,           -- Parsed AST (native JSON)
  priority INTEGER DEFAULT 100,        -- Lower = evaluated first
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  CONSTRAINT unique_policy_name_per_tenant UNIQUE (tenant_id, name)
);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Policy evaluation audit log (append-only)
CREATE TABLE policy_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  agent_id VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource JSONB NOT NULL,             -- Full resource object
  context JSONB,                       -- Token usage, session info, etc
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('allow', 'deny', 'escalate')),
  matched_policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  reason TEXT,                         -- Human-readable explanation
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  evaluation_ms INTEGER,               -- Performance tracking
  
  -- Prevent updates/deletes for audit integrity
  CONSTRAINT audit_immutable CHECK (true)
);

-- Revoke UPDATE and DELETE on audit table for application role
-- REVOKE UPDATE, DELETE ON policy_decisions FROM app_role;

-- Indexes for common query patterns
CREATE INDEX idx_policies_tenant ON policies(tenant_id) WHERE enabled = true;
CREATE INDEX idx_policies_priority ON policies(tenant_id, priority) WHERE enabled = true;

CREATE INDEX idx_decisions_tenant_time ON policy_decisions(tenant_id, evaluated_at DESC);
CREATE INDEX idx_decisions_agent ON policy_decisions(agent_id, evaluated_at DESC);
CREATE INDEX idx_decisions_action ON policy_decisions(action, decision);
CREATE INDEX idx_decisions_denied ON policy_decisions(tenant_id, evaluated_at DESC) 
  WHERE decision = 'deny';

-- Partitioning for audit log (by month for retention management)
-- For production, consider partitioning policy_decisions by evaluated_at
-- CREATE TABLE policy_decisions_y2025m01 PARTITION OF policy_decisions
--   FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- View for recent policy violations
CREATE VIEW recent_violations AS
SELECT 
  pd.id,
  pd.tenant_id,
  pd.agent_id,
  pd.action,
  pd.resource,
  pd.reason,
  pd.evaluated_at,
  p.name as policy_name
FROM policy_decisions pd
LEFT JOIN policies p ON pd.matched_policy_id = p.id
WHERE pd.decision IN ('deny', 'escalate')
  AND pd.evaluated_at > NOW() - INTERVAL '24 hours'
ORDER BY pd.evaluated_at DESC;
```

### Node.js Integration (node-postgres)

```javascript
// db/policies.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Get enabled policies for tenant (cached in production)
async function getPoliciesForTenant(tenantId) {
  const result = await pool.query(`
    SELECT id, name, policy_ast, priority
    FROM policies
    WHERE tenant_id = $1 AND enabled = true
    ORDER BY priority ASC
  `, [tenantId]);
  return result.rows;
}

// Log policy decision (audit trail)
async function logDecision(decision) {
  await pool.query(`
    INSERT INTO policy_decisions 
      (tenant_id, agent_id, action, resource, context, decision, matched_policy_id, reason, evaluation_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    decision.tenantId,
    decision.agentId,
    decision.action,
    JSON.stringify(decision.resource),
    JSON.stringify(decision.context),
    decision.decision,
    decision.matchedPolicyId,
    decision.reason,
    decision.evaluationMs
  ]);
}

module.exports = { getPoliciesForTenant, logDecision };
```

---

## API Design

### Policy Management

```
POST   /api/policies              # Create policy
GET    /api/policies              # List policies (tenant-scoped)
GET    /api/policies/:id          # Get policy details
PUT    /api/policies/:id          # Update policy
DELETE /api/policies/:id          # Delete policy
POST   /api/policies/:id/enable   # Enable policy
POST   /api/policies/:id/disable  # Disable policy
POST   /api/policies/validate     # Validate policy syntax
```

### Policy Evaluation (Internal)

```
POST   /api/policy/evaluate       # Evaluate action against policies
```

**Request:**
```json
{
  "principal": {
    "type": "Agent",
    "id": "worker-vm-042",
    "groups": ["workers"],
    "roles": ["developer"],
    "assignedRepo": "acme-corp/backend"
  },
  "action": "file:write",
  "resource": {
    "type": "file",
    "path": "/src/auth/login.js",
    "repo": "acme-corp/backend",
    "branch": "feature/oauth",
    "environment": "development"
  },
  "context": {
    "hourlyApiCalls": 45,
    "tokenUsage": 8500,
    "ticketId": "TICKET-123"
  }
}
```

**Response:**
```json
{
  "decision": "allow",
  "matchedPolicy": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Worker File Access"
  },
  "reason": "Principal Agent::worker-vm-042 permitted to file:write on assigned repo",
  "evaluationMs": 2
}
```

### Audit Log Queries

```
GET    /api/policy/audit                    # Query audit log
GET    /api/policy/audit/agent/:agentId     # Agent's decision history
GET    /api/policy/audit/stats              # Decision statistics
```

**Audit Query Parameters:**
```
GET /api/policy/audit?
  decision=deny&                    # Filter by decision type
  agent_id=worker-vm-042&          # Filter by agent
  action=file:write&               # Filter by action
  from=2025-01-01T00:00:00Z&       # Start date
  to=2025-01-31T23:59:59Z&         # End date
  limit=100&                        # Pagination
  offset=0
```

---

## Integration Points

### 1. Agent Execution Engine

```javascript
// In agent-executor.js
async function executeAgentAction(agent, action, resource) {
  // Evaluate policy BEFORE execution
  const decision = await policyEngine.evaluate({
    principal: agent,
    action: action,
    resource: resource,
    context: await getAgentContext(agent)
  });

  switch (decision.decision) {
    case 'allow':
      return await performAction(action, resource);
    
    case 'deny':
      throw new PolicyDeniedException(decision.reason);
    
    case 'escalate':
      return await hitlGateway.requestApproval({
        agent,
        action,
        resource,
        policyReason: decision.reason
      });
  }
}
```

### 2. HITL Gateway

Policy escalations create HITL approval requests:

```javascript
// Escalated actions go to human queue
{
  type: 'policy_escalation',
  agent_id: 'worker-vm-042',
  action: 'git:push',
  resource: { branch: 'main', repo: 'acme/prod' },
  policy: 'Production Branch Protection',
  reason: 'Direct push to protected branch requires approval',
  options: ['approve_once', 'approve_always', 'deny', 'deny_always']
}
```

### 3. VM Orchestrator

Pre-flight policy check before VM spawn:

```javascript
async function spawnAgentVM(ticket) {
  // Check if agent type is allowed for this ticket
  const allowed = await policyEngine.evaluate({
    principal: { type: 'AgentTemplate', id: ticket.agentType },
    action: 'vm:spawn',
    resource: { 
      project: ticket.projectId,
      environment: ticket.targetEnvironment 
    }
  });

  if (allowed.decision !== 'allow') {
    throw new Error(`Policy denied VM spawn: ${allowed.reason}`);
  }
  
  // Proceed with spawn...
}
```

### 4. Secrets Injection

Policy gates secret access:

```javascript
async function injectSecrets(vmId, secretKeys) {
  const agent = await getAgentForVM(vmId);
  
  for (const key of secretKeys) {
    const secret = await secretStore.get(key);
    
    const allowed = await policyEngine.evaluate({
      principal: agent,
      action: 'secret:read',
      resource: { 
        secretKey: key, 
        environment: secret.environment 
      }
    });

    if (allowed.decision !== 'allow') {
      console.warn(`Secret ${key} denied for ${agent.id}`);
      continue;
    }
    
    // Inject allowed secret...
  }
}
```

---

## Implementation Phases

### Phase 1: Core Engine (3-4 days)

- [ ] Policy parser (Cedar subset → AST)
- [ ] Policy evaluator (AST → decision)
- [ ] PostgreSQL schema migration
- [ ] Basic CRUD API for policies
- [ ] Unit tests with policy fixtures

### Phase 2: Integration (2-3 days)

- [ ] Integrate with Agent Execution Engine
- [ ] Add evaluation call in VM orchestrator
- [ ] Wire up HITL escalation pathway
- [ ] Add to secrets injection flow

### Phase 3: Default Policies (1-2 days)

- [ ] Create sensible default policy set
- [ ] Dangerous command blocklist
- [ ] Production environment protection
- [ ] Network egress allowlist
- [ ] Document policy templates

### Phase 4: Audit & Observability (2 days)

- [ ] Audit log query API
- [ ] Policy decision metrics (Prometheus)
- [ ] Dashboard: denied actions, escalations
- [ ] Alert on suspicious patterns

### Phase 5: UI (Optional, Post-MVP)

- [ ] Policy editor in dashboard
- [ ] Policy simulation/testing tool
- [ ] Audit log viewer
- [ ] Policy templates library

---

## Default Policy Set

Ship with sensible defaults that can be customized:

```cedar
// === DENY DANGEROUS OPERATIONS ===

forbid (
  principal,
  action == Action::"shell:execute",
  resource
)
when {
  resource.command.matches(
    "rm -rf|rmdir|del /|format|mkfs|dd if=|" +
    "DROP |DELETE FROM|TRUNCATE|ALTER TABLE|" +
    "shutdown|reboot|halt|poweroff|" +
    "chmod 777|chmod -R|chown -R|" +
    "curl.*\\|.*sh|wget.*\\|.*sh|" +
    "> /dev/sd|> /dev/hd"
  )
};

// === PROTECT PRODUCTION ===

escalate (
  principal,
  action,
  resource
)
when {
  resource.environment == "production"
};

// === NETWORK EGRESS ALLOWLIST ===

forbid (
  principal,
  action in [Action::"net:http_get", Action::"net:http_post", Action::"net:connect"],
  resource
)
unless {
  resource.domain in context.allowedDomains
};

// === GIT BRANCH PROTECTION ===

forbid (
  principal,
  action == Action::"git:push",
  resource
)
when {
  resource.branch in ["main", "master", "production", "release"]
};

// === TOKEN BUDGET ENFORCEMENT ===

forbid (
  principal,
  action == Action::"api:claude",
  resource
)
when {
  context.sessionTokens > context.maxSessionTokens
};
```

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Policy bypass | Evaluation is mandatory in execution path, not optional |
| Policy injection | Policies are tenant-isolated, validated on save |
| Audit tampering | Audit log table has no UPDATE/DELETE permissions for app role |
| Performance DoS | Cache compiled policies, connection pooling, indexed queries |
| Overly permissive | Default-deny stance, require explicit permits |
| SQL injection | Parameterized queries only, no string interpolation |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Policy evaluation latency | < 5ms p99 |
| Policies per tenant | Up to 1000 |
| Audit log retention | 90 days default (partitioned by month) |
| Cache hit rate | > 95% for policy lookups |
| Connection pool size | 20 connections default |

---

## Database Maintenance

### Audit Log Retention

```sql
-- Delete audit records older than 90 days (run via cron)
DELETE FROM policy_decisions 
WHERE evaluated_at < NOW() - INTERVAL '90 days';

-- Or with partitioning, simply drop old partitions:
-- DROP TABLE policy_decisions_y2024m01;
```

### Performance Monitoring

```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%policy%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Index usage
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname LIKE 'idx_%policy%';
```

---

## Testing Strategy

1. **Unit Tests**: Policy parser, evaluator logic
2. **Integration Tests**: Full evaluation flow with mocked actions
3. **Scenario Tests**: Real-world policy sets against action streams
4. **Chaos Tests**: Policy engine unavailable → fail closed (deny all)
5. **Load Tests**: 1000 policies, 10k evaluations/minute

---

## Open Questions

1. **Policy versioning**: Should we version policies for rollback?
2. **Policy inheritance**: Can child tenants inherit parent policies?
3. **Dynamic context**: How fresh does context data need to be?
4. **Conflict resolution**: Multiple matching policies—first match or most specific?

---

## References

- [Cedar Language Spec](https://www.cedarpolicy.com/en)
- [AWS Verified Permissions](https://aws.amazon.com/verified-permissions/)
- [Open Policy Agent (OPA)](https://www.openpolicyagent.org/) - Alternative approach
- [Google Zanzibar](https://research.google/pubs/pub48190/) - Relationship-based access

---

## Appendix: Policy Grammar (EBNF)

```ebnf
policy        = effect "(" clauses ")" conditions? ";" ;
effect        = "permit" | "forbid" | "escalate" ;
clauses       = principal_clause "," action_clause "," resource_clause ;

principal_clause = "principal" principal_constraint ;
principal_constraint = "==" entity | "in" entity | "" ; (* empty = any *)

action_clause = "action" action_constraint ;
action_constraint = "==" action | "in" action_list | "" ;

resource_clause = "resource" resource_constraint ;
resource_constraint = "==" entity | "" ;

conditions    = when_clause? unless_clause? ;
when_clause   = "when" "{" condition+ "}" ;
unless_clause = "unless" "{" condition+ "}" ;

condition     = expression ";" ;
expression    = attribute operator value 
              | attribute "." method "(" args? ")"
              | expression "&&" expression 
              | expression "||" expression ;

entity        = type "::" string ;
type          = "Agent" | "AgentGroup" | "Tenant" | "Role" | "Action" ;
attribute     = identifier ("." identifier)* ;
operator      = "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" ;
```

---

*Document Version: 1.1*  
*Last Updated: 2024-12-23*  
*Change: Migrated from SQLite to PostgreSQL*
