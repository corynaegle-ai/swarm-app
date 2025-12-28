# MCP Integration Phase 2: API, UI, and End-to-End Testing

## Persona: Alex Chen

You are **Alex Chen**, a senior systems architect with 15 years of experience building distributed systems. You specialize in:
- API design and RESTful best practices
- React/TypeScript frontend development
- Database integration patterns
- End-to-end testing strategies

Your coding style:
- Clean, readable code with meaningful variable names
- Comprehensive error handling
- Structured JSON logging
- Type-safe patterns even in JavaScript

Your communication style:
- Direct and technical
- Document decisions with comments
- Test-driven approach

---

## Context

MCP (Model Context Protocol) integration is partially complete:

| Component | Status | Location |
|-----------|--------|----------|
| MCPClient module | ✅ Complete | `/opt/swarm-agents/forge-agent/lib/mcp-client.js` |
| forge-agent main.js | ✅ Complete | `/opt/swarm-agents/forge-agent/main.js` (v4) |
| PostgreSQL schema | ✅ Complete | `tickets.mcp_servers`, `projects.mcp_servers` (JSONB) |
| MCP Fabric API | ✅ Running | `http://localhost:8085` on host |
| Platform API | ❌ Needs update | Must include mcp_servers in claim response |
| Dashboard UI | ❌ Needs update | Project settings for MCP servers |
| E2E Test | ❌ Not done | Full ticket flow with MCP tools |

---

## Pre-Implementation: RAG Queries

Before writing any code, query RAG to understand existing patterns:

```bash
# Platform API ticket routes
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ticket claim API endpoint projectSettings", "limit": 5}'

# Dashboard project settings UI
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "project settings form React component", "limit": 5}'

# MCP Fabric server list
curl -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "MCP server registry list available servers", "limit": 5}'
```

---

## Task 1: Update Platform API - Ticket Claim Response

### Objective

Modify the ticket claim endpoint to include `mcp_servers` in the response, merging project-level defaults with ticket-level overrides.

### Location

`/opt/swarm-app/apps/platform/routes/tickets.js` (or similar)

### Current Behavior

```javascript
// Current claim response
{
  "ticket": { ...ticketData },
  "projectSettings": {
    "worker_model": "claude-sonnet-4-20250514",
    // ... other settings
  }
}
```

### Required Changes

1. **Fetch mcp_servers from ticket and project**:

```javascript
// In claim endpoint handler
async function claimTicket(req, res) {
  const { agent_id, project_id } = req.query;
  
  // ... existing claim logic ...
  
  // Fetch ticket with mcp_servers
  const ticket = await db.query(`
    SELECT t.*, p.mcp_servers as project_mcp_servers
    FROM tickets t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = $1
  `, [ticketId]);
  
  // Merge MCP servers: ticket overrides project defaults
  const ticketMcpServers = ticket.mcp_servers || [];
  const projectMcpServers = ticket.project_mcp_servers || [];
  const effectiveMcpServers = ticketMcpServers.length > 0 
    ? ticketMcpServers 
    : projectMcpServers;
  
  // Include in response
  res.json({
    ticket: {
      ...ticketData,
      mcp_servers: effectiveMcpServers,
      user_id: ticket.user_id || ticket.tenant_id || 'default'
    },
    projectSettings: {
      ...projectSettings,
      mcp_servers: projectMcpServers  // Also expose project defaults
    }
  });
}
```

2. **Update ticket complete endpoint** to accept MCP usage stats:

```javascript
// In complete endpoint
async function completeTicket(req, res) {
  const { success, pr_url, error, usage, mcp_loops } = req.body;
  
  await db.query(`
    UPDATE tickets SET
      state = $1,
      pr_url = $2,
      error = $3,
      result = $4,
      completed_at = NOW()
    WHERE id = $5
  `, [
    success ? 'completed' : 'failed',
    pr_url,
    error,
    JSON.stringify({ usage, mcp_loops }),
    ticketId
  ]);
}
```

### Validation

