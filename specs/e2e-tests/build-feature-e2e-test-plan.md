# End-to-End Test Plan: Build Feature Workflow

## Document Info
- **Created:** 2025-12-17
- **Author:** Neural (Master Systems Architect)
- **Status:** Ready for Execution
- **Priority:** High

## Quick Context for New Sessions

This document provides everything needed to execute E2E testing of the "Build Feature" workflow. The workflow allows users to add features to existing repositories through an AI-assisted design process.

### Key System Locations

| Component | Location | Purpose |
|-----------|----------|---------|
| Dashboard UI | `/opt/swarm-dashboard/` | React SPA frontend |
| Platform API | `/opt/swarm-platform/` | Express.js backend |
| Database | PostgreSQL on localhost | `swarm` database |
| Session Notes | `/opt/swarm-specs/session-notes/current.md` | Current progress |

### SSH Access

```bash
# DEV Droplet (use for testing)
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# PROD Droplet (never test here)
ssh -i ~/.ssh/swarm_key root@146.190.35.235
```

### Key Files in the Workflow

```
Frontend (CreateProject.jsx):
/opt/swarm-dashboard/src/pages/CreateProject.jsx  - Project type selection & feature input
/opt/swarm-dashboard/src/pages/DesignSession.jsx  - AI clarification chat UI
/opt/swarm-dashboard/src/pages/BuildProgress.jsx  - Ticket generation progress

Backend Routes:
/opt/swarm-platform/routes/hitl.js      - HITL session state machine
/opt/swarm-platform/routes/repo.js      - GitHub repo fetching
/opt/swarm-platform/routes/tickets.js   - Ticket CRUD operations

Services:
/opt/swarm-platform/services/repoAnalysis.js      - Clone & analyze repos
/opt/swarm-platform/services/ticket-generator.js  - Spec → ticket breakdown
/opt/swarm-platform/services/ai-dispatcher.js     - Claude API integration
```

---

## Workflow Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    BUILD FEATURE WORKFLOW                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  User Flow:                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │
│  │ /new-project│──▶│ Select Repo │──▶│ Describe    │──▶│ /design/:id │  │
│  │ Select Type │   │ (GitHub)    │   │ Feature     │   │ AI Chat     │  │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │
│                                                               │           │
│                                                               ▼           │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │
│  │ /kanban     │◀──│ Tickets     │◀──│ Approve     │◀──│ Review Spec │  │
│  │ View Tasks  │   │ Generated   │   │ Spec        │   │ (spec_card) │  │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │
│                                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  State Machine (hitl_sessions.state):                                     │
│  ┌────────┐   ┌───────────┐   ┌───────────┐   ┌────────────┐   ┌───────┐│
│  │ input  │──▶│ clarifying│──▶│ reviewing │──▶│ generating │──▶│complete││
│  └────────┘   └───────────┘   └───────────┘   └────────────┘   └───────┘│
│       │            │               │                │              │      │
│       └────────────┴───────────────┴────────────────┴──────────────┘      │
│                              ▼                                            │
│                          ┌───────┐                                        │
│                          │ error │                                        │
│                          └───────┘                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Test Data

### Test Repository
```javascript
const TEST_REPO = {
  url: 'https://github.com/corynaegle-ai/swarm-platform',
  name: 'swarm-platform',
  owner: 'corynaegle-ai'
};
```

### Test Feature Spec
```javascript
const TEST_FEATURE = {
  name: 'User Activity Logging',
  description: `Add comprehensive user activity logging to track API usage.

## Requirements:
- Log all API requests with user ID, timestamp, endpoint, method
- Store logs in a new 'activity_logs' PostgreSQL table
- Add admin endpoint GET /api/admin/activity-logs
- Include pagination (limit/offset) and filtering by date range and user

## Technical Details:
- Use Express middleware for automatic logging
- JSON column for request/response metadata
- Index on user_id and created_at for query performance

## Acceptance Criteria:
- [ ] Database migration creates activity_logs table
- [ ] Middleware logs all authenticated requests
- [ ] Admin endpoint returns paginated results
- [ ] Logs older than 90 days auto-purge via cron`
};
```

---

## Phase 1: Environment Verification

### 1.1 Pre-Test Checklist

Run these commands on DEV droplet to verify system health:

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Check all services running
pm2 status

