# Continue Backlog System - Phase 1 Verification & Testing

## Context
You are a master systems architect continuing implementation of the Swarm Backlog System. Previous session completed code deployment but crashed before testing.

## What Was Done
1. ✅ Created `routes/backlog.js` (706 lines) - Full CRUD + chat + promotion endpoints
2. ✅ Created `migrations/010_backlog_items.sql` - Table with indexes, constraints, triggers
3. ✅ Created `lib/ticket-lifecycle.js` - Helper library
4. ✅ Updated `server.js` - Registered backlog routes at `/api/backlog`
5. ✅ Committed to GitHub: `a066500 feat: Add Backlog System - Phase 1 CRUD implementation`
6. ✅ Deployed to DEV droplet (134.199.235.140)
7. ✅ Database table `backlog_items` exists with all 18 columns
8. ✅ PM2 restarted `swarm-platform-dev`

## What Remains for Phase 1
1. **Test CRUD endpoints with curl**:
   - POST /api/backlog (create item)
   - GET /api/backlog (list items)
   - GET /api/backlog/:id (get single)
   - PATCH /api/backlog/:id (update)
   - DELETE /api/backlog/:id (archive)

2. **Test Chat endpoints**:
   - POST /api/backlog/:id/start-chat
   - POST /api/backlog/:id/chat
   - POST /api/backlog/:id/end-chat
   - POST /api/backlog/:id/abandon-chat

3. **Test Promotion**:
   - POST /api/backlog/:id/promote

4. **Fix any bugs found during testing**

5. **Update session notes in git**

## Test Commands
```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r ".token")

# Create backlog item
curl -s -X POST http://localhost:8080/api/backlog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Feature","description":"Testing backlog system","priority":1}' | jq .

# List items
curl -s http://localhost:8080/api/backlog -H "Authorization: Bearer $TOKEN" | jq .
```

## Key Files
- Implementation spec: `/opt/swarm-specs/prompts/implement-backlog-system.md`
- Routes: `/opt/swarm-platform/routes/backlog.js`
- Migration: `/opt/swarm-platform/migrations/010_backlog_items.sql`

## Droplet Access
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

## Anti-Freeze Protocol
- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- Max 3 chained commands
- Checkpoint to git after each milestone

## Success Criteria (Phase 1)
- [ ] Create backlog item returns 201 with item data
- [ ] List returns array with tenant isolation
- [ ] Update modifies fields correctly
- [ ] Archive sets state to 'archived'
- [ ] All endpoints require auth (401 without token)
- [ ] All queries filter by tenant_id

## Next Phase
After Phase 1 passes, Phase 2 is Chat Integration testing, then Phase 3 Promotion testing. Only do Phase 1 in this session.
