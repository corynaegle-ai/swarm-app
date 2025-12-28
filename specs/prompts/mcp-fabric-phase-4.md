# MCP Fabric Phase 4: Multi-Tenancy, Usage Tracking & Dashboard Integration

## Context

Phases 1-3 of MCP Fabric are COMPLETE on the dev droplet (134.199.235.140):

### Phase 1 (Complete)
- Registry sync: 55+ MCP servers from modelcontextprotocol.io
- PostgreSQL database with mcp_fabric schema
- Daily cron sync at 3 AM UTC

### Phase 2 (Complete)
- Package cache: npm/pypi packages in `/opt/swarm-mcp/cache/`
- Credential storage: AES-256-GCM encrypted in `credentials.mcp_credentials`

### Phase 3 (Complete)
- Server execution: Start/stop MCP server processes via stdio transport
- Tool discovery: Automatic tool parsing and caching in `mcp_fabric.server_tools`
- Tool invocation: Call tools on running instances
- Health checks: 30-second interval monitoring

### Current Infrastructure
```
Location: /opt/swarm-mcp
Database: postgresql://swarm:swarm_dev_2024@localhost:5432/mcp_fabric
PM2 Process: swarm-mcp (port 8085)
Version: 3.0.0
```

### Current Database Tables
```
mcp_fabric.servers              -- Registry of all MCP servers
mcp_fabric.server_packages      -- Package info (npm/pypi/oci)
mcp_fabric.server_tools         -- Discovered tools per server
mcp_fabric.server_instances     -- Running instance tracking
mcp_fabric.port_allocations     -- Port pool 3100-3199
credentials.mcp_credentials     -- Encrypted API keys
```

### Current API Endpoints
```
# Registry & Cache (Phase 1-2)
GET  /api/mcp/servers
GET  /api/mcp/servers/:id
POST /api/mcp/servers/:id/cache
GET  /api/mcp/servers/:id/cache/status
POST /api/mcp/credentials
GET  /api/mcp/credentials/:userId/:serverId

# Runtime (Phase 3)
POST /api/mcp/instances
GET  /api/mcp/instances
GET  /api/mcp/instances/:id
POST /api/mcp/instances/:id/stop
POST /api/mcp/instances/:id/restart
GET  /api/mcp/instances/:id/health
GET  /api/mcp/instances/:id/tools
POST /api/mcp/instances/:id/invoke
```

---

## Phase 4 Goals

1. **Multi-Tenant Isolation** - Workspace-scoped instances and credentials
2. **Usage Tracking** - Billable event logging for tool invocations
3. **Lifecycle Management** - Auto-cleanup of idle instances, resource limits
4. **Dashboard Integration** - React components for Swarm Dashboard

---

## Component 1: Multi-Tenant Workspace Isolation

### 1.1 Migration: 004_multi_tenant.sql
```sql
-- Add workspace/tenant columns to instances
ALTER TABLE mcp_fabric.server_instances 
  ADD COLUMN workspace_id UUID,
  ADD COLUMN tenant_id UUID;

CREATE INDEX idx_instances_workspace ON mcp_fabric.server_instances(workspace_id);
CREATE INDEX idx_instances_tenant ON mcp_fabric.server_instances(tenant_id);

-- Add workspace to credentials  
ALTER TABLE credentials.mcp_credentials
  ADD COLUMN workspace_id UUID;

CREATE INDEX idx_creds_workspace ON credentials.mcp_credentials(workspace_id);

-- Update unique constraint to be workspace-scoped
ALTER TABLE mcp_fabric.server_instances 
  DROP CONSTRAINT IF EXISTS server_instances_user_id_server_id_key;
ALTER TABLE mcp_fabric.server_instances
  ADD CONSTRAINT server_instances_workspace_user_server_key 
  UNIQUE(workspace_id, user_id, server_id);
```

