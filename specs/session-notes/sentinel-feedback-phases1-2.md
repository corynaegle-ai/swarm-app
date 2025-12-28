
---

## Session: December 24, 2025 - Sentinel Feedback Loop (Phases 1-2)

### Status: PHASES 1-2 COMPLETE ✅ | Phase 3 Ready

---

## Objective

Complete the feedback loop so rejected tickets get requeued with sentinel feedback, allowing forge agents to fix issues and retry.

### The Problem (Before)
- 19 tickets stuck in `sentinel_failed` state (dead end)
- No retry mechanism - one rejection = permanent failure
- Forge agents never received feedback about what to fix

### The Solution (After)
```
Sentinel rejects → retry_count < 2?
  YES → state = 'ready' + sentinel_feedback stored → Forge agent retries with feedback
  NO  → state = 'on_hold' + hold_reason → Human review (HITL)
```

---

## Phase 1: Database Schema ✅

| Column | Type | Purpose |
|--------|------|---------|
| `retry_count` | INTEGER DEFAULT 0 | Track rejection attempts |
| `retry_after` | TIMESTAMP | Backoff delay before retry |
| `sentinel_feedback` | JSONB | Store rejection feedback |
| `hold_reason` | TEXT | Explain why ticket is on hold |

Index created: `idx_tickets_retry_after` for efficient polling

---

## Phase 2: Engine Integration ✅

### Files Modified
| File | Change |
|------|--------|
| `/opt/swarm/engine/lib/engine.js` | Replaced `setSentinelFailed()` with retry-aware version |
| `/opt/swarm/engine/lib/engine.js` | Added `retry_after` filter to `atomicClaimNext()` |
| `/opt/swarm/engine/lib/engine.js` | Added `retry_after` filter to `getReadyTickets()` |

### New setSentinelFailed() Behavior
```
retry_count < 2:
  → state = 'ready'
  → sentinel_feedback = [issues from sentinel]
  → retry_count++
  → retry_after = NOW() + (5s * attempt)

retry_count >= 2:
  → state = 'on_hold'
  → hold_reason = 'Sentinel rejected after N attempts'
  → Requires human intervention
```

### Live Verification
```
Ticket: TKT-1C0CBF77
Before: state = 'sentinel_failed', no retry
After:  state = 'ready', retry_count = 1, sentinel_feedback populated
```

Engine logs confirmed:
```
[SENTINEL] Review result for TKT-1C0CBF77: failed
[SENTINEL] Ticket TKT-1C0CBF77 requeued for retry (attempt 1/2)
```

---

## Phase 3: Forge Agent Enhancement (NEXT)

### Prompt Location
`/opt/swarm-specs/prompts/implement-sentinel-feedback-phase3.md`

### Summary
- Locate forge agent prompt building code
- Add `formatSentinelFeedback()` helper
- Inject feedback into system prompt on retry attempts
- Format as explicit "MUST FIX" requirements

---

## Quick Reference

| Resource | Value |
|----------|-------|
| Test Ticket | TKT-1C0CBF77 |
| Engine Backup | engine.js.bak-20251223-235149 |
| Phase 3 Prompt | /opt/swarm-specs/prompts/implement-sentinel-feedback-phase3.md |

---
