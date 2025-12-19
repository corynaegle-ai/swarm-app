# Ticket-Level Collaboration Patterns

> Design document for flexible agent collaboration within Swarm's execution pipeline

**Status:** Draft  
**Author:** Neural (Claude)  
**Created:** 2025-12-12  
**Target:** Future Implementation (Post-MVP)

---

## Executive Summary

Swarm's current architecture implements a **project-level pipeline**: Clarifying Agent → Decomposer Agent → Orchestrator → Worker Agents → Review Agent. This design document proposes **ticket-level collaboration patterns** that operate *within* this existing flow, enabling the orchestrator to select different execution strategies based on ticket characteristics.

**Key Principle:** The project-level pipeline remains unchanged. Collaboration patterns provide flexibility for *how* individual tickets are executed.

### Proposed Patterns

| Pattern | Agents | Cost | Use Case |
|---------|--------|------|----------|
| Single (default) | 1 coder + 1 reviewer | 1x | 90% of tickets |
| Extended Pipeline | N stages (configurable) | Nx | Security-critical code |
| Ensemble | 3 workers + 1 judge + 1 reviewer | 4x | Ambiguous specifications |

---

## Current Architecture (Unchanged)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROJECT-LEVEL PIPELINE                               │
└─────────────────────────────────────────────────────────────────────────────┘

     User Request
          │
          ▼
   ┌──────────────┐
   │  Clarifying  │  Refines requirements, resolves ambiguity
   │    Agent     │  Output: Spec Card
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  Decomposer  │  Breaks spec into atomic tickets
   │    Agent     │  Output: Ticket DAG with metadata
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Orchestrator │  Manages VM pool, respects dependencies
   │              │  Assigns tickets based on collaboration_mode
   └──────┬───────┘
          │
          ├─────────────────┬─────────────────┐
          ▼                 ▼                 ▼
   ┌────────────┐    ┌────────────┐    ┌────────────┐
   │  Worker A  │    │  Worker B  │    │  Worker C  │
   └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
         │                 │                 │
         ▼                 ▼                 ▼
   ┌────────────┐    ┌────────────┐    ┌────────────┐
   │  Reviewer  │    │  Reviewer  │    │  Reviewer  │
   └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
         │                 │                 │
         ▼                 ▼                 ▼
       PR #1             PR #2             PR #3
```

This architecture is **correct and complete** for MVP. The enhancements below are additive.

---

## Proposed Enhancement: Configurable Ticket Execution


### Pattern 1: Single Agent (Default)

The current behavior. One coder, one reviewer per ticket.

```
Ticket → Coder Agent → Reviewer Agent → PR
```

**Selection Criteria:**
- Default for all tickets unless explicitly tagged otherwise
- Simple features, bug fixes, routine implementation

**Cost:** 2 API calls per ticket

---

### Pattern 2: Extended Pipeline

Configurable multi-stage pipeline with additional quality gates.

```
Ticket → Coder → [Security Audit] → [Test Gen] → Reviewer → PR
                      ▲                  ▲
                  (optional)         (optional)
```

**Selection Criteria:**
- Tickets tagged with `security-critical`
- Tickets touching auth, payments, user data
- Tickets in compliance-sensitive projects

**Stages Available:**
| Stage | Purpose | When to Include |
|-------|---------|-----------------|
| `coder` | Writes implementation | Always (required) |
| `security` | OWASP audit, secret detection | `security-critical` tag |
| `test_gen` | Generates unit/integration tests | `needs-tests` tag |
| `reviewer` | Code quality, logic errors | Always (required) |

**Cost:** N API calls where N = number of stages

---

### Pattern 3: Ensemble

Multiple agents attempt the same ticket independently; a judge selects the best solution.

```
              ┌─────────────┐
              │   Ticket    │
              └──────┬──────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌─────────┐    ┌─────────┐    ┌─────────┐
