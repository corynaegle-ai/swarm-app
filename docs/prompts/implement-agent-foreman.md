# Implementation Prompt: Agent-Foreman Pattern Adoption

**Spec Reference**: `/opt/swarm-specs/analysis/agent-foreman-adoption.md`  
**Target**: Swarm Worker Agent Pipeline  
**Priority**: Phase 1 (Schema) → Phase 2 (Verifier) → Phase 3 (Agent Integration)

---

## Context

You are implementing the Agent-Foreman pattern adoption for Swarm. This adds structured acceptance criteria and automated verification to the worker agent pipeline.

**Current State**:
- Tickets are stored in SQLite at `/opt/swarm-tickets/tickets.db`
- Worker agents claim tickets via HTTP API at `api.swarmstack.net`
- Agents generate code and create PRs without structured validation
- No automated verification before PR creation

**Target State**:
- Tickets include machine-parseable acceptance criteria (JSON)
- New `swarm-verifier` service validates code against criteria
- Worker agents run verify loop (max 3 attempts) before PR creation
- Failed verifications escalate to human review

---

## Implementation Tasks

### Phase 1: Schema Enhancement

**Location**: `/opt/swarm-tickets/`

1. **Migrate tickets table**:
```sql
ALTER TABLE tickets ADD COLUMN acceptance_criteria JSON;
ALTER TABLE tickets ADD COLUMN verification_status TEXT DEFAULT 'pending';
ALTER TABLE tickets ADD COLUMN verification_log JSON DEFAULT '[]';
ALTER TABLE tickets ADD COLUMN impact_flags JSON DEFAULT '[]';
```

2. **Create file tracking table**:
```sql
CREATE TABLE IF NOT EXISTS ticket_file_map (
  ticket_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,  -- 'created', 'modified', 'deleted'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, file_path)
);
```

3. **Update ticket API** (`/opt/swarm-tickets/server.js`):
- Accept `acceptance_criteria` in POST/PUT /tickets
- Return `verification_status` in GET responses
- Add GET /tickets/:id/verification endpoint


### Phase 2: Verifier Service

**Location**: Create `/opt/swarm-verifier/`

1. **Project structure**:
```
/opt/swarm-verifier/
├── package.json
├── server.js           # Express server on port 8090
├── lib/
│   ├── executor.js     # Check execution dispatcher
│   ├── checks/
│   │   ├── http.js     # HTTP request checks
│   │   ├── file.js     # File existence checks
│   │   ├── pattern.js  # Code pattern (regex) checks
│   │   └── test.js     # Test command checks
│   └── reporter.js     # Results aggregation
└── pm2.config.js
```

2. **API Endpoints**:

```javascript
// POST /verify
// Request:
{
  "ticket_id": "SWARM-042",
  "branch_name": "feature/SWARM-042-auth",
  "repo_url": "git@github.com:corynaegle-ai/target-repo.git"
}

// Response:
{
  "ticket_id": "SWARM-042",
  "verification_status": "passing" | "failing" | "blocked",
  "checks": [
    {
      "check_id": "ac-1",
      "status": "passed" | "failed" | "skipped",
      "message": "File exists: src/middleware/auth.js",
      "duration_ms": 45,
      "output": null
    }
  ],
  "summary": {
    "total": 4,
    "passed": 4,
    "failed": 0,
    "skipped": 0
  }
}
```

3. **Check Executors**:

```javascript
// lib/checks/http.js
async function executeHttpCheck(check, context) {
  const { method, path, body, headers, expect_status, expect_body } = check.verify;
  const baseUrl = context.service_url || 'http://localhost:3000';
  
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (response.status !== expect_status) {
    return { status: 'failed', message: `Expected ${expect_status}, got ${response.status}` };
  }
  
  return { status: 'passed', message: `${method} ${path} returned ${expect_status}` };
}

// lib/checks/file.js
async function executeFileCheck(check, context) {
  const { path: filePath, contains } = check.verify;
  const fullPath = `${context.repo_path}/${filePath}`;
  
  if (!fs.existsSync(fullPath)) {
    return { status: 'failed', message: `File not found: ${filePath}` };
  }
  
  if (contains) {
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of contains) {
      if (!content.includes(pattern)) {
        return { status: 'failed', message: `Missing pattern: ${pattern}` };
      }
    }
  }
  
  return { status: 'passed', message: `File exists: ${filePath}` };
}

// lib/checks/test.js
async function executeTestCheck(check, context) {
  const { command, expect_exit_code } = check.verify;
  
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: context.repo_path });
    return { status: 'passed', message: `Test passed`, output: stdout };
  } catch (error) {
    if (error.code === expect_exit_code) {
      return { status: 'passed', message: `Exited with expected code ${expect_exit_code}` };
    }
    return { status: 'failed', message: `Test failed: ${error.message}`, output: error.stderr };
  }
}
```


### Phase 3: Agent Integration

**Location**: Update `/opt/swarm/` agent components

1. **Add to agent system prompt** (`prompts/worker-agent.md`):

```markdown
## Acceptance Criteria Verification Protocol

Before creating a PR, you MUST verify your implementation:

### Step 1: Read Criteria
Parse the `acceptance_criteria` JSON from your ticket. Each check has:
- `id`: Unique identifier
- `type`: http_request | file_exists | code_pattern | test_pass | manual
- `description`: Human-readable description
- `verify`: Type-specific verification parameters

### Step 2: Implement
Write code that satisfies ALL criteria. Focus on one criterion at a time.

### Step 3: Self-Check
Before calling the verifier, manually confirm:
- [ ] All required files exist
- [ ] Code compiles/runs without errors
- [ ] Basic functionality works

### Step 4: Request Verification
Call: POST http://localhost:8090/verify
```json
{
  "ticket_id": "{{TICKET_ID}}",
  "branch_name": "{{BRANCH_NAME}}",
  "repo_url": "{{REPO_URL}}"
}
```

### Step 5: Handle Results
- **All checks pass**: Create PR immediately
- **Any check fails**: Read failure messages, fix code, re-verify (max 3 attempts)
- **After 3 failures**: Stop and report blockers. Do NOT create PR.

### Verification Commands
- `curl -X POST http://localhost:8090/verify -d '{"ticket_id":"X"}'` - Run checks
- `curl http://localhost:8090/status/TICKET_ID` - View last verification result
```

2. **Update agent execution loop** (`lib/agent-runner.js`):

```javascript
const MAX_VERIFY_ATTEMPTS = 3;
const VERIFIER_URL = 'http://localhost:8090';

async function executeTicket(ticket, vm) {
  let attempts = 0;
  let lastResult = null;
  
  while (attempts < MAX_VERIFY_ATTEMPTS) {
    attempts++;
    console.log(`[${ticket.id}] Attempt ${attempts}/${MAX_VERIFY_ATTEMPTS}`);
    
    // Agent generates/fixes code
    await runAgentCodeGeneration(ticket, vm, lastResult?.failedChecks);
    
    // Run verification
    lastResult = await verifyImplementation(ticket);
    
    // Log attempt
    await logVerificationAttempt(ticket.id, attempts, lastResult);
    
    if (lastResult.verification_status === 'passing') {
      console.log(`[${ticket.id}] ✅ All checks passed`);
      await createPullRequest(ticket, vm);
      await updateTicketStatus(ticket.id, 'complete', 'passing');
      return { success: true, attempts };
    }
    
    console.log(`[${ticket.id}] ❌ ${lastResult.summary.failed} checks failed`);
  }
  
  // Escalate after max attempts
  console.log(`[${ticket.id}] 🚨 Max attempts exceeded, escalating`);
  await escalateToHuman(ticket, lastResult);
  await updateTicketStatus(ticket.id, 'blocked', 'failing');
  return { success: false, attempts, reason: 'max_attempts_exceeded' };
}