# Expected output:
# ┌─────────────────┬────┬─────────┬──────┬───────┐
# │ name            │ id │ mode    │ pid  │ status│
# ├─────────────────┼────┼─────────┼──────┼───────┤
# │ swarm-dashboard │ 0  │ fork    │ xxx  │ online│
# │ swarm-platform  │ 1  │ fork    │ xxx  │ online│
# └─────────────────┴────┴─────────┴──────┴───────┘

# Check API health
curl -s http://localhost:3001/api/health | jq

# Check PostgreSQL
psql -U swarm -c "SELECT COUNT(*) FROM hitl_sessions;"

# Check GitHub PAT configured
psql -U swarm -c "SELECT type FROM secrets WHERE type = 'SYSTEM_GITHUB_PAT';"

# Check Anthropic API key
grep ANTHROPIC /opt/swarm-platform/.env
```

### 1.2 Success Criteria - Phase 1

| Check | Command | Expected | Status |
|-------|---------|----------|--------|
| Dashboard running | `pm2 status` | online | ⬜ |
| API running | `curl localhost:3001/api/health` | `{"status":"ok"}` | ⬜ |
| PostgreSQL connected | `psql -U swarm -c "SELECT 1"` | Returns 1 | ⬜ |
| GitHub PAT exists | Check secrets table | Row exists | ⬜ |
| Anthropic key set | Check .env | Key present | ⬜ |

---

## Phase 2: Frontend Tests

### 2.1 Test: Project Type Selection

**URL:** `https://dev.swarmstack.net/new-project` (or localhost:5173)

**Steps:**
1. Navigate to new project page
2. Verify 4 project type cards display:
   - New Application (blue)
   - Build Feature (orange) 
   - New MCP Server (green)
   - New Workflow (purple, disabled)
3. Click "Build Feature" card

**Expected:**
- Build Feature form appears
- Repository selector visible
- Feature name input visible
- Feature description textarea visible

**Manual Test Commands:**
```bash
# Check CreateProject.jsx has build_feature type
grep -n "build_feature" /opt/swarm-dashboard/src/pages/CreateProject.jsx | head -5
```

### 2.2 Test: Repository Loading

**Steps:**
1. Click "Select Main Repository" dropdown
2. Wait for repositories to load

**Expected API Call:**
```
GET /api/repos/github
Authorization: Bearer <token>
```

**Expected Response:**
```json
{
  "repos": [
    {"name": "swarm-platform", "url": "https://github.com/corynaegle-ai/swarm-platform", ...},
    {"name": "swarm-dashboard", "url": "https://github.com/corynaegle-ai/swarm-dashboard", ...}
  ]
}
```

**Manual Test:**
```bash
# Test repo endpoint directly
curl -s http://localhost:3001/api/repos/github \
  -H "Authorization: Bearer <your-token>" | jq '.repos | length'
```

### 2.3 Test: Feature Submission

**Steps:**
1. Select "swarm-platform" as main repo
2. Enter feature name: "User Activity Logging"
3. Enter feature description (from test data above)
4. Click "Start Design Session"

**Expected API Call:**
```
POST /api/hitl
Content-Type: application/json

{
  "project_name": "User Activity Logging",
  "description": "## Main Repository\n**Name:** swarm-platform\n**URL:** https://github.com/corynaegle-ai/swarm-platform\n\n## Feature Description\n...",
  "project_type": "build_feature",
  "repo_url": "https://github.com/corynaegle-ai/swarm-platform",
  "supporting_repos": []
}
```

**Expected:**
- Session created with UUID
- Navigate to `/design/<session-id>`
- State = 'input'

---

## Phase 3: API Tests

### 3.1 Test: Create HITL Session

```bash
# Create session via curl
SESSION_RESPONSE=$(curl -s -X POST http://localhost:3001/api/hitl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "project_name": "E2E Test - User Activity Logging",
    "description": "## Main Repository\n**Name:** swarm-platform\n**URL:** https://github.com/corynaegle-ai/swarm-platform\n\n## Feature Description\nAdd user activity logging middleware",
    "project_type": "build_feature",
    "repo_url": "https://github.com/corynaegle-ai/swarm-platform"
  }')

echo $SESSION_RESPONSE | jq
SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.id')
echo "Session ID: $SESSION_ID"
```

