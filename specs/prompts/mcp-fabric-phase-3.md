# MCP Fabric Phase 3: Server Execution & Agent Integration

## Context

Phase 1 and Phase 2 of MCP Fabric are COMPLETE on the dev droplet (134.199.235.140):

### Phase 1 Deliverables (Complete)
- **PostgreSQL Database**: `mcp_fabric` schema with 55+ servers synced
- **Registry Sync**: Daily sync from `registry.modelcontextprotocol.io`
- **REST API**: Running on port 8085 via PM2 (`swarm-mcp`)

### Phase 2 Deliverables (Complete)
- **Package Cache**: npm/pypi packages downloaded to `/opt/swarm-mcp/cache/`
- **Credential Storage**: AES-256-GCM encrypted credentials in `credentials.mcp_credentials`
- **Cache Endpoints**: POST/GET/DELETE for `/servers/:id/cache`
- **Credential Endpoints**: CRUD for `/credentials/:userId/:serverId`

### Current Infrastructure
```
Location: /opt/swarm-mcp
Database: postgresql://swarm:swarm_dev_2024@localhost:5432/mcp_fabric
PM2 Process: swarm-mcp (port 8085)
Cache Dir: /opt/swarm-mcp/cache/{npm,pypi,oci}/
```

---

## Phase 3 Requirements

### Goal
Enable Swarm to **run MCP servers as managed processes**, inject credentials at runtime, and expose their tools to Swarm worker agents in Firecracker VMs.

---

## Component 1: OCI/Docker Image Cache

Extend the package cache to support Docker images (many MCP servers use OCI transport).

**Implementation**: Update `src/cache/package-cache.ts`

```typescript
async downloadOciImage(identifier: string, tag: string = 'latest'): Promise<CacheResult>
```

**Cache Structure**:
```
/opt/swarm-mcp/cache/oci/{image_name}/{tag}/
  ├── manifest.json
  ├── config.json
  └── layers/
      ├── sha256_abc123.tar.gz
      └── sha256_def456.tar.gz
```

**New Endpoint**:
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mcp/servers/:id/cache/pull` | Pull Docker image (for OCI servers) |

---

## Component 2: Server Process Manager

Manage MCP server lifecycle with PM2-like process control.

**New Schema**: `mcp_fabric.server_instances`
```sql
CREATE TABLE mcp_fabric.server_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id),
  user_id TEXT NOT NULL,
  instance_name TEXT NOT NULL,          -- e.g., "notion-user123"
  status TEXT NOT NULL DEFAULT 'stopped', -- stopped, starting, running, error
  transport_type TEXT NOT NULL,          -- stdio, http, sse
  port INTEGER,                          -- For HTTP/SSE transport
  pid INTEGER,                           -- OS process ID
  pm2_id INTEGER,                        -- PM2 process ID
  endpoint_url TEXT,                     -- e.g., http://localhost:3001/mcp
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  health_status TEXT,                    -- healthy, unhealthy, unknown
  error_message TEXT,
  env_vars JSONB,                        -- Runtime env (non-sensitive)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, server_id)
);

CREATE INDEX idx_instances_user ON mcp_fabric.server_instances(user_id);
CREATE INDEX idx_instances_status ON mcp_fabric.server_instances(status);
CREATE INDEX idx_instances_port ON mcp_fabric.server_instances(port) WHERE port IS NOT NULL;
```

**New Service**: `/opt/swarm-mcp/src/runtime/server-manager.ts`

```typescript
interface ServerInstance {
  id: string;
  serverId: string;
  userId: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  port?: number;
  pid?: number;
  endpointUrl?: string;
}

class ServerManager {
  // Start an MCP server for a user
  async startServer(userId: string, serverId: string): Promise<ServerInstance>;
  
  // Stop a running server
  async stopServer(instanceId: string): Promise<boolean>;
  
  // Get server status
  async getStatus(instanceId: string): Promise<ServerInstance>;
  
  // List all instances for a user
  async listUserInstances(userId: string): Promise<ServerInstance[]>;
  
  // Health check a running server
  async healthCheck(instanceId: string): Promise<{ healthy: boolean; latency: number }>;
  
  // Allocate next available port (3100-3999 range)
  private async allocatePort(): Promise<number>;
  
