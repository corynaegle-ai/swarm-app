# MCP Server Hosting Platform

## Overview

End-to-end platform for creating, testing, deploying, and managing MCP servers. Extends the existing MCP Factory with hosted runtime and management UI.

## Existing MCP Factory Architecture

```
POST /api/generate { "description": "calculator with add, subtract..." }
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Current Pipeline (swarm-mcp-factory on port 3456):         │
│  1. parsing    → Claude parses NL → structured spec         │
│  2. generating → Creates TypeScript server (StdioTransport) │
│  3. validating → TypeScript compile + linting               │
│  4. packaging  → npm install, build                         │
│  5. registering → Save to /opt/mcp-factory/registry.db      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
/opt/swarm-mcp-factory/output/{name}/   ← Generated code
/opt/swarm-mcp-factory/registry.db      ← Server metadata (standalone)
```

### Current Generated Server (StdioTransport - Local Only)
```typescript
// Current output uses stdio - only works locally
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({ name: 'calculator', version: '1.0.0' }, ...);
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Current claude_desktop_config.json
```json
{
  "mcpServers": {
    "calculator": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]  // Local path only
    }
  }
}
```

---

## Integration Gap Analysis

| Aspect | Current State | Required for Hosting |
|--------|---------------|----------------------|
| Transport | `StdioServerTransport` | `StreamableHTTPServerTransport` |
| Registry | Separate DB (`registry.db`) | Unified in `swarm.db` |
| Config | Local file paths | Hosted URL endpoints |
| Runtime | Not running (just packaged) | PM2/VM lifecycle management |
| Secrets | None | Env var injection at runtime |
| Multi-tenant | No | tenant_id isolation |

---

## Updated User Journey

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. CREATE  │───▶│  2. CONVERT │───▶│  3. TEST    │───▶│  4. DEPLOY  │───▶│  5. MANAGE  │
│  MCP Factory│    │  HTTP Wrap  │    │  Sandbox    │    │  Start/Stop │    │  Dashboard  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     │                   │
     │ Existing          │ NEW
     │ Pipeline          │ Post-process
     ▼                   ▼
  registry.db       swarm.db
  (factory only)    (platform-wide)
```

---

## Phase 1: Creation (Existing MCP Factory)

### Existing Endpoints (port 3456)
```
POST /api/generate        # NL → full pipeline → registered server
GET  /api/jobs/:id        # Check job status
GET  /api/servers         # List registered servers
GET  /api/servers/:name   # Get server details
POST /api/validate        # Validate spec or serverDir
```

### Enhancement: Context7 Integration
Add to `generator.js` before code generation:

```javascript
const { resolve, getDocs } = require('./context7-client');

async function generateWithDocs(spec) {
  // Fetch latest MCP SDK docs
  const mcpDocs = await getDocs({
    libraryId: '/modelcontextprotocol/typescript-sdk',
    topic: 'server tools resources StreamableHTTPServerTransport',
    tokens: 5000
  });
  
  // Include in Claude prompt
  const prompt = `
    Using this MCP SDK documentation:
    ${mcpDocs}
    
    Generate a server for this spec:
    ${JSON.stringify(spec, null, 2)}
  `;
  
  return await claude.generate(prompt);
}
```

---

## Phase 2: HTTP Transport Conversion (NEW)

### Post-Generation Hook
After MCP Factory completes, convert stdio server to HTTP:

