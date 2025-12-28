# Diagnostic Prompt: Tickets/Projects Not Visible in Dashboard

## Problem Statement
After a successful build that created 21 tickets for session `6812bebd-3d71-4a1a-9c1a-34cb4c27c8af`:
1. Tickets don't appear on the Kanban board
2. Tickets don't appear on the Tickets page
3. Project doesn't appear in the project dropdown on `/tickets`

## Context
- Build completed, tickets exist in database (confirmed via psql)
- Ticket states: 12 needs_review, 3 in_progress, 3 ready, 3 cancelled
- Session ID: `6812bebd-3d71-4a1a-9c1a-34cb4c27c8af`
- User logged in as: admin@swarmstack.net
- DEV environment: dashboard.dev.swarmstack.net / api.dev.swarmstack.net

## Diagnostic Steps

### 1. Check tenant isolation on tickets
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
SELECT id, title, tenant_id, project_id, state 
FROM tickets 
WHERE design_session = '6812bebd-3d71-4a1a-9c1a-34cb4c27c8af' 
LIMIT 5;
\""
```

### 2. Check if project exists and has tenant_id
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
SELECT id, name, tenant_id, created_at 
FROM projects 
ORDER BY created_at DESC 
LIMIT 5;
\""
```

### 3. Check what tenant the logged-in user belongs to
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
SELECT id, email, tenant_id 
FROM users 
WHERE email = 'admin@swarmstack.net';
\""
```

### 4. Query RAG for ticket list endpoint logic
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"GET tickets list endpoint tenant_id project_id filter\", \"limit\": 5}'"
```

### 5. Query RAG for projects dropdown endpoint
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "curl -s -X POST http://localhost:8082/api/rag/search -H 'Content-Type: application/json' -d '{\"query\": \"GET projects list dropdown tenant filter\", \"limit\": 5}'"
```

### 6. Test API directly with auth token
Get a token from browser DevTools (Network tab → any API call → copy Authorization header), then:
```bash
curl -s "https://api.dev.swarmstack.net/api/tickets" \
  -H "Authorization: Bearer <TOKEN>" | jq '.tickets | length'

curl -s "https://api.dev.swarmstack.net/api/projects" \
  -H "Authorization: Bearer <TOKEN>" | jq '.projects | length'
```

## Likely Causes

### A. Missing tenant_id on tickets
The `generateTicketsFromSpec()` or `activateTicketsForBuild()` may not be setting `tenant_id` correctly.

**Fix pattern:**
```sql
UPDATE tickets 
SET tenant_id = 'tenant-swarm' 
WHERE design_session = '6812bebd-3d71-4a1a-9c1a-34cb4c27c8af' 
AND tenant_id IS NULL;
```

### B. Missing tenant_id on project
The project created during build may be missing tenant_id.

**Fix pattern:**
```sql
UPDATE projects 
SET tenant_id = 'tenant-swarm' 
WHERE tenant_id IS NULL;
```

### C. API query filtering by wrong tenant
Check if the API endpoints are using `req.tenantId` correctly in WHERE clauses.

### D. Frontend not passing tenant context
Check if the dashboard is sending the correct tenant in API requests.

## Quick Fix Commands
After diagnosis, if it's a tenant_id issue:

```bash
# Fix project tenant
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
UPDATE projects SET tenant_id = 'tenant-swarm' WHERE tenant_id IS NULL RETURNING id, name;
\""

# Fix ticket tenant  
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sudo -u postgres psql -d swarmdb -c \"
UPDATE tickets SET tenant_id = 'tenant-swarm' 
WHERE design_session = '6812bebd-3d71-4a1a-9c1a-34cb4c27c8af' 
AND tenant_id IS NULL 
RETURNING id, title;
\""
```

## Files to Review
- `/opt/swarm-app/apps/platform/routes/tickets.js` - GET /api/tickets endpoint
- `/opt/swarm-app/apps/platform/routes/projects.js` - GET /api/projects endpoint
- `/opt/swarm-app/apps/platform/services/ticket-generator.js` - generateTicketsFromSpec()
- `/opt/swarm-app/apps/platform/routes/hitl.js` - activateTicketsForBuild()