```bash
# Test claim endpoint includes mcp_servers
curl -X POST "http://localhost:8080/api/tickets/claim?agent_id=test" \
  -H "Content-Type: application/json" | jq '.ticket.mcp_servers, .projectSettings.mcp_servers'
```

---

## Task 2: Dashboard UI - Project MCP Server Configuration

### Objective

Add UI for configuring which MCP servers are available to agents working on a project.

### Location

`/opt/swarm-app/apps/dashboard/src/components/ProjectSettings.jsx` (or create new)

### Design

```
┌─────────────────────────────────────────────────────────────┐
│  Project Settings                                           │
├─────────────────────────────────────────────────────────────┤
│  General  │  MCP Servers  │  Models  │  Integrations        │
├───────────┴───────────────────────────────────────────────────┤
│                                                               │
│  MCP Servers                                                  │
│  Configure external tools available to agents                 │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Available Servers                    Enabled for Project │ │
│  │ ┌───────────────────────┐           ┌─────────────────┐ │ │
│  │ │ □ filesystem-server   │    →      │ ✓ mcp-merchant  │ │ │
│  │ │ □ github-server       │    ←      │                 │ │ │
│  │ │ □ mcp-merchant        │           │                 │ │ │
│  │ │ □ postgres-server     │           │                 │ │ │
│  │ └───────────────────────┘           └─────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  [ Save Changes ]                                             │
└───────────────────────────────────────────────────────────────┘
```

### Implementation

1. **Fetch available MCP servers from Fabric**:

```javascript
// src/api/mcp.js
export async function fetchAvailableMCPServers() {
  const response = await fetch('/api/mcp/servers');
  if (!response.ok) throw new Error('Failed to fetch MCP servers');
  return response.json();
}

export async function updateProjectMCPServers(projectId, serverIds) {
  const response = await fetch(`/api/projects/${projectId}/mcp-servers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mcp_servers: serverIds })
  });
  if (!response.ok) throw new Error('Failed to update MCP servers');
  return response.json();
}
```

2. **React Component**:

```jsx
// src/components/ProjectMCPSettings.jsx
import React, { useState, useEffect } from 'react';
import { fetchAvailableMCPServers, updateProjectMCPServers } from '../api/mcp';

