# Current Session Notes

## Session: December 22, 2024 - BuildProgress Bug Fix

### Status: ✅ FIXED

---

## Fix Summary

**Problem**: BuildProgress page at `/build/:sessionId` was returning 500 error.

**Root Cause**: The HITL route's tickets query was selecting a `type` column that doesn't exist in the `tickets` table (PostgreSQL error 42703 - column does not exist).

**Solution**: Removed `type` from the SELECT statement in `/opt/swarm-app/apps/platform/routes/hitl.js` line 73.

**Before**:
```sql
SELECT id, title, type, state, priority, created_at, updated_at
FROM tickets WHERE design_session = $1
```

**After**:
```sql
SELECT id, title, state, priority, created_at, updated_at
FROM tickets WHERE design_session = $1
```

**Commit**: `ee30af2` - "fix: remove non-existent type column from tickets query in HITL route"

---

## Verification

- API: `curl localhost:8080/api/hitl/6812bebd-3d71-4a1a-9c1a-34cb4c27c8af` ✅ Returns session with 21 tickets
- Page: https://dashboard.dev.swarmstack.net/build/6812bebd-3d71-4a1a-9c1a-34cb4c27c8af

---

## Commands Reference

```bash
# DEV SSH
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Service restart
pm2 restart swarm-platform-dev

# Test HITL endpoint
curl localhost:8080/api/hitl/6812bebd-3d71-4a1a-9c1a-34cb4c27c8af | jq .session.state
```

## Session: December 25, 2024 - Sentinel Integration & Backlog Fix

### Status: ✅ COMPLETED

---

## Changes Summary

### 1. Sentinel Feedback Loop
**Feature**: Implemented automatic ticket retries with `sentinel_feedback`.
**Changes**:
- `apps/platform/routes/tickets.js`: Added retry logic to `PUT /:id` and `POST /:id/verify`. Only tickets with valid `retry_after` timestamps are polled.
- `apps/platform/code/forge-agent-v4.js`: Injected `sentinel_feedback` into agent prompt.
- `apps/platform/lib/learning-queries.js`: Migrated to PostgreSQL and filtered `manual_review` errors from analytics.

### 2. Backlog Refinement Fixes
**Bug**: Refinement session (`chatting` state) not reloading history on page refresh.
**Fix**: Updated `Backlog.jsx` to fallback to `chat_transcript` and parse JSON.

**Feature**: Show original user input in chat.
**Change**: Updated `backlog.js` to insert the initial idea as the first user message in the transcript.

### 3. Verification
- **Sentinel**: Verified via end-to-end script `test-sentinel-retry.js`. Ticket transitions: `failed` -> `pending` (Retry Count: 1).
- **Backlog**: Verified code logic handles property mismatch.

---

## Commands Reference

```bash
# Verify End-to-End Retry
node apps/platform/tests/test-sentinel-retry.js
```
