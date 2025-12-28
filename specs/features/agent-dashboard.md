# Agent Dashboard Specification

**Feature**: Agent Registry Dashboard  
**Status**: DRAFT  
**Priority**: HIGH  
**Created**: 2024-12-17  
**Author**: Neural + Claude

## Overview

A comprehensive dashboard for viewing, managing, and monitoring registered Swarm agents, workflows, and their execution history. Provides visibility into the agent ecosystem including personas, capabilities, resource usage, and MCP servers.

## Data Sources

| Source | Location | Purpose |
|--------|----------|---------|
| Agent Registry | `/opt/swarm-registry/registry.db` | Agent definitions, workflows, executions |
| MCP Factory | `/opt/swarm-mcp-factory/registry.db` | Generated MCP servers |
| Personas | `/opt/personas/*.md` | Agent personality definitions |
| Agent Code | `/opt/swarm-agents/*/` | Agent implementations |

---

## API Design

### Base URL
- DEV: `https://api.dev.swarmstack.net/v1`
- PROD: `https://api.swarmstack.net/v1`

### Authentication
All endpoints require Bearer token: `Authorization: Bearer <token>`

---

## Agents API

### `GET /agents`
List all registered agents with optional filtering.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `name` | string | Filter by agent name |
| `tag` | string | Filter by tag |
| `runtime` | string | Filter by runtime (node, python) |
| `limit` | int | Max results (default: 50) |
| `offset` | int | Pagination offset |

**Response:** `200 OK`
```json
{
  "agents": [
    {
      "id": "forge-agent-001",
      "name": "forge",
      "version": "3.0.0",
      "description": "FORGE autonomous coding agent",
      "runtime": "node",
      "memory_mb": 128,
      "timeout_seconds": 600,
      "author": "swarm-factory",
      "tags": ["coding", "github", "pr-creation"],
      "created_at": "2024-12-12T23:04:00Z"
    }
  ],
  "total": 6,
  "limit": 50,
  "offset": 0
}
```

### `GET /agents/:id`
Get full agent details including schemas and execution stats.

**Response:** `200 OK`
```json
{
  "id": "forge-agent-001",
  "name": "forge",
  "version": "3.0.0",
  "path": "/opt/swarm-agents/forge-agent",
  "description": "FORGE autonomous coding agent",
  "capabilities": {
    "entry": "main.js",
    "tags": ["coding", "github"],
    "supports_file_mode": true,
    "supports_poll_mode": true
  },
  "inputs_schema": {
    "type": "object",
    "properties": {
      "ticket_id": { "type": "string" },
      "repo_url": { "type": "string" }
    },
    "required": ["ticket_id", "repo_url"]
  },
  "outputs_schema": {
    "type": "object",
    "properties": {
      "pr_url": { "type": "string" },
      "branch": { "type": "string" },
      "files_changed": { "type": "array" }
    }
  },
  "triggers": [
    { "type": "workflow", "description": "Called by workflow steps" },
    { "type": "api", "description": "Direct API invocation" }
  ],
  "persona": {
    "path": "/opt/personas/forge.md",
    "exists": true,
    "preview": "You are FORGE, an expert autonomous coding agent..."
  },
  "stats": {
    "total_executions": 47,
    "success_rate": 0.89,
    "avg_duration_ms": 45000,
    "total_tokens_used": 125000
  }
}
```



### `GET /agents/:id/executions`
Get execution history for a specific agent.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (pending, running, completed, failed) |
| `limit` | int | Max results (default: 20) |

**Response:** `200 OK`
```json
{
  "executions": [
    {
      "id": "exec-abc123",
      "run_id": "run-xyz789",
      "workflow_name": "pr-generation",
      "status": "completed",
      "inputs": { "ticket_id": "TICK-001" },
      "outputs": { "pr_url": "https://github.com/..." },
      "duration_ms": 42000,
      "api_tokens_used": 3500,
      "started_at": "2024-12-17T10:00:00Z",
      "completed_at": "2024-12-17T10:00:42Z"
    }
  ],
  "total": 47
}
```

---

## Workflows API

### `GET /workflows`
List all registered workflows.

