
---

## Session Update: Learning Page API 401 Fix

**Date**: 2025-12-16
**Status**: ✅ COMPLETE

### Problem

Learning Dashboard (LearningDashboard.jsx) returning 401 Unauthorized when accessing /api/learning/* endpoints on DEV environment.

### Root Cause

Cookie domain mismatch between DEV and PROD:
- Cookie was hardcoded to domain `.swarmstack.net` (PROD)
- DEV environment uses `*.dev.swarmstack.net`
- Browser wouldn't send cookies to dev subdomain due to domain mismatch

### Fix Applied

**File**: `/opt/swarm-platform/routes/auth.js`

Changed cookie domain from hardcoded value to environment variable:

```javascript
// Before
domain: '.swarmstack.net'

// After  
domain: process.env.COOKIE_DOMAIN || '.swarmstack.net'
```

**Environment Variable Added**:
- DEV: `COOKIE_DOMAIN=.dev.swarmstack.net`
- PROD: Uses default `.swarmstack.net` (no change needed)

### Deployment

On DEV (134.199.235.140):
1. Updated routes/auth.js with dynamic cookie domain
2. Committed: `git commit -m "Fix cookie domain for dev environment"`
3. Restarted PM2: `COOKIE_DOMAIN=.dev.swarmstack.net pm2 restart swarm-platform-dev --update-env`
4. Saved PM2 config: `pm2 save`

### Verification

- Login now returns cookie with `Domain=.dev.swarmstack.net`
- Learning API endpoints now return data instead of 401
- Tested: `/api/learning/detect` returns summary and patterns

### Git Commit

**swarm-platform** (commit f29cec3):
- routes/auth.js: Dynamic cookie domain via COOKIE_DOMAIN env var
