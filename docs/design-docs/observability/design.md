# Observability Stack Design

**Document:** `/opt/swarm-specs/design-docs/observability/design.md`  
**Created:** 2025-12-15  
**Status:** In Progress  
**Author:** Systems Architect

---

## Overview

This document defines the observability infrastructure for Project Swarm, covering:
1. **Structured Logging** - JSON logs with correlation IDs
2. **Metrics** - Prometheus-compatible endpoint
3. **Distributed Tracing** - Request flow across VMs
4. **Visualization** - Grafana dashboards + trace viewer
5. **Alerting** - Slack/PagerDuty integration

### Design Principles

| Principle | Rationale |
|-----------|-----------|
| SQLite-first | No external dependencies initially; scale later |
| OTel-compatible | Future migration path to OpenTelemetry |
| Tenant-isolated | All data scoped by tenant_id |
| Low overhead | <5% performance impact target |
| Crash-safe | VMs flush traces before termination |

---

## Phase 1: Logging Foundation

### 1.1 Logger Design (`lib/logger.js`)

#### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Logger                                │
├─────────────────────────────────────────────────────────────┤
│  Context Store (AsyncLocalStorage)                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ trace_id | request_id | tenant_id | user_id | agent_id ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Log Methods: debug | info | warn | error | fatal           │
├─────────────────────────────────────────────────────────────┤
│  Formatters: JSON (prod) | Pretty (dev)                     │
├─────────────────────────────────────────────────────────────┤
│  Transports: stdout | file | (future: remote)               │
└─────────────────────────────────────────────────────────────┘
```

#### Class Definition

```javascript
// /opt/swarm-platform/lib/logger.js

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

class SwarmLogger {
  constructor(options = {}) {
    this.context = new AsyncLocalStorage();
    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.format = options.format || process.env.LOG_FORMAT || 'json';
    this.serviceName = options.serviceName || 'swarm-platform';
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    };
  }

  // Run code within a logging context
  runWithContext(contextData, fn) {
    const ctx = {
      trace_id: contextData.trace_id || crypto.randomUUID(),
      request_id: contextData.request_id || `req_${crypto.randomUUID().slice(0,8)}`,
      tenant_id: contextData.tenant_id || null,
      user_id: contextData.user_id || null,
      agent_id: contextData.agent_id || null,
      ...contextData
    };
    return this.context.run(ctx, fn);
  }

  // Get current context
  getContext() {
    return this.context.getStore() || {};
  }

  // Add to current context
  addContext(data) {
    const store = this.context.getStore();
    if (store) {
      Object.assign(store, data);
    }
  }

  // Create child logger with additional context
  child(bindings) {
    const childLogger = Object.create(this);
    childLogger._bindings = { ...this._bindings, ...bindings };
    return childLogger;
  }

  // Core log method
  _log(level, message, meta = {}) {
    if (this.levels[level] < this.levels[this.level]) {
      return;
    }

    const ctx = this.getContext();
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      trace_id: ctx.trace_id || null,
      request_id: ctx.request_id || null,
      tenant_id: ctx.tenant_id || null,
      ...this._bindings,
      ...meta
    };

    // Remove null values for cleaner logs
    Object.keys(entry).forEach(k => entry[k] === null && delete entry[k]);

    if (this.format === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      // Pretty format for development
      const levelColors = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m', // red
        fatal: '\x1b[35m'  // magenta
      };
      const reset = '\x1b[0m';
      const traceStr = ctx.trace_id ? ` [${ctx.trace_id.slice(0,8)}]` : '';
      console.log(
        `${entry.timestamp} ${levelColors[level]}${level.toUpperCase().padEnd(5)}${reset}${traceStr} ${message}`,
        Object.keys(meta).length ? meta : ''
      );
    }
  }

  // Level methods
  debug(message, meta) { this._log('debug', message, meta); }
  info(message, meta) { this._log('info', message, meta); }
  warn(message, meta) { this._log('warn', message, meta); }
  error(message, meta) { this._log('error', message, meta); }
  fatal(message, meta) { this._log('fatal', message, meta); }

  // HTTP request logging helper
  logRequest(req, res, duration) {
    const level = res.statusCode >= 500 ? 'error' 
                : res.statusCode >= 400 ? 'warn' 
                : 'info';
    
    this._log(level, 'HTTP Request', {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
      user_agent: req.get('User-Agent'),
      ip: req.ip
    });
  }
}

// Singleton instance
const logger = new SwarmLogger({
  serviceName: process.env.SERVICE_NAME || 'swarm-platform',
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'json'
});

module.exports = { SwarmLogger, logger };
```


### 1.2 Logging Middleware (`lib/middleware/observability.js`)

```javascript
// /opt/swarm-platform/lib/middleware/observability.js

const { logger } = require('../logger');
const crypto = require('crypto');

/**
 * Request context middleware
 * Extracts or generates correlation IDs and wraps request in logging context
 */
function requestContext(req, res, next) {
  // Extract or generate trace_id (propagated from upstream or new)
  const traceId = req.get('X-Trace-ID') || crypto.randomUUID();
  const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
  
  // Extract tenant from JWT (set by auth middleware)
  const tenantId = req.user?.tenant_id || null;
  const userId = req.user?.id || null;
  
  // Set response headers for correlation
  res.set('X-Trace-ID', traceId);
  res.set('X-Request-ID', requestId);
  
  // Store on request for easy access
  req.traceId = traceId;
  req.requestId = requestId;
  
  // Run entire request within logging context
  logger.runWithContext(
    { trace_id: traceId, request_id: requestId, tenant_id: tenantId, user_id: userId },
    () => next()
  );
}

/**
 * Request timing middleware
 * Logs HTTP requests with duration
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });
  
  next();
}

/**
 * Error logging middleware
 * Must be registered after routes
 */
function errorLogger(err, req, res, next) {
  logger.error('Unhandled error', {
    error_name: err.name,
    error_message: err.message,
    error_stack: err.stack,
    path: req.path,
    method: req.method
  });
  next(err);
}

module.exports = { requestContext, requestLogger, errorLogger };
```

#### Integration Pattern

```javascript
// In server.js
const { logger } = require('./lib/logger');
const { requestContext, requestLogger, errorLogger } = require('./lib/middleware/observability');

const app = express();

// Order matters!
app.use(requestContext);   // 1. First: establish context
app.use(requestLogger);    // 2. Second: start timing

// ... auth middleware here (sets req.user) ...
// ... routes here ...

app.use(errorLogger);      // Last: catch errors
```

---

### 1.3 Log Format Specification

#### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SwarmLogEntry",
  "type": "object",
  "required": ["timestamp", "level", "message", "service"],
  "properties": {
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    },
    "level": {
      "type": "string",
      "enum": ["debug", "info", "warn", "error", "fatal"]
    },
    "service": {
      "type": "string",
      "description": "Service name (swarm-platform, swarm-sentinel, forge-agent)"
    },
    "message": {
      "type": "string",
      "description": "Human-readable log message"
    },
    "trace_id": {
      "type": "string",
      "format": "uuid",
      "description": "Distributed trace correlation ID"
    },
    "request_id": {
      "type": "string",
      "pattern": "^req_[a-f0-9]{8}$",
      "description": "Unique request identifier"
    },
    "tenant_id": {
      "type": "string",
      "description": "Tenant isolation scope"
    },
    "ticket_id": {
      "type": "string",
      "description": "Associated ticket (when applicable)"
    },
    "agent_id": {
      "type": "string",
      "description": "Agent identifier (in VM context)"
    },
    "vm_id": {
      "type": "integer",
      "description": "VM number (0-999)"
    },
    "duration_ms": {
      "type": "integer",
      "minimum": 0,
      "description": "Operation duration in milliseconds"
    },
    "error_name": {
      "type": "string",
      "description": "Error class name (Error, TypeError, etc)"
    },
    "error_message": {
      "type": "string",
      "description": "Error message text"
    },
    "error_stack": {
      "type": "string",
      "description": "Stack trace (error level only)"
    }
  }
}
```

#### Sample Log Entries

```json
{"timestamp":"2025-12-15T10:30:45.123Z","level":"info","service":"swarm-platform","message":"HTTP Request","trace_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","request_id":"req_f8a9b2c3","tenant_id":"tenant_001","method":"POST","path":"/api/tickets/claim","status_code":200,"duration_ms":45}

{"timestamp":"2025-12-15T10:30:45.200Z","level":"info","service":"swarm-platform","message":"Ticket claimed","trace_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","request_id":"req_f8a9b2c3","tenant_id":"tenant_001","ticket_id":"PROJ-001-T003","agent_id":"agent_vm5"}

{"timestamp":"2025-12-15T10:30:46.500Z","level":"error","service":"forge-agent","message":"Claude API error","trace_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","agent_id":"agent_vm5","ticket_id":"PROJ-001-T003","error_name":"APIError","error_message":"Rate limit exceeded","error_stack":"APIError: Rate limit exceeded\n    at ClaudeClient.send (/app/lib/claude.js:45:11)"}
```



---

### 1.4 Log Rotation Strategy

#### PM2 Log Management

PM2 handles log rotation natively. Configuration via `ecosystem.config.js`:

```javascript
// /opt/swarm-platform/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'swarm-platform',
    script: 'server.js',
    
    // Log configuration
    out_file: '/var/log/swarm/platform-out.log',
    error_file: '/var/log/swarm/platform-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    merge_logs: true,
    
    // Environment
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'json',
      SERVICE_NAME: 'swarm-platform'
    }
  }]
};
```

#### PM2 Log Rotation Module