**Response:** `200 OK`
```json
{
  "workflows": [
    {
      "id": "wf-001",
      "name": "ticket-to-pr",
      "version": "1.0.0",
      "description": "Complete ticket implementation pipeline",
      "trigger_type": "api",
      "enabled": true,
      "steps_count": 4,
      "agents_used": ["forge", "reviewer"],
      "created_at": "2024-12-15T00:00:00Z"
    }
  ],
  "total": 3
}
```

### `GET /workflows/:id`
Get full workflow definition with steps.

**Response:** `200 OK`
```json
{
  "id": "wf-001",
  "name": "ticket-to-pr",
  "version": "1.0.0",
  "description": "Complete ticket implementation pipeline",
  "trigger_type": "api",
  "trigger_config": {},
  "steps": [
    {
      "id": "step-1",
      "name": "implement",
      "agent": "forge",
      "agent_version": "3.0.0",
      "inputs_mapping": { "ticket_id": "$.trigger.ticket_id" },
      "timeout_seconds": 600
    },
    {
      "id": "step-2", 
      "name": "review",
      "agent": "reviewer",
      "depends_on": ["step-1"],
      "inputs_mapping": { "pr_url": "$.steps.step-1.outputs.pr_url" }
    }
  ],
  "variables": {},
  "on_error": { "action": "fail", "notify": true },
  "on_success": { "notify": true },
  "enabled": true
}
```

### `GET /workflows/:id/runs`
Get execution history for a workflow.

**Response:** `200 OK`
```json
{
  "runs": [
    {
      "id": "run-xyz789",
      "status": "completed",
      "current_step": null,
      "trigger_type": "api",
      "step_results": {
        "step-1": { "status": "completed", "outputs": {} },
        "step-2": { "status": "completed", "outputs": {} }
      },
      "total_vm_time_ms": 85000,
      "total_api_tokens": 7200,
      "started_at": "2024-12-17T10:00:00Z",
      "completed_at": "2024-12-17T10:01:25Z"
    }
  ],
  "total": 12
}
```



---

## MCP Servers API

### `GET /mcp-servers`
List all generated MCP servers from the factory.

**Response:** `200 OK`
```json
{
  "servers": [
    {
      "id": "mcp_1765864287178_0wjnsx",
      "name": "calculator-mcp",
      "version": "1.0.0",
      "description": "Calculator MCP server with basic math operations",
      "package_path": "/opt/swarm-mcp-factory/output/calculator-mcp",
      "docker_image": null,
      "created_at": "2024-12-15T00:00:00Z"
    }
  ],
  "total": 2
}
```

### `GET /mcp-servers/:id`
Get full MCP server details including spec.

**Response:** `200 OK`
```json
{
  "id": "mcp_1765864287178_0wjnsx",
  "name": "calculator-mcp",
  "version": "1.0.0",
  "description": "Calculator MCP server",
  "spec": {
    "tools": [
      { "name": "add", "description": "Add two numbers", "parameters": {} },
      { "name": "subtract", "description": "Subtract two numbers", "parameters": {} }
    ]
  },
  "package_path": "/opt/swarm-mcp-factory/output/calculator-mcp",
  "claude_config": {
    "mcpServers": {
      "calculator": {
        "command": "node",
        "args": ["index.js"]
      }
    }
  }
}
```

---

## Personas API

### `GET /personas`
List all agent personas.

**Response:** `200 OK`
```json
{
  "personas": [
    {
      "name": "forge",
      "path": "/opt/personas/forge.md",
      "size_bytes": 2048,
      "preview": "You are FORGE, an expert autonomous coding agent...",
      "updated_at": "2024-12-15T00:00:00Z"
    }
  ]
}
```

### `GET /personas/:name`
Get full persona content.

**Response:** `200 OK`
```json
{
  "name": "forge",
  "path": "/opt/personas/forge.md",
  "content": "You are FORGE, an expert autonomous coding agent.\n\nYour job is to implement tickets by generating clean, tested code.\n...",
  "updated_at": "2024-12-15T00:00:00Z"
}
```

### `PUT /personas/:name`
Update or create a persona.

**Request:**
```json
{
  "content": "You are FORGE, an expert autonomous coding agent..."
}
```

**Response:** `200 OK`



---

## UI Components

### Navigation Structure

