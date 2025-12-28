# Agent MCP Client Integration

## Persona: Alex Chen

You are Alex Chen, a master systems architect with 30 years of experience across networking, security, databases, distributed systems, and AI/ML infrastructure. You approach problems methodically, validate assumptions with tests, and write production-grade code. You follow the Context Management Protocol to prevent session freezes.

**Your working style:**
- Read existing code before writing new code
- Query RAG before implementing (POST http://localhost:8082/api/rag/search)
- Test incrementally, not all at once
- Commit progress frequently
- Update session notes in git

---

## Context

MCP Fabric Phase 3 is **COMPLETE** on the dev droplet (134.199.235.140). The service runs on port 8085 and provides:

### Available Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/mcp/instances` | Start MCP server instance |
| GET | `/api/mcp/instances?user_id=X` | List user's instances |
| GET | `/api/mcp/instances/:id` | Get instance details |
| POST | `/api/mcp/instances/:id/stop` | Stop instance |
| GET | `/api/mcp/instances/:id/tools` | List available tools |
| POST | `/api/mcp/instances/:id/invoke` | Invoke a tool |
| GET | `/api/mcp/instances/:id/health` | Health check |

### Verified Working (2024-12-24)

```bash
# Start instance
curl -X POST http://localhost:8085/api/mcp/instances \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","server_id":"ai.shawndurrani/mcp-merchant"}'
# Returns: { id, status: "running", pid: 2507490 }

# List tools
curl http://localhost:8085/api/mcp/instances/{id}/tools
# Returns: { tools: [{ name, description, inputSchema }] }

# Invoke tool
curl -X POST http://localhost:8085/api/mcp/instances/{id}/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool":"listProducts","arguments":{}}'
# Returns: { success: true, result: {...} }
```

---

## Objective

Enable Swarm worker agents (running in Firecracker VMs) to discover and use MCP server tools via the MCP Fabric API.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Firecracker VM (10.0.0.X)                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  swarm-agent-v2                                       │  │
│  │  ┌─────────────────┐    ┌─────────────────────────┐   │  │
│  │  │  Agent Logic    │───▶│  MCPClient              │   │  │
│  │  │  (Claude API)   │    │  - ensureServer()       │   │  │
│  │  │                 │◀───│  - callTool()           │   │  │
│  │  │                 │    │  - listTools()          │   │  │
│  │  └─────────────────┘    └───────────┬─────────────┘   │  │
│  └─────────────────────────────────────│─────────────────┘  │
└─────────────────────────────────────────│───────────────────┘
                                          │ HTTP
                                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Host (10.0.0.1)                                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MCP Fabric (port 8085)                               │  │
│  │  - Manages MCP server processes                       │  │
│  │  - Injects credentials at runtime                     │  │
│  │  - Discovers and caches tools                         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight**: VMs access host services via bridge gateway at `10.0.0.1`. MCP Fabric listens on `0.0.0.0:8085`, so VMs can reach it at `http://10.0.0.1:8085`.

---

## Implementation

### File: `/opt/swarm/agent/lib/mcp-client.js`

```javascript
/**
 * MCP Client for Swarm Agents
 * 
 * Enables agents in Firecracker VMs to use MCP server tools
 * via the MCP Fabric API running on the host.
 */

const MCP_FABRIC_URL = process.env.MCP_FABRIC_URL || 'http://10.0.0.1:8085';
const MCP_REQUEST_TIMEOUT = 30000;

class MCPClient {
  constructor(userId, options = {}) {
    this.userId = userId;
    this.fabricUrl = options.fabricUrl || MCP_FABRIC_URL;
    this.instanceCache = new Map(); // serverId -> instanceId
    this.toolCache = new Map();     // serverId -> tools[]
  }

  /**
   * Ensure an MCP server is running for this user.
   * Returns cached instance if already running.
   * 
   * @param {string} serverId - e.g., "ai.shawndurrani/mcp-merchant"
   * @returns {Promise<{id: string, status: string, tools: Array}>}
   */
  async ensureServer(serverId) {
    // Check cache first
    const cachedId = this.instanceCache.get(serverId);
    if (cachedId) {
      try {
        const health = await this._request('GET', `/api/mcp/instances/${cachedId}/health`);
        if (health.healthy) {
          return { id: cachedId, status: 'running', tools: this.toolCache.get(serverId) || [] };
        }
      } catch {
        // Instance gone, clear cache
        this.instanceCache.delete(serverId);
      }
    }

    // Start new instance
    const instance = await this._request('POST', '/api/mcp/instances', {
      user_id: this.userId,
      server_id: serverId
    });

    if (instance.error) {
      throw new Error(`Failed to start MCP server: ${instance.error}`);
    }

    // Cache instance ID
    this.instanceCache.set(serverId, instance.id);

    // Fetch and cache tools
    const toolsResponse = await this._request('GET', `/api/mcp/instances/${instance.id}/tools`);
    const tools = toolsResponse.tools || [];
    this.toolCache.set(serverId, tools);

    return { id: instance.id, status: instance.status, tools };
  }

  /**
   * List available tools for a server (from cache or fresh fetch).
   * 
   * @param {string} serverId
   * @returns {Promise<Array<{name: string, description: string, inputSchema: object}>>}
   */
  async listTools(serverId) {
    // Check cache
    if (this.toolCache.has(serverId)) {
      return this.toolCache.get(serverId);
    }

    // Ensure server running, which populates cache
    const { tools } = await this.ensureServer(serverId);
    return tools;
  }

  /**
   * Invoke a tool on an MCP server.
   * Automatically starts the server if not running.
   * 
   * @param {string} serverId - e.g., "ai.shawndurrani/mcp-merchant"
   * @param {string} toolName - e.g., "listProducts"
   * @param {object} args - Tool arguments
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async callTool(serverId, toolName, args = {}) {
    // Ensure server is running
    const { id: instanceId } = await this.ensureServer(serverId);

    // Invoke tool
    const response = await this._request('POST', `/api/mcp/instances/${instanceId}/invoke`, {
      tool: toolName,
      arguments: args
    });

    return response;
  }

  /**
   * Stop an MCP server instance.
   * 
   * @param {string} serverId
   * @returns {Promise<boolean>}
   */
  async stopServer(serverId) {
    const instanceId = this.instanceCache.get(serverId);
    if (!instanceId) return true;

    try {
      await this._request('POST', `/api/mcp/instances/${instanceId}/stop`);
      this.instanceCache.delete(serverId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop all running instances for this user.
   */
  async stopAll() {
    const promises = Array.from(this.instanceCache.keys()).map(id => this.stopServer(id));
    await Promise.allSettled(promises);
    this.instanceCache.clear();
    this.toolCache.clear();
  }

  /**
   * Internal HTTP request helper.
   */
  async _request(method, path, body = null) {
    const url = `${this.fabricUrl}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT)
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP Fabric error ${response.status}: ${text}`);
    }

    return response.json();
  }
}

module.exports = { MCPClient };
```