### 1.2 Tenant Middleware: src/middleware/tenant.ts
```typescript
import { Request, Response, NextFunction } from 'express';

export interface TenantContext {
  tenantId: string;
  workspaceId: string;
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string;
  const workspaceId = req.headers['x-workspace-id'] as string;
  const userId = req.headers['x-user-id'] as string;
  
  // Allow health checks without tenant
  if (req.path === '/health' || req.path === '/') {
    return next();
  }
  
  // For internal/system calls, allow bypass with secret
  const internalSecret = req.headers['x-internal-auth'] as string;
  if (internalSecret === process.env.INTERNAL_AUTH_SECRET) {
    req.tenant = { tenantId: 'system', workspaceId: 'system', userId: 'system' };
    return next();
  }
  
  if (!tenantId || !workspaceId || !userId) {
    return res.status(401).json({ 
      error: 'Missing tenant context',
      required: ['x-tenant-id', 'x-workspace-id', 'x-user-id']
    });
  }
  
  req.tenant = { tenantId, workspaceId, userId };
  next();
}
```

### 1.3 Update ServerManager for Tenancy
All queries must filter by workspace:
```typescript
// Before
await this.db.query(
  'SELECT * FROM mcp_fabric.server_instances WHERE user_id = $1 AND server_id = $2',
  [userId, serverId]
);

// After  
await this.db.query(
  'SELECT * FROM mcp_fabric.server_instances WHERE workspace_id = $1 AND user_id = $2 AND server_id = $3',
  [workspaceId, userId, serverId]
);
```

---

## Component 2: Usage Tracking & Billing

### 2.1 Migration: 004_multi_tenant.sql (continued)
```sql
-- Usage events table
CREATE TABLE mcp_fabric.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  instance_id UUID REFERENCES mcp_fabric.server_instances(id) ON DELETE SET NULL,
  server_id TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- 'instance_start', 'instance_stop', 'tool_invoke'
  tool_name TEXT,                  -- For tool_invoke events
  duration_ms INTEGER,             -- Execution time
  input_size_bytes INTEGER,        -- Request payload size
  output_size_bytes INTEGER,       -- Response payload size
  success BOOLEAN NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_tenant ON mcp_fabric.usage_events(tenant_id);
CREATE INDEX idx_usage_workspace ON mcp_fabric.usage_events(workspace_id);
CREATE INDEX idx_usage_created ON mcp_fabric.usage_events(created_at DESC);
CREATE INDEX idx_usage_type ON mcp_fabric.usage_events(event_type);

-- Daily aggregates for billing
CREATE TABLE mcp_fabric.usage_daily (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  workspace_id UUID NOT NULL,
  date DATE NOT NULL,
  instance_starts INTEGER DEFAULT 0,
  instance_minutes INTEGER DEFAULT 0,
  tool_invocations INTEGER DEFAULT 0,
  successful_invocations INTEGER DEFAULT 0,
  failed_invocations INTEGER DEFAULT 0,
  total_duration_ms BIGINT DEFAULT 0,
  UNIQUE(tenant_id, workspace_id, date)
);

CREATE INDEX idx_usage_daily_lookup ON mcp_fabric.usage_daily(tenant_id, workspace_id, date);
```