export function ProjectMCPSettings({ projectId, currentServers = [] }) {
  const [availableServers, setAvailableServers] = useState([]);
  const [enabledServers, setEnabledServers] = useState(currentServers);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAvailableMCPServers()
      .then(data => {
        setAvailableServers(data.servers || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const toggleServer = (serverId) => {
    setEnabledServers(prev => 
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProjectMCPServers(projectId, enabledServers);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4">Loading MCP servers...</div>;

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-lg font-semibold">MCP Servers</h3>
      <p className="text-sm text-gray-600">
        Configure external tools available to agents working on this project.
      </p>
      
      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      <div className="border rounded-lg divide-y">
        {availableServers.map(server => (
          <label 
            key={server.id} 
            className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={enabledServers.includes(server.id)}
              onChange={() => toggleServer(server.id)}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <div className="ml-3">
              <div className="font-medium">{server.id}</div>
              <div className="text-sm text-gray-500">{server.description}</div>
              <div className="text-xs text-gray-400">
                {server.tools?.length || 0} tools available
              </div>
            </div>
          </label>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}
```

3. **Backend API Route** (add to platform):

```javascript
// routes/projects.js - Add MCP servers endpoint

// GET /api/mcp/servers - List available MCP servers from Fabric
router.get('/api/mcp/servers', async (req, res) => {
  try {
    const fabricResponse = await fetch('http://localhost:8085/api/mcp/servers');
    const servers = await fabricResponse.json();
    res.json(servers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch MCP servers' });
  }
});

// PUT /api/projects/:id/mcp-servers - Update project MCP config
router.put('/api/projects/:id/mcp-servers', async (req, res) => {
  const { id } = req.params;
  const { mcp_servers } = req.body;
  
  try {
    await db.query(
      'UPDATE projects SET mcp_servers = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(mcp_servers), id]
    );
    res.json({ success: true, mcp_servers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## Task 3: End-to-End Test with Real MCP-Enabled Ticket

### Objective

Create and execute a complete ticket flow that uses MCP tools, verifying the entire pipeline works.

### Test Scenario

Use the `ai.shawndurrani/mcp-merchant` server (already registered) to fetch product data and generate a report.

### Step-by-Step Test

#### 1. Create Test Project with MCP Servers

```bash
# Insert test project with MCP servers configured
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "
INSERT INTO projects (id, name, repo_url, mcp_servers, tenant_id, created_at, updated_at)
VALUES (
  'proj-mcp-test-001',
  'MCP Integration Test',
  'https://github.com/corynaegle-ai/swarm-test-repo',
  '[\"ai.shawndurrani/mcp-merchant\"]'::jsonb,
  'default',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET mcp_servers = EXCLUDED.mcp_servers;
"
```

#### 2. Create Test Ticket

```bash
# Create ticket that requires MCP tool usage
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "
INSERT INTO tickets (
  id, 
  project_id, 
  title, 
  description, 
  acceptance_criteria,
  state,
  mcp_servers,
  user_id,
  repo_url,
  estimated_scope,
  created_at,
  updated_at
) VALUES (
  'TKT-MCP-TEST-001',
  'proj-mcp-test-001',
  'Generate Product Catalog Report',
  'Use the MCP merchant tools to fetch product data and generate a markdown report listing all products with their prices.',
  '- Report file created at docs/product-catalog.md\n- Contains all products from merchant API\n- Each product shows name and price\n- File is valid markdown',
  'pending',
  '[\"ai.shawndurrani/mcp-merchant\"]'::jsonb,
  'test-user-001',
  'https://github.com/corynaegle-ai/swarm-test-repo',
  'small',
  NOW(),
  NOW()
);
"
```

#### 3. Verify Ticket Claim Response

```bash
# Claim the ticket and verify mcp_servers is included
curl -s -X POST "http://localhost:8080/api/tickets/claim?agent_id=test-agent&project_id=proj-mcp-test-001" \
  -H "Content-Type: application/json" | jq '{
    ticket_id: .ticket.id,
    mcp_servers: .ticket.mcp_servers,
    user_id: .ticket.user_id,
    project_mcp_servers: .projectSettings.mcp_servers
  }'
```

Expected output:
```json
{
  "ticket_id": "TKT-MCP-TEST-001",
  "mcp_servers": ["ai.shawndurrani/mcp-merchant"],
  "user_id": "test-user-001",
  "project_mcp_servers": ["ai.shawndurrani/mcp-merchant"]
}
```

#### 4. Test MCP Client Directly

```bash
# From host, verify MCP Fabric is working
curl -s http://localhost:8085/health | jq .

# List available servers
curl -s http://localhost:8085/api/mcp/servers | jq '.servers[].id'

# Start an instance
curl -s -X POST http://localhost:8085/api/mcp/instances \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user-001", "server_id": "ai.shawndurrani/mcp-merchant"}' | jq .

# List tools (use instance ID from above)
curl -s http://localhost:8085/api/mcp/instances/{INSTANCE_ID}/tools | jq '.tools[].name'

# Invoke health tool
curl -s -X POST http://localhost:8085/api/mcp/instances/{INSTANCE_ID}/invoke \
  -H "Content-Type: application/json" \
  -d '{"tool": "health", "arguments": {}}' | jq .
```

#### 5. Run forge-agent in File Mode

Create test input file:

```bash
cat > /tmp/mcp-test-input.json << 'EOF'
{
  "ticket": {
    "id": "TKT-MCP-TEST-001",
    "title": "Generate Product Catalog Report",
    "description": "Use the MCP merchant tools to fetch product data and generate a markdown report.",
    "acceptance_criteria": "- Report file at docs/product-catalog.md\n- All products listed with prices",
    "repo_url": "https://github.com/corynaegle-ai/swarm-test-repo",
    "mcp_servers": ["ai.shawndurrani/mcp-merchant"],
    "user_id": "test-user-001",
    "files_hint": "docs/product-catalog.md"
  },
  "projectSettings": {
    "worker_model": "claude-sonnet-4-20250514",
    "mcp_servers": ["ai.shawndurrani/mcp-merchant"]
  }
}
EOF
```

Run the agent:

```bash
cd /opt/swarm-agents/forge-agent

# Set environment
export ANTHROPIC_API_KEY="sk-ant-..."  # Your key
export GITHUB_TOKEN="ghp_..."           # Your token
export MCP_FABRIC_URL="http://localhost:8085"
export DEBUG=1

# Run in file mode
node main.js /tmp/mcp-test-input.json /tmp/mcp-test-output.json

# Check output
cat /tmp/mcp-test-output.json | jq '{
  success: .success,
  pr_url: .prUrl,
  files: .filesWritten,
  mcp_loops: .mcpLoops,
  usage: .usage
}'
```

#### 6. Verify Results

```bash
# Check agent logs for MCP calls
grep -i "mcp" /tmp/mcp-test-output.json

# Verify PR was created (if successful)
# Check the repo for the new branch and PR

# Query ticket status
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c "
SELECT id, state, pr_url, result 
FROM tickets 
WHERE id = 'TKT-MCP-TEST-001';
"
```

---

## Success Criteria

### Task 1: Platform API ✓
- [ ] `/api/tickets/claim` response includes `ticket.mcp_servers`
- [ ] `/api/tickets/claim` response includes `ticket.user_id`
- [ ] `/api/tickets/claim` response includes `projectSettings.mcp_servers`
- [ ] MCP servers merge correctly (ticket overrides project)

### Task 2: Dashboard UI ✓
- [ ] Project settings page has MCP Servers tab
- [ ] Available servers fetched from MCP Fabric
- [ ] Checkboxes toggle server enablement
- [ ] Save persists to PostgreSQL `projects.mcp_servers`
- [ ] UI shows server descriptions and tool counts

### Task 3: End-to-End Test ✓
- [ ] Test project created with `mcp_servers` configured
- [ ] Test ticket created with MCP requirement
- [ ] Ticket claim returns MCP configuration
- [ ] forge-agent initializes MCPClient successfully
- [ ] Agent makes at least one MCP tool call
- [ ] Tool result is incorporated into Claude response
- [ ] Final code is generated and committed
- [ ] PR is created successfully
- [ ] Output includes `mcpLoops > 0`

---

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `/opt/swarm-app/apps/platform/routes/tickets.js` | Modify | Add mcp_servers to claim response |
| `/opt/swarm-app/apps/platform/routes/projects.js` | Add endpoint | MCP servers CRUD |
| `/opt/swarm-app/apps/dashboard/src/api/mcp.js` | Create | MCP API client |
| `/opt/swarm-app/apps/dashboard/src/components/ProjectMCPSettings.jsx` | Create | MCP config UI |
| `/opt/swarm-specs/tests/mcp-e2e-test.sh` | Create | E2E test script |

---

## Commit Message Template

```
feat(mcp): complete MCP integration phase 2

API Changes:
- Add mcp_servers to ticket claim response
- Add mcp_servers to projectSettings
- Add PUT /api/projects/:id/mcp-servers endpoint
- Add GET /api/mcp/servers proxy to Fabric

Dashboard UI:
- Add ProjectMCPSettings component
- Add MCP Servers tab to project settings
- Server list with checkboxes and descriptions

Testing:
- Add E2E test script for MCP-enabled tickets
- Verify full pipeline from claim to PR

Closes: MCP-PHASE-2
```

---

## Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| MCP servers not in claim response | API route logic | Ensure JOIN with projects table |
| Empty server list in UI | Fabric connectivity | Check http://localhost:8085/api/mcp/servers |
| Agent can't reach Fabric | Network config | Use 10.0.0.1:8085 from VM, localhost:8085 from host |
| Tool call fails | Instance status | Check /api/mcp/instances/:id/health |
| No files generated | Claude response parsing | Check for mcp_call blocking final JSON |
