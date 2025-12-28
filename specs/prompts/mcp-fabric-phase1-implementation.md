# MCP Fabric Phase 1 Implementation Prompt

## Context

You are implementing Phase 1 of the Swarm MCP Fabric - a registry sync service that mirrors the official MCP Registry into Swarm's PostgreSQL database. This enables Swarm to discover and integrate with hundreds of existing MCP servers (Notion, GitHub, Slack, etc.) without rebuilding them.

## Spec Location

The full specification is at:
```
/opt/swarm-specs/specs/mcp-fabric/phase-1-registry-integration.md
```

Pull latest and read it:
```bash
cd /opt/swarm-specs && git pull origin main
cat specs/mcp-fabric/phase-1-registry-integration.md
```

## What You're Building

### 1. PostgreSQL Schema (`mcp_fabric` schema)
- `servers` - Core metadata synced from registry
- `server_packages` - npm/pypi/docker package info
- `server_env_vars` - Required environment variables
- `server_categories` - Auto-extracted categories
- `server_remotes` - HTTP endpoints
- `sync_history` - Audit log
- `credential_docs` - Human-curated setup instructions

### 2. Sync Service (Node.js/TypeScript)
- `MCPRegistryClient` - Paginated client for `registry.modelcontextprotocol.io/v0`
- `SyncService` - Full sync with upsert, category extraction, deprecation handling
- Cron job for daily sync at 3 AM UTC

### 3. REST API (Express)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/servers` | List/search servers |
| GET | `/api/mcp/servers/:id` | Get server details |
| GET | `/api/mcp/servers/:id/credentials` | Get credential setup docs |
| GET | `/api/mcp/categories` | List all categories |
| GET | `/api/mcp/sync/status` | Get last sync status |
| POST | `/api/mcp/sync/trigger` | Manually trigger sync |

### 4. Seed Data
Curated credential documentation for top 10 servers (Notion, GitHub, Slack, Linear, OpenAI, Anthropic, AWS, Stripe, Supabase).

## Directory Structure

Create this on the dev droplet:
```
/opt/swarm-mcp/
├── package.json
├── tsconfig.json
├── ecosystem.config.js
├── .env
├── migrations/
│   └── 001_initial_schema.sql
├── seed/
│   └── credential-docs.sql
└── src/
    ├── index.ts
    ├── config.ts
    ├── db/
    │   └── index.ts
    ├── sync/
    │   ├── registry-client.ts
    │   └── sync-service.ts
    └── api/
        └── routes.ts
```

## Environment

- **Dev Droplet**: 134.199.235.140
- **PostgreSQL**: Already running, database `swarm`, user `swarm`
- **Node Path**: `/root/.nvm/versions/node/v22.21.1/bin`
- **Port**: 8085 (standalone service)

## Implementation Order

### Step 1: Setup Project
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
mkdir -p /opt/swarm-mcp/{src/{db,sync,api},migrations,seed}
cd /opt/swarm-mcp
npm init -y
npm install express pg node-cron node-fetch@2
npm install -D typescript @types/express @types/node @types/pg ts-node
npx tsc --init
```

### Step 2: Run Migration
Create and execute the PostgreSQL schema from the spec.

### Step 3: Build Registry Client
Implement `MCPRegistryClient` with async generator for pagination.

### Step 4: Build Sync Service
Implement `SyncService` with upsert logic and category extraction.

### Step 5: Build API Routes
Implement all 6 endpoints with proper error handling.

### Step 6: Wire Up Entry Point
Create `src/index.ts` with Express app, cron scheduler, and initial sync.

### Step 7: Insert Seed Data
Run the credential docs seed SQL.

### Step 8: Test & Deploy
Run integration tests, configure PM2, verify cron works.

## Key Technical Details

### Registry API
```bash
# List servers (paginated)
curl "https://registry.modelcontextprotocol.io/v0/servers?limit=100"

# Response format
{
  "servers": [{ "server": { "name": "...", "packages": [...] } }],
  "nextCursor": "abc123"
}
```

### Category Extraction
Auto-detect categories from server name/description:
- "productivity": notion, slack, calendar, gmail, asana
- "devtools": github, gitlab, jira, linear, sentry
- "database": postgres, mysql, sqlite, mongodb, redis
- "cloud": aws, gcp, azure, kubernetes, docker
- "ai": openai, anthropic, huggingface, llm

### Credential Docs Schema
```sql
CREATE TABLE mcp_fabric.credential_docs (
  server_id TEXT REFERENCES mcp_fabric.servers(id),
  env_var_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  instructions_md TEXT NOT NULL,
  obtain_url TEXT,
  format_hint TEXT,
  validation_regex TEXT,
  is_curated BOOLEAN DEFAULT FALSE
);
```

## Success Criteria

- [ ] Schema created in PostgreSQL
- [ ] Full sync completes in < 5 minutes
- [ ] All 6 API endpoints working
- [ ] Search returns relevant results
- [ ] Top 10 credential docs inserted
- [ ] PM2 process running
- [ ] Daily cron scheduled

## Anti-Freeze Protocol

- Max 60s SSH timeouts
- Max 3 chained commands
- Pipe large outputs through `head -50`
- Checkpoint progress frequently
- Use `scp` for file transfers, never heredoc

## Session Notes

Update session notes after completing each step:
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
cd /opt/swarm-specs && git pull
# Edit session-notes/current.md
git add -A && git commit -m "Phase 1 progress: [step]" && git push
```

## Start Command

Begin by reading the full spec, then create the project structure:

```bash
# On dev droplet
cd /opt/swarm-specs && git pull origin main
head -200 specs/mcp-fabric/phase-1-registry-integration.md

# Then create project
mkdir -p /opt/swarm-mcp
cd /opt/swarm-mcp
# ... continue with Step 1
```
