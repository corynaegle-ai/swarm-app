# Prompt: MCP Factory Ticket Integration

## Objective

Connect the MCP Server project type in the dashboard to the MCP-specific ticket generator so that MCP projects create properly structured tickets (scaffold → tools → validation → packaging) instead of generic HITL tickets.

## Context

### Current Architecture (DEV: 134.199.235.140)

**Services Running:**
- `swarm-platform-dev` (port 8080) - Main API
- `swarm-dashboard-dev` (port 3000) - React frontend
- `mcp-factory` (port 3456) - MCP spec parser & code generator

**Existing Components That Work:**

1. **mcp-factory `/api/design` endpoint** (`/opt/swarm-mcp-factory/src/api.js` line 318):
   - Parses natural language → MCP spec
   - Calls swarm-platform `/api/mcp/create-project`
   - Calls swarm-platform `/api/mcp/create-tickets`
   - ✅ Tested working: Creates 5+ tickets per MCP server

2. **swarm-platform `/api/mcp/*` routes** (`/opt/swarm-platform/routes/mcp.js`):
   - `POST /api/mcp/create-project` - Creates MCP project
   - `POST /api/mcp/create-tickets` - Creates tickets from spec
   - `GET /api/mcp/tickets/:projectId` - Lists MCP tickets
   - Auth: `MCP_SERVICE_KEY` Bearer token

3. **mcp-ticket-generator service** (`/opt/swarm-platform/services/mcp-ticket-generator.js`):
   - `generateMcpTickets(spec, projectId, jobId)`
   - Creates structured tickets:
     - `TKT-xxx-EPIC` - Server Scaffold (state: ready)
     - `TKT-xxx-TOOL-N` - One per tool (state: blocked)
     - `TKT-xxx-VAL` - Validation & Tests (state: blocked)
     - `TKT-xxx-PKG` - Package & Distribution (state: blocked)

### Current Problem

Dashboard MCP Server flow uses `createSession()` → HITL → `ticket-generator.js` which:
- Doesn't detect MCP project type
- Uses generic Claude-based ticket breakdown
- Misses MCP-specific patterns (scaffold, per-tool tickets, validation, packaging)

## Implementation Options

### Option A: Direct MCP Factory Call (Recommended)

Modify dashboard to call mcp-factory `/api/design` directly for MCP projects, bypassing HITL.

**Pros:** Uses purpose-built MCP workflow, simpler
**Cons:** Skips HITL clarification phase

**Files to modify:**
- `/opt/swarm-dashboard/src/pages/CreateProject.jsx`
- `/opt/swarm-dashboard/src/services/api.js` (add mcpDesign function)

### Option B: Integrate at Ticket Generation

Modify `ticket-generator.js` to detect MCP projects and delegate to `mcp-ticket-generator.js`.

**Pros:** Preserves HITL clarification, unified flow
**Cons:** More complex, needs spec_card → MCP spec conversion

**Files to modify:**
- `/opt/swarm-platform/services/ticket-generator.js`

### Option C: Hybrid - HITL + MCP Generator

Keep HITL for clarification, but after spec_card is complete, call mcp-factory to parse and generate tickets.

**Files to modify:**
- `/opt/swarm-platform/routes/sessions.js` (start-build endpoint)
- `/opt/swarm-platform/services/ticket-generator.js`

## Recommended Implementation: Option A

### Step 1: Add MCP API Service Function ✅ COMPLETE

Created `/opt/swarm-dashboard/src/services/mcpApi.js`:

```javascript
/**
 * MCP Factory API Client
 * Calls mcp-factory service for MCP server design
 */

const MCP_FACTORY_URL = import.meta.env.VITE_MCP_FACTORY_URL || '/api/mcp-factory';

export async function designMcpServer(description, tenantId = 'default') {
  const response = await fetch(`${MCP_FACTORY_URL}/api/design`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description,
      tenant_id: tenantId
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to design MCP server');
  }
  
  return response.json();
}

export async function getMcpDesignStatus(projectId) {
  const response = await fetch(`${MCP_FACTORY_URL}/api/design/${projectId}/status`);
  if (!response.ok) {
    throw new Error('Failed to get design status');
  }
  return response.json();
}
```