```javascript
// services/mcp-converter.js

const fs = require('fs');
const path = require('path');

class MCPConverter {
  /**
   * Wrap stdio-based MCP server with HTTP transport
   */
  async convertToHttp(serverDir) {
    const indexPath = path.join(serverDir, 'src', 'index.ts');
    const originalCode = fs.readFileSync(indexPath, 'utf8');
    
    // Generate HTTP wrapper
    const httpWrapper = this.generateHttpWrapper(originalCode);
    
    // Write new entry point
    const httpIndexPath = path.join(serverDir, 'src', 'index-http.ts');
    fs.writeFileSync(httpIndexPath, httpWrapper);
    
    // Update package.json scripts
    const pkgPath = path.join(serverDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.scripts['start:http'] = 'node dist/index-http.js';
    pkg.dependencies['express'] = '^4.18.0';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    
    return { httpIndexPath, needsRebuild: true };
  }
  
  generateHttpWrapper(originalCode) {
    // Extract tool handlers from original
    const toolHandlers = this.extractToolHandlers(originalCode);
    
    return `
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const app = express();
app.use(express.json());

const server = new Server(
  { name: process.env.MCP_SERVER_NAME || 'mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Original tool handlers
${toolHandlers}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`MCP Server running on port \${PORT}\`);
});
`;
  }
}
```

---

## Phase 3: Unified Database Schema

### Migration: Merge registries into swarm.db

```sql
-- In swarm.db (swarm-platform)
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  
  -- Source (from MCP Factory)
  factory_job_id TEXT,              -- Link to original generation job
  source_dir TEXT,                  -- /opt/swarm-mcp-factory/output/{name}
  spec JSON,                        -- Original parsed spec
  
  -- Runtime
  status TEXT DEFAULT 'stopped',    -- stopped | starting | running | error
  runtime TEXT DEFAULT 'node',      -- node | python
  port INTEGER,                     -- Allocated port when running
  pid INTEGER,                      -- PM2 process ID
  subdomain TEXT UNIQUE,            -- {name}.mcp.swarmstack.net
  
  -- Configuration
  config_schema JSON,               -- What env vars server needs
  config_values TEXT,               -- Encrypted env var values
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  last_started_at DATETIME,
  last_error TEXT,
  
  UNIQUE(tenant_id, name)
);

