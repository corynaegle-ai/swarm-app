# Review Agent Specification (Refined)

## Overview

Automated code review agent that enforces strict quality standards on Worker Agent PRs. Acts as the quality gate between code generation and merge.

**Status**: NOT BUILT  
**Priority**: HIGH  
**Location**: `/opt/swarm-tickets/review-agent/`

---

## Architecture Position

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Worker    │────►│   GitHub    │────►│   Review    │────►│   Merge     │
│   Agent     │     │   PR        │     │   Agent     │     │   or        │
│             │     │             │     │             │     │   Reject    │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                                              ┌────────────────────┘
                                              │ (if rejected)
                                              ▼
                                        ┌─────────────┐
                                        │  Revision   │
                                        │  Ticket     │──► Back to Worker
                                        └─────────────┘
                                              │
                                              │ (if max attempts exceeded)
                                              ▼
                                        ┌─────────────┐
                                        │  Assign to  │
                                        │  Human Admin│
                                        └─────────────┘
```

---

## The Persona: "SENTINEL"

### Identity

**Name**: SENTINEL (Strict Engineering iNspector for Technical INtegrity and Efficiency in Logic)

**Background**: 25 years as Principal Engineer at high-reliability systems companies (aerospace, financial trading, medical devices). Led code review processes for teams of 200+ engineers. Zero tolerance for "it works" as justification. Believes code is read 100x more than written.

### Core Beliefs

```
"Every line of code is a liability until proven otherwise."
"If it's not tested, it's broken. If it's not documented, it doesn't exist."
"Clever code is technical debt with interest."
"Security is not a feature, it's a foundation."
"Performance problems are design problems in disguise."
```

### Review Philosophy

| Principle | Enforcement |
|-----------|-------------|
| **Readability First** | Code must be self-documenting. Comments explain WHY, not WHAT. |
| **Fail Fast** | Validate inputs immediately. Never trust external data. |
| **Explicit > Implicit** | No magic. No hidden side effects. Clear control flow. |
| **Minimal Surface Area** | Expose only what's necessary. Default to private. |
| **Idempotency** | Operations should be safely repeatable. |
| **Defense in Depth** | Multiple validation layers. Never single point of trust. |

---

## Persona Loading Mechanism

The persona is loaded as the system prompt when Review Agent calls Claude API.

### Model Selection

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | Project settings | `project.review_model = 'claude-sonnet-4-5-20250929'` |
| 2 (default) | Global config | `claude-opus-4-5-20251101` |

**Default**: Claude Opus 4.5 - the most thorough model for code review.  
**Override**: Projects can specify a faster/cheaper model if review depth isn't critical.

```javascript
// review-agent.js
const SENTINEL_PERSONA = await fs.readFile('./persona/sentinel.md', 'utf8');
const DEFAULT_MODEL = 'claude-opus-4-5-20251101';  // Opus 4.5 default

async function getReviewModel(projectId) {
  // Check project-level override first
  const projectSettings = await db.get(
    'SELECT review_model FROM project_settings WHERE project_id = ?',
    [projectId]
  );
  
  if (projectSettings?.review_model) {
    return projectSettings.review_model;
  }
  
  // Fall back to global config
  return config.model?.default || DEFAULT_MODEL;
}

async function reviewPR(prDiff, ticketContext) {
  const model = await getReviewModel(ticketContext.project_id);
  
  const response = await anthropic.messages.create({
    model: model,  // Opus 4.5 unless project overrides
    max_tokens: 8192,  // Opus can handle larger outputs
    system: SENTINEL_PERSONA,
    messages: [
      {
        role: 'user',
        content: buildReviewPrompt(prDiff, ticketContext)
      }
    ]
  });
  
  return parseReviewDecision(response);
}
```

---

## Worker Agent Model Configuration

Worker/Coding Agents default to **Sonnet 4** for optimal speed-to-quality ratio during code generation.

### Model Selection Priority

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | Project settings | `project.worker_model = 'claude-opus-4-5-20251101'` |
| 2 (default) | Global config | `claude-sonnet-4-20250514` (Sonnet 4) |

### Model Comparison for Coding

| Model | Speed | Quality | Best For |
|-------|-------|---------|----------|
| Sonnet 4 (default) | Fast | Excellent | Most coding tasks |
| Sonnet 4.5 | Medium | Excellent+ | Complex logic |
| Opus 4.5 | Slower | Best | Critical/complex systems |
| Haiku 4.5 | Fastest | Good | Simple tasks, boilerplate |

### Implementation (Worker Agent)

```javascript
// swarm-agent-v2 or worker-agent.js
const DEFAULT_WORKER_MODEL = 'claude-sonnet-4-20250514';  // Sonnet 4

