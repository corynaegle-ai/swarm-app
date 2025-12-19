# Finish PostgreSQL Migration - Final Cleanup

## Context
All files have been migrated from SQLite `getDb()` to PostgreSQL async methods. However, the `DEPRECATED: getDb() called` warning still appears in PM2 logs, indicating something is still calling the deprecated function.

## Current State
- ✅ All service files migrated (hitl-service.js, session-service.js, etc.)
- ✅ websocket.js - already using `queryOne`
- ✅ lib/agent-learning.js - already using `execute`
- ✅ agents/clarification-agent.js - migrated to `queryAll`/`execute`
- ⚠️ DEPRECATED warning still appearing in logs

## Task
1. Find the remaining `getDb()` caller(s)
2. Migrate any remaining files
3. Remove the deprecated `getDb()` function from db.js entirely
4. Verify clean startup with no deprecation warnings

## Diagnostic Commands

### Find ALL getDb references (including indirect)
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -rn 'getDb' /opt/swarm-platform/ --include='*.js' | grep -v node_modules"
```

### Check which file is actually calling getDb at runtime
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 restart swarm-platform-dev && sleep 2 && pm2 logs swarm-platform-dev --lines 50 --nostream 2>&1 | grep -A5 -B5 DEPRECATED"
```

### Check db.js for the deprecation warning location
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'DEPRECATED\|getDb' /opt/swarm-platform/db.js | head -20"
```

### Search for require statements that pull getDb
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -rn \"require.*db.*getDb\|{ getDb }\" /opt/swarm-platform/ --include='*.js' | grep -v node_modules"
```

## Likely Culprits
Check these locations that may have been missed:
- `routes/*.js` - API route handlers
- `middleware/*.js` - Express middleware
- `index.js` or `server.js` - Main entry point
- Any file that imports from `./db` or `../db`

## Migration Pattern Reference
```javascript
// BEFORE (sync SQLite)
const { getDb } = require('./db');
const db = getDb();
const row = db.prepare('SELECT * FROM x WHERE id = ?').get(id);

// AFTER (async PostgreSQL)  
const { queryOne, queryAll, execute } = require('./db');
const row = await queryOne('SELECT * FROM x WHERE id = $1', [id]);
```

## Final Cleanup - Remove getDb from db.js
Once all callers are migrated, edit `/opt/swarm-platform/db.js`:
1. Remove the `getDb()` function definition
2. Remove `getDb` from the `module.exports`
3. Restart and verify clean logs

## Verification Commands
```bash
# Restart and check for clean startup
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 restart swarm-platform-dev && sleep 3 && pm2 logs swarm-platform-dev --lines 30 --nostream"

# Confirm no getDb references remain (except db.js definition if not yet removed)
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -r 'getDb' /opt/swarm-platform/ --include='*.js' | grep -v node_modules | grep -v 'function getDb'"
```

## Success Criteria
- [ ] No `DEPRECATED: getDb() called` warnings in PM2 logs
- [ ] No `getDb` imports in any file except db.js
- [ ] Server starts cleanly without errors
- [ ] All HITL endpoints functional (test via dashboard)

## Environment
- DEV Droplet: 134.199.235.140
- Node Path: `/root/.nvm/versions/node/v22.21.1/bin`
- Local work dir: `/Users/cory.naegle/swarm-platform-local/`