**Verify in Database:**
```sql
SELECT id, state, project_type, repo_url 
FROM hitl_sessions 
WHERE id = '<session_id>';
```

### 3.2 Test: Start Clarification

```bash
# Trigger AI clarification
curl -s -X POST http://localhost:3001/api/hitl/$SESSION_ID/clarify \
  -H "Authorization: Bearer <token>" | jq
```

**Expected:**
- State transitions to 'clarifying'
- AI message added to hitl_messages
- WebSocket broadcast sent

**Verify:**
```sql
SELECT state FROM hitl_sessions WHERE id = '<session_id>';
-- Expected: 'clarifying'

SELECT role, LEFT(content, 100) as preview 
FROM hitl_messages 
WHERE session_id = '<session_id>' 
ORDER BY created_at;
```

### 3.3 Test: Human Message Response

```bash
# Send human response
curl -s -X POST http://localhost:3001/api/hitl/$SESSION_ID/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "The logs should be stored in PostgreSQL with JSON metadata. We need to track request duration and response status codes too."
  }' | jq
```

### 3.4 Test: Generate Spec

```bash
# Finalize and generate spec
curl -s -X POST http://localhost:3001/api/hitl/$SESSION_ID/finalize \
  -H "Authorization: Bearer <token>" | jq
```

**Verify:**
```sql
SELECT state, spec_card IS NOT NULL as has_spec 
FROM hitl_sessions 
WHERE id = '<session_id>';
-- Expected: state='reviewing', has_spec=true
```

### 3.5 Test: Approve & Generate Tickets

```bash
# Approve spec and generate tickets
curl -s -X POST http://localhost:3001/api/hitl/$SESSION_ID/approve \
  -H "Authorization: Bearer <token>" | jq
```

**Verify:**
```sql
SELECT COUNT(*) as ticket_count 
FROM tickets 
WHERE design_session = '<session_id>';
```

---

## Phase 4: Service Tests

### 4.1 Test: Repository Analysis

```bash
# Test repo analysis service directly (Node REPL)
cd /opt/swarm-platform
node -e "
const { analyzeRepository } = require('./services/repoAnalysis');
analyzeRepository('https://github.com/corynaegle-ai/swarm-platform')
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e));
"
```

**Expected Output Structure:**
```json
{
  "files": [...],
  "techStack": ["node", "express", "postgresql"],
  "entryPoints": ["server.js"],
  "patterns": ["REST API"],
  "analyzedAt": "2025-12-17T..."
}
```

### 4.2 Test: Ticket Generation

```bash
# Test ticket generator (requires valid session with spec_card)
cd /opt/swarm-platform
node -e "
const { generateTicketsFromSpec } = require('./services/ticket-generator');
generateTicketsFromSpec('<session_id>', '<project_id>')
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e));
"
```

---

## Phase 5: Full E2E Happy Path

### Automated Test Script

Save as `/opt/swarm-specs/e2e-tests/run-build-feature-e2e.sh`:

```bash
#!/bin/bash
set -e

API_URL="http://localhost:3001"
TOKEN="<your-auth-token>"

echo "=== Build Feature E2E Test ==="
echo ""

# Step 1: Create session
echo "Step 1: Creating HITL session..."
SESSION=$(curl -s -X POST $API_URL/api/hitl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "project_name": "E2E Test Feature",
    "description": "## Main Repository\n**Name:** swarm-platform\n**URL:** https://github.com/corynaegle-ai/swarm-platform\n\n## Feature Description\nAdd activity logging",
    "project_type": "build_feature",
    "repo_url": "https://github.com/corynaegle-ai/swarm-platform"
  }')

SESSION_ID=$(echo $SESSION | jq -r '.id')
echo "✓ Session created: $SESSION_ID"

# Step 2: Verify state
STATE=$(psql -U swarm -t -c "SELECT state FROM hitl_sessions WHERE id = '$SESSION_ID';")
echo "✓ Initial state: $STATE"

# Step 3: Start clarification
echo "Step 3: Starting AI clarification..."
curl -s -X POST $API_URL/api/hitl/$SESSION_ID/clarify \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "✓ Clarification started"

# Step 4: Check state transition
sleep 5
STATE=$(psql -U swarm -t -c "SELECT state FROM hitl_sessions WHERE id = '$SESSION_ID';")
echo "✓ State after clarify: $STATE"

# Step 5: Check messages
MSG_COUNT=$(psql -U swarm -t -c "SELECT COUNT(*) FROM hitl_messages WHERE session_id = '$SESSION_ID';")
echo "✓ Messages in session: $MSG_COUNT"

echo ""
echo "=== E2E Test Complete ==="
echo "Session ID: $SESSION_ID"
echo "View at: https://dev.swarmstack.net/design/$SESSION_ID"
```