  // Build environment variables with injected credentials
  private async buildEnvVars(userId: string, serverId: string): Promise<Record<string, string>>;
}
```

**Port Allocation Strategy**:
- HTTP/SSE servers: ports 3100-3999 (900 available)
- Stdio servers: no port needed (communicate via stdin/stdout)
- Track allocated ports in `server_instances.port`

---

## Component 3: Transport Adapters

Different MCP servers use different transports. Create adapters for each:

**New Service**: `/opt/swarm-mcp/src/runtime/transports/`

```
src/runtime/transports/
├── index.ts           # Transport factory
├── stdio-adapter.ts   # Spawn process, communicate via stdio
├── http-adapter.ts    # HTTP POST to /mcp endpoint
└── sse-adapter.ts     # Server-Sent Events streaming
```

**Stdio Adapter** (most common):
```typescript
class StdioTransportAdapter {
  private process: ChildProcess;
  
  async spawn(command: string, args: string[], env: Record<string, string>): Promise<void>;
  async send(message: MCPRequest): Promise<MCPResponse>;
  async close(): Promise<void>;
}
```

**HTTP Adapter**:
```typescript
class HttpTransportAdapter {
  constructor(private endpointUrl: string);
  
  async send(message: MCPRequest): Promise<MCPResponse>;
  async healthCheck(): Promise<boolean>;
}
```

---

## Component 4: Tool Discovery

Parse MCP server manifests to discover available tools.

**New Table**: `mcp_fabric.server_tools`
```sql
CREATE TABLE mcp_fabric.server_tools (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB,           -- JSON Schema for tool inputs
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, tool_name)
);

CREATE INDEX idx_tools_server ON mcp_fabric.server_tools(server_id);
CREATE INDEX idx_tools_name ON mcp_fabric.server_tools(tool_name);
```

**Discovery Flow**:
1. Start server instance
2. Send `tools/list` MCP request
3. Parse response and store in `server_tools`
4. Cache for future lookups

**New Service**: `/opt/swarm-mcp/src/runtime/tool-discovery.ts`
```typescript
class ToolDiscovery {
  async discoverTools(instanceId: string): Promise<Tool[]>;
  async getServerTools(serverId: string): Promise<Tool[]>;
  async searchTools(query: string): Promise<Tool[]>;
}
```

---

## Component 5: API Endpoints

### Server Lifecycle Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mcp/instances` | Start a new server instance |
| GET | `/api/mcp/instances` | List user's running instances |
| GET | `/api/mcp/instances/:id` | Get instance details |
| POST | `/api/mcp/instances/:id/stop` | Stop instance |
| POST | `/api/mcp/instances/:id/restart` | Restart instance |
| DELETE | `/api/mcp/instances/:id` | Stop and remove instance |
| GET | `/api/mcp/instances/:id/health` | Health check |
| GET | `/api/mcp/instances/:id/logs` | Get recent logs |

### Tool Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/servers/:id/tools` | List server's tools (from cache or discovery) |
| POST | `/api/mcp/instances/:id/invoke` | Invoke a tool on running instance |
| GET | `/api/mcp/tools/search` | Search tools across all servers |

### Request/Response Examples

**Start Instance**:
```bash
POST /api/mcp/instances
{
  "user_id": "user-123",
  "server_id": "github.anthropics/mcp-server-github"
}

Response:
{
  "id": "inst-abc123",
  "server_id": "github.anthropics/mcp-server-github",
  "status": "starting",
  "port": 3101,
  "endpoint_url": "http://localhost:3101/mcp"
}
```

**Invoke Tool**:
```bash
POST /api/mcp/instances/inst-abc123/invoke
{
  "tool": "create_issue",
  "arguments": {
    "repo": "myorg/myrepo",
    "title": "Bug fix needed",
    "body": "Description here"
  }
}

Response:
{
  "success": true,
  "result": {
    "issue_number": 42,
    "url": "https://github.com/myorg/myrepo/issues/42"
  }
}
```

---

## Component 6: Agent Integration

Enable Swarm worker agents (in Firecracker VMs) to use MCP servers.