│Coder A  │    │Coder B  │    │Coder C  │
│(temp=0) │    │(temp=0.5│    │(temp=1) │
└────┬────┘    └────┬────┘    └────┬────┘
     │              │              │
     └──────────────┼──────────────┘
                    ▼
             ┌────────────┐
             │   Judge    │
             │   Agent    │
             └─────┬──────┘
                   │ (selects best)
                   ▼
             ┌────────────┐
             │  Reviewer  │
             └─────┬──────┘
                   ▼
                  PR
```

**Selection Criteria:**
- Tickets flagged `approach_uncertain` by decomposer
- Algorithm design with multiple valid approaches
- Performance-critical code where tradeoffs matter

**Judging Criteria:**
- Correctness (40%): Does it solve the problem?
- Code Quality (25%): Clean, maintainable, idiomatic?
- Efficiency (20%): Appropriate complexity?
- Edge Cases (15%): Handles errors and boundaries?

**Cost:** 5 API calls (3 coders + 1 judge + 1 reviewer)

---

## Data Model Changes

### Schema Additions

```sql
-- Extend tickets table
ALTER TABLE tickets ADD COLUMN collaboration_mode TEXT 
  DEFAULT 'single' 
  CHECK(collaboration_mode IN ('single', 'pipeline', 'ensemble'));

ALTER TABLE tickets ADD COLUMN collaboration_config JSON DEFAULT '{}';
-- Examples:
-- Pipeline: {"stages": ["coder", "security", "reviewer"]}
-- Ensemble: {"ensemble_size": 3, "temperatures": [0, 0.5, 1.0]}

-- Track collaboration sessions
CREATE TABLE collaborations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),
  ticket_id TEXT REFERENCES tickets(id),
  pattern TEXT CHECK(pattern IN ('single', 'pipeline', 'ensemble')),
  status TEXT DEFAULT 'active' 
    CHECK(status IN ('active', 'completed', 'failed', 'cancelled')),
  config JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_collaborations_ticket ON collaborations(ticket_id);
CREATE INDEX idx_collaborations_status ON collaborations(status);