```bash
# Install pm2-logrotate
pm2 install pm2-logrotate

# Configure rotation settings
pm2 set pm2-logrotate:max_size 50M      # Rotate at 50MB
pm2 set pm2-logrotate:retain 7          # Keep 7 rotated files
pm2 set pm2-logrotate:compress true     # Gzip old logs
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30 # Check every 30s
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # Daily rotation
```

#### Log Directory Structure

```
/var/log/swarm/
├── platform-out.log           # Current stdout
├── platform-error.log         # Current stderr  
├── platform-out__2025-12-14.log.gz  # Rotated
├── platform-out__2025-12-13.log.gz
├── verifier-out.log
├── verifier-error.log
└── agents/
    └── agent-vm{N}.log        # Per-VM logs (collected post-execution)
```

#### Retention Policy

| Log Type | Retention | Rationale |
|----------|-----------|-----------|
| Platform logs | 7 days | Normal operations |
| Error logs | 30 days | Debugging window |
| Agent VM logs | 24 hours | High volume, collect traces instead |
| Trace data | 30 days | Primary debugging source |

---

### 1.5 Environment Configuration

```bash
# /opt/swarm-platform/.env additions

# Logging
LOG_LEVEL=info          # debug|info|warn|error|fatal
LOG_FORMAT=json         # json|pretty
SERVICE_NAME=swarm-platform

# Trace propagation
TRACE_HEADER=X-Trace-ID
REQUEST_ID_HEADER=X-Request-ID
```

---

### 1.6 Migration Guide (from console.log)

#### Before (Current State)

```javascript
// server.js line 59
console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);

// server.js line 109
console.error('Error:', err);
```

#### After (With Logger)

```javascript
// server.js
const { logger } = require('./lib/logger');
const { requestContext, requestLogger, errorLogger } = require('./lib/middleware/observability');

// Remove old logging middleware, replace with:
app.use(requestContext);
app.use(requestLogger);

// Routes...

app.use(errorLogger);

// Startup log
logger.info('Server started', { port: PORT, env: process.env.NODE_ENV });
```

#### Search & Replace Patterns

| Old Pattern | New Pattern |
|-------------|-------------|
| `console.log(...)` | `logger.info(message, meta)` |
| `console.error('Error:', err)` | `logger.error(err.message, { error_stack: err.stack })` |
| `console.warn(...)` | `logger.warn(message, meta)` |
| `console.debug(...)` | `logger.debug(message, meta)` |

---

## Phase 1 Checklist

- [x] 1.1 Logger class design with AsyncLocalStorage context
- [x] 1.2 Express middleware for context propagation
- [x] 1.3 JSON log format specification
- [x] 1.4 PM2 log rotation configuration
- [x] 1.5 Environment variables
- [x] 1.6 Migration guide

**Phase 1 Status: DESIGN COMPLETE** ✅

---


## Phase 2: Metrics (Prometheus)

**Purpose:** Expose operational metrics in Prometheus format for monitoring, alerting, and capacity planning.

### 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   swarm-platform                        │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Routes    │  │   Routes    │  │   Routes    │    │
│  │  /api/vms   │  │ /api/tickets│  │ /api/agents │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │            │
│         └────────────────┼────────────────┘            │
│                          ▼                             │
│                 ┌────────────────┐                     │
│                 │   Middleware   │                     │
│                 │ metricsMiddleware                    │
│                 └────────┬───────┘                     │
│                          ▼                             │
│                 ┌────────────────┐                     │
│                 │  lib/metrics.js│                     │
│                 │  (prom-client) │                     │
│                 └────────┬───────┘                     │
│                          │                             │
│                 ┌────────▼───────┐                     │
│                 │  GET /metrics  │◄── Prometheus       │
│                 └────────────────┘    Scraper          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Dependencies

```bash
cd /opt/swarm-platform
npm install prom-client
```

### 2.3 Core Metrics Module (lib/metrics.js)

```javascript
// /opt/swarm-platform/lib/metrics.js
'use strict';

const promClient = require('prom-client');

// Create a registry for all metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
promClient.collectDefaultMetrics({ 
  register,
  prefix: 'swarm_nodejs_' 
});

// ─────────────────────────────────────────────────────
// VM METRICS
// ─────────────────────────────────────────────────────

const vmMetrics = {
  active: new promClient.Gauge({
    name: 'swarm_vms_active',
    help: 'Number of currently running VMs',
    labelNames: ['tenant_id'],
    registers: [register]
  }),

  total: new promClient.Counter({
    name: 'swarm_vms_total',
    help: 'Total number of VM spawn attempts',
    labelNames: ['tenant_id', 'status'],  // status: success|failure
    registers: [register]
  }),

  bootDuration: new promClient.Histogram({
    name: 'swarm_vm_boot_duration_ms',
    help: 'VM boot/restore duration in milliseconds',
    labelNames: ['method'],  // method: boot|restore
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
    registers: [register]
  })
};

// ─────────────────────────────────────────────────────
// TICKET METRICS
// ─────────────────────────────────────────────────────

const ticketMetrics = {
  total: new promClient.Counter({
    name: 'swarm_tickets_total',
    help: 'Total number of ticket state transitions',
    labelNames: ['tenant_id', 'status'],  // status: pending|claimed|completed|failed
    registers: [register]
  }),

  duration: new promClient.Histogram({
    name: 'swarm_ticket_duration_seconds',
    help: 'Time to complete a ticket in seconds',
    labelNames: ['type', 'complexity'],  // type: bug|feature|task, complexity: low|medium|high
    buckets: [30, 60, 120, 300, 600, 1800, 3600, 7200],
    registers: [register]
  }),

  queueDepth: new promClient.Gauge({
    name: 'swarm_queue_depth',
    help: 'Number of tickets in each status',
    labelNames: ['tenant_id', 'status'],
    registers: [register]
  })
};

// ─────────────────────────────────────────────────────
// API METRICS
// ─────────────────────────────────────────────────────

const apiMetrics = {
  requestsTotal: new promClient.Counter({
    name: 'swarm_api_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [register]
  }),

  requestDuration: new promClient.Histogram({
    name: 'swarm_api_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'path'],
    buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [register]
  })
};

// ─────────────────────────────────────────────────────
// CLAUDE API METRICS
// ─────────────────────────────────────────────────────

const claudeMetrics = {
  callsTotal: new promClient.Counter({
    name: 'swarm_claude_api_calls_total',
    help: 'Total number of Claude API calls',
    labelNames: ['model', 'status'],  // status: success|failure|timeout
    registers: [register]
  }),

  tokens: new promClient.Counter({
    name: 'swarm_claude_api_tokens',
    help: 'Total tokens consumed',
    labelNames: ['model', 'direction'],  // direction: input|output
    registers: [register]
  }),

  costUsd: new promClient.Counter({
    name: 'swarm_claude_api_cost_usd',
    help: 'Estimated Claude API cost in USD',
    labelNames: ['tenant_id', 'model'],
    registers: [register]
  })
};

// ─────────────────────────────────────────────────────
// AGENT METRICS
// ─────────────────────────────────────────────────────

const agentMetrics = {
  executionsTotal: new promClient.Counter({
    name: 'swarm_agent_executions_total',
    help: 'Total number of agent executions',
    labelNames: ['agent_type', 'status'],  // status: success|failure|timeout
    registers: [register]
  })
};

// ─────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────

/**
 * Normalize path for metrics labels (remove IDs, limit cardinality)
 * /api/vms/123 → /api/vms/:id
 * /api/tickets/abc-def-123 → /api/tickets/:id
 */
function normalizePath(path) {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:hash');
}

/**
 * Get all metrics in Prometheus text format
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Get content type for /metrics endpoint
 */
function getContentType() {
  return register.contentType;
}

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  register,
  vmMetrics,
  ticketMetrics,
  apiMetrics,
  claudeMetrics,
  agentMetrics,
  normalizePath,
  getMetrics,
  getContentType
};
```

### 2.4 Metrics Middleware (lib/middleware/observability.js additions)

```javascript
// Add to existing observability.js middleware file

const { apiMetrics, normalizePath } = require('../metrics');

/**
 * Middleware to record HTTP request metrics
 */
function metricsMiddleware(req, res, next) {
  const startTime = process.hrtime();

  // Skip metrics endpoint to avoid recursion
  if (req.path === '/metrics') {
    return next();
  }

  // Record response on finish
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const durationMs = seconds * 1000 + nanoseconds / 1e6;

    const path = normalizePath(req.route?.path || req.path);
    const method = req.method;
    const status = res.statusCode.toString();

    // Increment request counter
    apiMetrics.requestsTotal.inc({
      method,
      path,
      status
    });

    // Record request duration
    apiMetrics.requestDuration.observe({
      method,
      path
    }, durationMs);
  });

  next();
}

module.exports = {
  // ... existing exports
  metricsMiddleware
};
```

### 2.5 Metrics Endpoint (routes/metrics.js)

```javascript
// /opt/swarm-platform/routes/metrics.js
'use strict';

const express = require('express');
const router = express.Router();
const { getMetrics, getContentType } = require('../lib/metrics');

/**
 * GET /metrics
 * Prometheus scrape endpoint
 */
router.get('/', async (req, res) => {
  try {
    res.set('Content-Type', getContentType());
    res.end(await getMetrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

module.exports = router;
```

### 2.6 Server Integration (server.js additions)

```javascript
// Add to server.js after other middleware

const metricsRouter = require('./routes/metrics');
const { metricsMiddleware } = require('./lib/middleware/observability');

// Add metrics middleware early in chain
app.use(metricsMiddleware);

// Mount metrics endpoint (before auth for Prometheus access)
app.use('/metrics', metricsRouter);
```

