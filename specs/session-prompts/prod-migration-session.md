# Session Prompt: PROD PostgreSQL Schema Migration

## Context
We completed a schema comparison between DEV (134.199.235.140) and PROD (146.190.35.235) PostgreSQL databases. PROD is missing 15 tables, the pgvector extension, and ~30 columns across existing tables.

## Files Created (Local)
Two migration files are ready in `/Users/cory.naegle/swarm-specs-local/migrations/`:

1. **`prod-sync-migration-plan.md`** - Detailed documentation of all differences
2. **`020_prod_schema_sync.sql`** - Executable SQL migration (306 lines)

## Task
1. **Push to git** - Commit and push the migration files from local swarm-specs-local repo
2. **Pull on PROD** - Git pull in `/opt/swarm-specs` on PROD droplet
3. **Copy migration** - Copy SQL file to `/opt/swarm-app/apps/platform/migrations/`
4. **Run migration** - Execute as postgres superuser on swarmdb
5. **Verify** - Confirm table count, column additions, and extension installation

## Commands Reference

```bash
# 1. Local git push (from Mac)
cd /Users/cory.naegle/swarm-specs-local
git add migrations/
git commit -m "Add PROD schema sync migration 020"
git push

# 2. SSH to PROD and pull
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.nvm/versions/node/v22.12.0/bin
cd /opt/swarm-specs && git pull

# 3. Copy migration file
cp /opt/swarm-specs/migrations/020_prod_schema_sync.sql /opt/swarm-app/apps/platform/migrations/

# 4. Run migration
sudo -u postgres psql -d swarmdb -f /opt/swarm-app/apps/platform/migrations/020_prod_schema_sync.sql

# 5. Verify
sudo -u postgres psql -d swarmdb -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
# Expected: 29 tables

sudo -u postgres psql -d swarmdb -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tickets';"
# Expected: 47 columns

sudo -u postgres psql -d swarmdb -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
# Expected: vector
```

## Key Schema Changes
- **15 new tables**: agent_executions, backlog_items, backlog_attachments, mcp_servers, mcp_server_logs, mcp_test_runs, mcp_migrations, rag_repositories, code_chunks, raptor_nodes, ticket_dependencies, ticket_events, ticket_activity, vm_assignments, execution_artifacts
- **Extension**: pgvector for RAG embeddings
- **Rename**: `agents` → `agent_instances`
- **New columns**: 14 on tickets, 8 on projects, 7 on hitl_sessions, 1 on hitl_messages

## Rollback (if needed)
Each phase in the SQL is idempotent (IF NOT EXISTS / IF EXISTS). To rollback specific tables:
```sql
DROP TABLE IF EXISTS <table_name> CASCADE;
```
