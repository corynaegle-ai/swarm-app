# Ticket Workflow Lifecycle Test - Continuation Prompt

## Purpose
Complete end-to-end testing of the Swarm ticket workflow from creation through code generation, review, and deployment.

## Environment
- **Dev Droplet**: 134.199.235.140
- **SSH**: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
- **Node Path**: `/root/.nvm/versions/node/v22.21.1/bin`
- **Database**: PostgreSQL 16.11, database `swarmdb`, user `swarm`, password `swarm_dev_2024`

## Test Artifacts (Already Created)

### Project
```
ID: proj-e2e-test-001
Name: Phase2-E2E-Test
Repo: https://github.com/corynaegle-ai/swarm-test-repo
Tenant: tenant-swarm
Settings: {
  "worker_model": "claude-sonnet-4-20250514",
  "review_strictness": "medium",
  "max_review_attempts": 3,
  "auto_merge_on_approve": false
}
```

### Tickets
```
TKT-E2E-EPIC-001 [draft] - "E2E Test Epic: User Authentication Feature"
├── TKT-E2E-IMPL-001 [ready] - "Implement login endpoint" ← PRIMARY TEST TICKET
└── TKT-E2E-IMPL-002 [blocked] - "Add password hashing" (depends_on: IMPL-001)
```

### Primary Test Ticket Details
```
ID: TKT-E2E-IMPL-001
State: ready
Scope: small
Priority: 2
Files Hint: src/routes/auth.js, src/middleware/jwt.js
Acceptance Criteria:
  1. POST /api/auth/login accepts email and password
  2. Returns JWT token on successful authentication
  3. Returns 401 on invalid credentials
  4. Token expires after 24 hours
  5. Includes user role in token payload
```

### Authentication
```bash
# Get fresh JWT token
curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r '.token'
```

---

## Completed Phases

### ✅ Phase 1: Prerequisites & Environment Validation
- PostgreSQL running
- Platform API on port 8080
- Firecracker VMM installed
- VM snapshots available at `/opt/swarm/snapshots/`
- GitHub SSH authenticated
- Anthropic API key present

### ✅ Phase 2: Ticket Creation & State Transitions
- Project created with settings
- Epic and implementation tickets created
- State transitions tested (pending → ready)
- Event sourcing verified
- Dependency tracking confirmed (IMPL-002 blocked by IMPL-001)

---

## Remaining Phases

### Phase 3: Forge Agent Execution (Code Generation)

**Objective**: Test Forge agent claiming ticket, generating code, and pushing to branch.

**Prerequisites Check**:
```bash
# Verify Forge agent definition exists
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, name, type FROM agent_definitions WHERE type = 'forge' OR name LIKE '%forge%'"

# Check VM snapshot exists
ls -la /opt/swarm/snapshots/ubuntu2204-production/

# Verify test repo is accessible
ssh -T git@github.com 2>&1 | head -1
```

**Test Steps**:

1. **Spawn Firecracker VM for Forge**
```bash
# Check existing VMs
/opt/swarm/scripts/swarm-status 2>/dev/null || echo "No VMs running"

# Spawn VM (if orchestrator supports it)
# OR manually test via direct VM restoration
cd /opt/swarm && ./restore-vm.sh 0
```

2. **Agent Claims Ticket**
```bash
# Simulate agent claiming ticket via API
TOKEN="<jwt_token>"
curl -X POST http://localhost:8080/api/tickets/TKT-E2E-IMPL-001/claim \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "forge-agent-001", "vm_id": "vm-test-001"}'
```

3. **Verify State Transition**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, assignee_id, vm_id, branch_name FROM tickets WHERE id = 'TKT-E2E-IMPL-001'"
```

4. **Monitor Code Generation** (if running real agent)
```bash
# Check agent logs
pm2 logs swarm-engine --lines 50