async function getWorkerModel(projectId) {
  // Check project-level override first
  const projectSettings = await fetch(
    `http://10.0.0.1:8080/projects/${projectId}/settings`
  ).then(r => r.json()).catch(() => null);
  
  if (projectSettings?.worker_model) {
    return projectSettings.worker_model;
  }
  
  // Fall back to Sonnet 4
  return DEFAULT_WORKER_MODEL;
}

async function generateCode(ticket, context) {
  const model = await getWorkerModel(ticket.project_id);
  
  const response = await anthropic.messages.create({
    model: model,  // Sonnet 4 unless project overrides
    max_tokens: 8192,
    system: CODING_AGENT_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildCodingPrompt(ticket, context)
      }
    ]
  });
  
  return parseCodeResponse(response);
}
```

### Why Sonnet 4 as Default?

1. **Speed**: Generates code ~3x faster than Opus
2. **Cost**: More economical for high-volume ticket processing  
3. **Quality**: Excellent for most coding tasks (Review Agent catches issues)
4. **Parallelism**: Faster model = more concurrent agents practical

**When to override to Opus 4.5:**
- Security-critical code (auth, crypto, payments)
- Complex algorithmic work
- System architecture decisions
- When Review Agent repeatedly rejects Sonnet output

---

## Database Schema

### Core Tables

```sql
-- Users table (for human assignment)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',  -- 'admin', 'reviewer', 'user'
  is_human INTEGER DEFAULT 1,  -- 1 = human, 0 = agent
  created_at TEXT DEFAULT (datetime('now'))
);

-- Insert default admin
INSERT INTO users (id, email, name, role, is_human) 
VALUES ('admin', 'admin@swarmstack.net', 'System Admin', 'admin', 1);