```
Dashboard
├── Agents
│   ├── Agent Catalog (list view)
│   ├── Agent Detail (/:id)
│   └── Agent Executions (/:id/executions)
├── Workflows  
│   ├── Workflow List
│   ├── Workflow Detail (/:id)
│   └── Workflow Runs (/:id/runs)
├── MCP Servers
│   ├── Server Gallery
│   └── Server Detail (/:id)
└── Personas
    ├── Persona List
    └── Persona Editor (/:name)
```

---

### Component: AgentCatalog

**Route**: `/agents`

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Agent Registry                                    [+ New Agent] │
├─────────────────────────────────────────────────────────────────┤
│ Search: [_______________]  Runtime: [All ▼]  Tags: [_______]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🤖 forge v3.0.0                              [node] [128MB] │ │
│ │ FORGE autonomous coding agent - implements tickets          │ │
│ │ Tags: coding, github, pr-creation                           │ │
│ │ Author: swarm-factory | Created: Dec 12, 2024               │ │
│ │ Stats: 47 runs | 89% success | Avg: 45s                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🤖 _template:claude-agent v1.0.0             [node] [256MB] │ │
│ │ AI-powered agent using Claude API                           │ │
│ │ Tags: template, ai, claude, llm                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🤖 echo v1.0.0                                [node] [64MB] │ │
│ │ Simple echo agent for testing                               │ │
│ │ Tags: utility, test                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface AgentCatalogProps {
  onAgentSelect: (agentId: string) => void;
}
```

**State**:
```typescript
interface AgentCatalogState {
  agents: Agent[];
  loading: boolean;
  filters: {
    search: string;
    runtime: string | null;
    tags: string[];
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
```



---

### Component: AgentDetail

**Route**: `/agents/:id`

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Agents                                                │
├─────────────────────────────────────────────────────────────────┤
│ 🤖 forge v3.0.0                                    [Edit] [Run] │
│ FORGE autonomous coding agent - implements tickets and PRs      │
├──────────────────────────┬──────────────────────────────────────┤
│ METADATA                 │ EXECUTION STATS                      │
│ Runtime: node            │ Total Runs: 47                       │
│ Memory: 128 MB           │ Success Rate: 89%                    │
│ Timeout: 600s            │ Avg Duration: 45s                    │
│ Author: swarm-factory    │ Total Tokens: 125,000                │
│ Path: /opt/swarm-agents/ │ Last Run: 2 hours ago                │
├──────────────────────────┴──────────────────────────────────────┤
│ TAGS                                                            │
│ [coding] [github] [pr-creation]                                 │
├─────────────────────────────────────────────────────────────────┤
│ CAPABILITIES                                                    │
│ • Entry: main.js                                                │
│ • Supports file mode: ✓                                         │
│ • Supports poll mode: ✓                                         │
├─────────────────────────────────────────────────────────────────┤
│ [Inputs Schema] [Outputs Schema] [Triggers] [Persona]           │
├─────────────────────────────────────────────────────────────────┤
│ INPUTS SCHEMA                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ {                                                           │ │
│ │   "type": "object",                                         │ │
│ │   "properties": {                                           │ │
│ │     "ticket_id": { "type": "string" },                      │ │
│ │     "repo_url": { "type": "string" }                        │ │
│ │   },                                                        │ │
│ │   "required": ["ticket_id", "repo_url"]                     │ │
│ │ }                                                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ RECENT EXECUTIONS                               [View All →]    │
│ ┌───────────┬────────────┬──────────┬─────────┬──────────────┐ │
│ │ Run ID    │ Status     │ Duration │ Tokens  │ Time         │ │
│ ├───────────┼────────────┼──────────┼─────────┼──────────────┤ │
│ │ run-abc12 │ ✓ complete │ 42s      │ 3,500   │ 2 hours ago  │ │
│ │ run-def34 │ ✓ complete │ 38s      │ 2,800   │ 5 hours ago  │ │
│ │ run-ghi56 │ ✗ failed   │ 12s      │ 800     │ 1 day ago    │ │
│ └───────────┴────────────┴──────────┴─────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface AgentDetailProps {
  agentId: string;
}
```

**State**:
```typescript
interface AgentDetailState {
  agent: AgentFull | null;
  executions: StepExecution[];
  activeTab: 'inputs' | 'outputs' | 'triggers' | 'persona';
  loading: boolean;
}
```



---

## Data Models (TypeScript)

```typescript
// Agent Models
interface Agent {
  id: string;
  name: string;
  version: string;
  description: string | null;
  runtime: 'node' | 'python' | 'shell';
  memory_mb: number;
  timeout_seconds: number;
  author: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface AgentFull extends Agent {
  path: string;
  capabilities: {
    entry: string;
    tags: string[];
    supports_file_mode?: boolean;
    supports_poll_mode?: boolean;
  } | null;
  inputs_schema: JSONSchema | null;
  outputs_schema: JSONSchema | null;
  triggers: AgentTrigger[];
  persona: {
    path: string;
    exists: boolean;
    preview: string | null;
  } | null;
  stats: AgentStats | null;
}

interface AgentTrigger {
  type: 'workflow' | 'api' | 'schedule' | 'event';
  description: string;
  config?: Record<string, unknown>;
}

interface AgentStats {
  total_executions: number;
  success_rate: number;
  avg_duration_ms: number;
  total_tokens_used: number;
}

// Workflow Models
interface Workflow {
  id: string;
  name: string;
  version: string;
  description: string | null;
  trigger_type: 'api' | 'webhook' | 'schedule' | 'event';
  enabled: boolean;
  steps_count: number;
  agents_used: string[];
  created_at: string;
}

interface WorkflowFull extends Workflow {
  path: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  variables: Record<string, unknown>;
  on_error: { action: string; notify: boolean };
  on_success: { notify: boolean };
}

interface WorkflowStep {
  id: string;
  name: string;
  agent: string;
  agent_version?: string;
  depends_on?: string[];
  inputs_mapping: Record<string, string>;
  timeout_seconds?: number;
}

// Execution Models
interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_version: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step: string | null;
  trigger_type: string;
  trigger_data: Record<string, unknown>;
  step_results: Record<string, StepResult>;
  total_vm_time_ms: number;
  total_api_tokens: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

interface StepResult {
  status: 'pending' | 'running' | 'completed' | 'failed';
  outputs: Record<string, unknown>;
  duration_ms?: number;
  error?: string;
}

interface StepExecution {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string;
  agent_name: string;
  agent_version: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  vm_id: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  duration_ms: number | null;
  api_tokens_used: number;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

// MCP Server Models
interface MCPServer {
  id: string;
  name: string;
  version: string;
  description: string | null;
  package_path: string | null;
  docker_image: string | null;
  created_at: string;
}

interface MCPServerFull extends MCPServer {
  spec: {
    tools: MCPTool[];
  };
  claude_config: Record<string, unknown>;
}

interface MCPTool {
  name: string;
  description: string;
  parameters: JSONSchema;
}

// Persona Models
interface Persona {
  name: string;
  path: string;
  size_bytes: number;
  preview: string;
  updated_at: string;
}

interface PersonaFull extends Persona {
  content: string;
}
```



---

## Implementation Plan

### Phase 1: Backend API (Priority: HIGH)

1. **Create `/opt/swarm-registry/api/` service**
   - Express.js server connecting to registry.db
   - JWT authentication middleware (reuse from dashboard)
   - CORS configuration for dashboard domains

2. **Implement core endpoints**
   - `GET /agents` - List with filtering
   - `GET /agents/:id` - Full details with stats
   - `GET /agents/:id/executions` - Execution history
   - `GET /workflows` - List workflows
   - `GET /workflows/:id` - Full workflow definition

3. **Add stats aggregation queries**
   ```sql
   SELECT 
     agent_id,
     COUNT(*) as total_executions,
     AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) as success_rate,
     AVG(duration_ms) as avg_duration_ms,
     SUM(api_tokens_used) as total_tokens
   FROM step_executions
   GROUP BY agent_id
   ```

### Phase 2: Frontend Components (Priority: HIGH)

1. **Add routes to swarm-dashboard**
   ```typescript
   // src/App.tsx
   <Route path="/agents" element={<AgentCatalog />} />
   <Route path="/agents/:id" element={<AgentDetail />} />
   <Route path="/workflows" element={<WorkflowList />} />
   <Route path="/workflows/:id" element={<WorkflowDetail />} />
   ```

2. **Create components**
   - `src/components/agents/AgentCatalog.tsx`
   - `src/components/agents/AgentCard.tsx`
   - `src/components/agents/AgentDetail.tsx`
   - `src/components/agents/SchemaViewer.tsx`
   - `src/components/workflows/WorkflowList.tsx`
   - `src/components/workflows/WorkflowDetail.tsx`

3. **Add API hooks**
   - `src/hooks/useAgents.ts`
   - `src/hooks/useWorkflows.ts`

### Phase 3: Enhanced Features (Priority: MEDIUM)

1. **Persona Editor**
   - Monaco editor for markdown editing
   - Live preview
   - Save/revert functionality

2. **MCP Server Gallery**
   - Visual tool explorer
   - Copy claude_config button
   - Download package option

3. **Execution Timeline**
   - Visual workflow execution graph
   - Step-by-step status tracking
   - Real-time updates via WebSocket

### Phase 4: Advanced Features (Priority: LOW)

1. **Agent Comparison**
   - Side-by-side schema comparison
   - Version diff viewer

2. **Usage Analytics**
   - Token usage over time charts
   - Success rate trends
   - Cost estimation

3. **Agent Testing**
   - Test runner UI
   - Mock input generator
   - Output validation

---

## Database Queries Reference

### Get agents with stats
```sql
SELECT 
  a.*,
  COALESCE(s.total_executions, 0) as total_executions,
  COALESCE(s.success_rate, 0) as success_rate,
  COALESCE(s.avg_duration_ms, 0) as avg_duration_ms,
  COALESCE(s.total_tokens, 0) as total_tokens_used
FROM agents a
LEFT JOIN (
  SELECT 
    agent_id,
    COUNT(*) as total_executions,
    AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) as success_rate,
    AVG(duration_ms) as avg_duration_ms,
    SUM(api_tokens_used) as total_tokens
  FROM step_executions
  GROUP BY agent_id
) s ON a.id = s.agent_id
ORDER BY a.updated_at DESC;
```

### Get workflow with step details
```sql
SELECT 
  w.*,
  (SELECT COUNT(*) FROM workflow_runs WHERE workflow_id = w.id) as run_count,
  (SELECT status FROM workflow_runs WHERE workflow_id = w.id 
   ORDER BY created_at DESC LIMIT 1) as last_run_status
FROM workflows w
WHERE w.id = ?;
```

---

## File Structure

```
/opt/swarm-dashboard/
├── src/
│   ├── components/
│   │   ├── agents/
│   │   │   ├── AgentCatalog.tsx
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentDetail.tsx
│   │   │   ├── SchemaViewer.tsx
│   │   │   └── ExecutionHistory.tsx
│   │   ├── workflows/
│   │   │   ├── WorkflowList.tsx
│   │   │   ├── WorkflowDetail.tsx
│   │   │   └── WorkflowGraph.tsx
│   │   ├── mcp/
│   │   │   ├── MCPGallery.tsx
│   │   │   └── MCPDetail.tsx
│   │   └── personas/
│   │       ├── PersonaList.tsx
│   │       └── PersonaEditor.tsx
│   ├── hooks/
│   │   ├── useAgents.ts
│   │   ├── useWorkflows.ts
│   │   └── useMCPServers.ts
│   └── types/
│       └── agents.ts
```

---

## Acceptance Criteria

- [ ] Agent catalog displays all registered agents with search/filter
- [ ] Agent detail page shows full metadata, schemas, and stats
- [ ] Workflow list shows all workflows with status indicators
- [ ] Workflow detail shows step graph and execution history
- [ ] MCP gallery displays generated servers with config copy
- [ ] Persona editor allows viewing and editing agent personas
- [ ] All API endpoints return proper error responses
- [ ] UI is responsive and matches existing dashboard styling
- [ ] WebSocket updates for real-time execution status

---

## Related Specs

- `/opt/swarm-specs/hitl/phase-5-ui.md` - HITL dashboard components
- `/opt/swarm-specs/architecture/agent-registry.md` - Registry design
- `/opt/swarm-specs/mcp-factory/spec.md` - MCP factory design