### 2.7 Usage Patterns

#### Recording VM Spawns

```javascript
const { vmMetrics } = require('./lib/metrics');

async function spawnVM(tenantId, vmId) {
  const startTime = Date.now();
  
  try {
    await firecracker.restore(vmId);
    const duration = Date.now() - startTime;
    
    // Record success
    vmMetrics.total.inc({ tenant_id: tenantId, status: 'success' });
    vmMetrics.bootDuration.observe({ method: 'restore' }, duration);
    vmMetrics.active.inc({ tenant_id: tenantId });
    
  } catch (err) {
    vmMetrics.total.inc({ tenant_id: tenantId, status: 'failure' });
    throw err;
  }
}

async function killVM(tenantId, vmId) {
  await firecracker.kill(vmId);
  vmMetrics.active.dec({ tenant_id: tenantId });
}
```

#### Recording Ticket Transitions

```javascript
const { ticketMetrics } = require('./lib/metrics');

async function claimTicket(tenantId, ticketId, agentId) {
  await db.run(
    'UPDATE tickets SET status = ?, agent_id = ? WHERE id = ?',
    ['claimed', agentId, ticketId]
  );
  ticketMetrics.total.inc({ tenant_id: tenantId, status: 'claimed' });
}

async function completeTicket(tenantId, ticket) {
  const durationSeconds = (Date.now() - new Date(ticket.claimed_at)) / 1000;
  
  ticketMetrics.total.inc({ tenant_id: tenantId, status: 'completed' });
  ticketMetrics.duration.observe({
    type: ticket.type || 'task',
    complexity: ticket.complexity || 'medium'
  }, durationSeconds);
}

async function updateQueueDepth(tenantId) {
  const statuses = ['pending', 'claimed', 'blocked', 'completed', 'failed'];
  for (const status of statuses) {
    const { count } = await db.get(
      'SELECT COUNT(*) as count FROM tickets WHERE tenant_id = ? AND status = ?',
      [tenantId, status]
    );
    ticketMetrics.queueDepth.set({ tenant_id: tenantId, status }, count);
  }
}
```

#### Recording Claude API Usage

```javascript
const { claudeMetrics } = require('./lib/metrics');

// Cost per 1K tokens (Claude 3.5 Sonnet pricing as of Dec 2024)
const COST_PER_1K_INPUT = 0.003;
const COST_PER_1K_OUTPUT = 0.015;

async function callClaude(tenantId, model, messages) {
  try {
    const response = await anthropic.messages.create({
      model,
      messages
    });
    
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    
    // Record success
    claudeMetrics.callsTotal.inc({ model, status: 'success' });
    claudeMetrics.tokens.inc({ model, direction: 'input' }, inputTokens);
    claudeMetrics.tokens.inc({ model, direction: 'output' }, outputTokens);
    
    // Estimate cost
    const cost = (inputTokens / 1000) * COST_PER_1K_INPUT 
               + (outputTokens / 1000) * COST_PER_1K_OUTPUT;
    claudeMetrics.costUsd.inc({ tenant_id: tenantId, model }, cost);
    
    return response;
  } catch (err) {
    claudeMetrics.callsTotal.inc({ 
      model, 
      status: err.code === 'ETIMEDOUT' ? 'timeout' : 'failure' 
    });
    throw err;
  }
}
```

#### Recording Agent Executions

```javascript
const { agentMetrics } = require('./lib/metrics');

async function runAgent(agentType, ticketId) {
  try {
    const result = await executeAgentTask(agentType, ticketId);
    agentMetrics.executionsTotal.inc({ agent_type: agentType, status: 'success' });
    return result;
  } catch (err) {
    const status = err.message.includes('timeout') ? 'timeout' : 'failure';
    agentMetrics.executionsTotal.inc({ agent_type: agentType, status });
    throw err;
  }
}
```

### 2.8 Sample /metrics Output

```
# HELP swarm_vms_active Number of currently running VMs
# TYPE swarm_vms_active gauge
swarm_vms_active{tenant_id=tenant_001} 5
swarm_vms_active{tenant_id=tenant_002} 3

# HELP swarm_vms_total Total number of VM spawn attempts
# TYPE swarm_vms_total counter
swarm_vms_total{tenant_id=tenant_001,status=success} 150
swarm_vms_total{tenant_id=tenant_001,status=failure} 2

# HELP swarm_vm_boot_duration_ms VM boot/restore duration in milliseconds
# TYPE swarm_vm_boot_duration_ms histogram
swarm_vm_boot_duration_ms_bucket{method=restore,le=5} 45
swarm_vm_boot_duration_ms_bucket{method=restore,le=10} 142
swarm_vm_boot_duration_ms_bucket{method=restore,le=25} 148
swarm_vm_boot_duration_ms_bucket{method=restore,le=+Inf} 150
swarm_vm_boot_duration_ms_sum{method=restore} 1205.5
swarm_vm_boot_duration_ms_count{method=restore} 150

# HELP swarm_api_requests_total Total number of HTTP requests
# TYPE swarm_api_requests_total counter
swarm_api_requests_total{method=GET,path=/api/tickets,status=200} 1250
swarm_api_requests_total{method=POST,path=/api/tickets/:id/claim,status=200} 450
swarm_api_requests_total{method=GET,path=/api/health,status=200} 8640

# HELP swarm_api_request_duration_ms HTTP request duration in milliseconds
# TYPE swarm_api_request_duration_ms histogram
swarm_api_request_duration_ms_bucket{method=GET,path=/api/tickets,le=50} 1100
swarm_api_request_duration_ms_bucket{method=GET,path=/api/tickets,le=100} 1200
swarm_api_request_duration_ms_bucket{method=GET,path=/api/tickets,le=+Inf} 1250

# HELP swarm_claude_api_cost_usd Estimated Claude API cost in USD
# TYPE swarm_claude_api_cost_usd counter
swarm_claude_api_cost_usd{tenant_id=tenant_001,model=claude-sonnet-4-20250514} 12.45
```

### 2.9 Prometheus Configuration (for future)

```yaml
# /etc/prometheus/prometheus.yml (when Prometheus is installed)
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'swarm-platform'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: /metrics
    scheme: http
```

### 2.10 Metrics Best Practices

| Practice | Reason |
|----------|--------|
| Use `normalizePath()` for labels | Prevents high cardinality from unique IDs |
| Skip /metrics in middleware | Avoids recursive metric recording |
| Use appropriate bucket ranges | Match expected value distributions |
| Counter for totals, Gauge for current | Counters never decrease, gauges can |
| Histogram for durations | Enables percentile calculations |

---

## Phase 2 Checklist

- [x] 2.1 Architecture overview
- [x] 2.2 Dependencies (prom-client)
- [x] 2.3 Core metrics module design (lib/metrics.js)
- [x] 2.4 Metrics middleware
- [x] 2.5 /metrics endpoint
- [x] 2.6 Server integration pattern
- [x] 2.7 Usage patterns for all metric types
- [x] 2.8 Sample output format
- [x] 2.9 Prometheus configuration
- [x] 2.10 Best practices

**Phase 2 Status: DESIGN COMPLETE** ✅

---

## Phase 3: Distributed Tracing (Next)

*To be designed...*

| Span Name | Description |
|-----------|-------------|
| http.request | Root span for HTTP requests |
| ticket.claim | Ticket claim operation |
| vm.spawn | VM boot/restore |
| llm.generate | Claude API call |
| git.commit | Git operations |


## Phase 3: Distributed Tracing

**Goal:** Implement OpenTelemetry-style distributed tracing for end-to-end request visibility across VM boundaries.

### 3.1 Architecture Overview



### 3.2 Schema Migration

**File:** Migration SQL for swarm.db

```sql
-- Agent Traces Table
-- Stores OpenTelemetry-style spans for distributed tracing
CREATE TABLE IF NOT EXISTS agent_traces (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT REFERENCES tenants(id),
  ticket_id TEXT REFERENCES tickets(id),
  agent_id TEXT REFERENCES agents(id),
  
  -- Core trace identifiers
  trace_id TEXT NOT NULL,           -- Groups all spans in a request
  span_id TEXT NOT NULL UNIQUE,     -- Unique ID for this span
  parent_span_id TEXT,              -- NULL for root spans
  
  -- Span metadata
  span_name TEXT NOT NULL,          -- e.g., 'http.request', 'llm.generate'
  span_kind TEXT CHECK(span_kind IN ('internal', 'client', 'server')) DEFAULT 'internal',
  status TEXT CHECK(status IN ('ok', 'error', 'unset')) DEFAULT 'unset',
  
  -- Timing
  start_time TEXT NOT NULL,         -- ISO8601 timestamp
  end_time TEXT,                    -- NULL until span ends
  duration_ms INTEGER,              -- Computed on end
  
  -- Extensible data
  attributes JSON DEFAULT '{}',     -- Key-value span attributes
  events JSON DEFAULT '[]',         -- Timestamped events within span
  
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON agent_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_traces_tenant ON agent_traces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_traces_ticket ON agent_traces(ticket_id);
CREATE INDEX IF NOT EXISTS idx_traces_time ON agent_traces(start_time);
CREATE INDEX IF NOT EXISTS idx_traces_name ON agent_traces(span_name);
```

### 3.3 Core Tracer Module

**File:** /opt/swarm-platform/lib/tracer.js