### 2.2 Usage Tracker Service: src/billing/usage-tracker.ts
```typescript
import type { Pool } from 'pg';

export interface UsageEvent {
  tenantId: string;
  workspaceId: string;
  userId: string;
  instanceId?: string;
  serverId: string;
  eventType: 'instance_start' | 'instance_stop' | 'tool_invoke';
  toolName?: string;
  durationMs?: number;
  inputSizeBytes?: number;
  outputSizeBytes?: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  tenantId: string;
  workspaceId: string;
  period: { start: Date; end: Date };
  totals: {
    instanceStarts: number;
    instanceMinutes: number;
    toolInvocations: number;
    successRate: number;
  };
  byServer: Array<{
    serverId: string;
    invocations: number;
    avgDurationMs: number;
  }>;
}

export class UsageTracker {
  constructor(private db: Pool) {}

  async trackEvent(event: UsageEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO mcp_fabric.usage_events 
       (tenant_id, workspace_id, user_id, instance_id, server_id, event_type, 
        tool_name, duration_ms, input_size_bytes, output_size_bytes, success, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [event.tenantId, event.workspaceId, event.userId, event.instanceId, 
       event.serverId, event.eventType, event.toolName, event.durationMs,
       event.inputSizeBytes, event.outputSizeBytes, event.success, 
       event.errorMessage, event.metadata || {}]
    );
  }

  async getUsageSummary(
    tenantId: string, 
    workspaceId: string,
    startDate: Date, 
    endDate: Date
  ): Promise<UsageSummary> {
    const totals = await this.db.query(
      `SELECT 
        COUNT(*) FILTER (WHERE event_type = 'instance_start') as instance_starts,
        COALESCE(SUM(duration_ms) FILTER (WHERE event_type = 'tool_invoke'), 0) / 60000 as instance_minutes,
        COUNT(*) FILTER (WHERE event_type = 'tool_invoke') as tool_invocations,
        COUNT(*) FILTER (WHERE event_type = 'tool_invoke' AND success) as successful
       FROM mcp_fabric.usage_events
       WHERE tenant_id = $1 AND workspace_id = $2 
         AND created_at >= $3 AND created_at < $4`,
      [tenantId, workspaceId, startDate, endDate]
    );

    const byServer = await this.db.query(
      `SELECT server_id, COUNT(*) as invocations, AVG(duration_ms) as avg_duration
       FROM mcp_fabric.usage_events
       WHERE tenant_id = $1 AND workspace_id = $2 
         AND event_type = 'tool_invoke'
         AND created_at >= $3 AND created_at < $4
       GROUP BY server_id
       ORDER BY invocations DESC`,
      [tenantId, workspaceId, startDate, endDate]
    );

    const t = totals.rows[0];
    return {
      tenantId, workspaceId,
      period: { start: startDate, end: endDate },
      totals: {
        instanceStarts: parseInt(t.instance_starts),
        instanceMinutes: parseInt(t.instance_minutes),
        toolInvocations: parseInt(t.tool_invocations),
        successRate: t.tool_invocations > 0 
          ? (t.successful / t.tool_invocations) * 100 : 100
      },
      byServer: byServer.rows.map(r => ({
        serverId: r.server_id,
        invocations: parseInt(r.invocations),
        avgDurationMs: parseFloat(r.avg_duration)
      }))
    };
  }

  async aggregateDailyUsage(): Promise<number> {
    // Aggregate yesterday's events into daily table
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    const result = await this.db.query(
      `INSERT INTO mcp_fabric.usage_daily 
       (tenant_id, workspace_id, date, instance_starts, tool_invocations, 
        successful_invocations, failed_invocations, total_duration_ms)
       SELECT 
         tenant_id, workspace_id, $1::date,
         COUNT(*) FILTER (WHERE event_type = 'instance_start'),
         COUNT(*) FILTER (WHERE event_type = 'tool_invoke'),
         COUNT(*) FILTER (WHERE event_type = 'tool_invoke' AND success),
         COUNT(*) FILTER (WHERE event_type = 'tool_invoke' AND NOT success),
         COALESCE(SUM(duration_ms), 0)
       FROM mcp_fabric.usage_events
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY tenant_id, workspace_id
       ON CONFLICT (tenant_id, workspace_id, date) DO UPDATE SET
         instance_starts = EXCLUDED.instance_starts,
         tool_invocations = EXCLUDED.tool_invocations,
         successful_invocations = EXCLUDED.successful_invocations,
         failed_invocations = EXCLUDED.failed_invocations,
         total_duration_ms = EXCLUDED.total_duration_ms
       RETURNING id`,
      [yesterday, today]
    );

    return result.rowCount || 0;
  }
}
```

---

## Component 3: Instance Lifecycle Management

### 3.1 Schema Updates (in 004_multi_tenant.sql)
```sql
-- Track last activity for idle detection
ALTER TABLE mcp_fabric.server_instances
  ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_instances_activity ON mcp_fabric.server_instances(last_activity_at);

-- Workspace limits table
CREATE TABLE mcp_fabric.workspace_limits (
  workspace_id UUID PRIMARY KEY,
  max_instances INTEGER DEFAULT 10,
  max_instances_per_user INTEGER DEFAULT 3,
  idle_timeout_minutes INTEGER DEFAULT 5,
  max_instance_age_hours INTEGER DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Lifecycle Manager: src/runtime/lifecycle-manager.ts
```typescript
import type { Pool } from 'pg';
import { ServerManager } from './server-manager.js';

export interface LifecycleConfig {
  defaultIdleTimeoutMs: number;      // 300000 (5 min)
  defaultMaxInstancesPerUser: number; // 3
  defaultMaxInstancesPerWorkspace: number; // 10
  defaultMaxInstanceAgeMs: number;   // 86400000 (24h)
  healthCheckIntervalMs: number;     // 30000
}