---

## Integration with swarm-agent-v2

### Step 1: Add MCP Client to Agent Context

Update `/opt/swarm/agent/swarm-agent-v2.js` to initialize MCPClient:

```javascript
const { MCPClient } = require('./lib/mcp-client.js');

// In agent initialization (after getting ticket/user context)
const mcpClient = new MCPClient(userId);
```

### Step 2: Expose MCP Tools to Claude

When building the Claude prompt, include available MCP tools:

```javascript
async function buildToolsPrompt(mcpClient, mcpServers = []) {
  const toolDescriptions = [];
  
  for (const serverId of mcpServers) {
    try {
      const tools = await mcpClient.listTools(serverId);
      for (const tool of tools) {
        toolDescriptions.push({
          server: serverId,
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        });
      }
    } catch (err) {
      console.error(`[MCP] Failed to list tools for ${serverId}:`, err.message);
    }
  }
  
  if (toolDescriptions.length === 0) return '';
  
  return `
## Available MCP Tools

You have access to the following external tools via MCP servers:

${toolDescriptions.map(t => `### ${t.server} / ${t.name}
${t.description || 'No description'}
Parameters: ${JSON.stringify(t.parameters, null, 2)}
`).join('\n')}

To use a tool, output a JSON block:
\`\`\`json
{"mcp_call": {"server": "server_id", "tool": "tool_name", "args": {...}}}
\`\`\`
`;
}
```

### Step 3: Handle MCP Tool Calls in Agent Loop

```javascript
async function handleMCPCall(mcpClient, mcpCall) {
  const { server, tool, args } = mcpCall;
  
  console.log(`[MCP] Calling ${server}/${tool} with args:`, args);
  
  const result = await mcpClient.callTool(server, tool, args);
  
  if (!result.success) {
    return { error: result.error };
  }
  
  return { result: result.result };
}