async function verifyImplementation(ticket) {
  const response = await fetch(`${VERIFIER_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticket_id: ticket.id,
      branch_name: ticket.branch_name,
      repo_url: ticket.repo_url
    })
  });
  return response.json();
}

async function escalateToHuman(ticket, lastResult) {
  // Update ticket with failure details
  await db.run(`
    UPDATE tickets 
    SET status = 'blocked',
        verification_status = 'failing',
        verification_log = json_insert(verification_log, '$[#]', ?)
    WHERE id = ?
  `, [JSON.stringify({
    timestamp: new Date().toISOString(),
    action: 'escalated',
    reason: 'max_verification_attempts',
    last_result: lastResult
  }), ticket.id]);
  
  // TODO: Send notification (Slack, email, dashboard alert)
}
```


---

## Testing Instructions

### Test Phase 1 (Schema)
```bash
# On droplet
cd /opt/swarm-tickets
sqlite3 tickets.db ".schema tickets"  # Verify new columns exist

# Test API
curl -X POST http://localhost:8080/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test with criteria",
    "acceptance_criteria": {
      "checks": [
        {"id": "ac-1", "type": "file_exists", "description": "Test", "verify": {"path": "test.txt"}}
      ]
    }
  }'
```

### Test Phase 2 (Verifier)
```bash
# Start verifier service
cd /opt/swarm-verifier
npm install
pm2 start pm2.config.js

# Test verification endpoint
curl -X POST http://localhost:8090/verify \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "TEST-001",
    "branch_name": "test-branch",
    "repo_url": "git@github.com:corynaegle-ai/swarm-test.git"
  }'
```

### Test Phase 3 (Integration)
```bash
# Create test ticket with criteria
# Spawn VM and let agent claim it
# Observe verification loop in logs
# Confirm PR only created on passing verification
```

---

## Success Criteria

| Criterion | Validation |
|-----------|------------|
| Schema migration runs without error | `sqlite3 tickets.db ".schema"` shows new columns |
| API accepts acceptance_criteria | POST /tickets with JSON criteria returns 201 |
| Verifier service starts | `curl http://localhost:8090/health` returns 200 |
| HTTP checks execute | Verifier correctly validates endpoint responses |
| File checks execute | Verifier detects file existence and content |
| Agent runs verify loop | Logs show "Attempt 1/3", "Attempt 2/3", etc. |
| Passing verification creates PR | PR created only when all checks pass |
| Failing verification escalates | Ticket marked blocked after 3 failures |

---

## File Checklist

### Create New
- [ ] `/opt/swarm-verifier/package.json`
- [ ] `/opt/swarm-verifier/server.js`
- [ ] `/opt/swarm-verifier/lib/executor.js`
- [ ] `/opt/swarm-verifier/lib/checks/http.js`
- [ ] `/opt/swarm-verifier/lib/checks/file.js`
- [ ] `/opt/swarm-verifier/lib/checks/pattern.js`
- [ ] `/opt/swarm-verifier/lib/checks/test.js`
- [ ] `/opt/swarm-verifier/lib/reporter.js`
- [ ] `/opt/swarm-verifier/pm2.config.js`

### Modify Existing
- [ ] `/opt/swarm-tickets/migrations/003_acceptance_criteria.sql`
- [ ] `/opt/swarm-tickets/server.js` - Add criteria to ticket endpoints
- [ ] `/opt/swarm/lib/agent-runner.js` - Add verification loop
- [ ] `/opt/swarm-specs/prompts/worker-agent.md` - Add verification protocol

---

## Environment Variables

```bash
# Add to /opt/swarm-verifier/.env
PORT=8090
TICKETS_API_URL=http://localhost:8080
REPOS_BASE_PATH=/tmp/swarm-repos
GIT_SSH_KEY_PATH=/root/.ssh/swarm_github

# Add to agent environment
VERIFIER_URL=http://localhost:8090
MAX_VERIFY_ATTEMPTS=3
```

---

## Rollback Plan

If issues arise:
1. Stop verifier: `pm2 stop swarm-verifier`
2. Revert agent runner: `git checkout HEAD~1 -- lib/agent-runner.js`
3. Schema columns are additive (no data loss) - can ignore until fixed

---

## References

- Spec: `/opt/swarm-specs/analysis/agent-foreman-adoption.md`
- Agent-Foreman source: https://github.com/mylukin/agent-foreman
- Anthropic blog: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