CREATE TABLE mcp_server_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  level TEXT NOT NULL,              -- info | warn | error
  message TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcp_test_runs (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input JSON,
  output JSON,
  success INTEGER,
  duration_ms INTEGER,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcp_servers_tenant ON mcp_servers(tenant_id);
CREATE INDEX idx_mcp_servers_status ON mcp_servers(status);
CREATE INDEX idx_mcp_logs_server ON mcp_server_logs(server_id);
```

### Sync from Factory Registry
```javascript
// One-time migration or periodic sync
async function syncFromFactoryRegistry() {
  const factoryDb = new Database('/opt/mcp-factory/registry.db');
  const platformDb = getDb(); // swarm.db
  
  const factoryServers = factoryDb.prepare('SELECT * FROM mcp_servers').all();
  
  for (const server of factoryServers) {
    platformDb.prepare(`
      INSERT OR IGNORE INTO mcp_servers (id, tenant_id, name, description, version, spec, source_dir)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      server.id,
      'default',  // Assign to default tenant
      server.name,
      server.description,
      server.version,
      server.spec,
      server.package_path
    );
  }
}
```

---

## Phase 4: Testing Sandbox

### Test UI Component
```
┌─────────────────────────────────────────────────────────────┐
│ 🧪 Test: calculator-mcp                          [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Tools (4 available):                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ▼ add                                                   │ │
│ │   Adds two numbers together                             │ │
│ │   ┌─────────────────────────────────────────────────┐   │ │
│ │   │ a: [  5  ]    b: [  3  ]                        │   │ │
│ │   └─────────────────────────────────────────────────┘   │ │
│ │   [Run Test]                                            │ │
│ │                                                         │ │
│ │   Result: ✅ Success (12ms)                             │ │
│ │   { "result": 8 }                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ │ ▶ subtract                                              │ │
│ │ ▶ multiply                                              │ │
│ │ ▶ divide                                                │ │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ [Run All Tests]                        [Deploy to Hosting]  │
└─────────────────────────────────────────────────────────────┘
```

### Test Runner Service
```javascript
// services/mcp-tester.js

class MCPTester {
  /**
   * Start server temporarily for testing
   */
  async startTestInstance(serverId) {
    const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId);
    const testPort = await this.allocateTestPort(); // 9900-9999 range
    
    // Start with PM2 in test mode
    await pm2.start({
      name: `mcp-test-${serverId.slice(0, 8)}`,
      script: 'dist/index-http.js',
      cwd: server.source_dir,
      env: { PORT: testPort, NODE_ENV: 'test' }
    });
    
    // Wait for health check
    await this.waitForHealth(`http://localhost:${testPort}/health`);
    
    return { port: testPort, endpoint: `http://localhost:${testPort}/mcp` };
  }
  
  /**
   * Test a specific tool
   */
  async testTool(serverId, toolName, args) {
    const { endpoint } = await this.getTestInstance(serverId);
    const startTime = Date.now();
    
    try {
      // Initialize MCP session
      const initRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: { capabilities: {} },
          id: 1
        })
      });
      
      // Call tool
      const toolRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: toolName, arguments: args },
          id: 2
        })
      });
      
      const result = await toolRes.json();
      const duration = Date.now() - startTime;
      
      // Log test run
      db.prepare(`
        INSERT INTO mcp_test_runs (id, server_id, tool_name, input, output, success, duration_ms)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(uuidv4(), serverId, toolName, JSON.stringify(args), JSON.stringify(result), duration);
      
      return { success: true, result, duration_ms: duration };
      
    } catch (err) {
      const duration = Date.now() - startTime;
      
      db.prepare(`
        INSERT INTO mcp_test_runs (id, server_id, tool_name, input, success, duration_ms, error)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(uuidv4(), serverId, toolName, JSON.stringify(args), duration, err.message);
      
      return { success: false, error: err.message, duration_ms: duration };
    }
  }
  
  /**
   * List available tools from server
   */
  async listTools(serverId) {
    const { endpoint } = await this.getTestInstance(serverId);
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1
      })
    });
    
    const data = await res.json();
    return data.result?.tools || [];
  }
}
```

### Test API Endpoints
```
POST /api/mcp-servers/:id/test/start     # Start test instance
POST /api/mcp-servers/:id/test/stop      # Stop test instance
GET  /api/mcp-servers/:id/test/tools     # List available tools
POST /api/mcp-servers/:id/test/tool      # Test specific tool
GET  /api/mcp-servers/:id/test/history   # Get test run history
```

---

## Phase 5: Deployment & Lifecycle

### Lifecycle Manager
```javascript
// services/mcp-lifecycle.js

class MCPLifecycleManager {
  constructor() {
    this.portRange = { min: 9000, max: 9099 }; // Production ports
  }
  
