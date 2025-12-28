# Bug Fix Prompt: tenant_id Not Set on Projects/Tickets During Build

## Problem Statement
When `start-build` is triggered, the ticket generator creates projects and tickets but does NOT set `tenant_id` on them. This causes:
1. Projects not visible in the dropdown (filtered by tenant)
2. Tickets not visible on Kanban/Tickets pages (filtered by tenant)
3. Manual SQL fixes required after every build

## Evidence
```sql
-- Project created without tenant_id
SELECT id, name, tenant_id FROM projects WHERE id = '447c9818-0472-4d33-95e6-b7d4a6f7c0c3';
-- Result: tenant_id = NULL

-- Tickets created without tenant_id  
SELECT id, tenant_id FROM tickets WHERE design_session = '6812bebd-3d71-4a1a-9c1a-34cb4c27c8af' LIMIT 3;
-- Result: tenant_id = NULL (empty string)
```

## Diagnosis Steps

### 1. Find ticket generator code
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"generateTicketsFromSpec INSERT tickets project_id tenant_id\", \"limit\": 8}'"
```

### 2. Find project creation code
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"INSERT projects tenant_id createProject start-build\", \"limit\": 8}'"
```

### 3. Check how session tenant_id is accessed
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"hitl_sessions tenant_id session.tenant_id start-build\", \"limit\": 5}'"
```

## Expected Flow
1. User triggers `POST /hitl/:sessionId/start-build`
2. Session is loaded with `tenant_id` from `hitl_sessions` table
3. `generateTicketsFromSpec()` is called
4. Inside generator:
   - Create project WITH `tenant_id = session.tenant_id`
   - Create tickets WITH `tenant_id = session.tenant_id`
5. Tickets visible to user filtered by their tenant

## Fix Locations

### File 1: `/opt/swarm-app/apps/platform/services/ticket-generator.js`

**Find the INSERT INTO projects statement and add tenant_id:**
```javascript
// BEFORE (missing tenant_id)
INSERT INTO projects (id, name, description, repo_url, created_at)
VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)

// AFTER (with tenant_id)
INSERT INTO projects (id, name, description, repo_url, tenant_id, created_at)
VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
```

**Find the INSERT INTO tickets statement and add tenant_id:**
```javascript
// BEFORE (missing tenant_id)
INSERT INTO tickets (id, project_id, title, description, ...)
VALUES ($1, $2, $3, $4, ...)

// AFTER (with tenant_id)
INSERT INTO tickets (id, project_id, tenant_id, title, description, ...)
VALUES ($1, $2, $3, $4, $5, ...)
```

### File 2: `/opt/swarm-app/apps/platform/routes/hitl.js`

**Ensure tenant_id is passed to generateTicketsFromSpec:**
```javascript
// In start-build route, session.tenant_id must be passed
const ticketResult = await generateTicketsFromSpec(
  req.params.sessionId, 
  projectId,
  session.tenant_id  // <-- Make sure this is passed
);
```

## Implementation Commands

### Step 1: View current ticket-generator.js
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && head -100 /opt/swarm-app/apps/platform/services/ticket-generator.js"
```

### Step 2: Find INSERT statements
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'INSERT INTO' /opt/swarm-app/apps/platform/services/ticket-generator.js"
```

### Step 3: Check function signature
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'generateTicketsFromSpec' /opt/swarm-app/apps/platform/services/ticket-generator.js | head -5"
```

### Step 4: Check how it's called in hitl.js
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n -A2 'generateTicketsFromSpec' /opt/swarm-app/apps/platform/routes/hitl.js"
```

## Verification After Fix

### Test the fix:
1. Create a new HITL session
2. Go through design flow to approval
3. Click "Start Build"
4. Check database:
```sql
SELECT id, name, tenant_id FROM projects ORDER BY created_at DESC LIMIT 1;
SELECT id, tenant_id FROM tickets ORDER BY created_at DESC LIMIT 5;
```

### Expected result:
- Project has `tenant_id = 'tenant-swarm'`
- All tickets have `tenant_id = 'tenant-swarm'`
- Project appears in dropdown
- Tickets appear on Kanban/Tickets pages

## Commit Message
```
fix(ticket-generator): Propagate tenant_id to projects and tickets

Root cause: generateTicketsFromSpec() was not setting tenant_id on 
created projects and tickets, causing them to be invisible in the 
tenant-filtered dashboard views.

Fix:
- Add tenant_id parameter to generateTicketsFromSpec()
- Include tenant_id in INSERT INTO projects
- Include tenant_id in INSERT INTO tickets
- Pass session.tenant_id from start-build route
```
