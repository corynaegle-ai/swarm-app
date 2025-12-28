# Agent-Foreman Pattern Adoption Spec

**Status**: Draft  
**Author**: Neural + Claude  
**Date**: 2024-12-14  
**Source**: https://github.com/mylukin/agent-foreman  
**Anthropic Reference**: [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## Executive Summary

Agent-foreman is a structured harness for AI coding agents that solves three critical failure modes: doing too much at once, premature completion, and superficial testing. This spec proposes adopting its core patterns into Swarm's worker agent pipeline to strengthen validation and improve code quality.

**Key Adoption**: Machine-parseable acceptance criteria with automated verification before PR creation.

---

## Problem Statement

### Current Swarm Pipeline
```
Ticket → Worker Agent → Code Generation → PR → Human Review
                ↑
        No structured validation
        Agent self-declares completion
```

### Failure Modes (from Anthropic research)

| Failure Mode | Description | Swarm Impact |
|--------------|-------------|--------------|
| Doing too much | Agent tries to complete multiple features | Ticket scope creep, context overflow |
| Premature completion | Declares victory before code works | PRs that fail tests, wasted review cycles |
| Superficial testing | Doesn't validate implementation | Bugs slip through, technical debt |

---

## Agent-Foreman Core Patterns

### 1. External Memory via Structured Files

Agent-foreman uses JSON files as external memory that persists across sessions:

```json
{
  "features": [
    {
      "id": "auth.login",
      "status": "failing",
      "acceptance_criteria": [
        "POST /auth/login accepts email and password",
        "Returns JWT token on success",
        "Returns 401 on invalid credentials"
      ]
    }
  ]
}
```

**Key insight**: Models respect and accurately update JSON structures better than markdown checklists.

### 2. TDD-Style Workflow

```
RED    → Define acceptance criteria (failing tests)
GREEN  → Implement minimum code to pass
REFACTOR → Optimize under test protection
```

### 3. Status State Machine

```
pending → in_progress → verifying → passing
              ↓            ↓
           blocked      failing
```



---

## Proposed Swarm Integration

### Phase 1: Schema Enhancement

#### 1.1 Ticket Schema Changes

Add structured acceptance criteria to tickets table:

```sql
ALTER TABLE tickets ADD COLUMN acceptance_criteria JSON;
ALTER TABLE tickets ADD COLUMN verification_status TEXT DEFAULT 'pending';
ALTER TABLE tickets ADD COLUMN verification_log JSON;
ALTER TABLE tickets ADD COLUMN impact_flags JSON DEFAULT '[]';
```

#### 1.2 Acceptance Criteria Types

```typescript
interface AcceptanceCriteria {
  checks: Check[];
}

type Check = 
  | HttpRequestCheck
  | FileExistsCheck
  | CodePatternCheck
  | TestPassCheck
  | ManualCheck;

interface HttpRequestCheck {
  id: string;
  type: 'http_request';
  description: string;
  verify: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: object;
    expect_status: number;
    expect_body?: object;
  };
}

interface FileExistsCheck {
  id: string;
  type: 'file_exists';
  description: string;
  verify: {
    path: string;
    contains?: string[];
  };
}

interface CodePatternCheck {
  id: string;
  type: 'code_pattern';
  description: string;
  verify: {
    file: string;
    pattern: string;  // regex
    should_match: boolean;
  };
}

interface TestPassCheck {
  id: string;
  type: 'test_pass';
  description: string;
  verify: {
    command: string;  // e.g., "npm test -- --grep 'auth'"
    expect_exit_code: number;
  };
}

interface ManualCheck {
  id: string;
  type: 'manual';
  description: string;
  verify: null;  // Requires human verification
}
```



### Phase 2: Verification Engine

#### 2.1 New Component: `swarm-sentinel`

A verification service that runs acceptance criteria checks:

```
┌─────────────────────────────────────────────────────────┐
│                   SWARM VERIFIER                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Worker Agent completes code                            │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐                                   │
│  │ POST /verify    │◄── ticket_id, branch_name         │
│  └────────┬────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐                                   │
│  │ Load acceptance │                                   │
│  │ criteria from   │                                   │
│  │ ticket          │                                   │
│  └────────┬────────┘                                   │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐    ┌─────────────────┐           │
│  │ For each check: │───▶│ Execute check   │           │
│  │ - http_request  │    │ in isolated env │           │
│  │ - file_exists   │    │ (VM or container)│          │
│  │ - code_pattern  │    └────────┬────────┘           │
│  │ - test_pass     │             │                     │
│  └─────────────────┘             ▼                     │
│                        ┌─────────────────┐             │
│                        │ Aggregate       │             │
│                        │ results         │             │
│                        └────────┬────────┘             │
│                                 │                       │
│                                 ▼                       │
│  ┌──────────────────────────────────────────┐         │
│  │ All pass? → verification_status: passing │         │
│  │ Any fail? → verification_status: failing │         │
│  │ Return detailed results                   │         │
│  └──────────────────────────────────────────┘         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 2.2 Verification API

```typescript
// POST /api/verify
interface VerifyRequest {
  ticket_id: string;
  branch_name: string;
  repo_url: string;
}

interface VerifyResponse {
  ticket_id: string;
  verification_status: 'passing' | 'failing' | 'blocked';
  checks: CheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

interface CheckResult {
  check_id: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  duration_ms: number;
  output?: string;
}
```



### Phase 3: Worker Agent Changes

#### 3.1 Updated Agent Workflow

```
OLD: Ticket → Generate Code → Create PR → Done

NEW: Ticket → Generate Code → Self-Verify → Request Verification → 
     → If PASS: Create PR
     → If FAIL: Iterate (max 3 attempts) → Escalate to Human
```

#### 3.2 Agent Prompt Injection

Add to worker agent system prompt:

```markdown
## Acceptance Criteria Protocol

Before creating a PR, you MUST verify your implementation against the acceptance criteria.

1. Read the `acceptance_criteria` field from your ticket
2. For each criterion:
   - Implement the feature
   - Write a test or manual check
   - Verify it passes
3. Only create PR when ALL criteria pass
4. If you cannot meet a criterion after 3 attempts, mark ticket as `blocked` with explanation

## Verification Commands

- `swarm verify <ticket_id>` - Run automated acceptance checks
- `swarm status <ticket_id>` - View current verification status
```

#### 3.3 Max Iteration Guard

```typescript
const MAX_VERIFY_ATTEMPTS = 3;

async function workerAgentLoop(ticket: Ticket) {
  let attempts = 0;
  
  while (attempts < MAX_VERIFY_ATTEMPTS) {
    // Generate/fix code
    await generateCode(ticket);
    
    // Run verification
    const result = await verify(ticket.id, ticket.branch);
    
    if (result.verification_status === 'passing') {
      await createPR(ticket);
      return;
    }
    
    // Feed failures back to agent for iteration
    await feedbackToAgent(result.checks.filter(c => c.status === 'failed'));
    attempts++;
  }
  
  // Escalate after max attempts
  await escalateToHuman(ticket, 'Max verification attempts exceeded');
}
```



### Phase 4: Impact Tracking

#### 4.1 Dependency-Aware Flagging

When a ticket is completed, check if it impacts other tickets:

```typescript
async function onTicketComplete(completedTicket: Ticket) {
  // Find tickets that depend on completed ticket
  const dependents = await db.query(`
    SELECT * FROM tickets 
    WHERE dependencies LIKE '%${completedTicket.id}%'
    AND status = 'passing'
  `);
  
  // Flag for re-verification
  for (const dep of dependents) {
    await db.query(`
      UPDATE tickets 
      SET verification_status = 'needs_review',
          impact_flags = json_insert(impact_flags, '$[#]', ?)
      WHERE id = ?
    `, [{ triggered_by: completedTicket.id, reason: 'dependency_updated' }, dep.id]);
  }
}
```

#### 4.2 File-Based Impact Detection

Track which files each ticket modifies:

```sql
CREATE TABLE ticket_file_map (
  ticket_id TEXT,
  file_path TEXT,
  change_type TEXT,  -- 'created', 'modified', 'deleted'
  PRIMARY KEY (ticket_id, file_path)
);
```

When a file is modified, flag overlapping tickets:

```typescript
async function detectFileImpact(modifiedFiles: string[]) {
  const impacted = await db.query(`
    SELECT DISTINCT ticket_id FROM ticket_file_map
    WHERE file_path IN (?)
    AND ticket_id != ?
  `, [modifiedFiles, currentTicketId]);
  
  // Flag for review
  for (const t of impacted) {
    await flagForReview(t.ticket_id, 'file_overlap');
  }
}
```

---

## Migration Plan

### Stage 1: Schema Migration (Week 1)
- [ ] Add new columns to tickets table
- [ ] Create ticket_file_map table
- [ ] Update ticket API to accept acceptance_criteria

### Stage 2: Verifier Service (Week 2)
- [ ] Build swarm-sentinel service
- [ ] Implement check executors (http, file, pattern, test)
- [ ] Add /api/verify endpoint

### Stage 3: Agent Integration (Week 3)
- [ ] Update worker agent prompt with verification protocol
- [ ] Add verification loop to agent execution engine
- [ ] Implement escalation flow

### Stage 4: Impact Tracking (Week 4)
- [ ] Implement dependency flagging
- [ ] Add file change tracking
- [ ] Build impact detection queries



---

## Comparison: Agent-Foreman vs Swarm Adoption

| Feature | Agent-Foreman | Swarm Current | Swarm Proposed |
|---------|---------------|---------------|----------------|
| Feature tracking | `feature_list.json` | SQLite tickets | SQLite + JSON criteria ✅ |
| Status machine | 6 states | 4 states | 6 states (align) |
| Acceptance criteria | Text array | Text field | Structured JSON ✅ |
| Verification | Manual + CLI | None | Automated service ✅ |
| Session handoff | `progress.log` | Event sourcing | Event sourcing ✅ |
| Impact tracking | Manual review | None | Automated flagging ✅ |
| TDD enforcement | Workflow design | Implied | Enforced via loop ✅ |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| PRs requiring revision | Unknown | <20% |
| Verification pass rate (first attempt) | N/A | >60% |
| Time to PR (from ticket claim) | ~30 min | ~25 min |
| Human escalation rate | 100% | <30% |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Over-specified criteria | Agents stuck in loops | Max 3 attempts, then escalate |
| Verification service bottleneck | Slow pipeline | Run verification in parallel VMs |
| False positives | Good code rejected | Human review for contested PRs |
| Complex criteria authoring | Design agent burden | Provide criteria templates |

---

## Appendix: Example Ticket with Criteria

```json
{
  "id": "SWARM-042",
  "title": "Add JWT authentication middleware",
  "type": "feature",
  "status": "in_progress",
  "acceptance_criteria": {
    "checks": [
      {
        "id": "ac-1",
        "type": "file_exists",
        "description": "Middleware file exists",
        "verify": {
          "path": "src/middleware/auth.js",
          "contains": ["jwt.verify", "module.exports"]
        }
      },
      {
        "id": "ac-2",
        "type": "test_pass",
        "description": "Auth tests pass",
        "verify": {
          "command": "npm test -- --grep 'auth middleware'",
          "expect_exit_code": 0
        }
      },
      {
        "id": "ac-3",
        "type": "http_request",
        "description": "Protected route rejects without token",
        "verify": {
          "method": "GET",
          "path": "/api/protected",
          "expect_status": 401
        }
      },
      {
        "id": "ac-4",
        "type": "http_request",
        "description": "Protected route accepts valid token",
        "verify": {
          "method": "GET",
          "path": "/api/protected",
          "headers": {"Authorization": "Bearer {{TEST_JWT}}"},
          "expect_status": 200
        }
      }
    ]
  },
  "verification_status": "pending",
  "verification_log": []
}
```

---

## References

1. [Agent-Foreman GitHub](https://github.com/mylukin/agent-foreman)
2. [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
3. Swarm Ticket System Spec (`/opt/swarm-specs/architecture/ticket-system.md`)
4. Swarm Worker Agent Spec (`/opt/swarm-specs/architecture/worker-agent.md`)