  async allocatePort() {
    const usedPorts = db.prepare(
      'SELECT port FROM mcp_servers WHERE port IS NOT NULL'
    ).all().map(r => r.port);
    
    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      if (!usedPorts.includes(port)) return port;
    }
    throw new Error('No available ports');
  }
  
  async startServer(serverId) {
    const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId);
    if (!server) throw new Error('Server not found');
    if (server.status === 'running') return { already_running: true };
    
    // Update status
    db.prepare('UPDATE mcp_servers SET status = ? WHERE id = ?').run('starting', serverId);
    
    try {
      const port = await this.allocatePort();
      
      // Decrypt and prepare env vars
      const env = {
        PORT: port,
        MCP_SERVER_NAME: server.name,
        NODE_ENV: 'production',
        ...this.decryptConfig(server.config_values)
      };
      
      // Ensure HTTP version is built
      await this.ensureHttpBuild(server.source_dir);
      
      // Start with PM2
      const pm2Name = `mcp-${server.name}`;
      await pm2.start({
        name: pm2Name,
        script: 'dist/index-http.js',
        cwd: server.source_dir,
        env,
        max_memory_restart: '256M',
        error_file: `/var/log/mcp/${server.name}.error.log`,
        out_file: `/var/log/mcp/${server.name}.out.log`
      });
      
      // Get PID
      const pm2List = await pm2.list();
      const proc = pm2List.find(p => p.name === pm2Name);
      
      // Update nginx
      await this.updateNginx(server.subdomain || server.name, port);
      
      // Update database
      db.prepare(`
        UPDATE mcp_servers 
        SET status = 'running', port = ?, pid = ?, last_started_at = datetime('now')
        WHERE id = ?
      `).run(port, proc?.pid, serverId);
      
      return { 
        status: 'running', 
        port, 
        endpoint: `https://${server.subdomain || server.name}.mcp.swarmstack.net/mcp`
      };
      
    } catch (err) {
      db.prepare(`
        UPDATE mcp_servers SET status = 'error', last_error = ? WHERE id = ?
      `).run(err.message, serverId);
      throw err;
    }
  }
  
  async stopServer(serverId) {
    const server = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(serverId);
    if (!server) throw new Error('Server not found');
    
    await pm2.stop(`mcp-${server.name}`);
    
    db.prepare(`
      UPDATE mcp_servers SET status = 'stopped', port = NULL, pid = NULL WHERE id = ?
    `).run(serverId);
    
    return { status: 'stopped' };
  }
  
  async updateNginx(subdomain, port) {
    const config = `
upstream mcp_${subdomain.replace(/-/g, '_')} {
    server 127.0.0.1:${port};
}

server {
    listen 443 ssl;
    server_name ${subdomain}.mcp.swarmstack.net;
    
    ssl_certificate /etc/letsencrypt/live/swarmstack.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/swarmstack.net/privkey.pem;
    
    location / {
        proxy_pass http://mcp_${subdomain.replace(/-/g, '_')};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
`;
    
    const confPath = `/etc/nginx/sites-available/mcp-${subdomain}.conf`;
    fs.writeFileSync(confPath, config);
    
    // Enable site
    const enabledPath = `/etc/nginx/sites-enabled/mcp-${subdomain}.conf`;
    if (!fs.existsSync(enabledPath)) {
      fs.symlinkSync(confPath, enabledPath);
    }
    
    // Reload nginx
    await exec('nginx -t && nginx -s reload');
  }
}
```

---

## Phase 6: Management Dashboard

### Route: `/mcp-servers`

### Server List View
```
┌───────────────────────────────────────────────────────────────────────────┐
│ MCP Servers                                            [+ Create New]     │
├───────────────────────────────────────────────────────────────────────────┤
│ Name              Status      Endpoint                        Actions     │
├───────────────────────────────────────────────────────────────────────────┤
│ calculator-mcp    🟢 Running   calculator.mcp.swarmstack.net   ⚙️ 🧪 ⏹️ 🗑️ │
│ weather-api       🔴 Stopped   weather.mcp.swarmstack.net      ⚙️ 🧪 ▶️ 🗑️ │
│ github-tools      🟡 Starting  github.mcp.swarmstack.net       ⚙️    ⏹️    │
│ db-query          ⚠️ Error     db.mcp.swarmstack.net           ⚙️ 🧪 ▶️ 🗑️ │
└───────────────────────────────────────────────────────────────────────────┘
  ⚙️ Configure   🧪 Test   ▶️ Start   ⏹️ Stop   🗑️ Delete
