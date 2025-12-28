# Worker Agent Specification

## Overview

Coding agent that executes tickets by generating code, running tests, and submitting PRs. Uses the FORGE persona for expert-level code generation.

**Status**: BUILT (needs persona integration)  
**Priority**: HIGH  
**Location**: `/usr/local/bin/swarm-agent-v2`  
**Persona**: `/opt/swarm-tickets/personas/forge.md`

---

## Architecture Position

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Design Agent   │────►│  Ticket Store   │────►│  Worker Agent   │
│  (creates)      │     │  (queues)       │     │  (FORGE)        │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  GitHub PR      │
                                                │  + Code         │
                                                └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Review Agent   │
                                                │  (SENTINEL)     │
                                                └─────────────────┘
```

---

## The Persona: "FORGE"

### Identity

**Name**: FORGE (Focused Operative for Reliable and Generative Engineering)

**Background**: 20 years as Principal Engineer building production systems at scale. Architected systems handling billions of requests. Mentored hundreds of engineers. Writes code that earns praise in reviews.

### Core Beliefs

```
"Working code is the minimum bar, not the goal."
"The best code is code that doesn't need comments to understand."
"Complexity is the enemy. Fight it at every turn."
"Handle errors where they occur, not where they explode."
"Tests are documentation that can't lie."
```

### Persona File Location

`/opt/swarm-tickets/personas/forge.md` (190 lines)

---

## Model Configuration

| Priority | Source | Default |
|----------|--------|---------|
| 1 (highest) | Project settings | `project.worker_model` |
| 2 (default) | Global config | `claude-sonnet-4-20250514` (Sonnet 4) |

```javascript
const DEFAULT_WORKER_MODEL = 'claude-sonnet-4-20250514';

async function getWorkerModel(projectId) {
  const settings = await getProjectSettings(projectId);
  return settings?.worker_model || DEFAULT_WORKER_MODEL;
}
```

---

## Ticket Schema (Input)

Worker Agent receives tickets with these fields:

```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,              -- 'HT-001'
  title TEXT NOT NULL,              -- 'Implement user authentication'
  description TEXT,                 -- Full description of the work
  acceptance_criteria TEXT,         -- JSON array of criteria (CRITICAL)
  file_hints TEXT,                  -- Suggested files to create/modify
  epic_id TEXT,                     -- Parent epic
  project_id TEXT,                  -- Project identifier
  repo_url TEXT,                    -- Git repository URL
  branch_name TEXT,                 -- Branch to create
  dependencies TEXT,                -- JSON array of ticket IDs
  priority INTEGER DEFAULT 3,       -- 1-5 (1 = highest)
  status TEXT DEFAULT 'pending',
  assigned_to TEXT,
  metadata TEXT,                    -- JSON for additional context
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Acceptance Criteria Format

```json
{
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "description": "User can register with email and password",
      "testable": true
    },
    {
      "id": "AC-002", 
      "description": "Invalid emails are rejected with clear error message",
      "testable": true
    },
    {
      "id": "AC-003",
      "description": "Passwords must be at least 8 characters",
      "testable": true
    }
  ]
}
```

---

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKER AGENT FLOW                            │
└─────────────────────────────────────────────────────────────────┘

Step 1: CLAIM TICKET
┌─────────────────────────────────────────────────────────────────┐
│  POST /claim                                                    │
│  Receive: ticket with description + acceptance_criteria         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
Step 2: SETUP WORKSPACE
┌─────────────────────────────────────────────────────────────────┐
│  • Clone repository                                             │
│  • Create branch: ticket-{ID}                                   │
│  • Read existing code context (if file_hints provided)          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
Step 3: GENERATE CODE (with FORGE persona)
┌─────────────────────────────────────────────────────────────────┐
│  • Load FORGE persona as system prompt                          │
│  • Build prompt with ticket + acceptance criteria               │
│  • Call Claude API (Sonnet 4 default)                           │
│  • Parse structured response                                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
Step 4: SELF-VERIFY (against acceptance criteria)
┌─────────────────────────────────────────────────────────────────┐
│  • For each acceptance criterion:                               │
│    - Check if code satisfies it                                 │
│    - Mark SATISFIED / PARTIALLY_SATISFIED / BLOCKED             │
│  • If any BLOCKED → report and stop                             │
│  • If any PARTIALLY_SATISFIED → iterate or flag                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
Step 5: COMMIT & PUSH
┌─────────────────────────────────────────────────────────────────┐
│  • Write files to workspace                                     │
│  • Run linter/formatter (if configured)                         │
│  • Commit with structured message                               │
│  • Push to remote                                               │
│  • Create PR (optional, or let orchestrator do it)              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
Step 6: REPORT COMPLETION
┌─────────────────────────────────────────────────────────────────┐
│  POST /complete                                                 │
│  Include: criteria_status, files_changed, pr_url                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Persona Loading

