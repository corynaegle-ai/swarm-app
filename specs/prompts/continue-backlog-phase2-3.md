# Continue Backlog System - Phase 2 & 3 Testing

## Context
Phase 1 CRUD testing COMPLETE (Dec 23). All endpoints working on DEV droplet.

## Critical Path Info
- **DEV Droplet**: 134.199.235.140
- **App Location**: `/opt/swarm-app/apps/platform/` (NOT /opt/swarm-platform - deleted)
- **PM2 Process**: `swarm-platform-dev`
- **Routes File**: `/opt/swarm-app/apps/platform/routes/backlog.js`

## What's Done (Phase 1) ✅
- POST /api/backlog (create) - 201
- GET /api/backlog (list) - pagination works
- GET /api/backlog/:id (single) - returns item
- PATCH /api/backlog/:id (update) - modifies correctly
- DELETE /api/backlog/:id (archive) - sets state='archived'
- Auth protection - 401 without token

## Phase 2: Chat Integration Testing

Test the refinement chat workflow:

```bash
# Setup
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r ".token")

# Create fresh test item
ITEM=$(curl -s -X POST http://localhost:8080/api/backlog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Chat Test Feature","description":"Testing chat flow","priority":1}')
ID=$(echo $ITEM | jq -r ".id")

# Test 1: Start Chat (state: draft → chatting)
curl -s -X POST http://localhost:8080/api/backlog/$ID/start-chat \
  -H "Authorization: Bearer $TOKEN" | jq ".state"
# Expected: "chatting"

# Test 2: Send Chat Message
curl -s -X POST http://localhost:8080/api/backlog/$ID/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What technologies should we use?"}' | jq ".chat_transcript | length"
# Expected: 2 (user + assistant messages)

# Test 3: End Chat (state: chatting → refined)
curl -s -X POST http://localhost:8080/api/backlog/$ID/end-chat \
  -H "Authorization: Bearer $TOKEN" | jq ".state,.enriched_description"
# Expected: "refined", non-null enriched_description

# Test 4: Abandon Chat (create new item, start chat, then abandon)
# Should return to draft state
```

### Phase 2 Success Criteria
- [ ] start-chat transitions draft → chatting
- [ ] chat appends to transcript (user + AI response)
- [ ] end-chat transitions chatting → refined
- [ ] end-chat populates enriched_description
- [ ] abandon-chat returns chatting → draft

## Phase 3: Promotion Testing

```bash
# Use a refined item from Phase 2, or create and refine one
# Test: Promote to HITL session
curl -s -X POST http://localhost:8080/api/backlog/$ID/promote \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"test-project-id"}' | jq ".state,.hitl_session_id"
# Expected: "promoted", non-null hitl_session_id

# Verify: Cannot promote non-refined items
# Verify: Cannot delete promoted items
```

### Phase 3 Success Criteria
- [ ] promote creates HITL session
- [ ] promote sets state='promoted' and hitl_session_id
- [ ] Cannot promote items not in 'refined' state
- [ ] Cannot delete/archive promoted items

## Anti-Freeze Protocol
- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- Checkpoint to git after each phase

## Session Notes Location
`/opt/swarm-specs/session-notes/current.md` - commit after testing complete
