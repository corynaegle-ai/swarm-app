## Task: Build MCP Factory UI Page for DEV Dashboard

### Context
MCP Factory backend is fully operational on DEV (port 3456). It generates complete MCP servers from natural language descriptions. Missing piece: a dashboard UI page to interact with it.

### Verified Backend Endpoints
```
POST /api/mcp-factory/api/generate  → Generates complete MCP server code (~7s)
POST /api/mcp-factory/api/design   → Creates Swarm tickets for implementation
GET  /api/mcp-factory/api/jobs     → List all jobs
GET  /api/mcp-factory/api/jobs/:id → Get job status/result
GET  /api/mcp-factory/api/servers  → List generated servers
POST /api/mcp-factory/api/validate → Validate spec
```

### Existing API Client
File: `/opt/swarm-app/apps/dashboard/src/services/mcpApi.js`
```javascript
import { apiCall } from '../utils/api';
const MCP_FACTORY_BASE = import.meta.env.VITE_MCP_FACTORY_URL || "/api/mcp-factory";

export async function designMcpServer(description, tenantId = "default") { ... }
export async function getMcpDesignStatus(projectId) { ... }
```

**Needs extension** to support generate, jobs, and servers endpoints.

---

### Implementation Steps

#### Step 1: Extend mcpApi.js
Add these functions to the existing client:
```javascript
// Generate MCP server (full code generation)
export async function generateMcpServer(description) {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ description }),
  });
  if (!response.ok) throw new Error("Failed to start generation");
  return response.json(); // { job_id, status: "processing" }
}

// Get job status
export async function getJobStatus(jobId) {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/jobs/${jobId}`);
  if (!response.ok) throw new Error("Failed to get job status");
  return response.json();
}

// List all jobs
export async function listJobs() {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/jobs`);
  if (!response.ok) throw new Error("Failed to list jobs");
  return response.json();
}

// List generated servers
export async function listServers() {
  const response = await apiCall(`${MCP_FACTORY_BASE}/api/servers`);
  if (!response.ok) throw new Error("Failed to list servers");
  return response.json();
}
```

#### Step 2: Create McpFactory.jsx Page
Location: `/opt/swarm-app/apps/dashboard/src/pages/McpFactory.jsx`

**UI Components:**
1. **Description Input** - Textarea for natural language MCP description
2. **Action Buttons**:
   - "Generate Code" → Calls `/api/generate`, polls job status
   - "Create Tickets" → Calls `/api/design`, shows ticket count
3. **Job Status Panel** - Shows current/recent jobs with status badges
4. **Generated Servers List** - Table of completed servers with:
   - Name, description, tool count
   - Download/view buttons
5. **Result Display** - Shows generated spec JSON and file tree

**Follow existing patterns from AgentCatalog.jsx:**
- Import Sidebar component
- Use useState/useEffect for data fetching
- Use toast for notifications
- Use lucide-react icons
- Follow CSS class naming conventions

#### Step 3: Create McpFactory.css
Location: `/opt/swarm-app/apps/dashboard/src/pages/McpFactory.css`

Follow patterns from AgentCatalog.css for:
- Page layout with sidebar
- Card components
- Form styling
- Status badges
- Loading states

#### Step 4: Add Route to App.jsx
```javascript
import McpFactory from './pages/McpFactory';

// Add route:
<Route path="/mcp-factory" element={
  <ProtectedRoute>
    <McpFactory />
  </ProtectedRoute>
} />
```

#### Step 5: Add Sidebar Navigation
In Sidebar.jsx, add to navItems:
```javascript
{ to: '/mcp-factory', icon: Wand2, label: 'MCP Factory' },
```
Import: `import { Wand2 } from 'lucide-react';`

#### Step 6: Restart Dashboard
```bash
cd /opt/swarm-app/apps/dashboard
npm run build
pm2 restart swarm-dashboard-dev
```

---

### Success Criteria
1. `/mcp-factory` route loads without errors
2. Can enter description and click "Generate Code"
3. Job status updates in real-time (poll every 2s)
4. Completed jobs show spec and file structure
5. "Create Tickets" generates Swarm tickets and shows count
6. Generated servers appear in servers list
7. No console errors, proper loading states

### Quick Commands
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Test backend
curl -s 'http://localhost:3456/api/servers' | jq .

# Check dashboard logs
pm2 logs swarm-dashboard-dev --lines 20 --nostream
```

### File Locations (DEV Droplet)
- Dashboard: `/opt/swarm-app/apps/dashboard/`
- Pages: `/opt/swarm-app/apps/dashboard/src/pages/`
- Services: `/opt/swarm-app/apps/dashboard/src/services/`
- Components: `/opt/swarm-app/apps/dashboard/src/components/`
