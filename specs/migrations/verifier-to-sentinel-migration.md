# Migration Plan: swarm-verifier → swarm-sentinel

## Executive Summary

The verification agent codebase uses inconsistent naming - the directory is correctly named `sentinel` but PM2 process names, client libraries, and documentation still reference `verifier`. This migration consolidates everything under the `swarm-sentinel` name.

## Current State Analysis

### ✅ Already Using "sentinel"
- Directory: `/opt/swarm-app/apps/agents/sentinel/`
- package.json name: `swarm-sentinel-agent`
- Database column: `sentinel_feedback`
- Config paths: `REPOS_BASE_PATH: '/tmp/swarm-sentinel-repos'`

### ❌ Still Using "verifier" (needs migration)
| File | Current Reference | Target Reference |
|------|-------------------|------------------|
| ecosystem.config.js | `name: 'swarm-verifier'` | `name: 'swarm-sentinel'` |
| packages/engine/lib/verifier-client.js | filename | rename to `sentinel-client.js` |
| packages/engine/lib/engine.js | `import { verify, ... } from './verifier-client.js'` | `import { verify, ... } from './sentinel-client.js'` |
| apps/agents/sentinel/server.js | `service: 'swarm-verifier'` | `service: 'swarm-sentinel'` |
| apps/agents/deploy/manifests/swarm-verifier.yaml | filename + all contents | rename + update |
| apps/agents/deploy/dist/webhook-receiver.js | `'swarm-verifier': 'swarm-verifier'` | `'swarm-sentinel': 'swarm-sentinel'` |

---

## Migration Steps

### Phase 1: Code Changes (Non-Breaking)

#### 1.1 Update ecosystem.config.js
```javascript
// OLD
{ name: 'swarm-verifier', cwd: '/opt/swarm-app/apps/agents/sentinel', ... }

// NEW
{ name: 'swarm-sentinel', cwd: '/opt/swarm-app/apps/agents/sentinel', ... }
```

#### 1.2 Rename verifier-client.js → sentinel-client.js
```bash
mv packages/engine/lib/verifier-client.js packages/engine/lib/sentinel-client.js
```

Update internal exports to use more descriptive names:
```javascript
// NEW sentinel-client.js
export async function runSentinelVerification(params) { ... }
export async function isSentinelHealthy() { ... }

// Backward compatibility aliases
export { runSentinelVerification as verify };
export { isSentinelHealthy as isVerifierHealthy };
```

#### 1.3 Update engine.js imports
```javascript
// OLD
import { verify, formatFeedbackForRetry, isVerifierHealthy, MAX_ATTEMPTS } from './verifier-client.js';

// NEW  
import { runSentinelVerification as verify, formatFeedbackForRetry, isSentinelHealthy as isVerifierHealthy, MAX_ATTEMPTS } from './sentinel-client.js';
```

#### 1.4 Update sentinel/server.js service name
```javascript
// OLD
console.log(JSON.stringify({ service: 'swarm-verifier', ... }));

// NEW
console.log(JSON.stringify({ service: 'swarm-sentinel', ... }));
```

#### 1.5 Rename deploy manifest
```bash
mv apps/agents/deploy/manifests/swarm-verifier.yaml apps/agents/deploy/manifests/swarm-sentinel.yaml
```

Update contents:
```yaml
service:
  name: swarm-sentinel
  description: "Sentinel verification and code review agent"
  pm2_name: swarm-sentinel
  port: 3006
  
repository:
  path: /opt/swarm-app/apps/agents/sentinel
  github: corynaegle-ai/swarm-app  # Part of monorepo
  branch: main
```

#### 1.6 Update webhook-receiver.js (TypeScript source)
```typescript
// OLD
const REPO_TO_SERVICE = {
    'swarm-verifier': 'swarm-verifier',
    ...
};

// NEW
const REPO_TO_SERVICE = {
    'swarm-sentinel': 'swarm-sentinel',
    ...
};
```

### Phase 2: PM2 Migration (Requires Restart)

```bash
# Stop old process
pm2 stop swarm-verifier
pm2 delete swarm-verifier

# Start with new name
pm2 start ecosystem.config.js --only swarm-sentinel

# Save PM2 config
pm2 save
```

### Phase 3: Documentation Updates

Files to update (bulk search/replace):
```bash
grep -rl "swarm-verifier" /opt/swarm-app/docs --include="*.md" | head -30
```

Key documentation files:
- docs/runbooks.md
- docs/documentation/components/sentinel-agent.md
- docs/prompts/*.md (multiple files)
- INVESTIGATION.md

### Phase 4: Verification

```bash
# 1. Verify PM2 process
pm2 list | grep sentinel

# 2. Test health endpoint
curl http://localhost:3006/health

# 3. Run engine test cycle
node packages/engine/test/integration/sentinel-test.js

# 4. Verify logs are tagged correctly
pm2 logs swarm-sentinel --lines 5
```

### Phase 5: Cleanup (Safe to Delete After 48h)

Files to delete after migration is verified:
```
/opt/swarm-app/apps/agents/deploy/manifests/swarm-verifier.yaml (if not renamed)
/opt/swarm-app/packages/engine/lib/verifier-client.js (after rename)
/opt/swarm-app/docs/engine/verifier-client.js (stale copy)
```

---

## Rollback Plan

If issues occur:
```bash
# Revert PM2
pm2 stop swarm-sentinel
pm2 delete swarm-sentinel
pm2 start ecosystem.config.js --only swarm-verifier
pm2 save

# Git revert (if committed)
git revert HEAD
```

---

## Migration Checklist

- [x] Update ecosystem.config.js
- [x] Rename verifier-client.js → sentinel-client.js
- [x] Update engine.js imports
- [x] Update sentinel/server.js service name
- [x] Rename deploy manifest
- [x] Update webhook-receiver.ts and rebuild
- [x] Restart PM2 with new name
- [x] Update documentation (bulk replace)
- [x] Run integration tests (health check confirmed)
- [x] Delete stale files (docs/engine renamed, backup removed)

---

## Environment Applicability

| Droplet | IP | Apply Migration? |
|---------|-----|------------------|
| DEV | 134.199.235.140 | ✅ COMPLETED 2025-12-28 |
| PROD | 146.190.35.235 | After DEV verified |

---

*Created: 2025-12-27*
*Completed DEV: 2025-12-28*
*Status: DEV COMPLETE - Ready for PROD*