# Or check VM agent output
ssh root@10.0.0.2 "tail -50 /var/log/swarm-agent.log" 2>/dev/null
```

5. **Verify Branch Creation**
```bash
cd /tmp && rm -rf swarm-test-repo
git clone git@github.com:corynaegle-ai/swarm-test-repo.git
cd swarm-test-repo
git branch -r | grep -i "TKT-E2E-IMPL-001\|auth\|login"
```

**Expected Outcomes**:
- Ticket state: `ready` → `assigned` → `in_progress`
- `branch_name` populated (e.g., `feature/TKT-E2E-IMPL-001-login-endpoint`)
- `assignee_id` set to forge agent ID
- `vm_id` set to spawned VM ID
- Code committed and pushed to feature branch

---

### Phase 4: Sentinel Agent Review

**Objective**: Test Sentinel detecting needs_review ticket and performing code review.

**Prerequisites**:
```bash
# Verify Sentinel is running
pm2 status swarm-verifier
curl -s http://localhost:8090/health | jq

# Check Sentinel can access GitHub
curl -s http://localhost:8090/api/test-github 2>/dev/null || echo "No test endpoint"
```

**Test Steps**:

1. **Transition Ticket to needs_review** (simulate Forge completion)
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "UPDATE tickets SET state = 'needs_review', branch_name = 'feature/TKT-E2E-IMPL-001-login' WHERE id = 'TKT-E2E-IMPL-001' RETURNING id, state, branch_name"
```

2. **Trigger Sentinel Review** (or wait for poll)
```bash
# Check if Sentinel has webhook/poll endpoint
curl -X POST http://localhost:8090/api/review \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": "TKT-E2E-IMPL-001"}'
```

3. **Monitor Review Process**
```bash
pm2 logs swarm-verifier --lines 100
```

4. **Check Review Results**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, verification_status, sentinel_feedback FROM tickets WHERE id = 'TKT-E2E-IMPL-001'"

# Check reviews table
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT * FROM reviews WHERE ticket_id = 'TKT-E2E-IMPL-001' ORDER BY created_at DESC LIMIT 1"
```

**Expected Outcomes**:
- Sentinel detects `needs_review` ticket
- Fetches branch diff from GitHub
- Analyzes code against acceptance criteria
- Creates review record in `reviews` table
- Updates ticket:
  - `verification_status`: passed/failed
  - `sentinel_feedback`: JSON with issues/score
  - `state`: `completed` (if passed) or `sentinel_failed` (if failed)

---

### Phase 5: Git Integration & PR Creation

**Objective**: Test PR creation and GitHub integration.

**Test Steps**:

1. **Check if PR was created**
```bash
# Via GitHub API
curl -s -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/repos/corynaegle-ai/swarm-test-repo/pulls?state=open" | jq '.[].title'

# Check ticket for PR URL
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, pr_url, pr_number FROM tickets WHERE id = 'TKT-E2E-IMPL-001'"
```

2. **Test PR Merge Flow** (if auto_merge_on_approve = true)
```bash
# Check merge status
curl -s -H "Authorization: token $GITHUB_PAT" \
  "https://api.github.com/repos/corynaegle-ai/swarm-test-repo/pulls/1" | jq '{merged: .merged, mergeable: .mergeable}'
```

**Expected Outcomes**:
- PR created with descriptive title
- PR body includes acceptance criteria checklist
- `pr_url` and `pr_number` populated in ticket
- If `auto_merge_on_approve`: PR merged after Sentinel approval

---

### Phase 6: Deployment Agent Execution

**Objective**: Test deployment agent handling completed tickets.

**Prerequisites**:
```bash
pm2 status deploy-agent
curl -s http://localhost:3457/health 2>/dev/null | jq
```

**Test Steps**:

1. **Trigger Deployment** (or wait for agent poll)
```bash
# Check deploy agent API
curl -X POST http://localhost:3457/api/deploy \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": "TKT-E2E-IMPL-001", "environment": "staging"}'
```

2. **Monitor Deployment**
```bash
pm2 logs deploy-agent --lines 50
```

3. **Verify Deployment Status**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, deployment_status FROM tickets WHERE id = 'TKT-E2E-IMPL-001'"
```

