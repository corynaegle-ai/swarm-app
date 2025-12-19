# Phase 1: Create Users Table with OAuth-Ready Schema

**Project**: Swarm Dashboard Authentication
**Phase**: 1 of 7
**Estimated Time**: 10-15 minutes

---

## Context

Swarm is a distributed AI agent platform running on a DigitalOcean droplet. The dashboard (`/opt/swarm-tickets/api-server-dashboard.js`) needs authentication. This phase adds the users table to the existing SQLite database.

## Objective

Add a users table to `/opt/swarm-tickets/data/tickets.db` with OAuth-ready schema.

## Target Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  oauth_provider TEXT,
  oauth_id TEXT,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth 
  ON users(oauth_provider, oauth_id) 
  WHERE oauth_provider IS NOT NULL;
```

## Implementation Steps

1. SSH to droplet: `ssh -i ~/.ssh/swarm_key root@146.190.35.235`
2. Navigate to: `cd /opt/swarm-tickets`
3. Add table creation to database initialization in `api-server-dashboard.js`
4. Restart the API server to apply changes
5. Verify table exists: `sqlite3 data/tickets.db ".schema users"`

## Success Criteria

- [ ] Users table exists in tickets.db
- [ ] Schema matches specification (all columns present)
- [ ] Unique index on oauth_provider + oauth_id created
- [ ] API server starts without errors

## Session Notes Update

After completion, update `/opt/swarm-specs/session-notes/current.md`:
- Change Step 1 status from ⏳ to ✅
- Add commit hash if changes were committed

## Anti-Freeze Protocol

- SSH timeout: 30s max
- Use `head -50` for file reads
- Checkpoint progress before complex operations