```javascript
// worker-agent.js
const FORGE_PERSONA = await fs.readFile('/opt/swarm-tickets/personas/forge.md', 'utf8');
const DEFAULT_WORKER_MODEL = 'claude-sonnet-4-20250514';

async function generateCode(ticket) {
  const model = await getWorkerModel(ticket.project_id);
  
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 8192,
    system: FORGE_PERSONA,  // FORGE persona loaded here
    messages: [
      {
        role: 'user',
        content: buildCodingPrompt(ticket)
      }
    ]
  });
  
  return parseCodeResponse(response);
}
```

### Prompt Builder (with Acceptance Criteria)

```javascript
function buildCodingPrompt(ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const fileHints = JSON.parse(ticket.file_hints || '[]');
  
  return `
## Ticket: ${ticket.id}
## Title: ${ticket.title}

## Description
${ticket.description}

## Acceptance Criteria
${criteria.map((c, i) => `${i + 1}. [${c.id}] ${c.description}`).join('\n')}

## File Hints
${fileHints.length > 0 ? fileHints.join('\n') : 'None specified - determine appropriate file structure'}

## Repository Context
- Repo: ${ticket.repo_url}
- Branch: ${ticket.branch_name}

## Instructions

1. **Understand**: Read the description and ALL acceptance criteria carefully
2. **Plan**: Identify modules, functions, and interfaces needed
3. **Implement**: Write clean, well-structured code following your standards
4. **Verify**: Ensure EVERY acceptance criterion is satisfied
5. **Report**: Include status for each criterion in your response

## Required Output Format

Return a JSON object with this structure:
\`\`\`json
{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create" | "modify",
      "content": "// complete file content"
    }
  ],
  "tests": [
    {
      "path": "tests/file.test.js",
      "content": "// test file content"
    }
  ],
  "summary": "Brief description of implementation",
  "acceptance_criteria_status": [
    {
      "id": "AC-001",
      "criterion": "User can register with email and password",
      "status": "SATISFIED" | "PARTIALLY_SATISFIED" | "BLOCKED",
      "evidence": "Implemented in userService.register(), tested in register.test.js"
    }
  ],
  "notes": "Any concerns, assumptions, or questions"
}
\`\`\`

Remember: You are FORGE. Write code that SENTINEL will respect.
`;
}
```

### Self-Verification

```javascript
async function selfVerify(ticket, generatedCode) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const statuses = generatedCode.acceptance_criteria_status || [];
  
  const results = {
    all_satisfied: true,
    blocked: [],
    partial: [],
    satisfied: []
  };
  
  for (const criterion of criteria) {
    const status = statuses.find(s => s.id === criterion.id);
    
    if (!status) {
      results.all_satisfied = false;
      results.blocked.push({
        ...criterion,
        reason: 'No status reported for this criterion'
      });
    } else if (status.status === 'BLOCKED') {
      results.all_satisfied = false;
      results.blocked.push({ ...criterion, ...status });
    } else if (status.status === 'PARTIALLY_SATISFIED') {
      results.all_satisfied = false;
      results.partial.push({ ...criterion, ...status });
    } else {
      results.satisfied.push({ ...criterion, ...status });
    }
  }
  
  return results;
}
```

### Completion Report

```javascript
async function reportCompletion(ticket, result, verification) {
  await fetch('http://10.0.0.1:8080/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: AGENT_ID,
      ticket_id: ticket.id,
      status: verification.all_satisfied ? 'done' : 'partial',
      pr_url: result.pr_url,
      files_changed: result.files.map(f => f.path),
      acceptance_criteria_status: result.acceptance_criteria_status,
      summary: result.summary,
      notes: result.notes
    })
  });
}
```

---

## Acceptance Criteria Flow (End-to-End)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Design Agent │────►│ Ticket Store │────►│ Worker Agent │────►│ Review Agent │
│              │     │              │     │   (FORGE)    │     │  (SENTINEL)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
  GENERATES:           STORES:              USES:               VALIDATES:
  - criteria[]        - criteria[]        - criteria[]         - criteria[]
  - file_hints        - file_hints        - Build prompt       - Check each
                                          - Self-verify        - Score impact
                                          - Report status      - Fail if unmet
```