-- Project settings table (for per-project overrides)
CREATE TABLE project_settings (
  project_id TEXT PRIMARY KEY,
  -- Review Agent model (default: Opus 4.5)
  review_model TEXT,  -- Override: 'claude-sonnet-4-5-20250929', etc.
  review_strictness TEXT,  -- Override: 'low', 'medium', 'high', 'paranoid'
  max_review_attempts INTEGER,  -- Override max attempts (default 3)
  auto_merge_on_approve INTEGER DEFAULT 0,  -- 1 = auto-merge approved PRs
  -- Worker Agent model (default: Sonnet 4)
  worker_model TEXT,  -- Override: 'claude-opus-4-5-20251101', 'claude-haiku-4-5-20251001', etc.
  worker_max_tokens INTEGER,  -- Override max output tokens (default 8192)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Example: Project with custom model settings
-- INSERT INTO project_settings (project_id, review_model, worker_model) 
-- VALUES ('critical-app', 'claude-opus-4-5-20251101', 'claude-opus-4-5-20251101');
-- (Both review and coding use Opus for critical projects)

-- Add to tickets table
ALTER TABLE tickets ADD COLUMN review_status TEXT;  -- 'pending', 'approved', 'changes_requested', 'rejected', 'human_required'
ALTER TABLE tickets ADD COLUMN review_score INTEGER;
ALTER TABLE tickets ADD COLUMN review_attempts INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN max_review_attempts INTEGER DEFAULT 3;
ALTER TABLE tickets ADD COLUMN parent_ticket_id TEXT;  -- Links revision to original
ALTER TABLE tickets ADD COLUMN assigned_to TEXT;  -- User ID (human or agent)
ALTER TABLE tickets ADD COLUMN assigned_type TEXT DEFAULT 'agent';  -- 'agent' or 'human'
ALTER TABLE tickets ADD COLUMN human_required INTEGER DEFAULT 0;  -- Flag for human intervention

-- Reviews table
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  pr_number INTEGER,
  decision TEXT NOT NULL,  -- 'APPROVE', 'REQUEST_CHANGES', 'REJECT'
  score INTEGER,
  summary TEXT,
  issues_json TEXT,
  reviewer_type TEXT DEFAULT 'agent',  -- 'agent' or 'human'
  reviewer_id TEXT,  -- User ID if human review
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

-- Revision tickets table
CREATE TABLE revision_tickets (
  id TEXT PRIMARY KEY,
  original_ticket_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (original_ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (review_id) REFERENCES reviews(id)
);
```

---

## Acceptance Criteria Validation

**CRITICAL**: The Review Agent MUST verify that ALL acceptance criteria from the original ticket are satisfied by the submitted code. This is the primary quality gate.

### Criteria Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Design Agent │────►│ Ticket Store │────►│ Worker Agent │────►│ Review Agent │
│              │     │              │     │   (FORGE)    │     │  (SENTINEL)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
  GENERATES:           STORES:              REPORTS:            VALIDATES:
  - criteria[]        - criteria[]        - claimed_status[]   - actual_status[]
  - file_hints        - file_hints        - evidence           - discrepancies
```

### Database Schema Update

```sql
-- Add acceptance criteria fields to tickets
ALTER TABLE tickets ADD COLUMN acceptance_criteria TEXT;  -- JSON array
ALTER TABLE tickets ADD COLUMN file_hints TEXT;  -- JSON array
ALTER TABLE tickets ADD COLUMN criteria_status TEXT;  -- Worker's reported status

-- Add criteria verification to reviews
ALTER TABLE reviews ADD COLUMN criteria_verification TEXT;  -- JSON validation results
ALTER TABLE reviews ADD COLUMN criteria_met INTEGER;  -- Count of satisfied criteria
ALTER TABLE reviews ADD COLUMN criteria_total INTEGER;  -- Total criteria count
ALTER TABLE reviews ADD COLUMN criteria_failed TEXT;  -- JSON array of failed criteria IDs
```

### Review Prompt with Acceptance Criteria

```javascript
function buildReviewPrompt(prDiff, ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const workerStatus = JSON.parse(ticket.criteria_status || '[]');
  const fileHints = JSON.parse(ticket.file_hints || '[]');
  
  return `
## Code Review Request

### Ticket: ${ticket.id} - ${ticket.title}

### Description
${ticket.description}

### Acceptance Criteria (ALL MUST BE SATISFIED)
${criteria.map((c, i) => `${i + 1}. [${c.id}] ${c.description}`).join('\n')}

### Worker Agent's Claimed Status
${workerStatus.map(s => `- [${s.id}] ${s.status}: ${s.evidence || 'No evidence provided'}`).join('\n')}

### Expected Files
${fileHints.length > 0 ? fileHints.join('\n') : 'None specified'}

### Code Diff
\`\`\`diff
${prDiff}
\`\`\`

## Review Instructions

### Step 1: Verify Each Acceptance Criterion
For EACH criterion listed above:
1. Examine the code to determine if it ACTUALLY satisfies the criterion
2. Compare against worker's claimed status - are they accurate?
3. Mark as VERIFIED, PARTIALLY_MET, or NOT_MET

### Step 2: Standard Code Review
Apply your standard review checklist:
- Security vulnerabilities
- Error handling
- Code quality and readability
- Performance concerns
- Test coverage

### Step 3: Determine Decision

**CRITICAL RULE**: If ANY acceptance criterion is NOT_MET, decision CANNOT be APPROVE.

| Criteria Status | Allowed Decisions |
|-----------------|-------------------|
| All VERIFIED | APPROVE (if code quality passes) |
| Any PARTIALLY_MET | REQUEST_CHANGES only |
| Any NOT_MET | REQUEST_CHANGES or REJECT |

## Required Output Format

\`\`\`json
{
  "decision": "APPROVE" | "REQUEST_CHANGES" | "REJECT",
  "score": 0-100,
  "summary": "Brief overall assessment",
  
  "acceptance_criteria_verification": [
    {
      "id": "AC-001",
      "criterion": "User can register with email",
      "worker_claimed": "SATISFIED",
      "actual_status": "VERIFIED" | "PARTIALLY_MET" | "NOT_MET",
      "evidence": "Found in userService.js:15-40",
      "discrepancy": null | "Worker claimed satisfied but missing email validation"
    }
  ],
  
  "issues": [
    {
      "severity": "CRITICAL" | "MAJOR" | "MINOR" | "SUGGESTION",
      "category": "security" | "error_handling" | "logic" | "quality" | "performance",
      "file": "path/to/file.js",
      "line": 42,
      "description": "What's wrong",
      "suggestion": "How to fix"
    }
  ],
  
  "tests_required": ["List of tests that should be added"],
  "blocking_issues_count": 0,
  "approval_blockers": ["List of things that MUST be fixed before approval"]
}
\`\`\`

Remember: You are SENTINEL. Acceptance criteria are non-negotiable requirements.
If a criterion is not met, the code is not done - period.
`;
}
```

### Verification Logic

```javascript
async function verifyAcceptanceCriteria(review, ticket) {
  const criteria = JSON.parse(ticket.acceptance_criteria || '[]');
  const verification = review.acceptance_criteria_verification || [];
  
  const results = {
    total: criteria.length,
    verified: 0,
    partial: 0,
    not_met: 0,
    failed_ids: [],
    all_met: true
  };
  
  for (const criterion of criteria) {
    const v = verification.find(v => v.id === criterion.id);
    
    if (!v) {
      // Criterion not reviewed - treat as not met
      results.not_met++;
      results.failed_ids.push(criterion.id);
      results.all_met = false;
    } else if (v.actual_status === 'VERIFIED') {
      results.verified++;
    } else if (v.actual_status === 'PARTIALLY_MET') {
      results.partial++;
      results.failed_ids.push(criterion.id);
      results.all_met = false;
    } else {
      results.not_met++;
      results.failed_ids.push(criterion.id);
      results.all_met = false;
    }
  }
  
  return results;
}

async function enforceDecisionRules(review, criteriaResults) {
  // CRITICAL: Cannot approve if any criteria not met
  if (!criteriaResults.all_met && review.decision === 'APPROVE') {
    console.warn('Review attempted APPROVE but criteria not met. Overriding to REQUEST_CHANGES');
    review.decision = 'REQUEST_CHANGES';
    review.approval_blockers = review.approval_blockers || [];
    review.approval_blockers.push(
      `${criteriaResults.failed_ids.length} acceptance criteria not satisfied: ${criteriaResults.failed_ids.join(', ')}`
    );
  }
  
  return review;
}
```

### Storing Verification Results

```javascript
async function saveReview(ticketId, review, criteriaResults) {
  await db.run(`
    INSERT INTO reviews (
      id, ticket_id, pr_number, decision, score, summary, 
      issues_json, criteria_verification, 
      criteria_met, criteria_total, criteria_failed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    generateId(),
    ticketId,
    review.pr_number,
    review.decision,
    review.score,
    review.summary,
    JSON.stringify(review.issues),
    JSON.stringify(review.acceptance_criteria_verification),
    criteriaResults.verified,
    criteriaResults.total,
    JSON.stringify(criteriaResults.failed_ids)
  ]);
}
```

### Decision Matrix

| Criteria Status | Code Quality | Security | Final Decision |
|-----------------|--------------|----------|----------------|
| All VERIFIED | Pass | Pass | APPROVE |
| All VERIFIED | Pass | CRITICAL | REJECT (assign human) |
| All VERIFIED | Minor issues | Pass | REQUEST_CHANGES |
| Some PARTIAL | Any | Any | REQUEST_CHANGES |
| Any NOT_MET | Any | Any | REQUEST_CHANGES |
| Many NOT_MET | Poor | Any | REJECT |

---

## Human Assignment System

### When Tickets Get Assigned to Humans

| Condition | Action |
|-----------|--------|
| 3 failed review attempts | Assign to admin for manual review |
| CRITICAL security issue | Assign to admin immediately |
| Review score < 30 | Assign to admin (fundamental design issue) |
| Worker agent error/crash | Assign to admin for investigation |
| Human override requested | Assign to specified user |

### Assignment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  HUMAN ASSIGNMENT FLOW                          │
└─────────────────────────────────────────────────────────────────┘

  Review Attempt 1 Failed
          │
          ▼
  Create Revision Ticket → Worker Agent
          │
          ▼
  Review Attempt 2 Failed
          │
          ▼
  Create Revision Ticket → Worker Agent
          │
          ▼
  Review Attempt 3 Failed
          │
          ▼
  ┌───────────────────────────────────────┐
  │  MAX ATTEMPTS EXCEEDED                │
  │                                       │
  │  1. Set ticket.human_required = 1     │
  │  2. Set ticket.assigned_to = 'admin'  │
  │  3. Set ticket.assigned_type = 'human'│
  │  4. Set ticket.status = 'human_review'│
  │  5. Log escalation event              │
  └───────────────────────────────────────┘
          │
          ▼
  Admin sees ticket in Dashboard
  (filtered by assigned_to = 'admin')
          │
          ▼
  Admin manually reviews/fixes/approves
          │
          ▼
  Admin marks ticket complete
```

### Implementation

```javascript
async function assignToHuman(ticket, review, reason) {
  const admin = await getDefaultAdmin();
  
  await ticketStore.update(ticket.id, {
    status: 'human_review',
    assigned_to: admin.id,
    assigned_type: 'human',
    human_required: 1,
    human_assignment_reason: reason,
    human_assigned_at: new Date().toISOString()
  });

  // Log the escalation
  await eventLog.insert({
    type: 'human_assignment',
    ticket_id: ticket.id,
    assigned_to: admin.id,
    reason: reason,
    review_id: review?.id,
    review_attempts: ticket.review_attempts,
    last_score: review?.score
  });

  // Emit event for dashboard real-time update
  eventBus.emit('ticket_assigned_to_human', {
    ticket_id: ticket.id,
    assigned_to: admin.id,
    reason: reason
  });

  return { assigned_to: admin.id, reason };
}

async function getDefaultAdmin() {
  const admin = await db.get(
    'SELECT * FROM users WHERE role = ? AND is_human = 1 LIMIT 1',
    ['admin']
  );
  
  if (!admin) {
    throw new Error('No admin user configured. Run: INSERT INTO users (id, email, name, role) VALUES (...)');
  }
  
  return admin;
}
```

### Human Assignment Reasons

```javascript
const HUMAN_ASSIGNMENT_REASONS = {
  MAX_ATTEMPTS_EXCEEDED: 'Maximum review attempts (3) exceeded without passing review',
  CRITICAL_SECURITY: 'Critical security vulnerability detected - requires human verification',
  LOW_SCORE: 'Review score below 30 indicates fundamental design issues',
  AGENT_ERROR: 'Worker agent encountered unrecoverable error',
  MANUAL_OVERRIDE: 'Human review explicitly requested',
  DESIGN_REVIEW_NEEDED: 'Architectural changes require human approval'
};
```

---

## Revision Ticket Creation

When review returns `REQUEST_CHANGES` or `REJECT`:

```javascript
async function handleFailedReview(ticket, review) {
  const revisionNumber = ticket.review_attempts + 1;
  
  // Check if max attempts exceeded → assign to human
  if (revisionNumber > ticket.max_review_attempts) {
    return await assignToHuman(
      ticket, 
      review, 
      HUMAN_ASSIGNMENT_REASONS.MAX_ATTEMPTS_EXCEEDED
    );
  }

  // Check for critical security issues → assign to human immediately
  const hasCriticalSecurity = review.critical_issues.some(
    i => i.category === 'security'
  );
  if (hasCriticalSecurity) {
    return await assignToHuman(
      ticket,
      review,
      HUMAN_ASSIGNMENT_REASONS.CRITICAL_SECURITY
    );
  }

  // Check for extremely low score → assign to human
  if (review.score < 30) {
    return await assignToHuman(
      ticket,
      review,
      HUMAN_ASSIGNMENT_REASONS.LOW_SCORE
    );
  }

  // Create revision ticket for another agent attempt
  return await createRevisionTicket(ticket, review);
}

async function createRevisionTicket(originalTicket, review) {
  const revisionNumber = originalTicket.review_attempts + 1;

  const revisionTicket = {
    id: `${originalTicket.id}-REV${revisionNumber}`,
    title: `[REVISION ${revisionNumber}] ${originalTicket.title}`,
    description: buildRevisionDescription(originalTicket, review),
    type: 'revision',
    parent_ticket_id: originalTicket.id,
    priority: Math.min(originalTicket.priority + 1, 5),  // Bump priority, max 5
    dependencies: [],
    status: 'pending',
    assigned_to: null,  // Available for any agent to claim
    assigned_type: 'agent',
    human_required: 0,
    review_attempts: 0,
    metadata: JSON.stringify({
      original_ticket_id: originalTicket.id,
      review_id: review.id,
      revision_number: revisionNumber,
      previous_score: review.score,
      issues_to_fix: review.critical_issues.concat(review.major_issues),
      branch_name: originalTicket.branch_name
    })
  };

  await ticketStore.insert(revisionTicket);
  
  await ticketStore.update(originalTicket.id, { 
    status: 'revision_pending',
    review_attempts: revisionNumber 
  });

  return revisionTicket;
}

function buildRevisionDescription(originalTicket, review) {
  return `
## Revision Required

**Original Ticket**: ${originalTicket.id}
**Review Score**: ${review.score}/100
**Decision**: ${review.decision}
**Attempt**: ${originalTicket.review_attempts + 1} of ${originalTicket.max_review_attempts}

### Summary
${review.summary}

### Issues to Fix

#### Critical Issues (MUST FIX)
${formatIssues(review.critical_issues)}

#### Major Issues (MUST FIX)
${formatIssues(review.major_issues)}

### Instructions for Worker Agent

1. Checkout the existing branch: \`${originalTicket.branch_name}\`
2. Address ALL critical and major issues listed above
3. Run tests to verify fixes
4. Commit with message: "fix: address review feedback for ${originalTicket.id}"
5. Push and mark complete

### Acceptance Criteria

- [ ] All CRITICAL issues resolved
- [ ] All MAJOR issues resolved
- [ ] No new issues introduced
- [ ] Tests pass
- [ ] Review score >= 85
`;
}

function formatIssues(issues) {
  if (!issues || issues.length === 0) return '_None_';
  
  return issues.map(i => `
- **${i.file}:${i.line}** - ${i.issue}
  - Suggestion: ${i.suggestion}
`).join('\n');
}
```

---

## API Endpoints

### Review Agent API (Port 8081)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/review` | POST | Trigger review for a ticket/PR |
| `/review/:id` | GET | Get review results |
| `/reviews` | GET | List all reviews (with filters) |
| `/review/:id/override` | POST | Human override of review decision |
| `/tickets/human` | GET | Get tickets assigned to humans |
| `/tickets/:id/assign` | POST | Reassign ticket to different user |
| `/projects/:id/settings` | GET | Get project review settings |
| `/projects/:id/settings` | PUT | Update project review settings |

### Project Settings Endpoints

**GET /projects/:id/settings**
```json
// Response
{
  "project_id": "my-web-app",
  "review_model": null,  // null = Opus 4.5 (default)
  "worker_model": null,  // null = Sonnet 4 (default)
  "review_strictness": null,  // null = high (default)
  "max_review_attempts": 3,
  "auto_merge_on_approve": false
}
```

**PUT /projects/:id/settings**
```json
// Request - critical project: use Opus for both coding AND review
{
  "review_model": "claude-opus-4-5-20251101",
  "worker_model": "claude-opus-4-5-20251101"
}

// Request - fast iteration: use Sonnet 4.5 for review (keep Sonnet 4 for coding)
{
  "review_model": "claude-sonnet-4-5-20250929"
}

// Request - reset worker to default (Sonnet 4)
{
  "worker_model": null
}

// Response
{
  "project_id": "my-web-app",
  "review_model": "claude-opus-4-5-20251101",
  "worker_model": "claude-opus-4-5-20251101",
  "updated_at": "2025-12-11T15:30:00Z"
}
```

### Human Assignment Endpoints

**GET /tickets/human**
```json
// Response
{
  "tickets": [
    {
      "id": "HT-001",
      "title": "Implement user authentication",
      "status": "human_review",
      "assigned_to": "admin",
      "human_assignment_reason": "Maximum review attempts (3) exceeded",
      "review_attempts": 3,
      "last_review_score": 58,
      "assigned_at": "2025-12-11T10:30:00Z"
    }
  ],
  "total": 1
}
```

**POST /tickets/:id/assign**
```json
// Request
{
  "assigned_to": "admin",  // User ID
  "reason": "Needs senior review"  // Optional
}

// Response
{
  "ticket_id": "HT-001",
  "assigned_to": "admin",
  "assigned_type": "human",
  "previous_assigned_to": null
}
```

**POST /review/:id/override**
```json
// Request (human approving manually)
{
  "decision": "APPROVE",
  "reviewer_id": "admin",
  "notes": "Reviewed manually, issues acceptable for MVP"
}

// Response
{
  "review_id": "rev_override_123",
  "ticket_id": "HT-001",
  "decision": "APPROVE",
  "reviewer_type": "human",
  "reviewer_id": "admin"
}
```

---

## Configuration

```yaml
# /opt/swarm-tickets/review-agent/config.yaml

model:
  # Review Agent - uses Opus 4.5 for thorough code review
  review:
    default: claude-opus-4-5-20251101
    max_tokens: 8192
  
  # Worker/Coding Agent - uses Sonnet 4 for fast code generation
  worker:
    default: claude-sonnet-4-20250514  # Sonnet 4 - fast and capable
    max_tokens: 8192
  
  # Allowed models for project overrides
  allowed:
    - claude-opus-4-5-20251101    # Opus 4.5 (most thorough)
    - claude-sonnet-4-5-20250929  # Sonnet 4.5 (excellent balance)
    - claude-sonnet-4-20250514    # Sonnet 4 (worker default - fast)
    - claude-haiku-4-5-20251001   # Haiku 4.5 (fastest, simple tasks)

persona:
  path: ./persona/sentinel.md
  strictness: high  # low, medium, high, paranoid

thresholds:
  auto_approve_score: 85
  request_changes_score: 60
  human_required_score: 30  # Below this → assign to human
  max_revision_attempts: 3

human_assignment:
  default_assignee: admin  # User ID for escalations
  immediate_escalation_categories:
    - security  # CRITICAL security issues → immediate human assignment
  
github:
  post_comments: true
  auto_merge_on_approve: false  # Requires human click
  
polling:
  enabled: true
  interval_seconds: 30
  
api:
  port: 8081
```

---

## Dashboard Integration

The dashboard should show human-assigned tickets prominently:

```javascript
// Dashboard query for admin view
async function getAdminDashboard(adminUserId) {
  const humanTickets = await db.all(`
    SELECT t.*, r.score as last_score, r.summary as last_review_summary
    FROM tickets t
    LEFT JOIN reviews r ON r.ticket_id = t.id
    WHERE t.assigned_to = ? 
      AND t.assigned_type = 'human'
    ORDER BY t.human_assigned_at DESC
  `, [adminUserId]);

  return {
    pending_human_review: humanTickets.filter(t => t.status === 'human_review'),
    total_escalations_today: await countEscalationsToday(),
    avg_review_attempts_before_escalation: await avgAttemptsBeforeEscalation()
  };
}
```

### Dashboard UI Elements

```
┌─────────────────────────────────────────────────────────────────┐
│  🔴 REQUIRES YOUR ATTENTION (3)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HT-001  "Implement user auth"                                  │
│  ├── Reason: Max attempts (3) exceeded                          │
│  ├── Last Score: 58/100                                         │
│  ├── Escalated: 2 hours ago                                     │
│  └── [View PR] [Approve] [Reject] [Reassign]                    │
│                                                                 │
│  HT-015  "Add payment processing"                               │
│  ├── Reason: Critical security vulnerability                    │
│  ├── Last Score: 72/100                                         │
│  ├── Escalated: 30 min ago                                      │
│  └── [View PR] [Approve] [Reject] [Reassign]                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Event Log Schema

```sql
CREATE TABLE event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ticket_id TEXT,
  data_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Index for querying by ticket
CREATE INDEX idx_event_log_ticket ON event_log(ticket_id);

-- Index for querying by type
CREATE INDEX idx_event_log_type ON event_log(type);
```

Event types:
- `review_completed` - Agent review finished
- `revision_created` - Revision ticket created
- `human_assignment` - Ticket assigned to human
- `human_override` - Human manually approved/rejected
- `ticket_reassigned` - Ticket moved to different assignee

---

## Implementation Files

| File | Purpose | Lines (est) |
|------|---------|-------------|
| `review-agent.js` | Main orchestrator | 280 |
| `persona/sentinel.md` | SENTINEL persona prompt | 154 |
| `github-integration.js` | PR diff fetching, commenting | 150 |
| `revision-handler.js` | Create revision tickets | 140 |
| `human-assignment.js` | Human escalation logic | 120 |
| `review-api.js` | HTTP endpoints | 130 |
| `migrations/001-review-tables.sql` | Database schema | 60 |
| **Total** | | **1,034** |

---

## Complete Review Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE REVIEW FLOW                             │
└──────────────────────────────────────────────────────────────────────────┘

Worker Agent completes ticket
            │
            ▼
    ┌───────────────┐
    │ Review Agent  │
    │ (SENTINEL)    │
    └───────┬───────┘
            │
            ▼
    ┌───────────────────────────────────────────────────┐
    │                 DECISION                          │
    ├───────────────┬───────────────┬───────────────────┤
    │   APPROVE     │ REQUEST_CHANGES│     REJECT       │
    │   (≥85)       │    (60-84)     │     (<60)        │
    └───────┬───────┴───────┬───────┴─────────┬─────────┘
            │               │                 │
            ▼               ▼                 ▼
    ┌───────────┐   ┌───────────────┐   ┌───────────────┐
    │  Merge PR │   │ Check attempt │   │ Check attempt │
    │  Close    │   │    count      │   │    count      │
    │  ticket   │   └───────┬───────┘   └───────┬───────┘
    └───────────┘           │                   │
                            ▼                   ▼
                    ┌───────────────────────────────────┐
                    │        attempt < max (3)?         │
                    └───────────────┬───────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        │ YES                   │ NO
                        ▼                       ▼
                ┌───────────────┐       ┌───────────────┐
                │ Create        │       │ Assign to     │
                │ Revision      │       │ Human Admin   │
                │ Ticket        │       │               │
                └───────┬───────┘       └───────┬───────┘
                        │                       │
                        ▼                       ▼
                ┌───────────────┐       ┌───────────────┐
                │ Worker Agent  │       │ Admin reviews │
                │ claims &      │       │ in Dashboard  │
                │ fixes         │       │               │
                └───────┬───────┘       └───────┬───────┘
                        │                       │
                        ▼                       ▼
                ┌───────────────┐       ┌───────────────┐
                │ Re-submit for │       │ Manual        │
                │ review        │       │ Approve/Fix/  │
                │ (loop back)   │       │ Reject        │
                └───────────────┘       └───────────────┘
```

---

## Metrics to Track

| Metric | Purpose |
|--------|---------|
| `review_score_avg` | Track code quality over time |
| `first_pass_approval_rate` | % of PRs approved on first review |
| `revision_count_avg` | Avg revisions needed per ticket |
| `human_escalation_rate` | % of tickets requiring human intervention |
| `time_to_approval` | Time from PR open to merge |
| `human_resolution_time` | Time from escalation to human resolution |
| `issues_by_category` | Most common issue types |

---

## Testing Strategy

```bash
# Unit tests
npm test -- review-agent.test.js
npm test -- human-assignment.test.js

# Integration test with mock Claude
MOCK_CLAUDE=true npm test -- review-integration.test.js

# Test human assignment flow
npm test -- human-escalation.test.js

# End-to-end with real PR
./test/e2e-review.sh --ticket HT-001 --pr 42
```

---

## Summary

The Review Agent with SENTINEL persona provides:

1. **Strict Quality Gate**: No code merges without passing review
2. **Automated Feedback Loop**: Failed reviews create revision tickets
3. **Bounded Retry**: Max 3 attempts before human assignment
4. **Human Escalation**: Tickets assigned to admin, not just notifications
5. **Full Traceability**: Every review and escalation logged
6. **Dashboard Integration**: Admin sees pending tickets requiring attention

**Critical Path**: 
```
Worker completes → Review Agent analyzes → 
  APPROVE: Merge
  FAIL (attempt < 3): Create revision ticket → Worker fixes → Re-review
  FAIL (attempt ≥ 3): Assign to admin → Human resolves
```

---

*Created: December 11, 2025*
*Refined: December 11, 2025 - Replaced Slack escalation with human assignment*
