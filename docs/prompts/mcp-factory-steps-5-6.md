# MCP Factory - Steps 5-6 Implementation Prompt

## Context

You are continuing MCP Factory development on the Swarm droplet (146.190.35.235).

**Completed:**
- Step 1: Parser (`/opt/mcp-factory/src/parser.js`) - NL → JSON spec via Claude
- Step 2: Generator (`/opt/mcp-factory/src/generator.js`) - Spec → TypeScript MCP server
- Step 3: Validator (`/opt/mcp-factory/src/validator.js`) - TypeScript/Protocol/Deps checks
- Step 4: Packager (`/opt/mcp-factory/src/packager.js`) - Build, tarball, manifest generation

**Test artifacts:**
- `/opt/mcp-factory/output/mcp-weather/mcp-weather-1.0.0.tgz`
- `/opt/mcp-factory/output/mcp-weather/manifest.json`

**Remaining:** Steps 5 (Registry), 6 (API Server)

---

## Step 5: Registry

Create `/opt/mcp-factory/src/registry.js`

### Requirements

1. **SQLite Storage** at `/opt/mcp-factory/registry.db`
   ```sql
   CREATE TABLE mcp_servers (
     id TEXT PRIMARY KEY,
     name TEXT UNIQUE NOT NULL,
     version TEXT NOT NULL,
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
   - `register(manifest)` - Add/update server entry
   - `get(name, version?)` - Get by name (latest if no version)
   - `list(filter?)` - List all with optional filtering
   - `remove(name)` - Delete entry and optionally cleanup files

### Interface

```javascript
const { MCPRegistry } = require('./registry');

const registry = new MCPRegistry('/opt/mcp-factory/registry.db');
await registry.init();

// Register from packager manifest
await registry.register(manifest);

// Query
const server = await registry.get('mcp-weather');
const all = await registry.list({ limit: 10 });

// Remove
await registry.remove('mcp-weather');
```

### CLI Test

```bash
node /opt/mcp-factory/src/registry.js register /opt/mcp-factory/output/mcp-weather/manifest.json
node /opt/mcp-factory/src/registry.js list
node /opt/mcp-factory/src/registry.js get mcp-weather
```

---

## Step 6: API Server

Create `/opt/mcp-factory/src/api.js` (Express)

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/generate` | Start MCP generation job |
| GET | `/api/jobs/:id` | Get job status/result |
| GET | `/api/servers` | List registered servers |
| GET | `/api/servers/:name` | Get server details + claude_config |
| POST | `/api/validate` | Validate spec or server directory |

### Request/Response Examples

**POST /api/generate**
```json
// Request
{
  "description": "A weather API that fetches current conditions and forecasts",
  "runtime": "node"
}

// Response
{
  "job_id": "job_abc123",
  "status": "processing"
}
```

**GET /api/jobs/:id**
```json
{
  "job_id": "job_abc123",
  "status": "complete",
  "result": {
    "name": "mcp-weather",
    "version": "1.0.0",
    "package": "/opt/mcp-factory/output/mcp-weather-1.0.0.tgz",
    "claude_config": { ... }
  }
}
```

**GET /api/servers**
```json
{
  "servers": [
    { "name": "mcp-weather", "version": "1.0.0", "description": "..." },
    { "name": "mcp-github", "version": "1.0.0", "description": "..." }
  ]
}
```

### Job Processing Pipeline

```
POST /api/generate
       │
       ▼
┌──────────────┐
│ 1. Parser    │ description → spec
└──────────────┘
       │
       ▼
┌──────────────┐
│ 2. Generator │ spec → TypeScript
└──────────────┘
       │
       ▼
┌──────────────┐
│ 3. Validator │ check code quality
└──────────────┘
       │
       ▼
┌──────────────┐
│ 4. Packager  │ build + tarball
└──────────────┘
       │
       ▼
┌──────────────┐
│ 5. Registry  │ store metadata
└──────────────┘
       │
       ▼
    Return manifest
```

### Job Storage

Use in-memory Map or SQLite table:
```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'pending',
  description TEXT,
  result JSON,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
```

### Server Configuration

- Port: 8070 (or from MCP_FACTORY_PORT env)
- CORS: enabled for dashboard integration
- Body limit: 1MB for spec payloads

---

## Execution Order

### Step 5 - Registry
```bash
# Create and test
node /opt/mcp-factory/src/registry.js register /opt/mcp-factory/output/mcp-weather/manifest.json
node /opt/mcp-factory/src/registry.js list
node /opt/mcp-factory/src/registry.js get mcp-weather
```

### Step 6 - API Server
```bash
# Start server
node /opt/mcp-factory/src/api.js

# Test endpoints
curl http://localhost:8070/api/servers
curl -X POST http://localhost:8070/api/generate \
  -H "Content-Type: application/json" \
  -d '{"description": "A calculator API with add, subtract, multiply, divide"}'
```

---

## Dependencies

Add to `/opt/mcp-factory/package.json`:
```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  }
}
```

Then run: `cd /opt/mcp-factory && npm install`

---

## Success Criteria

1. **Registry**: SQLite DB stores server metadata, CLI works
2. **API**: All endpoints return valid responses
3. **Integration**: Full pipeline from description → registered server works
4. **PM2**: API server runs as `mcp-factory` process