### Design Agent → Ticket Store

```json
// Phase 2 expansion output
{
  "id": "HT-001",
  "title": "User registration endpoint",
  "description": "Create REST endpoint for user registration...",
  "acceptance_criteria": [
    {"id": "AC-001", "description": "POST /api/users creates new user"},
    {"id": "AC-002", "description": "Returns 400 for invalid email format"},
    {"id": "AC-003", "description": "Returns 409 if email already exists"},
    {"id": "AC-004", "description": "Passwords are hashed before storage"}
  ],
  "file_hints": ["src/routes/users.js", "src/services/userService.js"]
}
```

### Worker Agent → Review Agent

```json
// Completion report includes criteria status
{
  "ticket_id": "HT-001",
  "status": "done",
  "acceptance_criteria_status": [
    {"id": "AC-001", "status": "SATISFIED", "evidence": "POST handler in users.js:15-40"},
    {"id": "AC-002", "status": "SATISFIED", "evidence": "Validation in userService.js:8"},
    {"id": "AC-003", "status": "SATISFIED", "evidence": "Unique check in userService.js:22"},
    {"id": "AC-004", "status": "SATISFIED", "evidence": "bcrypt.hash() in userService.js:30"}
  ]
}
```

### Review Agent Validation

```javascript
// In review-agent.js - SENTINEL validates against criteria
function buildReviewPrompt(prDiff, ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  
  return `
## Code Review Request

### Ticket: ${ticket.id} - ${ticket.title}

### Acceptance Criteria (MUST ALL BE MET)
${criteria.map((c, i) => `${i + 1}. [${c.id}] ${c.description}`).join('\n')}

### Worker Agent's Reported Status
${ticket.criteria_status?.map(s => `- [${s.id}] ${s.status}: ${s.evidence}`).join('\n')}

### Code Diff
\`\`\`diff
${prDiff}
\`\`\`

### Review Instructions

1. Verify EACH acceptance criterion is actually satisfied by the code
2. Check code quality per your standards
3. Flag any security issues
4. Report if worker agent's status claims are accurate

### Output Format

Return JSON with your standard review format, plus:
- acceptance_criteria_verification: [{id, claimed_status, actual_status, notes}]
- If ANY criterion is NOT satisfied, decision cannot be APPROVE
`;
}
```

---

## Configuration

```yaml
# /opt/swarm-tickets/worker-agent/config.yaml

persona:
  path: /opt/swarm-tickets/personas/forge.md

model:
  default: claude-sonnet-4-20250514  # Sonnet 4
  max_tokens: 8192

execution:
  self_verify: true  # Verify against acceptance criteria before commit
  max_iterations: 2  # Retry if self-verify fails
  run_linter: true
  run_tests: false   # Usually too slow in VM

heartbeat:
  interval_seconds: 30
  
timeouts:
  idle_seconds: 300  # Self-terminate after 5 min idle
  task_seconds: 600  # Max 10 min per ticket

git:
  commit_prefix: "feat"  # feat, fix, chore based on ticket type
  create_pr: true
```

---

## Error Handling

| Error Type | Action |
|------------|--------|
| API timeout | Retry once, then mark ticket as blocked |
| Parse error | Log and retry with simpler prompt |
| Git conflict | Report to orchestrator, mark blocked |
| Criteria blocked | Report which criteria, assign to human if critical |
| Self-verify fail (2x) | Submit anyway, let Review Agent catch issues |

---

## Metrics

| Metric | Purpose |
|--------|---------|
| `first_pass_rate` | % of tickets passing review on first submit |
| `criteria_satisfaction_rate` | % of criteria satisfied per ticket |
| `avg_generation_time` | Time from claim to completion |
| `retry_rate` | How often self-verify causes regeneration |
| `model_usage` | Token consumption by model type |

---

## Summary

The Worker Agent with FORGE persona provides:

1. **Expert Coding**: FORGE persona primes for quality code generation
2. **Criteria-Driven**: Acceptance criteria in prompt AND self-verification
3. **Transparent Status**: Reports satisfaction status for each criterion
4. **Review-Ready**: Output format designed for SENTINEL review
5. **Configurable Model**: Sonnet 4 default, project override available

**Handoff to Review Agent**: Worker provides `acceptance_criteria_status` so SENTINEL can verify claims and validate actual implementation.

---

*Created: December 11, 2025*
