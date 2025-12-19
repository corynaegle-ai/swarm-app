# PostgreSQL Migration Continuation Prompt

## Context
You are continuing the PostgreSQL migration for Swarm Platform. The ai-dispatcher.js service was just migrated successfully.

## Task
Migrate the remaining 3 service files from SQLite to PostgreSQL:

1. `services/mcp-ticket-generator.js`
2. `services/repoAnalysis.js`
3. `services/ticket-generator.js`

## Migration Pattern
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

## Key Changes
- Change `?` placeholders to `$1, $2, ...` positional params
- Change `datetime('now')` to `NOW()`
- Ensure calling functions are `async`
- `.get()` → `await queryOne()`
- `.all()` → `await queryAll()`
- `.run()` → `await execute()`

## Workflow
1. SSH to dev droplet and count getDb() calls in each file:
   ```bash
   ssh -i ~/.ssh/swarm_key root@134.199.235.140 "grep -n 'getDb()' /opt/swarm-platform/services/mcp-ticket-generator.js | head -20"
   ```

2. Read file in chunks via SSH (50 lines at a time)

3. Write migrated file locally to `/Users/cory.naegle/swarm-platform-local/`

4. Deploy via rsync:
   ```bash
   rsync -avz -e "ssh -i ~/.ssh/swarm_key" /Users/cory.naegle/swarm-platform-local/FILE.js root@134.199.235.140:/opt/swarm-platform/services/FILE.js
   ```

5. Restart and verify:
   ```bash
   ssh -i ~/.ssh/swarm_key root@134.199.235.140 "export PATH=/root/.nvm/versions/node/v22.21.1/bin:\$PATH && pm2 restart swarm-platform-dev && sleep 2 && pm2 logs swarm-platform-dev --err --lines 15 --nostream"
   ```

6. Update migration guide when done

## Environment
- DEV Droplet: 134.199.235.140
- Node Path: `/root/.nvm/versions/node/v22.21.1/bin`
- Local work dir: `/Users/cory.naegle/swarm-platform-local/`
- Migration guide: `/Users/cory.naegle/swarm-specs-local/migrations/postgresql-migration-guide.md`

## Start Command
First, identify how many getDb() calls are in each remaining file:
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 "for f in mcp-ticket-generator.js repoAnalysis.js ticket-generator.js; do echo \"=== \$f ===\"; grep -c 'getDb()' /opt/swarm-platform/services/\$f 2>/dev/null || echo 0; done"
```

Then pick the smallest file to migrate first.
