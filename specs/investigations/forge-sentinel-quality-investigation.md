# Forge-Sentinel Quality Investigation

## Date: 2025-12-26
## Status: Phase 1 Complete - Root Causes Identified

---

## Executive Summary

Forge is correctly receiving Sentinel feedback, but quality issues persist due to three root causes:
1. **Third retry failure**: Forge completely fails to generate output on 3rd attempt
2. **No diagnostic logging**: Can't determine what Claude responds when parsing fails  
3. **No verification history**: Can't compare findings across attempts

---

## Phase 1: Actual Sentinel Feedback Analysis

### TKT-E2E-IMPL-001 Sentinel Review

**Score: 25/100 (REJECTED)**

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 4 | Security vulnerabilities |
| MAJOR | 2 | Error handling + mock data |
| MINOR | 2 | Code style |
| NITPICK | 1 | Documentation |

### Critical Issues Identified

1. **auth.js:18** - Password validation completely missing
   - Code finds user by email but never compares password
   - Any email authenticates regardless of password

2. **jwt.js:3** - Hardcoded fallback secret `"dev-secret"`
   - Creates massive security vulnerability
   - Tokens can be forged if JWT_SECRET not set

3. **auth.js:2** - Duplicate hardcoded secret
   - Same vulnerability in two files
   - Secret management inconsistent

4. **auth.js:19** - Information disclosure
   - Different error messages reveal email existence
   - Enables username enumeration

### Major Issues

1. **jwt.js:13** - Callback-style jwt.verify
   - Unhandled promise rejections in async context
   - Error handling incomplete

2. **auth.js:8** - Mock password not hashed
   - "hashed" is plaintext, not actual hash

---

## Phase 2: Retry Flow Analysis

### Timeline (08:16-08:23 UTC)

```
08:16:21 - Forge first run completed
08:16:21 - Verification attempt 1/3 started
08:16:47 - Verification FAILED (score: 25, 4 CRITICAL)
08:16:48 - Retry with sentinel feedback initiated
08:17:29 - Forge second run completed  
08:17:29 - Verification attempt 2/3 started
08:17:57 - Verification FAILED (unknown score)
08:17:59 - Second retry initiated
08:22:59 - Forge FAILED: "No files generated after MCP loop"
08:22:59 - Ticket escalated to needs_review
```

### Root Cause: Third Retry Failure

**Error**: `"No files generated after MCP loop"`

**Location**: `/opt/swarm-agents/forge-agent/main.js:405`

**What Happened**:
1. MCP loop ran 5 iterations
2. No valid JSON output parsed from Claude's response
3. `parseCodeResponse()` returned empty files array
4. Error thrown, ticket escalated

**Why This Matters**: We don't know if:
- Claude produced invalid JSON format
- Claude gave up and wrote explanation instead
- Context window overflowed
- Prompt was confusing on 3rd attempt

---

## Identified Bugs

### Bug 1: No Diagnostic Logging on Parse Failure

**File**: `forge-agent/main.js:405`

**Current Code**:
```javascript
if (!finalResult || !finalResult.files || finalResult.files.length === 0) {
  throw new Error('No files generated after MCP loop');
}
```

**Issue**: No visibility into what Claude actually responded

**Fix**:
```javascript
if (!finalResult || !finalResult.files || finalResult.files.length === 0) {
  log.error('No files generated', {
    lastResponse: messages[messages.length-1]?.content?.substring(0, 1000),
    loopCount,
    ticketId: ticket.id,
    attempt: ticket.retry_count
  });
  throw new Error('No files generated after MCP loop');
}
```

### Bug 2: No Verification History

**Issue**: `sentinel_feedback` column is overwritten on each verification
- Cannot compare findings across attempts
- Cannot determine if Forge fixed issues or created new ones

**Fix**: Add `verification_history` JSONB column or use events table

### Bug 3: Event Emission Parameter Mismatch

**Warning**: `bind message supplies 6 parameters, but prepared statement "" requires 7`

**Impact**: Non-blocking but events not being recorded properly

---

## Diagnostic Gaps

| Data Needed | Available | Source |
|-------------|-----------|--------|
| First Sentinel feedback | ✅ | sentinel_feedback column |
| Second Sentinel feedback | ❌ | Overwritten |
| Third Sentinel feedback | ❌ | Never reached (Forge failed) |
| Claude's failed response | ❌ | Not logged |
| Token usage per attempt | ❌ | Not logged to DB |

---

## Phase 3 Recommendations (Next Steps)

### Immediate Fixes

1. **Add diagnostic logging** before throwing "No files generated" error
2. **Fix event emission** parameter mismatch (7th param missing)
3. **Store verification history** array instead of overwriting

### Quality Improvements

1. **Response validation**: Check JSON structure before parsing
2. **Context management**: Limit feedback injection size
3. **Escalation path**: Provide Claude's response in needs_review state

### Testing

1. Create new test ticket with simple implementation
2. Manually verify Sentinel findings on each attempt
3. Confirm Forge addresses issues correctly

---

## Files Referenced

- `/opt/swarm-agents/forge-agent/main.js` - Lines 130-180, 235-275, 330-430
- `/opt/swarm-app/apps/engine/` - Orchestration logic
- `/opt/swarm-verifier/` - Sentinel verification

---

*Investigation by: Claude (Systems Architect)*
*Next Phase: Implement diagnostic logging fixes*
