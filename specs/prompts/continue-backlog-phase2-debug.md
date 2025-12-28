# Continue Backlog Phase 2 - Debug Chat Integration

## Context
Session Dec 23 ~8:47am - Fixed two bugs but chat still not working.

## Critical Path Info
- **DEV Droplet**: 134.199.235.140
- **App Location**: `/opt/swarm-app/apps/platform/`
- **PM2 Process**: `swarm-platform-dev`
- **Routes File**: `/opt/swarm-app/apps/platform/routes/backlog.js`
- **Claude Client**: `/opt/swarm-app/apps/platform/services/claude-client.js`

## Database Credentials
```bash
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=swarmdb
PG_USER=swarm
PG_PASSWORD=swarm_dev_2024
```

## Bugs Fixed This Session

### Bug 1: Wrong chat() function signature
**Before**: `await chat([messages], { system: prompt })`
**After**: `await chat({ messages: [...], system: prompt })`

### Bug 2: Not extracting content from response
**Before**: `content: aiResponse` (aiResponse is object, not string)
**After**: `content: aiResult.content` (extract .content from response object)

## Current Problem
After fixes, start-chat returns `state: "chatting"` but `chat_transcript` is empty.
- No new errors in PM2 logs after restart
- API call takes ~5 seconds (suggests Claude call happening)
- But transcript not saved to database

## Debugging Steps Needed

### 1. Check if Claude response is received
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Add debug logging to start-chat endpoint
# Look for: const aiResult = await chat({ messages: ...
# Add after: console.log('Claude result:', JSON.stringify(aiResult));
```

### 2. Check database directly
```bash
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, chat_transcript FROM backlog_items ORDER BY created_at DESC LIMIT 3;"
```

### 3. Verify the UPDATE query is working
The UPDATE statement saves `[initialMessage]` to chat_transcript.
Check if `initialMessage` is being constructed correctly.

## Likely Root Cause
The `chat()` function in claude-client.js returns:
```javascript
return {
  success: true,
  content: response.content[0].text,  // <-- This is the AI text
  usage: response.usage,
  stopReason: response.stop_reason
};
```

In backlog.js start-chat, we do:
```javascript
const aiResult = await chat({ messages: [...], system: systemPrompt });
// Then we need to use aiResult.content, NOT aiResult itself
```

**Check if this fix was applied correctly:**
```bash
grep -A 5 "aiResult = await chat" /opt/swarm-app/apps/platform/routes/backlog.js
```

Should show:
```javascript
const initialMessage = {
  role: 'assistant',
  content: aiResult.success ? aiResult.content : "AI error: " + aiResult.error,
  ...
};
```

## Quick Test After Fix
```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r ".token")

# Create and start chat
ITEM=$(curl -s -X POST http://localhost:8080/api/backlog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Debug Test","description":"Testing fix","priority":1}')
ID=$(echo $ITEM | jq -r ".id")

curl -s -X POST http://localhost:8080/api/backlog/$ID/start-chat \
  -H "Authorization: Bearer $TOKEN" | jq '{state, transcript_len: (.chat_transcript | length)}'
```

## Phase 2 Remaining Tests (after fix works)
- [ ] start-chat populates transcript with AI greeting
- [ ] chat appends user + AI messages
- [ ] end-chat transitions to refined state
- [ ] end-chat populates enriched_description
- [ ] abandon-chat returns to draft

## Phase 3 (after Phase 2 passes)
- [ ] promote creates HITL session
- [ ] promote blocks non-refined items
- [ ] Cannot delete promoted items

## Anti-Freeze Protocol
- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- Checkpoint to git after each phase