**Expected Outcomes**:
- Deploy agent detects completed ticket
- Executes deployment script/workflow
- Updates ticket with deployment status
- Ticket state: `completed` → `done`

---

### Phase 7: Dependency Unblocking

**Objective**: Test DAG dependency resolution when parent ticket completes.

**Test Steps**:

1. **Complete Parent Ticket**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "UPDATE tickets SET state = 'done' WHERE id = 'TKT-E2E-IMPL-001' RETURNING id, state"
```

2. **Check Dependent Ticket Unblocked**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, depends_on, unblocked_at FROM tickets WHERE id = 'TKT-E2E-IMPL-002'"
```

3. **Verify Event Logged**
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT * FROM ticket_events WHERE ticket_id = 'TKT-E2E-IMPL-002' ORDER BY created_at DESC LIMIT 5"
```

**Expected Outcomes**:
- TKT-E2E-IMPL-002 state: `blocked` → `ready`
- `unblocked_at` timestamp populated
- Event logged with `event_type = 'dependency_resolved'`

---

### Phase 8: Edge Cases & Failure Scenarios

**Objective**: Test error handling and recovery.

**Test Cases**:

1. **Sentinel Rejection (max retries)**
```bash
# Simulate failed review
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "UPDATE tickets SET 
    state = 'sentinel_failed', 
    rejection_count = 3,
    sentinel_feedback = '{\"score\": 45, \"issues\": [\"Missing error handling\", \"No tests\"]}'
   WHERE id = 'TKT-E2E-IMPL-001' RETURNING id, state, rejection_count"
```
Expected: Ticket escalated to `human_review` after max_review_attempts

2. **VM Crash During Execution**
```bash
# Kill VM mid-execution (if VM running)
/opt/swarm/scripts/kill-vm.sh 0

# Check ticket state recovery
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, retry_count FROM tickets WHERE id = 'TKT-E2E-IMPL-001'"
```
Expected: Ticket returned to `ready` for reassignment

3. **GitHub API Failure**
```bash
# Temporarily break GitHub auth and trigger agent
# Check graceful degradation and retry logic
```

4. **Concurrent Ticket Claims**
```bash
# Attempt to claim already-assigned ticket
curl -X POST http://localhost:8080/api/tickets/TKT-E2E-IMPL-001/claim \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "forge-agent-002"}'
```
Expected: 409 Conflict or appropriate error

---

## Cleanup

```bash
# Reset test tickets
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "
  UPDATE tickets SET 
    state = 'ready',
    assignee_id = NULL,
    vm_id = NULL,
    branch_name = NULL,
    pr_url = NULL,
    verification_status = NULL,
    sentinel_feedback = NULL,
    rejection_count = 0,
    retry_count = 0
  WHERE id LIKE 'TKT-E2E-%';
"

# Delete test branches
cd /tmp/swarm-test-repo && git push origin --delete feature/TKT-E2E-IMPL-001-login 2>/dev/null

# Kill test VMs
/opt/swarm/scripts/swarm-cleanup 2>/dev/null
```

---

## Key Services Reference

| Service | Port | Health Check |
|---------|------|--------------|
| Platform API | 8080 | `curl http://localhost:8080/health` |
| Sentinel (Verifier) | 8090 | `curl http://localhost:8090/health` |
| Deploy Agent | 3457 | `curl http://localhost:3457/health` |
| RAG Service | 8082 | `curl http://localhost:8082/health` |

## RAG Query Before Each Phase
```bash
curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "<relevant search terms>", "limit": 5}'
```

---

## Success Criteria

| Phase | Key Metric |
|-------|------------|
| Phase 3 | Ticket claimed, code generated, branch pushed |
| Phase 4 | Review completed, feedback recorded |
| Phase 5 | PR created with proper metadata |
| Phase 6 | Deployment executed successfully |
| Phase 7 | Blocked ticket auto-unblocked |
| Phase 8 | Errors handled gracefully, no data corruption |