### Architecture
```
┌──────────────────────────────────────────────────────────────────┐
│  Swarm Worker Agent (VM: 10.0.0.X)                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent Code                                                 │  │
│  │  ┌──────────────────┐                                       │  │
│  │  │ MCP Client Lib   │◄──── HTTP ────┐                       │  │
│  │  └──────────────────┘               │                       │  │
│  └─────────────────────────────────────│───────────────────────┘  │
└────────────────────────────────────────│──────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Host: MCP Fabric (port 8085)                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  /api/mcp/instances/:id/invoke                              │  │
│  │           │                                                  │  │
│  │           ▼                                                  │  │
│  │  ┌─────────────────┐    ┌─────────────────┐                 │  │
│  │  │ Server Manager  │───▶│ Running MCP     │                 │  │
│  │  │                 │    │ Server (PM2)    │                 │  │
│  │  └─────────────────┘    └─────────────────┘                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Agent MCP Client

Add to swarm-agent codebase: `/opt/swarm/agent/mcp-client.js`

```javascript
class MCPClient {
  constructor(fabricUrl = 'http://10.0.0.1:8085') {
    this.fabricUrl = fabricUrl;
    this.instanceCache = new Map();
  }
  
  // Ensure server is running, return instance
  async ensureServer(userId, serverId) {
    const cacheKey = `${userId}:${serverId}`;
    if (this.instanceCache.has(cacheKey)) {
      return this.instanceCache.get(cacheKey);
    }
    
    const res = await fetch(`${this.fabricUrl}/api/mcp/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, server_id: serverId })
    });
    
    const instance = await res.json();
    this.instanceCache.set(cacheKey, instance);
    return instance;
  }
  
  // Call a tool
  async callTool(instanceId, toolName, args) {
    const res = await fetch(`${this.fabricUrl}/api/mcp/instances/${instanceId}/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: toolName, arguments: args })
    });
    return res.json();
  }
  
  // List available tools
  async listTools(serverId) {
    const res = await fetch(`${this.fabricUrl}/api/mcp/servers/${encodeURIComponent(serverId)}/tools`);
    return res.json();
  }
}
```

---

## Database Migration

**File**: `/opt/swarm-mcp/migrations/003_server_execution.sql`

```sql
-- MCP Fabric Phase 3: Server Execution Schema

-- Server instances (running processes)
CREATE TABLE mcp_fabric.server_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped',
  transport_type TEXT NOT NULL,
  port INTEGER,
  pid INTEGER,
  pm2_id INTEGER,
  endpoint_url TEXT,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  health_status TEXT DEFAULT 'unknown',
  error_message TEXT,
  env_vars JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, server_id)
);

CREATE INDEX idx_instances_user ON mcp_fabric.server_instances(user_id);
CREATE INDEX idx_instances_status ON mcp_fabric.server_instances(status);
CREATE INDEX idx_instances_port ON mcp_fabric.server_instances(port) WHERE port IS NOT NULL;

-- Discovered tools
CREATE TABLE mcp_fabric.server_tools (
  id SERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_fabric.servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, tool_name)
);

CREATE INDEX idx_tools_server ON mcp_fabric.server_tools(server_id);
CREATE INDEX idx_tools_name ON mcp_fabric.server_tools(tool_name);
CREATE INDEX idx_tools_search ON mcp_fabric.server_tools 
  USING GIN(to_tsvector('english', coalesce(tool_name, '') || ' ' || coalesce(description, '')));