-- Track participants in multi-agent collaborations
CREATE TABLE collaboration_participants (
  id TEXT PRIMARY KEY,
  collaboration_id TEXT REFERENCES collaborations(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  role TEXT NOT NULL,  -- 'coder', 'security', 'judge', 'reviewer'
  sequence_order INTEGER,  -- for pipeline ordering
  status TEXT DEFAULT 'pending' 
    CHECK(status IN ('pending', 'active', 'completed', 'failed', 'skipped')),
  input_artifact_id TEXT,
  output_artifact_id TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX idx_collab_parts_collab ON collaboration_participants(collaboration_id);

-- Store artifacts passed between agents
CREATE TABLE collaboration_artifacts (
  id TEXT PRIMARY KEY,
  collaboration_id TEXT REFERENCES collaborations(id) ON DELETE CASCADE,
  producer_participant_id TEXT REFERENCES collaboration_participants(id),
  artifact_type TEXT CHECK(artifact_type IN (
    'code', 'review', 'security_report', 'test_suite', 'decision'
  )),
  content TEXT,
  file_paths JSON DEFAULT '[]',  -- list of files produced
  metadata JSON DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_collab_artifacts_collab ON collaboration_artifacts(collaboration_id);
```


---

## Decomposer Integration

The Decomposer Agent determines collaboration mode during ticket generation.

### Enhanced Ticket Output Schema

```json
{
  "id": "ticket-47",
  "title": "Implement JWT authentication middleware",
  "description": "...",
  "type": "feature",
  "priority": "high",
  "estimated_complexity": "medium",
  "dependencies": ["ticket-45", "ticket-46"],
  
  "collaboration_metadata": {
    "mode": "pipeline",
    "reason": "Touches authentication - security review required",
    "config": {
      "stages": ["coder", "security", "reviewer"]
    }
  },
  
  "tags": ["auth", "security-critical", "middleware"]
}
```

### Decomposer Decision Rules

```javascript
// Pseudo-code for decomposer collaboration assignment

function determineCollaborationMode(ticket, projectContext) {
  
  // Rule 1: Security-critical tickets get extended pipeline
  const securityKeywords = ['auth', 'password', 'token', 'jwt', 'oauth', 
    'permission', 'role', 'encrypt', 'secret', 'credential', 'payment',
    'credit card', 'pii', 'gdpr', 'hipaa'];
  
  const isSecurityCritical = securityKeywords.some(kw => 
    ticket.title.toLowerCase().includes(kw) ||
    ticket.description.toLowerCase().includes(kw)
  );
  
  if (isSecurityCritical) {
    return {
      mode: 'pipeline',
      reason: 'Security-sensitive code requires audit',
      config: { stages: ['coder', 'security', 'reviewer'] }
    };
  }
  
  // Rule 2: Ambiguous tickets with multiple approaches get ensemble
  const hasMultipleApproaches = ticket.possible_approaches?.length > 1;
  const isAlgorithmic = ['algorithm', 'optimize', 'performance', 'cache']
    .some(kw => ticket.description.toLowerCase().includes(kw));
  
  if (hasMultipleApproaches || (isAlgorithmic && ticket.complexity === 'high')) {
    return {
      mode: 'ensemble',
      reason: 'Multiple valid approaches - ensemble for best solution',
      config: { 
        ensemble_size: 3, 
        temperatures: [0, 0.5, 1.0],
        judge_criteria: ['correctness', 'efficiency', 'maintainability']
      }
    };
  }
  
  // Rule 3: Default to single agent
  return {
    mode: 'single',
    reason: 'Standard ticket',
    config: { stages: ['coder', 'reviewer'] }
  };
}
```

---

## Orchestrator Logic

### Collaboration-Aware Assignment

```javascript
// services/orchestrator.js

class Orchestrator {
  
  async assignTicket(ticket) {
    const mode = ticket.collaboration_mode || 'single';
    
    switch (mode) {
      case 'single':
        return this.assignSingleAgent(ticket);
      
      case 'pipeline':
        return this.startPipeline(ticket);
      
      case 'ensemble':
        return this.startEnsemble(ticket);
      
      default:
        throw new Error(`Unknown collaboration mode: ${mode}`);
    }
  }
  
  async assignSingleAgent(ticket) {
    // Current behavior - unchanged
    const vm = await this.spawnVM();
    const agent = await this.createAgent(vm, 'coder', ticket);
    await this.updateTicketStatus(ticket.id, 'assigned', agent.id);
    return agent;
  }
  
  async startPipeline(ticket) {
    const config = JSON.parse(ticket.collaboration_config || '{}');
    const stages = config.stages || ['coder', 'reviewer'];
    
    // Create collaboration record
    const collaboration = await db.run(`
      INSERT INTO collaborations (id, tenant_id, ticket_id, pattern, config)
      VALUES (?, ?, ?, 'pipeline', ?)
    `, [uuid(), ticket.tenant_id, ticket.id, JSON.stringify(config)]);
    
    // Create participant slots for each stage
    for (let i = 0; i < stages.length; i++) {
      await db.run(`
        INSERT INTO collaboration_participants 
        (id, collaboration_id, role, sequence_order, status)
        VALUES (?, ?, ?, ?, ?)
      `, [uuid(), collaboration.id, stages[i], i, i === 0 ? 'pending' : 'blocked']);
    }
    
    // Start first stage
    return this.advancePipeline(collaboration.id);
  }
  
  async advancePipeline(collaborationId) {
    // Find next pending stage
    const nextStage = await db.get(`
      SELECT * FROM collaboration_participants
      WHERE collaboration_id = ? AND status = 'pending'
      ORDER BY sequence_order ASC
      LIMIT 1
    `, [collaborationId]);
    
    if (!nextStage) {
      // Pipeline complete
      return this.completePipeline(collaborationId);
    }
    
    // Get previous stage output as input
    const prevArtifact = await db.get(`
      SELECT * FROM collaboration_artifacts
      WHERE collaboration_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, [collaborationId]);
    
    // Spawn agent for this stage
    const vm = await this.spawnVM();
    const agent = await this.createAgent(vm, nextStage.role, {
      collaboration_id: collaborationId,
      participant_id: nextStage.id,
      input_artifact: prevArtifact
    });
    
    await db.run(`
      UPDATE collaboration_participants
      SET status = 'active', agent_id = ?, started_at = datetime('now')
      WHERE id = ?
    `, [agent.id, nextStage.id]);
    
    return agent;
  }
  
  async startEnsemble(ticket) {
    const config = JSON.parse(ticket.collaboration_config || '{}');
    const size = config.ensemble_size || 3;
    const temperatures = config.temperatures || [0, 0.5, 1.0];
    
    // Create collaboration record
    const collaboration = await db.run(`
      INSERT INTO collaborations (id, tenant_id, ticket_id, pattern, config)
      VALUES (?, ?, ?, 'ensemble', ?)
    `, [uuid(), ticket.tenant_id, ticket.id, JSON.stringify(config)]);
    
    // Create parallel worker slots
    const agents = [];
    for (let i = 0; i < size; i++) {
      const participantId = uuid();
      await db.run(`
        INSERT INTO collaboration_participants
        (id, collaboration_id, role, sequence_order, status)
        VALUES (?, ?, 'ensemble_worker', ?, 'pending')
      `, [participantId, collaboration.id, i]);
      
      // Spawn worker with specific temperature
      const vm = await this.spawnVM();
      const agent = await this.createAgent(vm, 'coder', {
        collaboration_id: collaboration.id,
        participant_id: participantId,
        temperature: temperatures[i] || 0.5
      });
      
      agents.push(agent);
    }
    
    // Create judge slot (activates after all workers complete)
    await db.run(`
      INSERT INTO collaboration_participants
      (id, collaboration_id, role, sequence_order, status)
      VALUES (?, ?, 'judge', ?, 'blocked')
    `, [uuid(), collaboration.id, size]);
    
    // Create reviewer slot (activates after judge)
    await db.run(`
      INSERT INTO collaboration_participants
      (id, collaboration_id, role, sequence_order, status)
      VALUES (?, ?, 'reviewer', ?, 'blocked')
    `, [uuid(), collaboration.id, size + 1]);
    
    return agents;
  }
}
```


---

## Agent Templates

### Security Auditor Agent

```javascript
// agent-templates/security-auditor.js

const SECURITY_AUDITOR_SYSTEM_PROMPT = `
You are a security auditor reviewing code produced by another agent.
Your job is to identify security vulnerabilities before code is merged.

AUDIT CHECKLIST:
1. OWASP Top 10 vulnerabilities
   - Injection (SQL, NoSQL, OS, LDAP)
   - Broken authentication
   - Sensitive data exposure
   - XML external entities (XXE)
   - Broken access control
   - Security misconfiguration
   - Cross-site scripting (XSS)
   - Insecure deserialization
   - Using components with known vulnerabilities
   - Insufficient logging & monitoring

2. Secrets and Credentials
   - Hardcoded passwords, API keys, tokens
   - Credentials in comments or logs
   - Insecure credential storage

3. Input Validation
   - Missing sanitization
   - Type coercion issues
   - Buffer overflow potential

4. Authentication & Authorization
   - Missing auth checks
   - Privilege escalation paths
   - Session management issues

5. Cryptography
   - Weak algorithms (MD5, SHA1 for security)
   - Hardcoded IVs or salts
   - Improper random number generation
`;

const SECURITY_AUDITOR_USER_PROMPT = `
TICKET SPECIFICATION:
{ticket_description}

CODE TO AUDIT:
{code_files}

Analyze this code for security vulnerabilities.

OUTPUT FORMAT (JSON):
{
  "verdict": "pass" | "fail" | "warn",
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "category": "injection" | "auth" | "secrets" | "crypto" | "access_control" | "other",
      "file": "path/to/file.js",
      "line": 42,
      "code_snippet": "the problematic code",
      "description": "What the vulnerability is",
      "exploitation": "How it could be exploited",
      "recommendation": "How to fix it"
    }
  ],
  "passed_checks": ["list of checks that passed"],
  "summary": "Overall security assessment"
}

VERDICTS:
- "fail": Any critical or high severity issue found. Pipeline halts for human review.
- "warn": Only medium/low severity issues. Pipeline continues with issues logged.
- "pass": No security issues found.
`;

async function runSecurityAudit(ticket, codeArtifact) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: SECURITY_AUDITOR_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: SECURITY_AUDITOR_USER_PROMPT
        .replace('{ticket_description}', ticket.description)
        .replace('{code_files}', formatCodeFiles(codeArtifact))
    }]
  });
  
  const result = JSON.parse(response.content[0].text);
  
  return {
    artifact_type: 'security_report',
    content: result,
    metadata: {
      verdict: result.verdict,
      issue_count: result.issues.length,
      critical_count: result.issues.filter(i => i.severity === 'critical').length,
      high_count: result.issues.filter(i => i.severity === 'high').length
    }
  };
}
```

### Ensemble Judge Agent

```javascript
// agent-templates/ensemble-judge.js

const JUDGE_SYSTEM_PROMPT = `
You are a senior engineer judging multiple solutions to the same problem.
Your job is to select the best solution based on objective criteria.

You must be fair and evaluate each solution on its merits, not on superficial
differences like variable naming (unless it affects readability significantly).

EVALUATION CRITERIA:
1. Correctness (40%): Does it fully solve the problem? Handle edge cases?
2. Code Quality (25%): Clean, readable, idiomatic, maintainable?
3. Efficiency (20%): Appropriate time/space complexity for the use case?
4. Robustness (15%): Error handling, input validation, defensive coding?
`;

const JUDGE_USER_PROMPT = `
ORIGINAL TICKET:
{ticket_description}

SOLUTION A:
{solution_a}

SOLUTION B:
{solution_b}

SOLUTION C:
{solution_c}

Evaluate each solution and select the best one.

OUTPUT FORMAT (JSON):
{
  "winner": "A" | "B" | "C",
  "scores": {
    "A": {
      "correctness": 8,
      "quality": 7,
      "efficiency": 9,
      "robustness": 6,
      "total": 7.6,
      "strengths": ["handles edge cases well", "clean API"],
      "weaknesses": ["error messages could be clearer"]
    },
    "B": { ... },
    "C": { ... }
  },
  "reasoning": "Solution A wins because...",
  "consensus_elements": "All solutions correctly implemented X...",
  "recommended_improvements": "Even the winner could improve by..."
}
`;

async function judgeEnsemble(ticket, solutions) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: JUDGE_USER_PROMPT
        .replace('{ticket_description}', ticket.description)
        .replace('{solution_a}', formatSolution(solutions[0]))
        .replace('{solution_b}', formatSolution(solutions[1]))
        .replace('{solution_c}', formatSolution(solutions[2]))
    }]
  });
  
  const result = JSON.parse(response.content[0].text);
  const winnerIndex = ['A', 'B', 'C'].indexOf(result.winner);
  
  return {
    artifact_type: 'decision',
    content: result,
    selected_solution_id: solutions[winnerIndex].id,
    metadata: {
      winner: result.winner,
      winning_score: result.scores[result.winner].total,
      score_spread: Math.max(...Object.values(result.scores).map(s => s.total)) -
                    Math.min(...Object.values(result.scores).map(s => s.total))
    }
  };
}
```


---

## API Extensions

### New Endpoints

```
POST   /api/tickets/:id/collaborate     Start collaboration for existing ticket
GET    /api/collaborations/:id          Get collaboration details
GET    /api/collaborations/:id/stream   WebSocket for live updates
POST   /api/collaborations/:id/abort    Cancel active collaboration
GET    /api/tickets/:id/collaboration   Get collaboration for ticket (if exists)
```

### Endpoint Specifications

```javascript
// routes/collaborations.js

const router = express.Router();

// Start a collaboration (override default mode)
router.post('/api/tickets/:id/collaborate', requireAuth, async (req, res) => {
  const { pattern, config } = req.body;
  const ticket = await getTicketWithOwnershipCheck(req.params.id, req.tenantId);
  
  if (ticket.status !== 'ready') {
    return res.status(400).json({ 
      error: 'Ticket must be in ready state to start collaboration' 
    });
  }
  
  if (!['pipeline', 'ensemble'].includes(pattern)) {
    return res.status(400).json({ error: 'Invalid pattern. Use: pipeline, ensemble' });
  }
  
  const collaboration = await orchestrator.startCollaboration(ticket, pattern, config);
  
  res.json({
    collaboration_id: collaboration.id,
    pattern,
    status: 'active',
    participants: await getParticipants(collaboration.id)
  });
});

// Get collaboration status and details
router.get('/api/collaborations/:id', requireAuth, async (req, res) => {
  const collab = await db.get(`
    SELECT c.*, t.name as ticket_name, t.id as ticket_id
    FROM collaborations c
    JOIN tickets t ON c.ticket_id = t.id
    JOIN projects p ON t.project_id = p.id
    WHERE c.id = ? AND p.tenant_id = ?
  `, [req.params.id, req.tenantId]);
  
  if (!collab) return res.status(404).json({ error: 'Collaboration not found' });
  
  const participants = await db.all(`
    SELECT cp.*, a.status as agent_status, a.ip_address
    FROM collaboration_participants cp
    LEFT JOIN agents a ON cp.agent_id = a.id
    WHERE cp.collaboration_id = ?
    ORDER BY cp.sequence_order
  `, [collab.id]);
  
  const artifacts = await db.all(`
    SELECT ca.*, cp.role as producer_role
    FROM collaboration_artifacts ca
    LEFT JOIN collaboration_participants cp ON ca.producer_participant_id = cp.id
    WHERE ca.collaboration_id = ?
    ORDER BY ca.created_at
  `, [collab.id]);
  
  res.json({
    ...collab,
    participants,
    artifacts,
    progress: calculateProgress(participants)
  });
});

function calculateProgress(participants) {
  const completed = participants.filter(p => p.status === 'completed').length;
  const total = participants.length;
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    current_stage: participants.find(p => p.status === 'active')?.role || null
  };
}
```

---

## Dashboard UI Components

### Collaboration Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│  Ticket #47: Implement JWT Authentication                       │
│  Pattern: PIPELINE    Status: IN PROGRESS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐                │
│   │  CODER  │─────▶│SECURITY │─────▶│REVIEWER │                │
│   │    ✓    │      │   ●     │      │   ○     │                │
│   │ 2m 34s  │      │ running │      │ pending │                │
│   └─────────┘      └─────────┘      └─────────┘                │
│                                                                 │
│   Artifacts:                                                    │
│   • code_output.json (from: coder, 2:34 ago)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Ensemble View

```
┌─────────────────────────────────────────────────────────────────┐
│  Ticket #52: Implement Caching Strategy                         │
│  Pattern: ENSEMBLE    Status: JUDGING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐                  │
│   │Solution A │  │Solution B │  │Solution C │                  │
│   │  temp=0   │  │ temp=0.5  │  │  temp=1   │                  │
│   │    ✓      │  │     ✓     │  │     ✓     │                  │
│   │  Redis    │  │  LRU Mem  │  │  Hybrid   │                  │
│   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                  │
│         │              │              │                         │
│         └──────────────┼──────────────┘                         │
│                        ▼                                        │
│                 ┌────────────┐                                  │
│                 │   JUDGE    │                                  │
│                 │     ●      │                                  │
│                 │ evaluating │                                  │
│                 └────────────┘                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Required UI Components

| Component | Purpose | Priority |
|-----------|---------|----------|
| `CollaborationBadge` | Shows pattern type on ticket cards | P1 |
| `PipelineProgress` | Horizontal stage visualization | P1 |
| `EnsembleSolutions` | Side-by-side solution comparison | P2 |
| `ArtifactViewer` | Display security reports, decisions | P1 |
| `JudgeDecisionCard` | Shows winner with reasoning | P2 |
| `CollaborationTimeline` | Event history for debugging | P2 |


---

## Decision Matrix: When to Use Each Pattern

### Automatic Selection (Decomposer Rules)

| Ticket Characteristic | Pattern | Rationale |
|----------------------|---------|-----------|
| Default (no special flags) | Single | Cost-effective for routine work |
| Tags: `security-critical`, `auth`, `payment` | Pipeline (+ security stage) | Compliance requirement |
| Tags: `needs-tests`, `test-coverage` | Pipeline (+ test_gen stage) | Quality requirement |
| Flag: `approach_uncertain: true` | Ensemble | Multiple valid solutions |
| Complexity: high + algorithmic | Ensemble | Benefit from diverse approaches |
| Project setting: `security_level: high` | Pipeline (all tickets) | Project-wide policy |

### Manual Override (Human Decision)

Users can override the automatic selection via dashboard:

```
[ ] Use default collaboration (Single Agent)
[●] Override collaboration mode:
    ( ) Extended Pipeline
        Stages: [x] Coder [x] Security [ ] Test Gen [x] Reviewer
    ( ) Ensemble
        Workers: [3] Temperature spread: [0, 0.5, 1.0]
```

---

## Cost Analysis

### API Call Estimates

| Pattern | Stages | API Calls | Est. Cost (per ticket)* |
|---------|--------|-----------|------------------------|
| Single | coder → reviewer | 2 | $0.04 - $0.12 |
| Pipeline (3-stage) | coder → security → reviewer | 3 | $0.06 - $0.18 |
| Pipeline (4-stage) | coder → security → test → reviewer | 4 | $0.08 - $0.24 |
| Ensemble (3+1+1) | 3 coders → judge → reviewer | 5 | $0.10 - $0.30 |

*Assumes Claude Sonnet at ~$0.02-$0.06 per call depending on context size

### Cost Control Mechanisms

```javascript
// Tenant plan limits
const PLAN_LIMITS = {
  free: {
    collaboration_modes: ['single'],  // No advanced patterns
    max_pipeline_stages: 2,
    ensemble_enabled: false
  },
  pro: {
    collaboration_modes: ['single', 'pipeline'],
    max_pipeline_stages: 4,
    ensemble_enabled: false
  },
  enterprise: {
    collaboration_modes: ['single', 'pipeline', 'ensemble'],
    max_pipeline_stages: 6,
    ensemble_enabled: true,
    max_ensemble_size: 5
  }
};

// Enforce in orchestrator
async function validateCollaborationRequest(tenant, mode, config) {
  const limits = PLAN_LIMITS[tenant.plan];
  
  if (!limits.collaboration_modes.includes(mode)) {
    throw new PlanLimitError(`${mode} not available on ${tenant.plan} plan`);
  }
  
  if (mode === 'pipeline' && config.stages.length > limits.max_pipeline_stages) {
    throw new PlanLimitError(`Max ${limits.max_pipeline_stages} pipeline stages on ${tenant.plan}`);
  }
  
  if (mode === 'ensemble' && !limits.ensemble_enabled) {
    throw new PlanLimitError('Ensemble mode requires Enterprise plan');
  }
}
```

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pipeline stage fails | Ticket stuck | Auto-retry with backoff; escalate to human after 3 failures |
| Ensemble produces identical solutions | Wasted compute | Detect similarity before judging; abort if >90% similar |
| Judge picks objectively worse solution | Bad code merged | Human can override judge decision via dashboard |
| Security audit false positives | Pipeline blocked unnecessarily | Tunable sensitivity; human override for "warn" verdicts |
| Cost explosion on ensemble | Unexpected bills | Hard caps per tenant; require confirmation for ensemble |
| Collaboration state corruption | Orphaned agents/VMs | Cleanup job; collaboration timeout (30 min default) |

---

## Implementation Roadmap

### Phase 0: Prerequisites (Before Collaboration)
**Target:** Before starting collaboration work

- [ ] Complete Agent Execution Engine (Track 4 in REMAINING-WORK.md)
- [ ] Verify single-agent coder → reviewer flow works end-to-end
- [ ] Implement basic VM health monitoring
- [ ] Add agent failure recovery

---

### Phase 1: Database Schema
**Effort:** 0.5 day

- [ ] Create migration for `collaborations` table
- [ ] Create migration for `collaboration_participants` table
- [ ] Create migration for `collaboration_artifacts` table
- [ ] Add `collaboration_mode` and `collaboration_config` to tickets
- [ ] Test migrations on dev database

---

### Phase 2: Extended Pipeline
**Effort:** 3-4 days

**2.1 Orchestrator Updates**
- [ ] Add pipeline initialization logic
- [ ] Implement stage advancement after completion
- [ ] Add artifact passing between stages
- [ ] Handle stage failures and retries

**2.2 Security Auditor Agent**
- [ ] Create security auditor prompt template
- [ ] Implement verdict parsing (pass/warn/fail)
- [ ] Add security report artifact storage
- [ ] Test with known-vulnerable code samples

**2.3 Pipeline API**
- [ ] Add `POST /api/tickets/:id/collaborate` endpoint
- [ ] Add `GET /api/collaborations/:id` endpoint
- [ ] Add collaboration status to ticket responses

**2.4 Decomposer Integration**
- [ ] Update decomposer to emit `collaboration_metadata`
- [ ] Implement security-critical detection rules
- [ ] Test automatic pipeline assignment

---

### Phase 3: Dashboard Integration
**Effort:** 2-3 days

- [ ] Add `CollaborationBadge` component
- [ ] Build `PipelineProgress` visualization
- [ ] Create `ArtifactViewer` for security reports
- [ ] Add collaboration details to ticket detail page
- [ ] Implement manual mode override UI

---

### Phase 4: Ensemble Pattern (Future)
**Effort:** 4-5 days

- [ ] Implement parallel VM spawning for ensemble
- [ ] Create judge agent template
- [ ] Build solution comparison logic
- [ ] Add judge decision artifact
- [ ] UI for side-by-side solution view
- [ ] Implement judge override mechanism

---

## Appendix: State Machine

### Collaboration States

```
                    ┌──────────┐
                    │  ACTIVE  │
                    └────┬─────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌───────────┐  ┌───────────┐  ┌───────────┐
   │ COMPLETED │  │  FAILED   │  │ CANCELLED │
   └───────────┘  └───────────┘  └───────────┘
```

### Participant States

```
   PENDING ──▶ ACTIVE ──▶ COMPLETED
      │           │
      │           ▼
      │        FAILED
      │
      ▼
   SKIPPED (if pipeline aborts)
```

---

## References

- REMAINING-WORK.md - Track 4 (Agent Execution Engine)
- architecture/ticketing-system.md - Ticket state machine
- architecture/agent-pull.md - Agent claim mechanism
- prompts/ui-hitl-implementation.md - HITL patterns (related)

---

*Document version: 1.0*  
*Last updated: 2025-12-12*