### Step 2: Add Caddy Proxy Route

Add to `/etc/caddy/Caddyfile` (dashboard block):

```
handle /api/mcp-factory/* {
    uri strip_prefix /api/mcp-factory
    reverse_proxy localhost:3456
}
```

### Step 3: Modify CreateProject.jsx

In the `handleMcpServerSubmit` function, change from:
```javascript
const result = await createSession(mcpServerName.trim(), mcpSpec, 'mcp_server');
```

To:
```javascript
import { designMcpServer } from '../services/mcpApi';

// In handleMcpServerSubmit:
const fullDescription = `
MCP Server: ${mcpServerName}

${mcpDescription}

${mcpTools ? `Desired Tools:\n${mcpTools}` : ''}
`.trim();

const result = await designMcpServer(fullDescription);

// Navigate to project view with tickets
navigate(`/projects/${result.project.id}`);
```

### Step 4: Add Loading State for MCP Design

MCP design calls Claude API and takes 5-15 seconds. Add loading state:

```javascript
const [isDesigning, setIsDesigning] = useState(false);

const handleMcpServerSubmit = async () => {
  setIsDesigning(true);
  setLocalError(null);
  
  try {
    const result = await designMcpServer(fullDescription);
    navigate(`/projects/${result.project.id}`);
  } catch (err) {
    setLocalError(err.message);
  } finally {
    setIsDesigning(false);
  }
};
```

### Step 5: Restart Services

```bash
# On DEV droplet
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Reload Caddy
caddy reload --config /etc/caddy/Caddyfile

# Restart dashboard (will rebuild)
pm2 restart swarm-dashboard-dev
```

## Verification Steps

1. **Test API directly:**
```bash
curl -X POST http://localhost:3456/api/design \
  -H 'Content-Type: application/json' \
  -d '{"description": "MCP server for managing GitHub issues"}'
```

2. **Test via Caddy proxy:**
```bash
curl -X POST https://dashboard.dev.swarmstack.net/api/mcp-factory/api/design \
  -H 'Content-Type: application/json' \
  -d '{"description": "MCP server for Slack notifications"}'
```

3. **Test full flow:**
   - Go to dashboard.dev.swarmstack.net
   - Click "Create Project"
   - Select "MCP Server"
   - Fill in name: "Test MCP Server"
   - Fill in description: "A server for testing things"
   - Submit
   - Verify redirects to project page with 5+ tickets

## Acceptance Criteria

- [ ] MCP Server project type in dashboard creates tickets via mcp-factory
- [ ] Tickets follow MCP pattern: EPIC → TOOL-N → VAL → PKG
- [ ] Project appears in Projects list with type='mcp'
- [ ] Tickets appear in Tickets view, filterable by project
- [ ] Loading state shown during design (5-15s)
- [ ] Error handling for API failures
- [ ] Works on DEV environment (134.199.235.140)

## Environment Details

**DEV Droplet:** 134.199.235.140
**SSH:** `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
**PATH:** `export PATH=/root/.nvm/versions/node/v22.21.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`

**Service Locations:**
- Dashboard: `/opt/swarm-dashboard`
- Platform: `/opt/swarm-platform`
- MCP Factory: `/opt/swarm-mcp-factory`

**Git Repos (commit after changes):**
- `git -C /opt/swarm-dashboard add -A && git commit -m "feat: integrate MCP ticket generation"`
- `git -C /opt/swarm-platform add -A && git commit -m "feat: MCP ticket integration"` (if needed)

## Notes

- Do NOT modify PROD (146.190.35.235)
- All work on DEV only
- Test thoroughly before any promotion discussion
- mcp-factory already has ANTHROPIC_API_KEY configured
- MCP_SERVICE_KEY defaults to 'mcp-internal-key-dev' (ok for dev)
