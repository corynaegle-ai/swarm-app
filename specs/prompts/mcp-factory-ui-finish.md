# MCP Factory UI - Finish Implementation

## Context
MCP Factory backend is fully operational on DEV droplet (134.199.235.140, port 3456). The UI page exists but has critical missing pieces preventing access.

## Current State

| Component | Status | Location |
|-----------|--------|----------|
| `McpFactory.jsx` | ✅ Complete | `/opt/swarm-dashboard/src/pages/McpFactory.jsx` (287 lines) |
| `McpFactory.css` | ✅ Complete | `/opt/swarm-dashboard/src/pages/McpFactory.css` (299 lines) |
| `App.jsx` route | ✅ Complete | Route `/mcp-factory` configured |
| Backend API | ✅ Running | PM2 `mcp-factory` on port 3456 |
| `mcpApi.js` | ⚠️ Partial | `/opt/swarm-dashboard/src/services/mcpApi.js` (32 lines) |
| **Sidebar entry** | ❌ MISSING | No navigation link exists |
| **Dashboard build** | ❌ STALE | dist from Dec 19, code updated Dec 22 |

## Tasks (Priority Order)

### Task 1: Add Sidebar Navigation Entry (CRITICAL)
**File:** `/opt/swarm-dashboard/src/components/Sidebar.jsx`

The `Factory` icon is already imported but used for "Learning". Add MCP Factory entry:

```javascript
// Find the mainNav array and add this entry (around line 28-31):
{ to: '/mcp-factory', icon: Factory, label: 'MCP Factory' },
```

**Note:** You may need to import a different icon for MCP Factory to avoid duplicate. Options:
- `Cpu` from lucide-react
- `Boxes` from lucide-react  
- `Workflow` from lucide-react

### Task 2: Rebuild Dashboard (CRITICAL)
```bash
cd /opt/swarm-dashboard && npm run build && pm2 restart swarm-dashboard-dev
```

### Task 3: Expand mcpApi.js (Optional Enhancement)
**File:** `/opt/swarm-dashboard/src/services/mcpApi.js`

Current file only has `designMcpServer` and `getMcpDesignStatus`. Add:

```javascript
const MCP_FACTORY_URL = import.meta.env.VITE_MCP_FACTORY_URL || "/api/mcp-factory";

export async function generateMcpServer(description) {
  const response = await fetch(`${MCP_FACTORY_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ description }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Generation failed");
  }
  return response.json();
}

export async function getServers() {
  const response = await fetch(`${MCP_FACTORY_URL}/api/servers`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch servers");
  return response.json();
}

export async function getJobs() {
  const response = await fetch(`${MCP_FACTORY_URL}/api/jobs`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch jobs");
  return response.json();
}
```

### Task 4: Add Claude Config Copy Button (Enhancement)
The server objects include a `claude_config` field. In the modal, add a button to copy this for easy paste into Claude Desktop config.

## SSH Access
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
```

## Verification Steps
1. After rebuild, visit: https://dev.swarmstack.net/mcp-factory
2. Check sidebar shows "MCP Factory" link
3. Test "Generate Server" with: "A simple hello world MCP server"
4. Verify servers list populates
5. Click a server card to see detail modal

## Backend API Reference
```bash
# Test endpoints
curl -s http://localhost:3456/api/servers | jq .
curl -s http://localhost:3456/api/jobs | jq .
curl -s -X POST http://localhost:3456/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"description":"test calculator"}' | jq .
```

## Files to Transfer (if editing locally)
After editing, deploy with:
```bash
# From Mac
scp -i ~/.ssh/swarm_key /path/to/Sidebar.jsx root@134.199.235.140:/opt/swarm-dashboard/src/components/
scp -i ~/.ssh/swarm_key /path/to/mcpApi.js root@134.199.235.140:/opt/swarm-dashboard/src/services/
```

## Success Criteria
- [ ] MCP Factory appears in sidebar navigation
- [ ] Page loads without errors at /mcp-factory
- [ ] Can generate a new MCP server
- [ ] Servers list shows generated servers
- [ ] Jobs tab shows generation history
- [ ] Server detail modal opens on card click
