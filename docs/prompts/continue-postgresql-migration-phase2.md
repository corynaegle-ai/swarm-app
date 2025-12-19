# PostgreSQL Migration Phase 2 - Remaining Files

## Context
Services migration is complete. Three non-service files still use deprecated `getDb()` SQLite calls.

## Task
Migrate these remaining files from SQLite to PostgreSQL:

| File | getDb() calls | Priority |
|------|---------------|----------|
| `websocket.js` | 1 | Start here (smallest) |
| `lib/agent-learning.js` | 2 | Medium |
| `agents/clarification-agent.js` | 4 | Last (most complex) |

## Migration Pattern
```javascript
// BEFORE (sync SQLite)
const { getDb } = require('./db');  // or '../db'
const db = getDb();
const row = db.prepare('SELECT * FROM x WHERE id = ?').get(id);
const rows = db.prepare('SELECT * FROM x WHERE y = ?').all(y);
db.prepare('UPDATE x SET y = ? WHERE id = ?').run(y, id);

// AFTER (async PostgreSQL)  
const { queryAll, queryOne, execute, getPool } = require('./db');
const row = await queryOne('SELECT * FROM x WHERE id = $1', [id]);
const rows = await queryAll('SELECT * FROM x WHERE y = $1', [y]);
await execute('UPDATE x SET y = $1 WHERE id = $2', [y, id]);

// For transactions:
const pool = getPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... queries using client.query()
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

## Key Changes Checklist
- [ ] Change `?` placeholders to `$1, $2, ...` positional params
- [ ] Change `datetime('now')` to `NOW()`
- [ ] Ensure calling functions are `async`
- [ ] `.get()` → `await queryOne()`
- [ ] `.all()` → `await queryAll()`
- [ ] `.run()` → `await execute()`

## Workflow

### 1. Analyze file
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "wc -l /opt/swarm-platform/FILE && grep -n 'getDb\|\.prepare\|\.get(\|\.all(\|\.run(' /opt/swarm-platform/FILE | head -30"
```

### 2. Read file in chunks (50 lines max)
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "head -50 /opt/swarm-platform/FILE"
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "sed -n '50,100p' /opt/swarm-platform/FILE"
```

### 3. Write migrated file locally
```
/Users/cory.naegle/swarm-platform-local/
```

### 4. Deploy via rsync (NEVER use heredoc or scp)
```bash
rsync -avz -e "ssh -i ~/.ssh/swarm_key" /Users/cory.naegle/swarm-platform-local/FILE root@134.199.235.140:/opt/swarm-platform/FILE
```

### 5. Restart and verify
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 restart swarm-platform-dev && sleep 2 && pm2 logs swarm-platform-dev --err --lines 15 --nostream"
```

### 6. Verify no remaining getDb calls
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -r 'getDb()' /opt/swarm-platform/ --include='*.js' | grep -v node_modules | grep -v 'db.js'"
```

## Environment
- DEV Droplet: 134.199.235.140
- Node Path: `/root/.nvm/versions/node/v22.21.1/bin`
- Local work dir: `/Users/cory.naegle/swarm-platform-local/`
- Migration guide: `/Users/cory.naegle/swarm-specs-local/migrations/postgresql-migration-guide.md`

## Start Command
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "wc -l /opt/swarm-platform/websocket.js && grep -n 'getDb\|\.prepare' /opt/swarm-platform/websocket.js"
```

## Success Criteria
- No `getDb()` calls remain (except in db.js definition)
- `pm2 logs` shows no DEPRECATED warnings
- Server starts without errors
- Migration guide updated to 100% complete
