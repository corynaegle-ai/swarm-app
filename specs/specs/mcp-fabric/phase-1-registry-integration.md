# MCP Fabric Phase 1: Registry Integration Specification

**Version**: 1.0.0  
**Status**: Draft  
**Author**: Neural + Alex Chen  
**Created**: 2024-12-23  
**Target Completion**: 1 Week

---

## Executive Summary

Phase 1 establishes the foundation of the Swarm MCP Fabric by implementing a sync service that mirrors the official MCP Registry (`registry.modelcontextprotocol.io`) into Swarm's PostgreSQL database. This enables fast local lookups, offline capability, and sets the stage for package caching and snapshot creation in subsequent phases.

---

## Goals

| Goal | Success Metric |
|------|----------------|
| Sync all MCP servers from official registry | 100% of public servers indexed |
| Sub-10ms local lookups | p99 latency < 10ms |
| Search by name, category, transport type | All filter combinations functional |
| Expose REST API for dashboard/workflows | 5 endpoints operational |
| Automated daily sync | Cron job running reliably |

---

## Non-Goals (Deferred to Later Phases)

- Package downloading/caching (Phase 2)
- VM snapshot creation (Phase 3)
- Runtime integration with orchestrator (Phase 4)
- Dashboard UI (Phase 5)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1 SCOPE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐      ┌──────────────────┐                │
│  │  Official MCP    │      │   Swarm MCP      │                │
│  │  Registry API    │─────▶│   Sync Service   │                │
│  │  (External)      │      │   (Node.js)      │                │
│  └──────────────────┘      └────────┬─────────┘                │
│                                     │                           │
│                                     ▼                           │
│                          ┌──────────────────┐                  │
│                          │   PostgreSQL     │                  │
│                          │   mcp_fabric     │                  │
│                          │   schema         │                  │
│                          └────────┬─────────┘                  │
│                                   │                             │
│                                   ▼                             │
│                          ┌──────────────────┐                  │
│                          │  Swarm Dev API   │                  │
│                          │  /api/mcp/*      │                  │
│                          └──────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component 1: Database Schema

**Location**: `/opt/swarm-mcp/migrations/001_initial_schema.sql`

```sql
-- Create dedicated schema
CREATE SCHEMA IF NOT EXISTS mcp_fabric;
SET search_path TO mcp_fabric, public;

-----------------------------------------------------------
-- Core Tables
-----------------------------------------------------------

CREATE TABLE mcp_fabric.servers (
  id TEXT PRIMARY KEY,                    -- "io.github.anthropics/notion-mcp-server"
  name TEXT NOT NULL,                     -- Display name from registry
  title TEXT,                             -- Human-friendly title
  description TEXT,
  version TEXT NOT NULL,
  repository_url TEXT,
  repository_source TEXT,                 -- "github", "gitlab", etc.
  
  -- Sync metadata
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  registry_created_at TIMESTAMPTZ,
  registry_updated_at TIMESTAMPTZ,
  
  -- Swarm extensions
  popularity_score INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  is_deprecated BOOLEAN DEFAULT FALSE,
  
  -- Full JSON blob from registry
  raw_metadata JSONB
);

CREATE TABLE mcp_fabric.server_packages (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  registry_type TEXT NOT NULL,            -- 'npm', 'pypi', 'docker'
  identifier TEXT NOT NULL,               -- "@anthropic/notion-mcp-server"
  version TEXT NOT NULL,
  transport_type TEXT NOT NULL,           -- 'stdio', 'streamable-http'
  transport_config JSONB,
  runtime TEXT,                           -- 'node', 'python', 'binary'
  runtime_version TEXT,
  
  -- Cache status (for Phase 2)
  cached_at TIMESTAMPTZ,
  cache_path TEXT,
  cache_size_bytes BIGINT,
  cache_checksum TEXT,
  
  UNIQUE(server_id, registry_type, identifier)
);

CREATE TABLE mcp_fabric.server_env_vars (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT TRUE,
  default_value TEXT,
  UNIQUE(server_id, name)
);

CREATE TABLE mcp_fabric.server_categories (
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY(server_id, category)
);

CREATE TABLE mcp_fabric.server_remotes (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  remote_type TEXT NOT NULL,
  url TEXT NOT NULL,
  UNIQUE(server_id, url)
);

CREATE TABLE mcp_fabric.sync_history (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  servers_added INTEGER DEFAULT 0,
  servers_updated INTEGER DEFAULT 0,
  servers_removed INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB
);

-----------------------------------------------------------
-- Indexes
-----------------------------------------------------------

CREATE INDEX idx_servers_name ON mcp_fabric.servers(name);
CREATE INDEX idx_servers_popularity ON mcp_fabric.servers(popularity_score DESC);
CREATE INDEX idx_servers_use_count ON mcp_fabric.servers(use_count DESC);
CREATE INDEX idx_packages_registry ON mcp_fabric.server_packages(registry_type);
CREATE INDEX idx_packages_transport ON mcp_fabric.server_packages(transport_type);
CREATE INDEX idx_categories_category ON mcp_fabric.server_categories(category);

-- Full-text search
CREATE INDEX idx_servers_search ON mcp_fabric.servers 
  USING GIN(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));
```


---

## Component 2: Registry Client

**Location**: `/opt/swarm-mcp/src/sync/registry-client.ts`

```typescript
import fetch from 'node-fetch';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0';

export interface RegistryServer {
  name: string;
  title?: string;
  description?: string;
  version: string;
  repository?: { url: string; source: string };
  packages?: {
    registryType: 'npm' | 'pypi' | 'docker';
    identifier: string;
    version: string;
    transport: { type: 'stdio' | 'streamable-http'; args?: string[] };
  }[];
  remotes?: { type: string; url: string }[];
  environment?: { name: string; description?: string; required?: boolean }[];
}

export interface RegistryListResponse {
  servers: { server: RegistryServer }[];
  nextCursor?: string;
}

export class MCPRegistryClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = REGISTRY_BASE) {
    this.baseUrl = baseUrl;
  }
  
  async listServers(options: {
    limit?: number;
    cursor?: string;
    search?: string;
  } = {}): Promise<RegistryListResponse> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.search) params.set('search', options.search);
    
    const url = `${this.baseUrl}/servers?${params}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`Registry API error: ${response.status}`);
    }
    return response.json();
  }
  
  async *iterateAllServers(batchSize = 100): AsyncGenerator<RegistryServer> {
    let cursor: string | undefined;
    do {
      const response = await this.listServers({ limit: batchSize, cursor });
      for (const { server } of response.servers) {
        yield server;
      }
      cursor = response.nextCursor;
    } while (cursor);
  }
}
```

---

## Component 3: Sync Service

**Location**: `/opt/swarm-mcp/src/sync/sync-service.ts`

```typescript
import { Pool } from 'pg';
import { MCPRegistryClient, RegistryServer } from './registry-client';

export class SyncService {
  constructor(private db: Pool, private registry: MCPRegistryClient) {}
  
  async fullSync(): Promise<SyncResult> {
    const syncId = await this.startSyncRecord('full');
    
    try {
      let added = 0, updated = 0;
      const seenIds = new Set<string>();
      
      for await (const server of this.registry.iterateAllServers(100)) {
        seenIds.add(server.name);
        const result = await this.upsertServer(server);
        if (result === 'added') added++;
        else if (result === 'updated') updated++;
      }
      
      const removed = await this.markMissingServers(seenIds);
      await this.completeSyncRecord(syncId, { added, updated, removed });
      
      return { success: true, added, updated, removed };
    } catch (error) {
      await this.failSyncRecord(syncId, error as Error);
      throw error;
    }
  }
  
  private async upsertServer(server: RegistryServer): Promise<'added' | 'updated' | 'unchanged'> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      const existing = await client.query(
        'SELECT version FROM mcp_fabric.servers WHERE id = $1',
        [server.name]
      );
      
      const isNew = existing.rows.length === 0;
      const isUpdated = !isNew && existing.rows[0].version !== server.version;
      
      if (!isNew && !isUpdated) {
        await client.query('COMMIT');
        return 'unchanged';
      }
      
      // Upsert server
      await client.query(`
        INSERT INTO mcp_fabric.servers (id, name, title, description, version,
          repository_url, repository_source, synced_at, raw_metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, title = EXCLUDED.title, description = EXCLUDED.description,
          version = EXCLUDED.version, repository_url = EXCLUDED.repository_url,
          synced_at = NOW(), raw_metadata = EXCLUDED.raw_metadata
      `, [
        server.name, server.name.split('/').pop(), server.title, server.description,
        server.version, server.repository?.url, server.repository?.source, JSON.stringify(server)
      ]);
      
      // Sync packages
      await client.query('DELETE FROM mcp_fabric.server_packages WHERE server_id = $1', [server.name]);
      for (const pkg of server.packages || []) {
        await client.query(`
          INSERT INTO mcp_fabric.server_packages 
          (server_id, registry_type, identifier, version, transport_type, transport_config)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [server.name, pkg.registryType, pkg.identifier, pkg.version, 
            pkg.transport.type, JSON.stringify(pkg.transport)]);
      }
      
      // Sync env vars
      await client.query('DELETE FROM mcp_fabric.server_env_vars WHERE server_id = $1', [server.name]);
      for (const env of server.environment || []) {
        await client.query(`
          INSERT INTO mcp_fabric.server_env_vars (server_id, name, description, is_required)
          VALUES ($1, $2, $3, $4)
        `, [server.name, env.name, env.description, env.required !== false]);
      }
      
      // Extract categories
      const categories = this.extractCategories(server);
      await client.query('DELETE FROM mcp_fabric.server_categories WHERE server_id = $1', [server.name]);
      for (const cat of categories) {
        await client.query(
          'INSERT INTO mcp_fabric.server_categories (server_id, category) VALUES ($1, $2)',
          [server.name, cat]
        );
      }
      
      await client.query('COMMIT');
      return isNew ? 'added' : 'updated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  private extractCategories(server: RegistryServer): string[] {
    const categories: Set<string> = new Set();
    const text = `${server.name} ${server.description || ''}`.toLowerCase();
    
    const patterns: Record<string, string[]> = {
      'productivity': ['notion', 'slack', 'calendar', 'email', 'gmail', 'asana'],
      'devtools': ['github', 'gitlab', 'jira', 'linear', 'sentry'],
      'database': ['postgres', 'mysql', 'sqlite', 'mongodb', 'redis'],
      'cloud': ['aws', 'gcp', 'azure', 'kubernetes', 'docker'],
      'ai': ['openai', 'anthropic', 'huggingface', 'llm'],
      'filesystem': ['filesystem', 'file', 'directory', 'storage'],
      'web': ['fetch', 'browser', 'scrape', 'http', 'api']
    };
    
    for (const [cat, keywords] of Object.entries(patterns)) {
      if (keywords.some(k => text.includes(k))) categories.add(cat);
    }
    return Array.from(categories);
  }
  
  private async startSyncRecord(type: string): Promise<number> {
    const result = await this.db.query(
      `INSERT INTO mcp_fabric.sync_history (sync_type, status) VALUES ($1, 'running') RETURNING id`,
      [type]
    );
    return result.rows[0].id;
  }
  
  private async completeSyncRecord(id: number, stats: { added: number; updated: number; removed: number }) {
    await this.db.query(`
      UPDATE mcp_fabric.sync_history SET completed_at = NOW(), status = 'completed',
      servers_added = $2, servers_updated = $3, servers_removed = $4 WHERE id = $1
    `, [id, stats.added, stats.updated, stats.removed]);
  }
  
  private async failSyncRecord(id: number, error: Error) {
    await this.db.query(`
      UPDATE mcp_fabric.sync_history SET completed_at = NOW(), status = 'failed',
      error_message = $2 WHERE id = $1
    `, [id, error.message]);
  }
  
  private async markMissingServers(seenIds: Set<string>): Promise<number> {
    const result = await this.db.query(`
      UPDATE mcp_fabric.servers SET is_deprecated = TRUE
      WHERE id NOT IN (SELECT unnest($1::text[])) AND is_deprecated = FALSE
    `, [Array.from(seenIds)]);
    return result.rowCount || 0;
  }
}

interface SyncResult { success: boolean; added: number; updated: number; removed: number }
```


---

## Component 4: REST API

**Location**: `/opt/swarm-mcp/src/api/routes.ts`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/servers` | List/search servers |
| GET | `/api/mcp/servers/:id` | Get server details |
| GET | `/api/mcp/categories` | List all categories |
| GET | `/api/mcp/sync/status` | Get last sync status |
| POST | `/api/mcp/sync/trigger` | Manually trigger sync |

```typescript
import { Router } from 'express';
import { Pool } from 'pg';

export function createMCPRoutes(db: Pool): Router {
  const router = Router();
  
  // GET /api/mcp/servers
  router.get('/servers', async (req, res) => {
    const { search, category, registry_type, transport_type, limit = '50', offset = '0', sort = 'popularity' } = req.query;
    
    let query = `
      SELECT DISTINCT ON (s.id) s.id, s.name, s.title, s.description, s.version,
        s.popularity_score, s.use_count, s.is_verified,
        p.registry_type, p.identifier AS package_identifier, p.transport_type,
        array_agg(DISTINCT c.category) FILTER (WHERE c.category IS NOT NULL) AS categories
      FROM mcp_fabric.servers s
      LEFT JOIN mcp_fabric.server_packages p ON s.id = p.server_id
      LEFT JOIN mcp_fabric.server_categories c ON s.id = c.server_id
      WHERE s.is_deprecated = FALSE
    `;
    
    const params: any[] = [];
    let idx = 1;
    
    if (search) {
      query += ` AND (s.name ILIKE $${idx} OR s.description ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (category) { query += ` AND c.category = $${idx}`; params.push(category); idx++; }
    if (registry_type) { query += ` AND p.registry_type = $${idx}`; params.push(registry_type); idx++; }
    if (transport_type) { query += ` AND p.transport_type = $${idx}`; params.push(transport_type); idx++; }
    
    query += ` GROUP BY s.id, p.registry_type, p.identifier, p.transport_type`;
    
    const sortMap: Record<string, string> = {
      popularity: 'ORDER BY s.popularity_score DESC',
      name: 'ORDER BY s.name ASC',
      recent: 'ORDER BY s.synced_at DESC',
      usage: 'ORDER BY s.use_count DESC'
    };
    query += ` ${sortMap[sort as string] || sortMap.popularity}`;
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));
    
    const result = await db.query(query, params);
    res.json({ servers: result.rows, limit: +limit, offset: +offset });
  });
  
  // GET /api/mcp/servers/:id
  router.get('/servers/:id', async (req, res) => {
    const { id } = req.params;
    const server = await db.query('SELECT * FROM mcp_fabric.servers WHERE id = $1', [id]);
    if (!server.rows.length) return res.status(404).json({ error: 'Not found' });
    
    const [packages, envVars, categories, remotes] = await Promise.all([
      db.query('SELECT * FROM mcp_fabric.server_packages WHERE server_id = $1', [id]),
      db.query('SELECT * FROM mcp_fabric.server_env_vars WHERE server_id = $1', [id]),
      db.query('SELECT category FROM mcp_fabric.server_categories WHERE server_id = $1', [id]),
      db.query('SELECT * FROM mcp_fabric.server_remotes WHERE server_id = $1', [id])
    ]);
    
    // Track usage
    await db.query('UPDATE mcp_fabric.servers SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1', [id]);
    
    res.json({
      ...server.rows[0],
      packages: packages.rows,
      environment: envVars.rows,
      categories: categories.rows.map(r => r.category),
      remotes: remotes.rows
    });
  });
  
  // GET /api/mcp/categories
  router.get('/categories', async (req, res) => {
    const result = await db.query(`
      SELECT category, COUNT(*) as count FROM mcp_fabric.server_categories
      GROUP BY category ORDER BY count DESC
    `);
    res.json({ categories: result.rows });
  });
  
  // GET /api/mcp/sync/status
  router.get('/sync/status', async (req, res) => {
    const [syncs, count] = await Promise.all([
      db.query('SELECT * FROM mcp_fabric.sync_history ORDER BY started_at DESC LIMIT 10'),
      db.query('SELECT COUNT(*) FROM mcp_fabric.servers WHERE is_deprecated = FALSE')
    ]);
    res.json({ lastSyncs: syncs.rows, totalServers: +count.rows[0].count });
  });
  
  // POST /api/mcp/sync/trigger
  router.post('/sync/trigger', async (req, res) => {
    // Would trigger background sync
    res.json({ message: 'Sync triggered', status: 'queued' });
  });
  
  return router;
}
```

---

## Component 5: Service Entry Point

**Location**: `/opt/swarm-mcp/src/index.ts`

```typescript
import express from 'express';
import { Pool } from 'pg';
import cron from 'node-cron';
import { createMCPRoutes } from './api/routes';
import { MCPRegistryClient } from './sync/registry-client';
import { SyncService } from './sync/sync-service';

const app = express();
app.use(express.json());

const db = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'swarm',
  user: process.env.POSTGRES_USER || 'swarm',
  password: process.env.POSTGRES_PASSWORD,
  max: 10
});

const registryClient = new MCPRegistryClient();
const syncService = new SyncService(db, registryClient);

app.use('/api/mcp', createMCPRoutes(db));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'swarm-mcp' }));

// Daily sync at 3 AM UTC
cron.schedule('0 3 * * *', async () => {
  console.log('Starting scheduled sync...');
  const result = await syncService.fullSync();
  console.log('Sync completed:', result);
});

// Initial sync on startup
(async () => {
  console.log('Running initial sync...');
  await syncService.fullSync();
})();

const PORT = process.env.PORT || 8085;
app.listen(PORT, () => console.log(`Swarm MCP service on port ${PORT}`));
```


---

## Deployment

### File Structure
```
/opt/swarm-mcp/
├── package.json
├── tsconfig.json
├── ecosystem.config.js
├── .env
├── migrations/
│   └── 001_initial_schema.sql
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

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'swarm-mcp',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 8085,
      POSTGRES_HOST: 'localhost',
      POSTGRES_DB: 'swarm',
      POSTGRES_USER: 'swarm'
    }
  }]
};
```

### Package.json

```json
{
  "name": "swarm-mcp",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "migrate": "psql $DATABASE_URL < migrations/001_initial_schema.sql"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "node-cron": "^3.0.3",
    "node-fetch": "^2.7.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "@types/pg": "^8.10.9",
    "typescript": "^5.3.2"
  }
}
```

---

## Implementation Tasks

### Day 1-2: Database & Core
- [ ] Create `/opt/swarm-mcp/` directory structure
- [ ] Write PostgreSQL migration script  
- [ ] Run migration on dev droplet (134.199.235.140)
- [ ] Implement `MCPRegistryClient` with pagination
- [ ] Test client against live registry API

### Day 3-4: Sync Service
- [ ] Implement `SyncService` with upsert logic
- [ ] Add category extraction from name/description
- [ ] Handle edge cases (timeouts, malformed data)
- [ ] Run first full sync, verify data integrity

### Day 5: API Layer
- [ ] Implement all 5 REST endpoints
- [ ] Add input validation and error handling
- [ ] Test with curl, verify JSON responses
- [ ] Add Bearer token authentication (optional)

### Day 6: Integration & Deployment
- [ ] Configure PM2 or systemd
- [ ] Set up cron schedule for daily sync
- [ ] Deploy to dev droplet
- [ ] Verify sync runs automatically

### Day 7: Testing & Documentation
- [ ] Run integration test suite
- [ ] Load test search endpoint
- [ ] Update session notes in git
- [ ] Create README.md

---

## Success Criteria

| Criterion | Target | Validation |
|-----------|--------|------------|
| Full sync completes | < 5 minutes | Log timestamps |
| Server count | Matches registry ±5% | Compare counts |
| Search latency | p99 < 50ms | Load test |
| API uptime | 99.9% | Monitor |
| Data integrity | All fields preserved | Spot check 10 servers |

---

## Testing Strategy

### Integration Test Script

```bash
#!/bin/bash
# /opt/swarm-mcp/scripts/test.sh

BASE_URL="http://localhost:8085"

echo "=== Health Check ==="
curl -s "$BASE_URL/health" | jq .

echo "=== List Servers ==="
curl -s "$BASE_URL/api/mcp/servers?limit=5" | jq '.servers | length'

echo "=== Search ==="
curl -s "$BASE_URL/api/mcp/servers?search=notion" | jq '.servers[0].name'

echo "=== Categories ==="
curl -s "$BASE_URL/api/mcp/categories" | jq .

echo "=== Sync Status ==="
curl -s "$BASE_URL/api/mcp/sync/status" | jq '.totalServers'
```

---

## Open Questions

1. **Standalone vs Integrated**: Separate service (port 8085) or add routes to existing Swarm Dev API?
   - Recommendation: Standalone for Phase 1, integrate later

2. **Authentication**: Require Bearer token like other Swarm APIs?
   - Recommendation: Yes, reuse existing auth middleware

3. **Redis Caching**: Add caching layer for hot queries?
   - Recommendation: Defer to Phase 2, PostgreSQL is fast enough initially

---

## References

- [Official MCP Registry](https://registry.modelcontextprotocol.io/)
- [MCP Registry API Docs](https://modelcontextprotocol.info/tools/registry/)
- [Registry GitHub](https://github.com/modelcontextprotocol/registry)


---

## Component 6: Credential Documentation

### Problem

The MCP registry tells us *what* environment variables a server needs, but not *how* to get them. Users need:
- Clear instructions on obtaining API keys
- Direct links to the provider's settings page
- Format hints for validation
- Warnings about common pitfalls

### Schema Addition

```sql
-- Add to migrations/001_initial_schema.sql

-- Credential setup documentation (human-curated)
CREATE TABLE mcp_fabric.credential_docs (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  env_var_name TEXT NOT NULL,
  
  -- User-facing content
  display_name TEXT NOT NULL,              -- "Notion Integration Token"
  description TEXT,                        -- "Allows Swarm to read/write your workspace"
  
  -- Setup instructions
  instructions_md TEXT NOT NULL,           -- Markdown instructions
  obtain_url TEXT,                         -- Direct link to get the key
  
  -- Validation
  format_hint TEXT,                        -- "secret_xxxxx"
  validation_regex TEXT,                   -- "^secret_[a-zA-Z0-9_]+$"
  
  -- Metadata
  is_curated BOOLEAN DEFAULT FALSE,        -- Human-reviewed?
  curated_by TEXT,                         -- Who reviewed it
  curated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(server_id, env_var_name)
);

CREATE INDEX idx_credential_docs_server ON mcp_fabric.credential_docs(server_id);
```

### API Endpoint Addition

```typescript
// Add to routes.ts

// GET /api/mcp/servers/:id/credentials
router.get('/servers/:id/credentials', async (req, res) => {
  const { id } = req.params;
  
  // Get env vars from registry sync
  const envVars = await db.query(`
    SELECT e.name, e.description, e.is_required, e.default_value,
           d.display_name, d.instructions_md, d.obtain_url, 
           d.format_hint, d.validation_regex, d.is_curated
    FROM mcp_fabric.server_env_vars e
    LEFT JOIN mcp_fabric.credential_docs d 
      ON e.server_id = d.server_id AND e.name = d.env_var_name
    WHERE e.server_id = $1
    ORDER BY e.is_required DESC, e.name
  `, [id]);
  
  res.json({
    server_id: id,
    credentials: envVars.rows.map(row => ({
      env_var: row.name,
      required: row.is_required,
      default_value: row.default_value,
      // Documentation (may be null if not curated)
      display_name: row.display_name || row.name,
      description: row.description,
      instructions: row.instructions_md,
      obtain_url: row.obtain_url,
      format_hint: row.format_hint,
      validation_regex: row.validation_regex,
      is_documented: row.is_curated || false
    }))
  });
});
```

---

## Component 7: Seed Data - Top 20 MCP Servers

### Location
`/opt/swarm-mcp/seed/credential-docs.sql`

### Priority Servers for Manual Curation

| Rank | Server | Category | Env Vars |
|------|--------|----------|----------|
| 1 | Notion | productivity | NOTION_API_KEY |
| 2 | GitHub | devtools | GITHUB_TOKEN |
| 3 | Slack | communication | SLACK_BOT_TOKEN, SLACK_TEAM_ID |
| 4 | Linear | devtools | LINEAR_API_KEY |
| 5 | Jira | devtools | JIRA_API_TOKEN, JIRA_EMAIL, JIRA_URL |
| 6 | Google Drive | productivity | GOOGLE_CREDENTIALS |
| 7 | Gmail | communication | GOOGLE_CREDENTIALS |
| 8 | PostgreSQL | database | DATABASE_URL |
| 9 | Supabase | database | SUPABASE_URL, SUPABASE_KEY |
| 10 | OpenAI | ai | OPENAI_API_KEY |
| 11 | Anthropic | ai | ANTHROPIC_API_KEY |
| 12 | AWS | cloud | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY |
| 13 | Stripe | finance | STRIPE_API_KEY |
| 14 | Twilio | communication | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN |
| 15 | SendGrid | communication | SENDGRID_API_KEY |
| 16 | Airtable | productivity | AIRTABLE_API_KEY |
| 17 | Discord | communication | DISCORD_BOT_TOKEN |
| 18 | Figma | design | FIGMA_ACCESS_TOKEN |
| 19 | Vercel | cloud | VERCEL_TOKEN |
| 20 | MongoDB | database | MONGODB_URI |

### Seed Data SQL

```sql
-- /opt/swarm-mcp/seed/credential-docs.sql

-- Notion
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.anthropics/notion-mcp-server',
  'NOTION_API_KEY',
  'Notion Integration Token',
  'Allows Swarm to read and write pages and databases in your Notion workspace',
  '## How to get your Notion API Key

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Fill in the details:
   - **Name**: Swarm
   - **Associated workspace**: Select your workspace
   - **Capabilities**: Check the permissions you want to grant
4. Click **Submit**
5. Copy the **Internal Integration Token** (starts with `secret_`)

### Important: Share pages with your integration

After creating the integration, you must explicitly share pages/databases:

1. Open the page or database in Notion
2. Click **•••** (top right) → **Connections**
3. Search for "Swarm" and add it

> ⚠️ The integration can only access pages explicitly shared with it.',
  'https://www.notion.so/my-integrations',
  'secret_xxxxxxxxxxxxxxxxxxxxxxx',
  '^secret_[a-zA-Z0-9_-]+$',
  TRUE,
  NOW()
);

-- GitHub
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.modelcontextprotocol/server-github',
  'GITHUB_TOKEN',
  'GitHub Personal Access Token',
  'Allows Swarm to access repositories, issues, pull requests, and other GitHub resources',
  '## How to get your GitHub Token

### Option 1: Fine-grained token (Recommended)

1. Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
2. Click **Generate new token**
3. Configure:
   - **Name**: Swarm
   - **Expiration**: Choose based on your needs
   - **Repository access**: Select specific repos or all
   - **Permissions**: Grant based on what you need:
     - `Contents: Read/Write` - for code access
     - `Issues: Read/Write` - for issue management
     - `Pull requests: Read/Write` - for PR management
4. Click **Generate token**
5. Copy the token immediately (you won''t see it again!)

### Option 2: Classic token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Select scopes: `repo`, `read:org`
4. Generate and copy

> 🔒 Store this token securely. Treat it like a password.',
  'https://github.com/settings/tokens',
  'ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_xxxxx',
  '^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]+)$',
  TRUE,
  NOW()
);

-- Slack
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.modelcontextprotocol/server-slack',
  'SLACK_BOT_TOKEN',
  'Slack Bot Token',
  'Allows Swarm to read messages, post to channels, and interact with your Slack workspace',
  '## How to get your Slack Bot Token

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it "Swarm" and select your workspace
4. Go to **OAuth & Permissions** in the sidebar
5. Under **Scopes → Bot Token Scopes**, add:
   - `channels:history` - read channel messages
   - `channels:read` - list channels
   - `chat:write` - post messages
   - `users:read` - list users
6. Click **Install to Workspace** at the top
7. Authorize the app
8. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Add to channels

The bot must be invited to channels to read/post:
```
/invite @Swarm
```',
  'https://api.slack.com/apps',
  'xoxb-xxxx-xxxx-xxxx',
  '^xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+$',
  TRUE,
  NOW()
);

-- Linear
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.jerhadf/linear-mcp-server',
  'LINEAR_API_KEY',
  'Linear API Key',
  'Allows Swarm to manage issues, projects, and cycles in Linear',
  '## How to get your Linear API Key

1. Open Linear and go to **Settings** (gear icon)
2. Navigate to **API** in the sidebar
3. Under **Personal API keys**, click **Create key**
4. Name it "Swarm"
5. Copy the generated key

> 💡 You can also create a workspace-level OAuth app for team use under **Settings → API → OAuth applications**',
  'https://linear.app/settings/api',
  'lin_api_xxxxxxxxxxxxxxxx',
  '^lin_api_[a-zA-Z0-9]+$',
  TRUE,
  NOW()
);

-- OpenAI
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.openai/openai-mcp-server',
  'OPENAI_API_KEY',
  'OpenAI API Key',
  'Allows Swarm to use OpenAI models for text generation, embeddings, and more',
  '## How to get your OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Name it "Swarm"
4. Copy the key immediately (you won''t see it again!)

### Usage & Billing

- API usage is billed separately from ChatGPT Plus
- Set spending limits at [platform.openai.com/settings/limits](https://platform.openai.com/settings/limits)
- Monitor usage at [platform.openai.com/usage](https://platform.openai.com/usage)

> ⚠️ Never commit this key to git or share it publicly.',
  'https://platform.openai.com/api-keys',
  'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
  '^sk-[a-zA-Z0-9]+$',
  TRUE,
  NOW()
);

-- Anthropic
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.anthropics/anthropic-mcp-server',
  'ANTHROPIC_API_KEY',
  'Anthropic API Key',
  'Allows Swarm to use Claude models for text generation',
  '## How to get your Anthropic API Key

1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Click **Create Key**
3. Name it "Swarm"
4. Copy the key

### Usage & Billing

- Set spending limits in your console settings
- Monitor usage in the dashboard

> ⚠️ API keys grant full access to your account. Keep them secure.',
  'https://console.anthropic.com/settings/keys',
  'sk-ant-xxxxxxxxxxxxxxxx',
  '^sk-ant-[a-zA-Z0-9-]+$',
  TRUE,
  NOW()
);

-- AWS
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.aws/aws-mcp-server',
  'AWS_ACCESS_KEY_ID',
  'AWS Access Key ID',
  'Identifies your AWS IAM user or role',
  '## How to get AWS credentials

### Option 1: IAM User (Simple)

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Navigate to **Users** → Select your user (or create one)
3. Go to **Security credentials** tab
4. Under **Access keys**, click **Create access key**
5. Select **Application running outside AWS**
6. Copy both the **Access Key ID** and **Secret Access Key**

### Option 2: IAM Role with temporary credentials (Recommended for production)

Use AWS STS to assume a role with limited permissions.

> 🔒 Best Practice: Create a dedicated IAM user with minimal permissions for Swarm.',
  'https://console.aws.amazon.com/iam/home#/security_credentials',
  'AKIAIOSFODNN7EXAMPLE',
  '^AKIA[0-9A-Z]{16}$',
  TRUE,
  NOW()
);

INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.aws/aws-mcp-server',
  'AWS_SECRET_ACCESS_KEY',
  'AWS Secret Access Key',
  'The secret key paired with your Access Key ID',
  '## AWS Secret Access Key

This is generated alongside your Access Key ID. See the instructions for AWS_ACCESS_KEY_ID.

> ⚠️ This key is shown only once when created. Store it securely immediately.',
  'https://console.aws.amazon.com/iam/home#/security_credentials',
  'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  '^[a-zA-Z0-9+/]{40}$',
  TRUE,
  NOW()
);

-- Stripe
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.stripe/stripe-mcp-server',
  'STRIPE_API_KEY',
  'Stripe API Key',
  'Allows Swarm to manage payments, customers, and subscriptions',
  '## How to get your Stripe API Key

1. Go to [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. You''ll see two types of keys:
   - **Publishable key** (pk_...) - for client-side
   - **Secret key** (sk_...) - for server-side (use this one)
3. Click **Reveal live key** or **Reveal test key**
4. Copy the secret key

### Test vs Live

- Use **test keys** (sk_test_...) for development
- Use **live keys** (sk_live_...) for production

> ⚠️ Never expose your secret key in client-side code or logs.',
  'https://dashboard.stripe.com/apikeys',
  'sk_test_xxxxxxxx or sk_live_xxxxxxxx',
  '^sk_(test|live)_[a-zA-Z0-9]+$',
  TRUE,
  NOW()
);

-- Supabase
INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.supabase/supabase-mcp-server',
  'SUPABASE_URL',
  'Supabase Project URL',
  'The URL of your Supabase project',
  '## How to get your Supabase URL

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project (or create one)
3. Go to **Settings** → **API**
4. Copy the **Project URL**

This is your project''s API endpoint.',
  'https://supabase.com/dashboard',
  'https://xxxxx.supabase.co',
  '^https://[a-z0-9]+\\.supabase\\.co$',
  TRUE,
  NOW()
);

INSERT INTO mcp_fabric.credential_docs 
(server_id, env_var_name, display_name, description, instructions_md, obtain_url, format_hint, validation_regex, is_curated, curated_at)
VALUES (
  'io.github.supabase/supabase-mcp-server',
  'SUPABASE_KEY',
  'Supabase API Key',
  'Service role key for full database access',
  '## How to get your Supabase Key

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Under **Project API keys**, copy the **service_role** key

### Key Types

- **anon/public**: Limited access, safe for client-side
- **service_role**: Full access, server-side only (use this for Swarm)

> ⚠️ The service_role key bypasses Row Level Security. Keep it secret.',
  'https://supabase.com/dashboard',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  '^eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+$',
  TRUE,
  NOW()
);
```


---

## Updated Implementation Tasks

### Day 1-2: Database & Core
- [ ] Create `/opt/swarm-mcp/` directory structure
- [ ] Write PostgreSQL migration with credential_docs table
- [ ] Run migration on dev droplet (134.199.235.140)
- [ ] Implement `MCPRegistryClient` with pagination
- [ ] Test client against live registry API

### Day 3-4: Sync Service
- [ ] Implement `SyncService` with upsert logic
- [ ] Add category extraction from name/description
- [ ] Handle edge cases (timeouts, malformed data)
- [ ] Run first full sync, verify data integrity

### Day 5: API Layer
- [ ] Implement 6 REST endpoints (added `/credentials`)
- [ ] Add input validation and error handling
- [ ] Test with curl, verify JSON responses

### Day 6: Credential Documentation
- [ ] Create seed SQL file with top 10 servers
- [ ] Insert seed data into database
- [ ] Test credential docs API endpoint
- [ ] Verify instructions render correctly

### Day 7: Integration & Testing
- [ ] Configure PM2/systemd
- [ ] Deploy to dev droplet
- [ ] Run integration tests
- [ ] Update session notes in git

---

## Updated API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/servers` | List/search servers |
| GET | `/api/mcp/servers/:id` | Get server details |
| GET | `/api/mcp/servers/:id/credentials` | **NEW** Get credential setup docs |
| GET | `/api/mcp/categories` | List all categories |
| GET | `/api/mcp/sync/status` | Get last sync status |
| POST | `/api/mcp/sync/trigger` | Manually trigger sync |

---

## Credential Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CREDENTIAL LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PHASE 1 (This Spec)                                                    │
│  ┌────────────────────┐    ┌────────────────────┐                       │
│  │ Sync env var names │───▶│ Store curated docs │                       │
│  │ from MCP Registry  │    │ (instructions, URLs)│                       │
│  └────────────────────┘    └────────────────────┘                       │
│                                                                          │
│  PHASE 2-4 (Future)                                                     │
│  ┌────────────────────┐    ┌────────────────────┐    ┌───────────────┐ │
│  │ User enters key in │───▶│ Encrypt & store in │───▶│ Inject at VM  │ │
│  │ Dashboard form     │    │ PostgreSQL         │    │ boot time     │ │
│  └────────────────────┘    └────────────────────┘    └───────────────┘ │
│                                                                          │
│  ⚠️ Keys NEVER in snapshots, NEVER in logs, NEVER in git               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Schema Summary

```sql
-- mcp_fabric schema (Phase 1)
mcp_fabric.servers              -- Core server metadata from registry
mcp_fabric.server_packages      -- npm/pypi/docker package info
mcp_fabric.server_env_vars      -- Required environment variables
mcp_fabric.server_categories    -- Auto-extracted categories
mcp_fabric.server_remotes       -- HTTP endpoints (if any)
mcp_fabric.sync_history         -- Sync audit log
mcp_fabric.credential_docs      -- Human-curated setup instructions  ← NEW

-- Future phases will add:
credentials.mcp_credentials     -- Encrypted user credentials (Phase 2)
mcp_fabric.snapshots           -- Pre-baked VM images (Phase 3)
mcp_fabric.usage_patterns      -- Analytics for snapshot optimization (Phase 4)
```

---

## Testing Credential Docs API

```bash
#!/bin/bash
# Test credential documentation endpoint

# Get Notion credential docs
curl -s "http://localhost:8085/api/mcp/servers/io.github.anthropics%2Fnotion-mcp-server/credentials" | jq .

# Expected response:
# {
#   "server_id": "io.github.anthropics/notion-mcp-server",
#   "credentials": [
#     {
#       "env_var": "NOTION_API_KEY",
#       "required": true,
#       "display_name": "Notion Integration Token",
#       "description": "Allows Swarm to read and write...",
#       "instructions": "## How to get your Notion API Key\n\n1. Go to...",
#       "obtain_url": "https://www.notion.so/my-integrations",
#       "format_hint": "secret_xxxxxxxxxxxxxxxxxxxxxxx",
#       "validation_regex": "^secret_[a-zA-Z0-9_-]+$",
#       "is_documented": true
#     }
#   ]
# }
```

---

## Dashboard Preview (Phase 5)

When the Dashboard is built, the credential docs will render like this:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Configure Notion Integration                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Notion Integration Token *                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ secret_                                                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  Format: secret_xxxxxxxxxxxxxxxxxxxxxxx                                  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 📖 How to get your Notion API Key                                  │  │
│  │                                                                     │  │
│  │ 1. Go to notion.so/my-integrations                                 │  │
│  │ 2. Click "+ New integration"                                       │  │
│  │ 3. Fill in the details:                                            │  │
│  │    • Name: Swarm                                                   │  │
│  │    • Associated workspace: Select your workspace                   │  │
│  │ 4. Click "Submit"                                                  │  │
│  │ 5. Copy the Internal Integration Token                             │  │
│  │                                                                     │  │
│  │ ⚠️ Remember to share pages with your integration in Notion        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  [Open Notion Integrations ↗]                                            │
│                                                                          │
│                                    [Cancel]  [Save & Test Connection]    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Success Criteria (Updated)

| Criterion | Target | Validation |
|-----------|--------|------------|
| Full sync completes | < 5 minutes | Log timestamps |
| Server count | Matches registry ±5% | Compare counts |
| Search latency | p99 < 50ms | Load test |
| Credential docs | Top 10 servers documented | Manual check |
| API uptime | 99.9% | Monitor |
| Docs accuracy | 100% links valid | Test each obtain_url |