---

## Phase 6: Error Handling Tests

### 6.1 Invalid Repo URL
```bash
curl -s -X POST http://localhost:3001/api/hitl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "project_name": "Bad Repo Test",
    "project_type": "build_feature",
    "repo_url": "https://github.com/nonexistent/fake-repo-12345"
  }' | jq
```
**Expected:** Error response, session not created or marked failed

### 6.2 Missing Required Fields
```bash
curl -s -X POST http://localhost:3001/api/hitl \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"project_type": "build_feature"}' | jq
```
**Expected:** 400 Bad Request with validation error

### 6.3 Invalid State Transition
```bash
# Try to approve a session that's still in 'input' state
curl -s -X POST http://localhost:3001/api/hitl/<input-state-session>/approve \
  -H "Authorization: Bearer <token>" | jq
```
**Expected:** 400 with "Invalid state transition" error

---

## Success Criteria Checklist

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1 | Environment healthy | All services online | ⬜ |
| 2 | Build Feature form renders | Form visible after type selection | ⬜ |
| 3 | Repos load from GitHub | List populated | ⬜ |
| 4 | Main repo selectable | Selection persists | ⬜ |
| 5 | Session creates via API | UUID returned, state='input' | ⬜ |
| 6 | repo_url stored | Column populated | ⬜ |
| 7 | Clarification starts | State → 'clarifying' | ⬜ |
| 8 | AI generates questions | Message in hitl_messages | ⬜ |
| 9 | Human can respond | Message stored | ⬜ |
| 10 | Spec generates | spec_card populated | ⬜ |
| 11 | Approval works | State → 'generating' | ⬜ |
| 12 | Tickets created | Rows in tickets table | ⬜ |
| 13 | Error handling works | Graceful failures | ⬜ |

---

## Troubleshooting

### Common Issues

**Issue:** Repo list empty
```bash
# Check GitHub PAT
psql -U swarm -c "SELECT LEFT(value, 20) FROM secrets WHERE type = 'SYSTEM_GITHUB_PAT';"
# Check API logs
pm2 logs swarm-platform --lines 50 | grep -i repo
```

**Issue:** AI clarification hangs
```bash
# Check Anthropic key
grep ANTHROPIC /opt/swarm-platform/.env
# Check AI dispatcher logs
pm2 logs swarm-platform --lines 50 | grep -i claude
```

**Issue:** State not transitioning
```bash
# Check session-gate middleware
cat /opt/swarm-platform/middleware/session-gate.js
# Check valid transitions
grep -A20 "VALID_TRANSITIONS" /opt/swarm-platform/middleware/session-gate.js
```

---

## References

- Dashboard: https://dev.swarmstack.net
- API Docs: /opt/swarm-platform/README.md
- Session Notes: /opt/swarm-specs/session-notes/current.md
- HITL State Machine: /opt/swarm-platform/middleware/session-gate.js

---

## Credentials Reference

**Dashboard Test Users:**
- Admin: admin@swarmstack.net / AdminTest123!
- Test: test@swarmstack.net / TestUser123!

**API Token:** Generate via login or use stored token

**GitHub PAT:** Stored in secrets table as SYSTEM_GITHUB_PAT

---

## Next Session Instructions

When continuing this work in a new chat:

1. Start with: "Continue E2E testing of Build Feature workflow"
2. Reference this file: `/opt/swarm-specs/e2e-tests/build-feature-e2e-test-plan.md`
3. Check current session notes: `/opt/swarm-specs/session-notes/current.md`
4. SSH to DEV droplet (134.199.235.140) - never PROD
5. Run Phase 1 environment checks first
6. Update checkboxes in Success Criteria as tests pass
