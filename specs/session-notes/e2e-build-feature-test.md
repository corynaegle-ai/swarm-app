# E2E Test: Build Feature Workflow

## Session Date: 2025-12-17T18:00:00-07:00

## Test Objective
End-to-end test of the "Build Feature" workflow from the new projects page of Swarm Dashboard.

## Environment
- **DEV Droplet:** 134.199.235.140
- **Dashboard:** Port 3000 (swarm-dashboard-dev)
- **API:** Port 8080 (swarm-platform-dev)
- **Database:** PostgreSQL (swarmdb)

## Pre-Test Verification ✅

| Check | Status | Notes |
|-------|--------|-------|
| PM2 services online | ✅ | All 6 services running |
| Health endpoint | ✅ | `/health` returns healthy, db=postgresql |
| PostgreSQL tables | ✅ | 13 tables including hitl_sessions, hitl_messages |
| GitHub PAT configured | ✅ | SYSTEM_GITHUB_PAT exists in secrets |
| Auth working | ✅ | Login returns JWT token |
| Repo list working | ✅ | `/api/repo/list` returns repos from corynaegle-ai |

## Test Progress

### Step 1: Authentication ✅
```bash
POST /api/auth/login
Body: {"email":"admin@swarmstack.net","password":"AdminTest123!"}
Result: JWT token received
```

### Step 2: List Repositories ✅
```bash
GET /api/repo/list
Result: Returns repos including swarm-platform, swarm-specs, swarm-dashboard
```

### Step 3: Create HITL Session 🔄 IN PROGRESS
```bash
POST /api/hitl
Body: {
  "name": "Test E2E Activity Logging",
  "description": "Add user activity logging feature to track API calls",
  "projectType": "build_feature",
  "metadata": {
    "repo_url": "https://github.com/corynaegle-ai/swarm-platform",
    "supporting_repos": []
  }
}
Result: PENDING - waiting for response
```

## Key Findings

### API Endpoints Discovered
- `/health` - Health check (no auth)
- `/api/auth/login` - Authentication
- `/api/projects` - Project CRUD (requires auth)
- `/api/repo/list` - List GitHub repos
- `/api/repo/provision` - Create new managed repo
- `/api/repo/link` - Link existing repo
- `/api/hitl` - HITL session management
- `/api/hitl/:sessionId/start-clarification` - Begin AI chat
- `/api/hitl/:sessionId/respond` - Send message to AI
- `/api/hitl/:sessionId/generate-spec` - Generate spec from chat
- `/api/hitl/:sessionId/approve` - Approve spec
- `/api/hitl/:sessionId/start-build` - Begin ticket generation

### Build Feature Flow (from CreateProject.jsx)
1. User selects "Build Feature" project type
2. Fetches repos via `/api/repo/list`
3. User selects main repo + optional supporting repos
4. User enters feature name and description
5. Calls `createSession()` with `projectType: 'build_feature'`
6. Navigates to `/design/:sessionId` for AI clarification

### HITL State Machine
```
input → clarifying → reviewing → generating → complete
                ↘      ↓
                  → error
```

## Next Steps to Test
1. Verify HITL session creation response
2. Test `/api/hitl/:sessionId/analyze-repo` - Clone and analyze target repo
3. Test `/api/hitl/:sessionId/start-clarification` - Begin AI chat
4. Test `/api/hitl/:sessionId/respond` - Send clarification messages
5. Test `/api/hitl/:sessionId/generate-spec` - Generate feature spec
6. Test `/api/hitl/:sessionId/approve` - Approve the spec
7. Test `/api/hitl/:sessionId/start-build` - Generate tickets

## Files Referenced
- `/opt/swarm-dashboard/src/pages/CreateProject.jsx` - UI entry point
- `/opt/swarm-dashboard/src/pages/DesignSession.jsx` - AI chat UI
- `/opt/swarm-platform/routes/hitl.js` - HITL API routes
- `/opt/swarm-platform/routes/repo.js` - Repository routes
- `/opt/swarm-platform/server.js` - Route mounting

## Resume Instructions
To continue this test:
1. SSH to dev: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
2. Export PATH: `export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH`
3. Use saved JWT token for authenticated requests
4. Check HITL session status and continue from last step