```javascript
/**
 * AgentTracer - OpenTelemetry-style distributed tracing for Swarm
 * 
 * Usage:
 *   const tracer = require('./lib/tracer');
 *   
 *   // Start a root span
 *   const span = tracer.startSpan('http.request', {
 *     traceId: req.headers['x-trace-id'],
 *     attributes: { method: req.method, path: req.path }
 *   });
 *   
 *   // Create child span
 *   const childSpan = tracer.startSpan('db.query', { parent: span });
 *   
 *   // Add events and attributes
 *   childSpan.addEvent('query_started', { sql: 'SELECT...' });
 *   childSpan.setAttribute('rows_returned', 42);
 *   
 *   // End spans
 *   childSpan.end('ok');
 *   span.end('ok');
 */

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const path = require('path');

// Async context for trace propagation
const traceContext = new AsyncLocalStorage();

// Database path (same as main app)
const DB_PATH = process.env.SWARM_DB_PATH || '/opt/swarm-platform/data/swarm.db';
let db = null;

/**
 * Generate trace/span IDs (W3C Trace Context format)
 * trace_id: 32 hex chars (128-bit)
 * span_id: 16 hex chars (64-bit)
 */
function generateTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Span class - represents a unit of work
 */
class Span {
  constructor(name, options = {}) {
    this.spanId = generateSpanId();
    this.traceId = options.traceId || options.parent?.traceId || generateTraceId();
    this.parentSpanId = options.parent?.spanId || options.parentSpanId || null;
    this.name = name;
    this.kind = options.kind || 'internal';
    this.status = 'unset';
    this.startTime = new Date().toISOString();
    this.endTime = null;
    this.durationMs = null;
    this.attributes = { ...options.attributes };
    this.events = [];
    
    // Context binding
    this.tenantId = options.tenantId || null;
    this.ticketId = options.ticketId || null;
    this.agentId = options.agentId || null;
  }
  
  /**
   * Add a key-value attribute to the span
   */
  setAttribute(key, value) {
    this.attributes[key] = value;
    return this;
  }
  
  /**
   * Add multiple attributes
   */
  setAttributes(attrs) {
    Object.assign(this.attributes, attrs);
    return this;
  }
  
  /**
   * Record a timestamped event within the span
   */
  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes
    });
    return this;
  }
  
  /**
   * End the span and persist to database
   */
  end(status = 'ok') {
    if (this.endTime) return; // Already ended
    
    this.endTime = new Date().toISOString();
    this.status = status;
    this.durationMs = new Date(this.endTime) - new Date(this.startTime);
    
    // Async persist (non-blocking)
    setImmediate(() => persistSpan(this));
    
    return this;
  }
  
  /**
   * Create a child span
   */
  child(name, options = {}) {
    return new Span(name, {
      ...options,
      parent: this,
      tenantId: this.tenantId,
      ticketId: this.ticketId,
      agentId: this.agentId
    });
  }
  
  /**
   * Get traceparent header value (W3C format)
   */
  toTraceparent() {
    return `00-${this.traceId}-${this.spanId}-01`;
  }
}

/**
 * Persist span to SQLite (non-blocking)
 */
async function persistSpan(span) {
  try {
    const stmt = getDb().prepare(`
      INSERT INTO agent_traces (
        tenant_id, ticket_id, agent_id,
        trace_id, span_id, parent_span_id,
        span_name, span_kind, status,
        start_time, end_time, duration_ms,
        attributes, events
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      span.tenantId,
      span.ticketId,
      span.agentId,
      span.traceId,
      span.spanId,
      span.parentSpanId,
      span.name,
      span.kind,
      span.status,
      span.startTime,
      span.endTime,
      span.durationMs,
      JSON.stringify(span.attributes),
      JSON.stringify(span.events)
    );
  } catch (err) {
    // Non-blocking - log but don't throw
    console.error('[tracer] Failed to persist span:', err.message);
  }
}

/**
 * Get or initialize database connection
 */
function getDb() {
  if (!db) {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    initSchema();
  }
  return db;
}

/**
 * Initialize schema if needed
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT,
      ticket_id TEXT,
      agent_id TEXT,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL UNIQUE,
      parent_span_id TEXT,
      span_name TEXT NOT NULL,
      span_kind TEXT CHECK(span_kind IN ('internal', 'client', 'server')) DEFAULT 'internal',
      status TEXT CHECK(status IN ('ok', 'error', 'unset')) DEFAULT 'unset',
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_ms INTEGER,
      attributes JSON DEFAULT '{}',
      events JSON DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON agent_traces(trace_id);
    CREATE INDEX IF NOT EXISTS idx_traces_tenant ON agent_traces(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_traces_time ON agent_traces(start_time);
  `);
}

// ============================================================
// Public API
// ============================================================

const tracer = {
  /**
   * Start a new span
   */
  startSpan(name, options = {}) {
    // Inherit context from AsyncLocalStorage if available
    const ctx = traceContext.getStore() || {};
    
    const span = new Span(name, {
      ...options,
      traceId: options.traceId || ctx.traceId,
      parentSpanId: options.parentSpanId || ctx.spanId,
      tenantId: options.tenantId || ctx.tenantId,
      ticketId: options.ticketId || ctx.ticketId,
      agentId: options.agentId || ctx.agentId
    });
    
    return span;
  },
  
  /**
   * Run a function within trace context
   */
  withContext(context, fn) {
    return traceContext.run(context, fn);
  },
  
  /**
   * Get current trace context
   */
  getContext() {
    return traceContext.getStore() || {};
  },
  
  /**
   * Parse traceparent header (W3C format)
   * Format: 00-traceId-spanId-flags
   */
  parseTraceparent(header) {
    if (!header) return null;
    const parts = header.split('-');
    if (parts.length !== 4) return null;
    return {
      version: parts[0],
      traceId: parts[1],
      spanId: parts[2],
      flags: parts[3]
    };
  },
  
  /**
   * Generate new trace ID
   */
  generateTraceId,
  
  /**
   * Generate new span ID  
   */
  generateSpanId,
  
  /**
   * Query traces by trace_id
   */
  getTrace(traceId) {
    return getDb()
      .prepare('SELECT * FROM agent_traces WHERE trace_id = ? ORDER BY start_time')
      .all(traceId);
  },
  
  /**
   * Query recent traces
   */
  getRecentTraces(limit = 100, tenantId = null) {
    if (tenantId) {
      return getDb()
        .prepare(`
          SELECT DISTINCT trace_id, MIN(start_time) as start_time, 
                 MAX(duration_ms) as total_duration_ms,
                 COUNT(*) as span_count
          FROM agent_traces 
          WHERE tenant_id = ?
          GROUP BY trace_id
          ORDER BY start_time DESC
          LIMIT ?
        `)
        .all(tenantId, limit);
    }
    return getDb()
      .prepare(`
        SELECT DISTINCT trace_id, MIN(start_time) as start_time,
               MAX(duration_ms) as total_duration_ms,
               COUNT(*) as span_count
        FROM agent_traces
        GROUP BY trace_id  
        ORDER BY start_time DESC
        LIMIT ?
      `)
      .all(limit);
  },
  
  /**
   * Close database connection
   */
  close() {
    if (db) {
      db.close();
      db = null;
    }
  }
};

module.exports = tracer;
```

### 3.4 Tracing Middleware

**File:** Add to /opt/swarm-platform/lib/middleware.js

```javascript
const tracer = require('./tracer');

/**
 * Tracing middleware - creates root span and propagates trace context
 * 
 * Extracts X-Trace-ID or traceparent from headers, or generates new trace.
 * Stores root span in req.span for handlers to create child spans.
 */
function tracingMiddleware(req, res, next) {
  // Extract or generate trace ID
  let traceId = req.headers['x-trace-id'];
  let parentSpanId = null;
  
  // W3C traceparent support
  const traceparent = tracer.parseTraceparent(req.headers['traceparent']);
  if (traceparent) {
    traceId = traceparent.traceId;
    parentSpanId = traceparent.spanId;
  }
  
  // Start root span for this request
  const span = tracer.startSpan('http.request', {
    traceId,
    parentSpanId,
    kind: 'server',
    tenantId: req.tenantId,  // From authMiddleware
    attributes: {
      'http.method': req.method,
      'http.url': req.originalUrl,
      'http.path': req.path,
      'http.user_agent': req.headers['user-agent']
    }
  });
  
  // Attach to request
  req.span = span;
  req.traceId = span.traceId;
  
  // Set response header for client correlation
  res.setHeader('X-Trace-ID', span.traceId);
  
  // Run handler in trace context
  tracer.withContext({
    traceId: span.traceId,
    spanId: span.spanId,
    tenantId: req.tenantId
  }, () => {
    // Capture response
    const originalEnd = res.end;
    res.end = function(...args) {
      span.setAttribute('http.status_code', res.statusCode);
      span.end(res.statusCode >= 400 ? 'error' : 'ok');
      return originalEnd.apply(res, args);
    };
    
    next();
  });
}

module.exports = { tracingMiddleware };
```

### 3.5 Traces API Route

**File:** /opt/swarm-platform/routes/traces.js

```javascript
/**
 * Traces API - Query and ingest distributed traces
 * 
 * Routes:
 *   GET  /api/traces              - List recent traces
 *   GET  /api/traces/:traceId     - Get all spans for a trace
 *   POST /api/traces              - Ingest spans (for agents)
 */

const express = require('express');
const router = express.Router();
const tracer = require('../lib/tracer');

