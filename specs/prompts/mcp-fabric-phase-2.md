# MCP Fabric Phase 2: Package Caching & Credentials

## Context

Phase 1 of MCP Fabric is COMPLETE on the dev droplet (134.199.235.140). The following is operational:

### Phase 1 Deliverables (Complete)
- **PostgreSQL Database**: `mcp_fabric` with schema `mcp_fabric.*`
- **Registry Sync**: 55+ servers synced from `registry.modelcontextprotocol.io`
- **REST API**: Running on port 8085 via PM2 (`swarm-mcp`)
- **Daily Cron**: Auto-sync at 3 AM UTC

### Current Infrastructure
```
Location: /opt/swarm-mcp
Database: postgresql://swarm:swarm_dev_2024@localhost:5432/mcp_fabric
PM2 Process: swarm-mcp (port 8085)
Schema: mcp_fabric.servers, server_packages, server_env_vars, server_categories, server_remotes, sync_history, credential_docs
```

### Phase 1 API Endpoints (Working)
- GET /api/mcp/servers - List/search servers
- GET /api/mcp/servers/:id - Server details
- GET /api/mcp/servers/:id/credentials - Credential docs
- GET /api/mcp/categories - List categories
- GET /api/mcp/sync/status - Sync status
- POST /api/mcp/sync/trigger - Manual sync

---

## Phase 2 Requirements

### Goal
Enable Swarm to **download and cache MCP server packages** (npm, pypi, docker) locally, and **securely store user credentials** for MCP server configuration.

### Component 1: Package Cache System

Create a package caching layer that:
1. Downloads npm/pypi packages on-demand when a server is selected
2. Stores packages in `/opt/swarm-mcp/cache/{registry_type}/{package_name}/{version}/`
3. Verifies checksums before use
4. Tracks cache status in `mcp_fabric.server_packages` (columns already exist: `cached_at`, `cache_path`, `cache_size_bytes`, `cache_checksum`)

**New Tables**: None required (columns exist)

**New Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mcp/servers/:id/cache` | Trigger package download |
| GET | `/api/mcp/servers/:id/cache/status` | Check cache status |
| DELETE | `/api/mcp/servers/:id/cache` | Clear cached package |
| GET | `/api/mcp/cache/stats` | Overall cache statistics |

**New Service**: `/opt/swarm-mcp/src/cache/package-cache.ts`
- `downloadNpmPackage(identifier: string, version: string): Promise<CacheResult>`
- `downloadPypiPackage(identifier: string, version: string): Promise<CacheResult>`
- `verifyChecksum(path: string, expected: string): Promise<boolean>`
- `getCacheStats(): Promise<CacheStats>`

### Component 2: Credential Storage

Create encrypted credential storage for user-specific MCP server configurations:

**New Schema**: `credentials` (separate from `mcp_fabric`)
```sql
CREATE SCHEMA IF NOT EXISTS credentials;

CREATE TABLE credentials.mcp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                    -- Swarm user ID
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id),
  env_var TEXT NOT NULL,                    -- e.g., "NOTION_API_KEY"
  encrypted_value TEXT NOT NULL,            -- AES-256-GCM encrypted
  iv TEXT NOT NULL,                         -- Initialization vector
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, server_id, env_var)
);

CREATE INDEX idx_creds_user ON credentials.mcp_credentials(user_id);
CREATE INDEX idx_creds_server ON credentials.mcp_credentials(server_id);
```

**New Endpoints**:
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mcp/credentials` | Store encrypted credential |
| GET | `/api/mcp/credentials/:userId/:serverId` | Get credential metadata (not values) |
| DELETE | `/api/mcp/credentials/:userId/:serverId/:envVar` | Delete credential |
| POST | `/api/mcp/credentials/:userId/:serverId/decrypt` | Decrypt for VM injection (internal only) |

**Encryption**:
- Use `crypto.createCipheriv('aes-256-gcm', key, iv)`
- Key derived from `CREDENTIAL_ENCRYPTION_KEY` env var
- Never log or return decrypted values in API responses

**New Service**: `/opt/swarm-mcp/src/credentials/credential-store.ts`

---

## Implementation Steps

1. **Create migration** `/opt/swarm-mcp/migrations/002_credentials_schema.sql`
2. **Create cache service** `/opt/swarm-mcp/src/cache/package-cache.ts`
3. **Create credential service** `/opt/swarm-mcp/src/credentials/credential-store.ts`
4. **Add routes** to `/opt/swarm-mcp/src/api/routes.ts`
5. **Update .env** with `CREDENTIAL_ENCRYPTION_KEY`
6. **Test all endpoints**
7. **Update session notes**

---

## Dev Droplet Access
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
cd /opt/swarm-mcp
```

## Spec Location
Full Phase 1 spec: `/opt/swarm-specs/specs/mcp-fabric/phase-1-registry-integration.md`

## Success Criteria
- [ ] npm packages download and cache correctly
- [ ] pypi packages download and cache correctly  
- [ ] Cache status tracked in database
- [ ] Credentials encrypted at rest
- [ ] Decrypt endpoint works for VM injection
- [ ] All new endpoints return proper responses
- [ ] PM2 process stable after changes