// In agent loop, after Claude response:
const mcpMatch = response.match(/```json\s*(\{"mcp_call":.+?\})\s*```/s);
if (mcpMatch) {
  const mcpCall = JSON.parse(mcpMatch[1]).mcp_call;
  const mcpResult = await handleMCPCall(mcpClient, mcpCall);
  // Feed result back to Claude for next iteration
}
```

### Step 4: Cleanup on Agent Exit

```javascript
// In agent cleanup/exit handler
process.on('SIGTERM', async () => {
  await mcpClient.stopAll();
  process.exit(0);
});
```

---

## Configuration

### Environment Variables

Add to VM environment or agent config:

```bash
# MCP Fabric URL (default: http://10.0.0.1:8085)
MCP_FABRIC_URL=http://10.0.0.1:8085

# Request timeout in ms (default: 30000)
MCP_REQUEST_TIMEOUT=30000
```

### Ticket-Level MCP Server Config

Tickets can specify which MCP servers the agent should use:

```json
{
  "ticket_id": "123",
  "mcp_servers": [
    "ai.shawndurrani/mcp-merchant",
    "npm.@anthropic/mcp-server-github"
  ]
}
```

---

## Testing

### Unit Test: MCP Client

Create `/opt/swarm/agent/test/mcp-client.test.js`:

```javascript
const { MCPClient } = require('../lib/mcp-client.js');

async function testMCPClient() {
  // Use localhost for testing on host, 10.0.0.1 from VM
  const client = new MCPClient('test-user', { 
    fabricUrl: 'http://localhost:8085' 
  });

  console.log('1. Testing ensureServer...');
  const instance = await client.ensureServer('ai.shawndurrani/mcp-merchant');
  console.log('   Instance:', instance.id, 'Status:', instance.status);
  console.log('   Tools:', instance.tools.map(t => t.name));

  console.log('2. Testing listTools...');
  const tools = await client.listTools('ai.shawndurrani/mcp-merchant');
  console.log('   Found', tools.length, 'tools');

  console.log('3. Testing callTool...');
  const result = await client.callTool(
    'ai.shawndurrani/mcp-merchant',
    'health',
    {}
  );
  console.log('   Result:', result);

  console.log('4. Testing stopServer...');
  await client.stopServer('ai.shawndurrani/mcp-merchant');
  console.log('   Stopped');

  console.log('✅ All tests passed');
}

testMCPClient().catch(console.error);
```

### Integration Test: From VM

```bash
# SSH into a running VM
ssh root@10.0.0.2

# Test connectivity to MCP Fabric
curl -s http://10.0.0.1:8085/health | jq

# Run agent test script
cd /opt/swarm/agent
node test/mcp-client.test.js
```

---

## Success Criteria

- [ ] `mcp-client.js` created and working
- [ ] MCPClient can start/stop instances
- [ ] MCPClient can list and invoke tools
- [ ] Integration with swarm-agent-v2 complete
- [ ] Claude can request MCP tool calls
- [ ] Agent handles MCP results correctly
- [ ] Cleanup on agent exit works
- [ ] Works from inside Firecracker VM (10.0.0.1:8085)
- [ ] Unit tests passing
- [ ] Session notes updated

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `/opt/swarm/agent/lib/mcp-client.js` | CREATE |
| `/opt/swarm/agent/swarm-agent-v2.js` | MODIFY - add MCP integration |
| `/opt/swarm/agent/test/mcp-client.test.js` | CREATE |
| `/opt/swarm-specs/session-notes/current.md` | UPDATE |

---

## Dev Droplet Access

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# MCP Fabric logs
pm2 logs swarm-mcp --lines 50

# Test MCP Fabric
curl http://localhost:8085/health | jq
```

---

## Related Specs

- MCP Fabric Phase 3: `/opt/swarm-specs/prompts/mcp-fabric-phase-3.md`
- Swarm Agent v2: `/opt/swarm/agent/swarm-agent-v2.js`
- Session Notes: `/opt/swarm-specs/session-notes/current.md`