-- Port allocation tracking
CREATE TABLE mcp_fabric.port_allocations (
  port INTEGER PRIMARY KEY,
  instance_id UUID REFERENCES mcp_fabric.server_instances(id) ON DELETE SET NULL,
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

-- Pre-allocate port range 3100-3999
INSERT INTO mcp_fabric.port_allocations (port)
SELECT generate_series(3100, 3999);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA mcp_fabric TO swarm;
GRANT ALL ON ALL SEQUENCES IN SCHEMA mcp_fabric TO swarm;
```

---

## Implementation Steps

### Step 1: Create Migration
```bash
# Create and apply migration
psql $DATABASE_URL -f migrations/003_server_execution.sql
```

### Step 2: Create Transport Adapters
```
src/runtime/transports/
├── index.ts
├── stdio-adapter.ts
├── http-adapter.ts
└── sse-adapter.ts
```

### Step 3: Create Server Manager
```
src/runtime/server-manager.ts
```

### Step 4: Create Tool Discovery
```
src/runtime/tool-discovery.ts
```

### Step 5: Add OCI Cache Support
Update `src/cache/package-cache.ts` with `downloadOciImage()`

### Step 6: Add API Routes
Update `src/api/routes.ts` with instance and tool endpoints

### Step 7: Update index.ts
Initialize ServerManager and ToolDiscovery services

### Step 8: Test All Endpoints
```bash
# Start instance
curl -X POST http://localhost:8085/api/mcp/instances \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","server_id":"npm.@anthropic/mcp-server-memory"}'

# List tools
curl http://localhost:8085/api/mcp/instances/{id}/tools

# Invoke tool
curl -X POST http://localhost:8085/api/mcp/instances/{id}/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool":"store","arguments":{"key":"test","value":"hello"}}'

# Stop instance
curl -X POST http://localhost:8085/api/mcp/instances/{id}/stop
```

---

## File Structure After Phase 3

```
/opt/swarm-mcp/
├── src/
│   ├── index.ts                    # Updated with new services
│   ├── api/
│   │   └── routes.ts               # Updated with new endpoints
│   ├── cache/
│   │   └── package-cache.ts        # Updated with OCI support
│   ├── credentials/
│   │   └── credential-store.ts     # Existing (Phase 2)
│   ├── runtime/                    # NEW
│   │   ├── server-manager.ts       # Process lifecycle
│   │   ├── tool-discovery.ts       # Tool parsing
│   │   └── transports/
│   │       ├── index.ts
│   │       ├── stdio-adapter.ts
│   │       ├── http-adapter.ts
│   │       └── sse-adapter.ts
│   └── sync/
│       ├── registry-client.ts      # Existing
│       └── sync-service.ts         # Existing
├── migrations/
│   ├── 001_initial_schema.sql      # Phase 1
│   ├── 002_credentials_schema.sql  # Phase 2
│   └── 003_server_execution.sql    # Phase 3 (NEW)
├── cache/
│   ├── npm/                        # Existing
│   ├── pypi/                       # Existing
│   └── oci/                        # NEW
└── .env                            # Updated
```

---

## Environment Variables

Add to `.env`:
```bash
# Phase 3: Server Execution
MCP_PORT_RANGE_START=3100
MCP_PORT_RANGE_END=3999
MCP_HEALTH_CHECK_INTERVAL=30000    # 30 seconds
MCP_INSTANCE_TIMEOUT=300000        # 5 minutes idle timeout
MCP_MAX_INSTANCES_PER_USER=10
```

---

## Dev Droplet Access

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
cd /opt/swarm-mcp
```

---

## Success Criteria

- [ ] Migration 003 applied successfully
- [ ] OCI images download and cache correctly
- [ ] Server instances start via POST /api/mcp/instances
- [ ] Port allocation works (3100-3999 range)
- [ ] Credentials injected at runtime
- [ ] Health checks run and update status
- [ ] Tools discovered via MCP protocol
- [ ] Tool invocation works end-to-end
- [ ] Instances stop cleanly
- [ ] Agent MCP client works from VM
- [ ] PM2 process stable after changes

---

## Security Considerations

1. **Credential Injection**: Credentials decrypted only at server start, never logged
2. **Port Isolation**: Each user's instances on different ports
3. **Process Isolation**: Each MCP server runs as separate process
4. **Network**: VMs access MCP Fabric via host bridge (10.0.0.1:8085)
5. **Timeouts**: Idle instances auto-stopped after 5 minutes
6. **Limits**: Max 10 instances per user

---

## Future Enhancements (Phase 4+)

- **WebSocket streaming**: Real-time tool output
- **Resource quotas**: CPU/memory limits per instance
- **Billing integration**: Track usage per user
- **Marketplace**: User-contributed MCP servers
- **Kubernetes**: Scale beyond single host
- **Observability**: OpenTelemetry tracing

---

## Related Specs

- Phase 1: `/opt/swarm-specs/prompts/mcp-fabric-phase1-implementation.md`
- Phase 2: `/opt/swarm-specs/prompts/mcp-fabric-phase-2.md`
- MCP Hosting Platform: `/opt/swarm-specs/documentation/designs/mcp-hosting-platform.md`
