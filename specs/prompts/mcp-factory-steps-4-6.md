# MCP Factory - Steps 4-6 Implementation Prompt

## Context

You are continuing MCP Factory development on the Swarm droplet (146.190.35.235).

**Completed:**
- Step 1: Parser (`/opt/mcp-factory/src/parser.js`) - NL → JSON spec via Claude
- Step 2: Generator (`/opt/mcp-factory/src/generator.js`) - Spec → TypeScript MCP server
- Step 3: Validator (`/opt/mcp-factory/src/validator.js`) - TypeScript/Protocol/Deps checks

**Remaining:** Steps 4 (Packager), 5 (Registry), 6 (API Server)

**Test output exists at:** `/opt/mcp-factory/output/mcp-weather` (has npm installed)

---

## Step 4: Packager

Create `/opt/mcp-factory/src/packager.js`

### Requirements

1. **Build TypeScript**
   ```bash
   cd <server> && npm run build
   ```

2. **Create Distribution Package**
   - Copy dist/, package.json, README.md to output
   - Generate .tgz via `npm pack`

3. **Docker Image** (optional flag)
   ```bash
   docker build -t mcp-<name>:<version> .
   ```

4. **Output Manifest**
   ```json
   {
     "name": "mcp-weather",
     "version": "1.0.0",
     "package": "/opt/mcp-factory/output/mcp-weather-1.0.0.tgz",
     "docker": "mcp-weather:1.0.0",
     "claude_config": { ... }
   }
   ```

### Interface

```javascript
class MCPPackager {
  async package(serverDir, options) → { manifest }
  async build(serverDir) → { success, outputDir }
  async createTarball(serverDir) → { tarballPath }
  async buildDocker(serverDir) → { imageName }  // optional
}
```

---

## Step 5: Registry

Create `/opt/mcp-factory/src/registry.js`

### Requirements

1. **SQLite Storage** at `/opt/mcp-factory/registry.db`
   ```sql
   CREATE TABLE mcp_servers (
     id TEXT PRIMARY KEY,
     name TEXT UNIQUE,
     version TEXT,
     description TEXT,
     spec JSON,
     package_path TEXT,
     docker_image TEXT,
     claude_config JSON,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME
   );
   ```

2. **CRUD Operations**
   - `register(manifest)` - Add/update server
   - `get(name, version?)` - Get by name
   - `list(filter?)` - List all
   - `remove(name)` - Delete entry

### Interface

```javascript
class MCPRegistry {
  constructor(dbPath)
  async init() → create tables
  async register(manifest) → { id }
  async get(name, version?) → server | null
  async list(filter?) → servers[]
  async remove(name) → { removed: boolean }
}
```

---

## Step 6: API Server

Create `/opt/mcp-factory/src/api.js` (Express)

### Endpoints

```
POST /api/generate
  Body: { description: string, runtime?: string }
  → { job_id, status: "processing" }

GET /api/jobs/:id
  → { status, result?, errors? }

GET /api/servers
  → { servers: [...] }

GET /api/servers/:name
  → { server details + claude_config }

POST /api/validate
  Body: { serverDir: string } or { spec: object }
  → { valid, errors, warnings }
```

### Job Flow

1. Parse description → spec (parser.js)
2. Generate server code (generator.js)
3. Validate (validator.js)
4. Package (packager.js)
5. Register (registry.js)
6. Return manifest

Store jobs in memory or SQLite with status: pending/processing/complete/failed

---

## Execution

After each step, test:

```bash
# Step 4 - Package mcp-weather
node /opt/mcp-factory/src/packager.js /opt/mcp-factory/output/mcp-weather

# Step 5 - Register it
node /opt/mcp-factory/src/registry.js register /path/to/manifest.json
node /opt/mcp-factory/src/registry.js list

# Step 6 - Start API
node /opt/mcp-factory/src/api.js
curl http://localhost:3456/api/servers
```

---

## SSH Access

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.nvm/versions/node/v22.12.0/bin
```

## File Transfer

Write files locally with Desktop Commander, then:
```bash
scp -i ~/.ssh/swarm_key /local/path root@146.190.35.235:/opt/mcp-factory/src/filename.js
```

---

## Deliverables

1. `/opt/mcp-factory/src/packager.js` - Build & package MCP servers
2. `/opt/mcp-factory/src/registry.js` - SQLite-backed server registry
3. `/opt/mcp-factory/src/api.js` - Express API orchestrating full pipeline
4. Test all three against mcp-weather example
