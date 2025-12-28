# Continue Backlog Phase 3 - Debug Promote Endpoint

## Context
Session Dec 23 ~9:30am - Phase 2 COMPLETE, Phase 3 in progress.

## Critical Path Info
- **DEV Droplet**: 134.199.235.140
- **App Location**: `/opt/swarm-app/apps/platform/`
- **PM2 Process**: `swarm-platform-dev`
- **Routes File**: `/opt/swarm-app/apps/platform/routes/backlog.js`
- **Local Copy**: `/Users/cory.naegle/swarm-specs-local/temp/backlog.js`

## Phase 2 COMPLETE ✅
All chat endpoints working:
- [x] start-chat - returns chat_transcript
- [x] chat - returns chat_transcript  
- [x] end-chat - transitions to refined, populates enriched_description
- [x] abandon-chat - returns to draft state ✅ FIXED THIS SESSION

## Phase 3 - Promote Endpoint FAILING
The promote endpoint returns 500 error. Need to debug.

### Test Command
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r ".token")

# Test with refined item
curl -s -X POST "http://localhost:8080/api/backlog/1cc66373-5c44-45e5-8e0b-8f2570e1b54f/promote" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Debug Steps
1. Check PM2 error logs:
```bash
pm2 logs swarm-platform-dev --err --lines 20 --nostream
```

2. The promote endpoint code starts around line 565 in backlog.js
3. Local copy is at `/Users/cory.naegle/swarm-specs-local/temp/backlog.js`

### Phase 3 Test Checklist
- [ ] promote creates HITL session
- [ ] promote blocks non-refined items (should return 400)
- [ ] Cannot delete promoted items

### After Promote Works
Test deletion protection:
```bash
# Try to delete a promoted item - should fail with 400
curl -s -X DELETE "http://localhost:8080/api/backlog/$PROMOTED_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## File Edit Protocol
**NEVER use sed for edits. Always:**
1. rsync file FROM droplet to local
2. Edit locally with Desktop Commander
3. rsync file TO droplet
4. pm2 restart swarm-platform-dev

```bash
# Pull
rsync -avz -e "ssh -i ~/.ssh/swarm_key" root@134.199.235.140:/opt/swarm-app/apps/platform/routes/backlog.js /Users/cory.naegle/swarm-specs-local/temp/backlog.js

# Push after edit
rsync -avz -e "ssh -i ~/.ssh/swarm_key" /Users/cory.naegle/swarm-specs-local/temp/backlog.js root@134.199.235.140:/opt/swarm-app/apps/platform/routes/backlog.js

# Restart
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && pm2 restart swarm-platform-dev --update-env'
```

## Anti-Freeze Protocol
- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- No sed/heredocs - use rsync
- Checkpoint to git after phase complete