const DEFAULT_CONFIG: LifecycleConfig = {
  defaultIdleTimeoutMs: 5 * 60 * 1000,
  defaultMaxInstancesPerUser: 3,
  defaultMaxInstancesPerWorkspace: 10,
  defaultMaxInstanceAgeMs: 24 * 60 * 60 * 1000,
  healthCheckIntervalMs: 30 * 1000
};

export class LifecycleManager {
  private config: LifecycleConfig;

  constructor(
    private db: Pool,
    private serverManager: ServerManager,
    config?: Partial<LifecycleConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get workspace-specific limits or defaults
   */
  async getWorkspaceLimits(workspaceId: string): Promise<{
    maxInstances: number;
    maxInstancesPerUser: number;
    idleTimeoutMs: number;
    maxInstanceAgeMs: number;
  }> {
    const result = await this.db.query(
      'SELECT * FROM mcp_fabric.workspace_limits WHERE workspace_id = $1',
      [workspaceId]
    );

    if (result.rows.length > 0) {
      const limits = result.rows[0];
      return {
        maxInstances: limits.max_instances,
        maxInstancesPerUser: limits.max_instances_per_user,
        idleTimeoutMs: limits.idle_timeout_minutes * 60 * 1000,
        maxInstanceAgeMs: limits.max_instance_age_hours * 60 * 60 * 1000
      };
    }

    return {
      maxInstances: this.config.defaultMaxInstancesPerWorkspace,
      maxInstancesPerUser: this.config.defaultMaxInstancesPerUser,
      idleTimeoutMs: this.config.defaultIdleTimeoutMs,
      maxInstanceAgeMs: this.config.defaultMaxInstanceAgeMs
    };
  }

  /**
   * Check if user can start a new instance
   */
  async canStartInstance(
    workspaceId: string,
    userId: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    userCount: number;
    userLimit: number;
    workspaceCount: number;
    workspaceLimit: number;
  }> {
    const limits = await this.getWorkspaceLimits(workspaceId);

    // Count user's running instances
    const userResult = await this.db.query(
      `SELECT COUNT(*) FROM mcp_fabric.server_instances 
       WHERE workspace_id = $1 AND user_id = $2 AND status = 'running'`,
      [workspaceId, userId]
    );
    const userCount = parseInt(userResult.rows[0].count);

    // Count workspace's running instances
    const wsResult = await this.db.query(
      `SELECT COUNT(*) FROM mcp_fabric.server_instances 
       WHERE workspace_id = $1 AND status = 'running'`,
      [workspaceId]
    );
    const workspaceCount = parseInt(wsResult.rows[0].count);

    if (userCount >= limits.maxInstancesPerUser) {
      return {
        allowed: false,
        reason: `User limit reached (${userCount}/${limits.maxInstancesPerUser})`,
        userCount, userLimit: limits.maxInstancesPerUser,
        workspaceCount, workspaceLimit: limits.maxInstances
      };
    }

    if (workspaceCount >= limits.maxInstances) {
      return {
        allowed: false,
        reason: `Workspace limit reached (${workspaceCount}/${limits.maxInstances})`,
        userCount, userLimit: limits.maxInstancesPerUser,
        workspaceCount, workspaceLimit: limits.maxInstances
      };
    }

    return {
      allowed: true,
      userCount, userLimit: limits.maxInstancesPerUser,
      workspaceCount, workspaceLimit: limits.maxInstances
    };
  }

  /**
   * Update last activity timestamp (call on every tool invocation)
   */
  async touchInstance(instanceId: string): Promise<void> {
    await this.db.query(
      'UPDATE mcp_fabric.server_instances SET last_activity_at = NOW() WHERE id = $1',
      [instanceId]
    );
  }

  /**
   * Stop instances that have been idle too long
   */
  async cleanupIdleInstances(): Promise<{ stopped: number; instances: string[] }> {
    // Get all running instances with their workspace limits
    const instances = await this.db.query(
      `SELECT si.id, si.workspace_id, si.last_activity_at, 
              COALESCE(wl.idle_timeout_minutes, $1) as timeout_minutes
       FROM mcp_fabric.server_instances si
       LEFT JOIN mcp_fabric.workspace_limits wl ON si.workspace_id = wl.workspace_id
       WHERE si.status = 'running'`,
      [this.config.defaultIdleTimeoutMs / 60000]
    );

    const stoppedIds: string[] = [];
    const now = Date.now();

    for (const inst of instances.rows) {
      const lastActivity = new Date(inst.last_activity_at).getTime();
      const timeoutMs = inst.timeout_minutes * 60 * 1000;
      
      if (now - lastActivity > timeoutMs) {
        try {
          await this.serverManager.stopServer(inst.id);
          stoppedIds.push(inst.id);
          console.log(`[Lifecycle] Stopped idle instance ${inst.id}`);
        } catch (err) {
          console.error(`[Lifecycle] Failed to stop ${inst.id}:`, err);
        }
      }
    }

    return { stopped: stoppedIds.length, instances: stoppedIds };
  }

  /**
   * Stop instances that exceed max age
   */
  async cleanupOldInstances(): Promise<{ stopped: number; instances: string[] }> {
    const instances = await this.db.query(
      `SELECT si.id, si.created_at,
              COALESCE(wl.max_instance_age_hours, $1) as max_age_hours
       FROM mcp_fabric.server_instances si
       LEFT JOIN mcp_fabric.workspace_limits wl ON si.workspace_id = wl.workspace_id
       WHERE si.status = 'running'`,
      [this.config.defaultMaxInstanceAgeMs / 3600000]
    );

    const stoppedIds: string[] = [];
    const now = Date.now();

    for (const inst of instances.rows) {
      const createdAt = new Date(inst.created_at).getTime();
      const maxAgeMs = inst.max_age_hours * 60 * 60 * 1000;
      
      if (now - createdAt > maxAgeMs) {
        try {
          await this.serverManager.stopServer(inst.id);
          stoppedIds.push(inst.id);
          console.log(`[Lifecycle] Stopped old instance ${inst.id}`);
        } catch (err) {
          console.error(`[Lifecycle] Failed to stop ${inst.id}:`, err);
        }
      }
    }

    return { stopped: stoppedIds.length, instances: stoppedIds };
  }
}
```

---

## Component 4: Dashboard Integration

### 4.1 New API Endpoints: src/api/routes-phase4.ts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/usage` | Get usage summary for workspace |
| GET | `/api/mcp/usage/daily` | Get daily breakdown |
| GET | `/api/mcp/usage/export` | Export usage as CSV |
| GET | `/api/mcp/limits` | Get workspace limits |
| PUT | `/api/mcp/limits` | Update workspace limits (admin) |
| GET | `/api/mcp/dashboard/stats` | Aggregated stats for dashboard |

```typescript
import { Router, Request, Response } from 'express';
import { UsageTracker } from '../billing/usage-tracker.js';
import { LifecycleManager } from '../runtime/lifecycle-manager.js';
import type { Pool } from 'pg';

export function addPhase4Routes(
  router: Router, 
  db: Pool,
  usageTracker: UsageTracker,
  lifecycleManager: LifecycleManager
): void {

  // GET /api/mcp/usage - Usage summary
  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const { workspaceId, tenantId } = req.tenant!;
      const startDate = req.query.start 
        ? new Date(req.query.start as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
      const endDate = req.query.end 
        ? new Date(req.query.end as string)
        : new Date();

      const summary = await usageTracker.getUsageSummary(
        tenantId, workspaceId, startDate, endDate
      );
      res.json(summary);
    } catch (error) {
      console.error('[API] Usage error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/mcp/limits - Get workspace limits
  router.get('/limits', async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.tenant!;
      const limits = await lifecycleManager.getWorkspaceLimits(workspaceId);
      const canStart = await lifecycleManager.canStartInstance(
        workspaceId, req.tenant!.userId
      );
      res.json({ limits, capacity: canStart });
    } catch (error) {
      console.error('[API] Limits error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/mcp/dashboard/stats - Aggregated dashboard stats
  router.get('/dashboard/stats', async (req: Request, res: Response) => {
    try {
      const { workspaceId, tenantId } = req.tenant!;

      // Running instances
      const instances = await db.query(
        `SELECT COUNT(*) as running,
                COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy
         FROM mcp_fabric.server_instances 
         WHERE workspace_id = $1 AND status = 'running'`,
        [workspaceId]
      );

      // Today's usage
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const usage = await db.query(
        `SELECT COUNT(*) as invocations,
                COUNT(*) FILTER (WHERE success) as successful
         FROM mcp_fabric.usage_events
         WHERE workspace_id = $1 AND created_at >= $2`,
        [workspaceId, today]
      );

      // Available servers
      const servers = await db.query(
        'SELECT COUNT(*) FROM mcp_fabric.servers WHERE is_deprecated = false'
      );

      // Cached packages
      const cached = await db.query(
        'SELECT COUNT(*) FROM mcp_fabric.server_packages WHERE cached_at IS NOT NULL'
      );

      res.json({
        instances: {
          running: parseInt(instances.rows[0].running),
          healthy: parseInt(instances.rows[0].healthy)
        },
        usage: {
          todayInvocations: parseInt(usage.rows[0].invocations),
          todaySuccessful: parseInt(usage.rows[0].successful)
        },
        catalog: {
          totalServers: parseInt(servers.rows[0].count),
          cachedPackages: parseInt(cached.rows[0].count)
        }
      });
    } catch (error) {
      console.error('[API] Dashboard stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
```

### 4.2 React Components: Dashboard MCP Page

Create these components in the Swarm Dashboard (`/opt/swarm-dashboard/src/`):

#### pages/MCPServersPage.tsx
```tsx
// Main page component showing:
// - Stats cards (running instances, today's usage, available servers)
// - Server catalog table with search/filter
// - Running instances list with health status
// - Quick actions (start server, view tools, stop instance)
```

#### components/mcp/ServerCatalog.tsx
```tsx
// Searchable table of available MCP servers
// Columns: Name, Description, Transport, Categories, Actions
// Actions: View Details, Start Instance, Cache Package
```

#### components/mcp/InstanceList.tsx
```tsx
// List of user's running instances
// Shows: Server name, Status, Health, Uptime, Last Activity
// Actions: View Tools, Invoke Tool, Stop, Restart
```

#### components/mcp/ToolInvoker.tsx
```tsx
// Modal/drawer for invoking tools on an instance
// - Tool selector dropdown
// - JSON schema-based form for arguments
// - Execute button with loading state
// - Response display area
```

#### components/mcp/UsageChart.tsx
```tsx
// Line chart showing usage over time
// - Tool invocations per day
// - Instance minutes per day
// - Success rate trend
```

---

## Component 5: Updated Index & Cron Jobs

### 5.1 Updated index.ts (v4.0.0)
```typescript
// Add to existing imports
import { tenantMiddleware } from './middleware/tenant.js';
import { UsageTracker } from './billing/usage-tracker.js';
import { LifecycleManager } from './runtime/lifecycle-manager.js';
import { addPhase4Routes } from './api/routes-phase4.js';

// Apply tenant middleware BEFORE routes
app.use('/api/mcp', tenantMiddleware);

// Initialize Phase 4 services
const usageTracker = new UsageTracker(db);
const lifecycleManager = new LifecycleManager(db, serverManager);

// Add Phase 4 routes
addPhase4Routes(mcpRouter, db, usageTracker, lifecycleManager);

// Update version
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'swarm-mcp',
    version: '4.0.0',
    features: { 
      cache: true, 
      credentials: !!credentialStore, 
      runtime: true,
      multiTenant: true,
      usageTracking: true,
      lifecycle: true
    }
  });
});

// Cron jobs
cron.schedule('* * * * *', async () => {
  // Every minute: cleanup idle instances
  const result = await lifecycleManager.cleanupIdleInstances();
  if (result.stopped > 0) {
    console.log(`[Cron] Cleaned up ${result.stopped} idle instances`);
  }
});

cron.schedule('0 * * * *', async () => {
  // Every hour: cleanup old instances
  const result = await lifecycleManager.cleanupOldInstances();
  if (result.stopped > 0) {
    console.log(`[Cron] Cleaned up ${result.stopped} old instances`);
  }
});

cron.schedule('5 0 * * *', async () => {
  // Daily at 00:05: aggregate usage
  const count = await usageTracker.aggregateDailyUsage();
  console.log(`[Cron] Aggregated ${count} daily usage records`);
});
```

### 5.2 Update ServerManager to Track Usage

In `server-manager.ts`, inject UsageTracker and call it:

```typescript
// On instance start
await this.usageTracker?.trackEvent({
  tenantId, workspaceId, userId, instanceId, serverId,
  eventType: 'instance_start',
  success: true
});

// On tool invocation
const startTime = Date.now();
const result = await transport.callTool(toolName, args);
await this.usageTracker?.trackEvent({
  tenantId, workspaceId, userId, instanceId, serverId,
  eventType: 'tool_invoke',
  toolName,
  durationMs: Date.now() - startTime,
  success: !result.error,
  errorMessage: result.error?.message
});

// Touch activity timestamp
await this.lifecycleManager?.touchInstance(instanceId);
```

---

## Implementation Plan

### Step 1: Create Migration
File: `/opt/swarm-mcp/migrations/004_multi_tenant.sql`
- Add tenant columns to server_instances
- Add workspace column to credentials
- Create usage_events table
- Create usage_daily table
- Create workspace_limits table
- Add last_activity_at column

### Step 2: Create Middleware
File: `/opt/swarm-mcp/src/middleware/tenant.ts`

### Step 3: Create Usage Tracker
File: `/opt/swarm-mcp/src/billing/usage-tracker.ts`

### Step 4: Create Lifecycle Manager
File: `/opt/swarm-mcp/src/runtime/lifecycle-manager.ts`

### Step 5: Create Phase 4 Routes
File: `/opt/swarm-mcp/src/api/routes-phase4.ts`

### Step 6: Update index.ts
Add middleware, services, routes, cron jobs

### Step 7: Update ServerManager
Inject UsageTracker and LifecycleManager, add tracking calls

### Step 8: Build & Deploy
```bash
npm run build
pm2 restart swarm-mcp
```

### Step 9: Test All Endpoints
```bash
# Test with tenant headers
curl -H "x-tenant-id: test-tenant" \
     -H "x-workspace-id: test-workspace" \
     -H "x-user-id: test-user" \
     http://localhost:8085/api/mcp/instances

# Test usage endpoint
curl -H "x-tenant-id: test-tenant" \
     -H "x-workspace-id: test-workspace" \
     -H "x-user-id: test-user" \
     http://localhost:8085/api/mcp/usage

# Test dashboard stats
curl -H "x-tenant-id: test-tenant" \
     -H "x-workspace-id: test-workspace" \
     -H "x-user-id: test-user" \
     http://localhost:8085/api/mcp/dashboard/stats
```

---

## File Structure After Phase 4

```
/opt/swarm-mcp/
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_credentials_schema.sql
│   ├── 003_server_execution.sql
│   └── 004_multi_tenant.sql          # NEW
├── src/
│   ├── index.ts                       # Updated v4.0.0
│   ├── middleware/
│   │   └── tenant.ts                  # NEW
│   ├── api/
│   │   ├── routes.ts
│   │   ├── routes-phase3.ts
│   │   └── routes-phase4.ts           # NEW
│   ├── billing/
│   │   └── usage-tracker.ts           # NEW
│   ├── runtime/
│   │   ├── server-manager.ts          # Updated
│   │   ├── lifecycle-manager.ts       # NEW
│   │   └── transports/
│   │       ├── index.ts
│   │       └── stdio-adapter.ts
│   ├── cache/
│   │   └── package-cache.ts
│   ├── credentials/
│   │   └── credential-store.ts
│   └── sync/
│       ├── registry-client.ts
│       └── sync-service.ts
└── package.json
```

---

## Success Criteria

1. ✅ All API calls require tenant headers (except /health)
2. ✅ Instances scoped to workspace
3. ✅ Usage events logged for all tool invocations
4. ✅ Idle instances auto-stopped after 5 minutes
5. ✅ Instance limits enforced per user and workspace
6. ✅ Dashboard stats endpoint returns correct data
7. ✅ Daily usage aggregation runs on schedule

---

## Notes

- Tenant headers will come from Swarm Platform JWT in production
- For development/testing, use direct headers
- Dashboard UI components are separate deliverable (can be Phase 4.5)
- Consider adding WebSocket for real-time instance status updates