/**
 * GET /api/traces - List recent traces
 * Query params: limit (default 100)
 */
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const tenantId = req.tenantId; // From auth middleware
  
  try {
    const traces = tracer.getRecentTraces(limit, tenantId);
    res.json({
      traces,
      count: traces.length,
      limit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/traces/:traceId - Get all spans for a trace
 */
router.get('/:traceId', (req, res) => {
  const { traceId } = req.params;
  
  try {
    const spans = tracer.getTrace(traceId);
    
    if (spans.length === 0) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    
    // Build span tree
    const spanTree = buildSpanTree(spans);
    
    res.json({
      traceId,
      spans,
      spanTree,
      totalSpans: spans.length,
      totalDurationMs: calculateTotalDuration(spans)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/traces - Ingest spans from agents
 * Body: { spans: [{ name, traceId, parentSpanId, ... }] }
 */
router.post('/', (req, res) => {
  const { spans } = req.body;
  
  if (!Array.isArray(spans)) {
    return res.status(400).json({ error: 'spans must be an array' });
  }
  
  const results = [];
  const errors = [];
  
  for (const spanData of spans) {
    try {
      // Create and immediately end span (for historical ingestion)
      const span = tracer.startSpan(spanData.name, {
        traceId: spanData.traceId,
        parentSpanId: spanData.parentSpanId,
        tenantId: spanData.tenantId || req.tenantId,
        ticketId: spanData.ticketId,
        agentId: spanData.agentId,
        kind: spanData.kind || 'internal',
        attributes: spanData.attributes || {}
      });
      
      // Set timing from payload if provided
      if (spanData.startTime) span.startTime = spanData.startTime;
      if (spanData.events) span.events = spanData.events;
      
      span.end(spanData.status || 'ok');
      
      results.push({ spanId: span.spanId, status: 'created' });
    } catch (err) {
      errors.push({ span: spanData.name, error: err.message });
    }
  }
  
  res.json({
    created: results.length,
    errors: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
});

/**
 * Build hierarchical span tree from flat span list
 */
function buildSpanTree(spans) {
  const spanMap = new Map();
  const roots = [];
  
  // Index spans by ID
  spans.forEach(span => {
    spanMap.set(span.span_id, { ...span, children: [] });
  });
  
  // Build tree
  spans.forEach(span => {
    const node = spanMap.get(span.span_id);
    if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
      spanMap.get(span.parent_span_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  
  return roots;
}

/**
 * Calculate total trace duration
 */
function calculateTotalDuration(spans) {
  if (spans.length === 0) return 0;
  const starts = spans.map(s => new Date(s.start_time).getTime());
  const ends = spans.filter(s => s.end_time).map(s => new Date(s.end_time).getTime());
  return ends.length > 0 ? Math.max(...ends) - Math.min(...starts) : 0;
}

module.exports = router;
```

### 3.6 Server Integration

**Update:** /opt/swarm-platform/server.js

```javascript
// Add after other imports
const { tracingMiddleware } = require('./lib/middleware');
const tracesRouter = require('./routes/traces');

// Add to middleware chain (after auth, before routes)
// Order: cors → bodyParser → requestContext → auth → tracing → routes
app.use(tracingMiddleware);

// Add traces routes
app.use('/api/traces', tracesRouter);
```

### 3.7 Instrumentation Guide

**Where to add spans in the codebase:**

| Location | Span Name | Parent | Attributes |
|----------|-----------|--------|------------|
| ticket routes | ticket.claim | http.request | ticket_id, agent_id |
| ticket routes | ticket.complete | http.request | duration_ms, status |
| VM manager | vm.spawn | ticket.claim | vm_id, method (boot/restore) |
| VM manager | vm.shutdown | ticket.complete | vm_id, uptime_ms |
| pull-agent | agent.execute | vm.spawn | agent_type, ticket_id |
| pull-agent | git.clone | agent.execute | repo_url, branch |
| pull-agent | llm.generate | agent.execute | model, input_tokens, output_tokens |
| pull-agent | file.write | agent.execute | file_count, total_bytes |
| pull-agent | git.commit | agent.execute | commit_sha, files_changed |
| pull-agent | git.push | agent.execute | branch, commit_count |
| pull-agent | pr.create | agent.execute | pr_number, pr_url |

**Example Instrumentation - Ticket Claim:**

```javascript
// In routes/tickets.js
router.post('/claim', async (req, res) => {
  // Create child span from request span
  const span = req.span.child('ticket.claim', {
    attributes: { agent_id: req.body.agentId }
  });
  
  try {
    const ticket = await claimTicket(req.body.agentId);
    span.setAttribute('ticket_id', ticket.id);
    span.end('ok');
    res.json(ticket);
  } catch (err) {
    span.setAttribute('error.message', err.message);
    span.end('error');
    throw err;
  }
});
```

**Example Instrumentation - Agent (VM-side):**

```javascript
// In pull-agent-v2.js
async function executeTask(ticket) {
  // Report spans back to orchestrator
  const spans = [];
  
  const execSpan = {
    name: 'agent.execute',
    traceId: ticket.traceId, // Propagated from orchestrator
    ticketId: ticket.id,
    agentId: CONFIG.agentId,
    startTime: new Date().toISOString(),
    attributes: { agent_type: 'coder' }
  };
  
  // ... do work ...
  
  const llmSpan = {
    name: 'llm.generate',
    traceId: ticket.traceId,
    parentSpanId: execSpan.spanId,
    startTime: llmStart,
    endTime: llmEnd,
    attributes: { 
      model: 'claude-sonnet-4-20250514',
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens
    }
  };
  
  spans.push(llmSpan);
  
  // Send spans to collector
  await fetch('http://10.0.0.1:8080/api/traces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spans })
  });
}
```

### 3.8 Trace Propagation Across VM Boundaries

**Problem:** VMs are isolated but need to correlate traces with orchestrator.

**Solution:** Pass trace context via ticket payload:

```javascript
// Orchestrator: Include trace context when assigning ticket
{
  ticket_id: abc123,
  trace_id: 4bf92f3577b34da6a3ce929d0e0e4736,
  parent_span_id: 00f067aa0ba902b7,
  // ... other ticket fields
}

// Agent: Extract and use trace context
const traceId = ticket.trace_id;
const parentSpanId = ticket.parent_span_id;
```

### 3.9 Sample Trace Output

```json
{
  traceId: 4bf92f3577b34da6a3ce929d0e0e4736,
  spans: [
    {
      span_id: 00f067aa0ba902b7,
      parent_span_id: null,
      span_name: http.request,
      start_time: 2025-01-15T10:30:00.000Z,
      end_time: 2025-01-15T10:30:45.000Z,
      duration_ms: 45000,
      status: ok,
      attributes: {
        http.method: POST,
        http.path: /api/tickets/claim
      }
    },
    {
      span_id: 7a2190f7b8e23d4c,
      parent_span_id: 00f067aa0ba902b7,
      span_name: ticket.claim,
      duration_ms: 50,
      attributes: { ticket_id: ticket_001 }
    },
    {
      span_id: b3e4f5a6d7c8e9f0,
      parent_span_id: 7a2190f7b8e23d4c,
      span_name: vm.spawn,
      duration_ms: 8,
      attributes: { vm_id: vm_042, method: restore }
    },
    {
      span_id: c4d5e6f7a8b9c0d1,
      parent_span_id: b3e4f5a6d7c8e9f0,
      span_name: agent.execute,
      duration_ms: 44000,
      attributes: { agent_type: coder }
    },
    {
      span_id: d5e6f7a8b9c0d1e2,
      parent_span_id: c4d5e6f7a8b9c0d1,
      span_name: llm.generate,
      duration_ms: 12000,
      attributes: { 
        model: claude-sonnet-4-20250514,
        input_tokens: 4200,
        output_tokens: 1800
      }
    }
  ],
  totalSpans: 5,
  totalDurationMs: 45000
}
```

---

## Phase 3 Checklist

- [x] 3.1 Architecture overview
- [x] 3.2 Schema migration (agent_traces table)
- [x] 3.3 Core tracer module (lib/tracer.js)
- [x] 3.4 Tracing middleware
- [x] 3.5 Traces API route (/api/traces)
- [x] 3.6 Server integration pattern
- [x] 3.7 Instrumentation guide (11 span types)
- [x] 3.8 Cross-VM trace propagation
- [x] 3.9 Sample trace output

**Phase 3 Status: DESIGN COMPLETE** ✅

---

## Phase 4: Dashboards (Next)

*To be designed...*

| Dashboard | Purpose |
|-----------|---------|
| system-overview.json | Active VMs, throughput, errors |
| agent-performance.json | Execution times, success rates |
| vm-health.json | Boot times, lifecycle |
| ticket-pipeline.json | Queue depth, throughput |


## Phase 3: Distributed Tracing

**Goal:** Implement OpenTelemetry-style distributed tracing for end-to-end request visibility across VM boundaries.

### 3.1 Architecture Overview

```
                    TRACING ARCHITECTURE
    
  HTTP Request     tracingMiddleware      Request Handler
  X-Trace-ID  -->  (create/propagate) --> (instrumented)
                                                |
                    +---------------------------+
                    v                           v
             AgentTracer              AgentTracer
             .startSpan()             .recordEvent()
             .endSpan()               .addAttribute()
                    |                           |
                    +-------------+-------------+
                                  v
                           agent_traces
                           (SQLite)
                                  |
                                  v
                        POST /api/traces
                        (collector API)
```

### 3.2 Schema Migration

**File:** Migration SQL for swarm.db

```sql
-- Agent Traces Table
-- Stores OpenTelemetry-style spans for distributed tracing
CREATE TABLE IF NOT EXISTS agent_traces (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT REFERENCES tenants(id),
  ticket_id TEXT REFERENCES tickets(id),
  agent_id TEXT REFERENCES agents(id),
  
  -- Core trace identifiers
  trace_id TEXT NOT NULL,           -- Groups all spans in a request
  span_id TEXT NOT NULL UNIQUE,     -- Unique ID for this span
  parent_span_id TEXT,              -- NULL for root spans
  
  -- Span metadata
  span_name TEXT NOT NULL,          -- e.g., 'http.request', 'llm.generate'
  span_kind TEXT CHECK(span_kind IN ('internal', 'client', 'server')) DEFAULT 'internal',
  status TEXT CHECK(status IN ('ok', 'error', 'unset')) DEFAULT 'unset',
  
  -- Timing
  start_time TEXT NOT NULL,         -- ISO8601 timestamp
  end_time TEXT,                    -- NULL until span ends
  duration_ms INTEGER,              -- Computed on end
  
  -- Extensible data
  attributes JSON DEFAULT '{}',     -- Key-value span attributes
  events JSON DEFAULT '[]',         -- Timestamped events within span
  
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON agent_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_traces_tenant ON agent_traces(tenant_id);
CREATE INDEX IF NOT EXISTS idx_traces_ticket ON agent_traces(ticket_id);
CREATE INDEX IF NOT EXISTS idx_traces_time ON agent_traces(start_time);
CREATE INDEX IF NOT EXISTS idx_traces_name ON agent_traces(span_name);
```

### 3.3 Core Tracer Module

**File:** /opt/swarm-platform/lib/tracer.js

```javascript
/**
 * AgentTracer - OpenTelemetry-style distributed tracing for Swarm
 * 
 * Usage:
 *   const tracer = require('./lib/tracer');
 *   
 *   // Start a root span
 *   const span = tracer.startSpan('http.request', {
 *     traceId: req.headers['x-trace-id'],
 *     attributes: { method: req.method, path: req.path }
 *   });
 *   
 *   // Create child span
 *   const childSpan = tracer.startSpan('db.query', { parent: span });
 *   
 *   // Add events and attributes
 *   childSpan.addEvent('query_started', { sql: 'SELECT...' });
 *   childSpan.setAttribute('rows_returned', 42);
 *   
 *   // End spans
 *   childSpan.end('ok');
 *   span.end('ok');
 */

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const path = require('path');

// Async context for trace propagation
const traceContext = new AsyncLocalStorage();

// Database path (same as main app)
const DB_PATH = process.env.SWARM_DB_PATH || '/opt/swarm-platform/data/swarm.db';
let db = null;

/**
 * Generate trace/span IDs (W3C Trace Context format)
 * trace_id: 32 hex chars (128-bit)
 * span_id: 16 hex chars (64-bit)
 */
function generateTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Span class - represents a unit of work
 */
class Span {
  constructor(name, options = {}) {
    this.spanId = generateSpanId();
    this.traceId = options.traceId || options.parent?.traceId || generateTraceId();
    this.parentSpanId = options.parent?.spanId || options.parentSpanId || null;
    this.name = name;
    this.kind = options.kind || 'internal';
    this.status = 'unset';
    this.startTime = new Date().toISOString();
    this.endTime = null;
    this.durationMs = null;
    this.attributes = { ...options.attributes };
    this.events = [];
    
    // Context binding
    this.tenantId = options.tenantId || null;
    this.ticketId = options.ticketId || null;
    this.agentId = options.agentId || null;
  }
  
  /**
   * Add a key-value attribute to the span
   */
  setAttribute(key, value) {
    this.attributes[key] = value;
    return this;
  }
  
  /**
   * Add multiple attributes
   */
  setAttributes(attrs) {
    Object.assign(this.attributes, attrs);
    return this;
  }
  
  /**
   * Record a timestamped event within the span
   */
  addEvent(name, attributes = {}) {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes
    });
    return this;
  }
  
  /**
   * End the span and persist to database
   */
  end(status = 'ok') {
    if (this.endTime) return; // Already ended
    
    this.endTime = new Date().toISOString();
    this.status = status;
    this.durationMs = new Date(this.endTime) - new Date(this.startTime);
    
    // Async persist (non-blocking)
    setImmediate(() => persistSpan(this));
    
    return this;
  }
  
  /**
   * Create a child span
   */
  child(name, options = {}) {
    return new Span(name, {
      ...options,
      parent: this,
      tenantId: this.tenantId,
      ticketId: this.ticketId,
      agentId: this.agentId
    });
  }
  
  /**
   * Get traceparent header value (W3C format)
   */
  toTraceparent() {
    return `00-${this.traceId}-${this.spanId}-01`;
  }
}

/**
 * Persist span to SQLite (non-blocking)
 */
async function persistSpan(span) {
  try {
    const stmt = getDb().prepare(`
      INSERT INTO agent_traces (
        tenant_id, ticket_id, agent_id,
        trace_id, span_id, parent_span_id,
        span_name, span_kind, status,
        start_time, end_time, duration_ms,
        attributes, events
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      span.tenantId,
      span.ticketId,
      span.agentId,
      span.traceId,
      span.spanId,
      span.parentSpanId,
      span.name,
      span.kind,
      span.status,
      span.startTime,
      span.endTime,
      span.durationMs,
      JSON.stringify(span.attributes),
      JSON.stringify(span.events)
    );
  } catch (err) {
    // Non-blocking - log but don't throw
    console.error('[tracer] Failed to persist span:', err.message);
  }
}

/**
 * Get or initialize database connection
 */
function getDb() {
  if (!db) {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    initSchema();
  }
  return db;
}

/**
 * Initialize schema if needed
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_traces (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tenant_id TEXT,
      ticket_id TEXT,
      agent_id TEXT,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL UNIQUE,
      parent_span_id TEXT,
      span_name TEXT NOT NULL,
      span_kind TEXT CHECK(span_kind IN ('internal', 'client', 'server')) DEFAULT 'internal',
      status TEXT CHECK(status IN ('ok', 'error', 'unset')) DEFAULT 'unset',
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_ms INTEGER,
      attributes JSON DEFAULT '{}',
      events JSON DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON agent_traces(trace_id);
    CREATE INDEX IF NOT EXISTS idx_traces_tenant ON agent_traces(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_traces_time ON agent_traces(start_time);
  `);
}

// ============================================================
// Public API
// ============================================================

const tracer = {
  /**
   * Start a new span
   */
  startSpan(name, options = {}) {
    // Inherit context from AsyncLocalStorage if available
    const ctx = traceContext.getStore() || {};
    
    const span = new Span(name, {
      ...options,
      traceId: options.traceId || ctx.traceId,
      parentSpanId: options.parentSpanId || ctx.spanId,
      tenantId: options.tenantId || ctx.tenantId,
      ticketId: options.ticketId || ctx.ticketId,
      agentId: options.agentId || ctx.agentId
    });
    
    return span;
  },
  
  /**
   * Run a function within trace context
   */
  withContext(context, fn) {
    return traceContext.run(context, fn);
  },
  
  /**
   * Get current trace context
   */
  getContext() {
    return traceContext.getStore() || {};
  },
  
  /**
   * Parse traceparent header (W3C format)
   * Format: 00-traceId-spanId-flags
   */
  parseTraceparent(header) {
    if (!header) return null;
    const parts = header.split('-');
    if (parts.length !== 4) return null;
    return {
      version: parts[0],
      traceId: parts[1],
      spanId: parts[2],
      flags: parts[3]
    };
  },
  
  /**
   * Generate new trace ID
   */
  generateTraceId,
  
  /**
   * Generate new span ID  
   */
  generateSpanId,
  
  /**
   * Query traces by trace_id
   */
  getTrace(traceId) {
    return getDb()
      .prepare('SELECT * FROM agent_traces WHERE trace_id = ? ORDER BY start_time')
      .all(traceId);
  },
  
  /**
   * Query recent traces
   */
  getRecentTraces(limit = 100, tenantId = null) {
    if (tenantId) {
      return getDb()
        .prepare(`
          SELECT DISTINCT trace_id, MIN(start_time) as start_time, 
                 MAX(duration_ms) as total_duration_ms,
                 COUNT(*) as span_count
          FROM agent_traces 
          WHERE tenant_id = ?
          GROUP BY trace_id
          ORDER BY start_time DESC
          LIMIT ?
        `)
        .all(tenantId, limit);
    }
    return getDb()
      .prepare(`
        SELECT DISTINCT trace_id, MIN(start_time) as start_time,
               MAX(duration_ms) as total_duration_ms,
               COUNT(*) as span_count
        FROM agent_traces
        GROUP BY trace_id  
        ORDER BY start_time DESC
        LIMIT ?
      `)
      .all(limit);
  },
  
  /**
   * Close database connection
   */
  close() {
    if (db) {
      db.close();
      db = null;
    }
  }
};

module.exports = tracer;
```


### 3.4 Tracing Middleware

**File:** Add to /opt/swarm-platform/lib/middleware.js

```javascript
const tracer = require('./tracer');

/**
 * Tracing middleware - creates root span and propagates trace context
 * 
 * Extracts X-Trace-ID or traceparent from headers, or generates new trace.
 * Stores root span in req.span for handlers to create child spans.
 */
function tracingMiddleware(req, res, next) {
  // Extract or generate trace ID
  let traceId = req.headers['x-trace-id'];
  let parentSpanId = null;
  
  // W3C traceparent support
  const traceparent = tracer.parseTraceparent(req.headers['traceparent']);
  if (traceparent) {
    traceId = traceparent.traceId;
    parentSpanId = traceparent.spanId;
  }
  
  // Start root span for this request
  const span = tracer.startSpan('http.request', {
    traceId,
    parentSpanId,
    kind: 'server',
    tenantId: req.tenantId,  // From authMiddleware
    attributes: {
      'http.method': req.method,
      'http.url': req.originalUrl,
      'http.path': req.path,
      'http.user_agent': req.headers['user-agent']
    }
  });
  
  // Attach to request
  req.span = span;
  req.traceId = span.traceId;
  
  // Set response header for client correlation
  res.setHeader('X-Trace-ID', span.traceId);
  
  // Run handler in trace context
  tracer.withContext({
    traceId: span.traceId,
    spanId: span.spanId,
    tenantId: req.tenantId
  }, () => {
    // Capture response
    const originalEnd = res.end;
    res.end = function(...args) {
      span.setAttribute('http.status_code', res.statusCode);
      span.end(res.statusCode >= 400 ? 'error' : 'ok');
      return originalEnd.apply(res, args);
    };
    
    next();
  });
}

module.exports = { tracingMiddleware };
```

### 3.5 Traces API Route

**File:** /opt/swarm-platform/routes/traces.js

```javascript
/**
 * Traces API - Query and ingest distributed traces
 * 
 * Routes:
 *   GET  /api/traces              - List recent traces
 *   GET  /api/traces/:traceId     - Get all spans for a trace
 *   POST /api/traces              - Ingest spans (for agents)
 */

const express = require('express');
const router = express.Router();
const tracer = require('../lib/tracer');

/**
 * GET /api/traces - List recent traces
 * Query params: limit (default 100)
 */
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const tenantId = req.tenantId; // From auth middleware
  
  try {
    const traces = tracer.getRecentTraces(limit, tenantId);
    res.json({
      traces,
      count: traces.length,
      limit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/traces/:traceId - Get all spans for a trace
 */
router.get('/:traceId', (req, res) => {
  const { traceId } = req.params;
  
  try {
    const spans = tracer.getTrace(traceId);
    
    if (spans.length === 0) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    
    // Build span tree
    const spanTree = buildSpanTree(spans);
    
    res.json({
      traceId,
      spans,
      spanTree,
      totalSpans: spans.length,
      totalDurationMs: calculateTotalDuration(spans)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/traces - Ingest spans from agents
 * Body: { spans: [{ name, traceId, parentSpanId, ... }] }
 */
router.post('/', (req, res) => {
  const { spans } = req.body;
  
  if (!Array.isArray(spans)) {
    return res.status(400).json({ error: 'spans must be an array' });
  }
  
  const results = [];
  const errors = [];
  
  for (const spanData of spans) {
    try {
      // Create and immediately end span (for historical ingestion)
      const span = tracer.startSpan(spanData.name, {
        traceId: spanData.traceId,
        parentSpanId: spanData.parentSpanId,
        tenantId: spanData.tenantId || req.tenantId,
        ticketId: spanData.ticketId,
        agentId: spanData.agentId,
        kind: spanData.kind || 'internal',
        attributes: spanData.attributes || {}
      });
      
      // Set timing from payload if provided
      if (spanData.startTime) span.startTime = spanData.startTime;
      if (spanData.events) span.events = spanData.events;
      
      span.end(spanData.status || 'ok');
      
      results.push({ spanId: span.spanId, status: 'created' });
    } catch (err) {
      errors.push({ span: spanData.name, error: err.message });
    }
  }
  
  res.json({
    created: results.length,
    failed: errors.length,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
});

/**
 * Build hierarchical span tree from flat span list
 */
function buildSpanTree(spans) {
  const spanMap = new Map();
  const roots = [];
  
  // Index spans by ID
  spans.forEach(span => {
    spanMap.set(span.span_id, { ...span, children: [] });
  });
  
  // Build tree
  spans.forEach(span => {
    const node = spanMap.get(span.span_id);
    if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
      spanMap.get(span.parent_span_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  
  return roots;
}

/**
 * Calculate total trace duration
 */
function calculateTotalDuration(spans) {
  if (spans.length === 0) return 0;
  const starts = spans.map(s => new Date(s.start_time).getTime());
  const ends = spans.filter(s => s.end_time).map(s => new Date(s.end_time).getTime());
  return ends.length > 0 ? Math.max(...ends) - Math.min(...starts) : 0;
}

module.exports = router;
```

### 3.6 Server Integration

**Update:** /opt/swarm-platform/server.js

```javascript
// Add after other imports
const { tracingMiddleware } = require('./lib/middleware');
const tracesRouter = require('./routes/traces');

// Add to middleware chain (after auth, before routes)
// Order: cors -> bodyParser -> requestContext -> auth -> tracing -> routes
app.use(tracingMiddleware);

// Add traces routes
app.use('/api/traces', tracesRouter);
```

### 3.7 Instrumentation Guide

**Where to add spans in the codebase:**

| Location | Span Name | Parent | Attributes |
|----------|-----------|--------|------------|
| ticket routes | ticket.claim | http.request | ticket_id, agent_id |
| ticket routes | ticket.complete | http.request | duration_ms, status |
| VM manager | vm.spawn | ticket.claim | vm_id, method (boot/restore) |
| VM manager | vm.shutdown | ticket.complete | vm_id, uptime_ms |
| pull-agent | agent.execute | vm.spawn | agent_type, ticket_id |
| pull-agent | git.clone | agent.execute | repo_url, branch |
| pull-agent | llm.generate | agent.execute | model, input_tokens, output_tokens |
| pull-agent | file.write | agent.execute | file_count, total_bytes |
| pull-agent | git.commit | agent.execute | commit_sha, files_changed |
| pull-agent | git.push | agent.execute | branch, commit_count |
| pull-agent | pr.create | agent.execute | pr_number, pr_url |

**Example Instrumentation - Ticket Claim:**

```javascript
// In routes/tickets.js
router.post('/claim', async (req, res) => {
  // Create child span from request span
  const span = req.span.child('ticket.claim', {
    attributes: { agent_id: req.body.agentId }
  });
  
  try {
    const ticket = await claimTicket(req.body.agentId);
    span.setAttribute('ticket_id', ticket.id);
    span.end('ok');
    res.json(ticket);
  } catch (err) {
    span.setAttribute('error.message', err.message);
    span.end('error');
    throw err;
  }
});
```

**Example Instrumentation - Agent (VM-side):**

```javascript
// In pull-agent-v2.js
async function executeTask(ticket) {
  // Report spans back to orchestrator
  const spans = [];
  
  const execSpan = {
    name: 'agent.execute',
    traceId: ticket.traceId, // Propagated from orchestrator
    ticketId: ticket.id,
    agentId: CONFIG.agentId,
    startTime: new Date().toISOString(),
    attributes: { agent_type: 'coder' }
  };
  
  // ... do work ...
  
  const llmSpan = {
    name: 'llm.generate',
    traceId: ticket.traceId,
    parentSpanId: execSpan.spanId,
    startTime: llmStart,
    endTime: llmEnd,
    attributes: { 
      model: 'claude-sonnet-4-20250514',
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens
    }
  };
  
  spans.push(llmSpan);
  
  // Send spans to collector
  await fetch('http://10.0.0.1:8080/api/traces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spans })
  });
}
```


### 3.8 Trace Propagation Across VM Boundaries

**Problem:** VMs are isolated but need to correlate traces with orchestrator.

**Solution:** Pass trace context via ticket payload:

```javascript
// Orchestrator: Include trace context when assigning ticket
{
  "ticket_id": "abc123",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "parent_span_id": "00f067aa0ba902b7",
  // ... other ticket fields
}

// Agent: Extract and use trace context
const traceId = ticket.trace_id;
const parentSpanId = ticket.parent_span_id;
```

### 3.9 Sample Trace Output

```json
{
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spans": [
    {
      "span_id": "00f067aa0ba902b7",
      "parent_span_id": null,
      "span_name": "http.request",
      "start_time": "2025-01-15T10:30:00.000Z",
      "end_time": "2025-01-15T10:30:45.000Z",
      "duration_ms": 45000,
      "status": "ok",
      "attributes": {
        "http.method": "POST",
        "http.path": "/api/tickets/claim"
      }
    },
    {
      "span_id": "7a2190f7b8e23d4c",
      "parent_span_id": "00f067aa0ba902b7",
      "span_name": "ticket.claim",
      "duration_ms": 50,
      "attributes": { "ticket_id": "ticket_001" }
    },
    {
      "span_id": "b3e4f5a6d7c8e9f0",
      "parent_span_id": "7a2190f7b8e23d4c",
      "span_name": "vm.spawn",
      "duration_ms": 8,
      "attributes": { "vm_id": "vm_042", "method": "restore" }
    },
    {
      "span_id": "c4d5e6f7a8b9c0d1",
      "parent_span_id": "b3e4f5a6d7c8e9f0",
      "span_name": "agent.execute",
      "duration_ms": 44000,
      "attributes": { "agent_type": "coder" }
    },
    {
      "span_id": "d5e6f7a8b9c0d1e2",
      "parent_span_id": "c4d5e6f7a8b9c0d1",
      "span_name": "llm.generate",
      "duration_ms": 12000,
      "attributes": { 
        "model": "claude-sonnet-4-20250514",
        "input_tokens": 4200,
        "output_tokens": 1800
      }
    }
  ],
  "totalSpans": 5,
  "totalDurationMs": 45000
}
```

---

## Phase 3 Checklist

- [x] 3.1 Architecture overview
- [x] 3.2 Schema migration (agent_traces table)
- [x] 3.3 Core tracer module (lib/tracer.js)
- [x] 3.4 Tracing middleware
- [x] 3.5 Traces API route (/api/traces)
- [x] 3.6 Server integration pattern
- [x] 3.7 Instrumentation guide (11 span types)
- [x] 3.8 Cross-VM trace propagation
- [x] 3.9 Sample trace output

**Phase 3 Status: DESIGN COMPLETE** ✅

---

## Phase 4: Dashboards (Next)

*To be designed...*

| Dashboard | Purpose |
|-----------|---------|
| system-overview.json | Active VMs, throughput, errors |
| agent-performance.json | Execution times, success rates |
| vm-health.json | Boot times, lifecycle |
| ticket-pipeline.json | Queue depth, throughput |

---

## Phase 4: Grafana Dashboards

### 4.1 Overview

Phase 4 provides pre-built Grafana dashboard JSON configurations that visualize all metrics from Phase 2. Four dashboards are provided, each targeting a specific audience and use case.

### 4.2 Dashboard Inventory

| Dashboard | File | Audience | Panels |
|-----------|------|----------|--------|
| System Overview | `dashboards/system-overview.json` | Operations | 10 |
| Agent Performance | `dashboards/agent-performance.json` | Engineering | 10 |
| VM Health | `dashboards/vm-health.json` | Infrastructure | 10 |
| Ticket Pipeline | `dashboards/ticket-pipeline.json` | Product/Eng | 12 |

### 4.3 System Overview Dashboard

**UID:** `swarm-system-overview`  
**Refresh:** 30s  
**Purpose:** Quick health check for operations team

| Panel | Type | Metric |
|-------|------|--------|
| Active VMs | Stat | `swarm_vms_active` |
| Tickets/Hour | Stat | `rate(swarm_tickets_total{status="completed"}[1h])` |
| API Error Rate % | Gauge | 5xx/total ratio |
| API Latency P95 | Stat | `histogram_quantile(0.95, swarm_api_request_duration_ms)` |
| Pending Queue | Stat | `swarm_queue_depth{status="pending"}` |
| Claude Cost (24h) | Stat | `swarm_claude_api_cost_usd` |
| API Request Rate | Time series | By status code |
| VM Boot Times | Time series | P50/P95/P99 percentiles |
| Ticket Throughput | Time series | By status |
| Token Usage | Time series | Input/Output |

### 4.4 Agent Performance Dashboard

**UID:** `swarm-agent-performance`  
**Refresh:** 30s  
**Purpose:** Engineering optimization and cost tracking

| Panel | Type | Metric |
|-------|------|--------|
| Success Rate | Gauge | `swarm_agent_executions_total{status="success"}` ratio |
| Avg Duration | Stat | `swarm_ticket_duration_seconds` avg |
| Executions (24h) | Stat | Total count |
| Claude Calls (1h) | Stat | `swarm_claude_api_calls_total` |
| By Agent Type | Bar chart | Breakdown by agent |
| By Status | Pie chart | Success/failure distribution |
| Models Used | Pie chart | Claude model distribution |
| Token Usage | Time series | Input/output over time |
| Cost by Model | Time series | Cumulative USD |
| Duration by Complexity | Time series | Low/medium/high P95 |

### 4.5 VM Health Dashboard

**UID:** `swarm-vm-health`  
**Refresh:** 10s  
**Purpose:** Infrastructure monitoring

| Panel | Type | Metric |
|-------|------|--------|
| Active VMs | Stat | Current count |
| Total Spawned (24h) | Stat | Cumulative |
| Avg Boot Time | Stat | With thresholds |
| Failed Spawns (1h) | Stat | Error count |
| Restore vs Cold | Pie chart | Boot method distribution |
| Lifecycle Status | Time series | By status |
| Boot Distribution | Histogram | Latency buckets |
| Boot Percentiles | Time series | By method P50/P95/P99 |
| VMs by Tenant | Bar chart | Multi-tenant view |
| Spawn Rate | Time series | Created/terminated/failed |

### 4.6 Ticket Pipeline Dashboard

**UID:** `swarm-ticket-pipeline`  
**Refresh:** 30s  
**Purpose:** Product and engineering pipeline visibility

| Panel | Type | Metric |
|-------|------|--------|
| Pending | Stat | Queue depth |
| In Progress | Stat | Active work |
| Completed (24h) | Stat | Success count |
| Failed (24h) | Stat | Error count |
| Throughput/Hour | Stat | Rate calculation |
| Avg Duration | Stat | Processing time |
| Queue Depth | Time series | By status over time |
| Flow Rate | Time series | Created/completed/failed |
| Duration Heatmap | Heatmap | By type |
| By Type | Pie chart | Ticket type distribution |
| By Tenant | Bar chart | Multi-tenant view |
| Backlog Trend | Time series | With 1h moving average |

### 4.7 Grafana Provisioning

#### Docker Compose

```yaml
version: 3.8
services:
  grafana:
    image: grafana/grafana:10.2.2
    container_name: swarm-grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=swarm-grafana-secret
    volumes:
      - grafana-data:/var/lib/grafana
      - ./dashboards:/etc/grafana/provisioning/dashboards
      - ./datasources:/etc/grafana/provisioning/datasources
    restart: unless-stopped

volumes:
  grafana-data:
```

#### Datasource Provisioning

Create `datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

#### Dashboard Provisioning

Create `dashboards/default.yml`:

```yaml
apiVersion: 1
providers:
  - name: Swarm Dashboards
    orgId: 1
    folder: Swarm
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
```

#### Installation Steps

1. Copy dashboard JSON files to provisioning directory
2. Create datasource configuration
3. Start Grafana with docker-compose
4. Access at http://localhost:3000
5. Dashboards auto-load in "Swarm" folder

### 4.8 Metrics Coverage

All 12 metrics from Phase 2 are utilized:

| Metric | System | Agent | VM | Pipeline |
|--------|--------|-------|-----|----------|
| `swarm_vms_active` | ✅ | | ✅ | |
| `swarm_vms_total` | | | ✅ | |
| `swarm_vm_boot_duration_ms` | ✅ | | ✅ | |
| `swarm_tickets_total` | ✅ | | | ✅ |
| `swarm_ticket_duration_seconds` | | ✅ | | ✅ |
| `swarm_queue_depth` | ✅ | | | ✅ |
| `swarm_api_requests_total` | ✅ | | | |
| `swarm_api_request_duration_ms` | ✅ | | | |
| `swarm_claude_api_calls_total` | | ✅ | | |
| `swarm_claude_api_tokens` | ✅ | ✅ | | |
| `swarm_claude_api_cost_usd` | ✅ | ✅ | | |
| `swarm_agent_executions_total` | | ✅ | | |

---

## Phase 4 Checklist

- [x] 4.1 System Overview dashboard (10 panels)
- [x] 4.2 Agent Performance dashboard (10 panels)
- [x] 4.3 VM Health dashboard (10 panels)
- [x] 4.4 Ticket Pipeline dashboard (12 panels)
- [x] 4.5 Grafana provisioning configuration
- [x] 4.6 Metrics coverage verification

**Phase 4 Status: DESIGN COMPLETE** ✅

---

## Phase 5: Alerting

**Status:** ✅ Design Complete  
**Created:** 2025-12-15

### 5.1 Alert Overview

| Alert | Condition | Severity | Team |
|-------|-----------|----------|------|
| SwarmHighErrorRate | API 5xx > 5% for 5m | Critical | Platform |
| SwarmClaudeAPIDown | No API calls for 5m while VMs active | Critical | Platform |
| SwarmVMBootSlow | P95 boot > 100ms for 5m | Warning | Infrastructure |
| SwarmNoActiveVMs | Active VMs = 0 for 5m | Critical | Infrastructure |
| SwarmAgentSuccessLow | Success rate < 90% for 15m | Critical | Engineering |
| SwarmTicketQueueBacklog | Pending > 100 for 15m | Warning | Platform |
| SwarmTicketStuck | In progress > 1 hour | Warning | Engineering |
| SwarmCostSpike | Hourly cost > $10/hour | Warning | Platform |

### 5.2 File Structure

```
/opt/swarm-specs/design-docs/observability/alerting/
├── swarm-alerts.yaml      # Prometheus alerting rules
├── alertmanager.yaml      # Alertmanager configuration
├── slack.tmpl             # Slack notification templates
└── runbooks.md            # Operational runbooks
```

### 5.3 Notification Channels

| Channel | Severity | Response Time |
|---------|----------|---------------|
| #swarm-critical (Slack) | Critical | Immediate |
| #swarm-alerts (Slack) | All | 5 min group |
| PagerDuty | Critical | On-call page |
| Team channels | By team label | 5 min group |

### 5.4 Inhibition Rules

1. **SwarmNoActiveVMs** suppresses all SwarmVM* alerts
2. **SwarmClaudeAPIDown** suppresses SwarmAgent* and SwarmTicket* alerts
3. Critical alerts suppress related warnings (same alertname)

### 5.5 Recording Rules

Pre-computed metrics for dashboard efficiency:

| Rule | Expression |
|------|------------|
| swarm:error_rate:5m | 5xx / total requests |
| swarm:agent_success_rate:15m | success / total operations |
| swarm:vm_boot_p95:5m | P95 boot duration |
| swarm:tickets_per_hour:1h | Completed tickets per hour |

### 5.6 Deployment

```yaml
# docker-compose addition for alerting
services:
  alertmanager:
    image: prom/alertmanager:v0.26.0
    volumes:
      - ./alerting/alertmanager.yaml:/etc/alertmanager/alertmanager.yaml
      - ./alerting/slack.tmpl:/etc/alertmanager/templates/slack.tmpl
    environment:
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
      - PAGERDUTY_SERVICE_KEY=${PAGERDUTY_SERVICE_KEY}
    ports:
      - "9093:9093"
```