```

### Configuration Modal
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Configure: weather-api                                        [X]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Environment Variables                                                   │
│ ┌─────────────────────────┬────────────────────────────────┬─────────┐ │
│ │ OPENWEATHER_API_KEY *   │ ••••••••••••••••               │ 👁️      │ │
│ │ CACHE_TTL_SECONDS       │ 300                            │         │ │
│ └─────────────────────────┴────────────────────────────────┴─────────┘ │
│ [+ Add Variable]                                                        │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Connection Info                                                         │
│                                                                         │
│ Endpoint:  https://weather.mcp.swarmstack.net/mcp                       │
│ Health:    https://weather.mcp.swarmstack.net/health                    │
│ Status:    🟢 Running (uptime: 3h 42m)                                  │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Claude Desktop Config                                          [Copy]   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ {                                                                   │ │
│ │   "mcpServers": {                                                   │ │
│ │     "weather-api": {                                                │ │
│ │       "url": "https://weather.mcp.swarmstack.net/mcp"               │ │
│ │     }                                                               │ │
│ │   }                                                                 │ │
│ │ }                                                                   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Recent Logs                                                  [View All] │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 14:23:01 [INFO] Tool called: get_weather {location: "NYC"}          │ │
│ │ 14:22:55 [INFO] Health check passed                                 │ │
│ │ 14:20:00 [INFO] Server started on port 9003                         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│                                              [Cancel]  [Save & Restart] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Summary

### Factory (Existing - port 3456)
```
POST /api/generate              # NL → MCP server
GET  /api/jobs/:id              # Job status
GET  /api/servers               # List (factory registry)
GET  /api/servers/:name         # Details
```

### Platform (New - port 3000)
```
# CRUD
GET    /api/mcp-servers                    # List tenant's servers
POST   /api/mcp-servers                    # Import from factory
GET    /api/mcp-servers/:id                # Get details
PUT    /api/mcp-servers/:id                # Update config
DELETE /api/mcp-servers/:id                # Delete

# Lifecycle
POST   /api/mcp-servers/:id/start          # Start server
POST   /api/mcp-servers/:id/stop           # Stop server
POST   /api/mcp-servers/:id/restart        # Restart
GET    /api/mcp-servers/:id/logs           # Get logs

# Testing
POST   /api/mcp-servers/:id/test/start     # Start test instance
POST   /api/mcp-servers/:id/test/stop      # Stop test instance
GET    /api/mcp-servers/:id/test/tools     # List tools
POST   /api/mcp-servers/:id/test/tool      # Test specific tool
```

---

## Implementation Phases

| Phase | Deliverable | Effort | Depends On |
|-------|-------------|--------|------------|
| 1 | HTTP converter service | 1 day | - |
| 2 | Database schema + migration | 0.5 day | - |
| 3 | Lifecycle manager (PM2) | 1 day | 1, 2 |
| 4 | Platform API endpoints | 1 day | 2, 3 |
| 5 | Test sandbox service | 1.5 days | 1, 4 |
| 6 | Dashboard UI (list + config) | 2 days | 4 |
| 7 | Test UI component | 1 day | 5, 6 |
| 8 | Nginx dynamic config | 0.5 day | 3 |
| 9 | Context7 integration | 0.5 day | Factory |

**Total: ~9 days**

---

## Security Considerations

1. **Secrets encryption**: AES-256-GCM for config_values at rest
2. **Tenant isolation**: All queries filtered by tenant_id
3. **Port allocation**: Dynamic ports 9000-9099, tracked in DB
4. **Subdomain validation**: Sanitize names, prevent collisions
5. **Rate limiting**: Per-server limits via nginx
6. **Log sanitization**: Scrub secrets before storage
7. **Test isolation**: Separate port range (9900-9999) for testing

---

## File Locations

```
/opt/swarm-mcp-factory/           # Existing factory
├── src/api.js                    # Factory API
├── src/generator.js              # Code generation
├── output/{name}/                # Generated servers
└── registry.db                   # Factory registry (to be synced)

/opt/swarm-platform/              # Platform (add here)
├── services/mcp-converter.js     # NEW: HTTP wrapper
├── services/mcp-lifecycle.js     # NEW: Start/stop management
├── services/mcp-tester.js        # NEW: Test runner
├── routes/mcp-servers.js         # NEW: API endpoints
└── data/swarm.db                 # Unified registry

/opt/swarm-dashboard/             # Dashboard (add here)
└── src/pages/MCPServers.jsx      # NEW: Management UI
```
