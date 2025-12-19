# PostgreSQL Migration Guide - Swarm Platform

> **Session Prompt Document** - Provides full context for continuing PostgreSQL migration work

## Critical Directives

```
⚠️  NEVER use heredoc (<<EOF) for file transfers - causes formatting corruption
⚠️  NEVER use scp for file transfers  
✅  ALWAYS use rsync for copying files to droplet
✅  ALWAYS write files locally first with Desktop Commander, then rsync
```

---

## Environment Context

| Property | Value |
|----------|-------|
| DEV Droplet IP | 134.199.235.140 |
| PROD Droplet IP | 146.190.35.235 (DO NOT DEPLOY DIRECTLY) |
| Node Path (DEV) | `/root/.nvm/versions/node/v22.21.1/bin` |
| PostgreSQL DB | `swarmdb` |
| PostgreSQL User/Pass | `swarm` / `swarm_dev_2024` |
| PM2 Process | `swarm-platform-dev` |

---

## Current Migration Status

### Last Updated: 2025-12-17 23:32 UTC

### Overall Progress: ~85% Complete

## Routes - ALL MIGRATED ✅

| File | Status |
|------|--------|
| `routes/design.js` | ✅ Migrated 2025-12-17 |
| `routes/mcp.js` | ✅ Migrated 2025-12-17 |
| `routes/tickets.js` | ✅ Already migrated |
| `routes/projects.js` | ✅ Already migrated |
| `routes/auth.js` | ✅ Already migrated |
| `routes/hitl.js` | ✅ Already migrated |
| `routes/health.js` | ✅ Already migrated |
| `routes/repo.js` | ✅ Already migrated |
| `routes/agents.js` | ✅ Already migrated |

## Services - ALL MIGRATED ✅

| File | getDb() calls | Lines | Status |
|------|---------------|-------|--------|
| `services/ai-dispatcher.js` | 9→0 | 1073 | ✅ Migrated 2025-12-17 |
| `services/mcp-ticket-generator.js` | 3→0 | 193 | ✅ Migrated 2025-12-17 |
| `services/repoAnalysis.js` | 1→0 | 229 | ✅ Migrated 2025-12-17 |
| `services/ticket-generator.js` | 4→0 | 278 | ✅ Migrated 2025-12-17 |

## Remaining Files (Not in Services)

| File | getDb() calls | Status |
|------|---------------|--------|
| `agents/clarification-agent.js` | 4 | ❌ NEEDS MIGRATION |
| `lib/agent-learning.js` | 2 | ❌ NEEDS MIGRATION |
| `websocket.js` | 1 | ❌ NEEDS MIGRATION |

---

## Next Session: Migrate remaining services

### Migration Pattern
```javascript
// BEFORE (sync SQLite)
const { getDb } = require('../db');
const db = getDb();
const row = db.prepare('SELECT * FROM x WHERE id = ?').get(id);
const rows = db.prepare('SELECT * FROM x WHERE y = ?').all(y);
db.prepare('UPDATE x SET y = ? WHERE id = ?').run(y, id);

// AFTER (async PostgreSQL)  
const { queryAll, queryOne, execute } = require('../db');
const row = await queryOne('SELECT * FROM x WHERE id = $1', [id]);
const rows = await queryAll('SELECT * FROM x WHERE y = $1', [y]);
await execute('UPDATE x SET y = $1 WHERE id = $2', [y, id]);
```

### Key Changes for ai-dispatcher.js Migration
- Changed import from `getDb` to `queryAll, queryOne, execute`
- Converted 9 sync getDb() calls to async PostgreSQL methods
- Changed `datetime('now')` to `NOW()` for PostgreSQL
- Changed `?` placeholders to `$1, $2, ...` positional params
- Ensured all calling functions are async

---

## Quick Commands

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Find remaining getDb usage
grep -l 'getDb()' /opt/swarm-platform/services/*.js

# Restart and check
pm2 restart swarm-platform-dev && pm2 logs --err --lines 20 --nostream

# Test health
curl -s http://localhost:8080/health
```

---

*Last updated: 2025-12-17 23:32 UTC*
