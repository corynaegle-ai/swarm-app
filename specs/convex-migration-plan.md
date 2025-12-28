# Swarm Platform: PostgreSQL → Convex Migration Plan

## Executive Summary

This document provides a comprehensive, step-by-step migration plan for moving the Swarm platform from PostgreSQL to Convex. The migration will leverage Convex's self-hosted capabilities with PostgreSQL as the underlying storage layer, effectively replacing the Express.js API layer and WebSocket implementation while retaining PostgreSQL for data persistence.

**Key Decision: Same Droplet Installation**

Convex self-hosted will run on the **same DEV droplet** (134.199.235.140) using the **mounted volume** `/mnt/volume_sfo3_01` for data storage. Rationale:
- DEV droplet has 16GB RAM, 4 vCPU - exceeds the 4GB RAM recommended minimum
- 173GB available on root partition, 95GB on `/mnt/volume_sfo3_01`
- Convex backend is lightweight (Docker container ~500MB)
- Database remains on existing PostgreSQL (no duplication)
- Single-node deployment matches our current architecture

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Infrastructure Decision Matrix](#3-infrastructure-decision-matrix)
4. [Phase 1: Convex Installation](#4-phase-1-convex-installation)
5. [Phase 2: Schema Design](#5-phase-2-schema-design)
6. [Phase 3: Backend Migration](#6-phase-3-backend-migration)
7. [Phase 4: Frontend Migration](#7-phase-4-frontend-migration)
8. [Phase 5: Testing & Validation](#8-phase-5-testing--validation)
9. [Phase 6: Cutover & Rollback](#9-phase-6-cutover--rollback)
10. [Scripts & Automation](#10-scripts--automation)
11. [Risk Assessment](#11-risk-assessment)
12. [Timeline](#12-timeline)

---

## 1. Current Architecture Analysis

### 1.1 Database Schema (PostgreSQL - swarmdb)

```
┌─────────────────────────────────────────────────────────────────┐
│                     SWARMDB TABLES (12)                          │
├─────────────────────────────────────────────────────────────────┤
│ CORE ENTITIES                                                    │
│   • users (12 cols) - Authentication, roles, tenants             │
│   • projects (12 cols) - Repository definitions                  │
│   • tickets (27 cols) - Work items, agent assignments            │
│                                                                  │
│ RBAC                                                             │
│   • roles (5 cols) - Admin, Operator, Viewer levels              │
│   • permissions (5 cols) - Granular permission definitions       │
│   • role_permissions (3 cols) - Junction table                   │
│                                                                  │
│ HITL (Human-in-the-Loop)                                         │
│   • hitl_sessions (22 cols) - Design sessions with LLM           │
│   • hitl_messages (6 cols) - Chat history                        │
│   • hitl_events (5 cols) - Event sourcing                        │
│   • hitl_approvals (8 cols) - Approval workflows                 │
│                                                                  │
│ DESIGN                                                           │
│   • design_sessions (8 cols) - Spec generation sessions          │
│                                                                  │
│ SECURITY                                                         │
│   • secrets (6 cols) - API keys, tokens per tenant               │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Current Data Volumes

| Table | Row Count | Growth Rate |
|-------|-----------|-------------|
| users | 2 | Low |
| tickets | 0 | High (100s/day expected) |
| projects | 0 | Medium |
| hitl_sessions | 1 | Medium |
| hitl_messages | 0 | High |
| hitl_events | 0 | High |

**Assessment**: Low data volume - ideal time for migration before scale.

### 1.3 Current Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   PM2 PROCESS MANAGER                            │
├─────────────────────────────────────────────────────────────────┤
│ swarm-platform-dev (port 8080)                                   │
│   └── Express.js server                                          │
│       ├── 14 Route modules (auth, vms, tickets, projects, etc)   │
│       ├── WebSocket server (/ws)                                 │
│       ├── PostgreSQL pool (pg)                                   │
│       └── JWT authentication                                     │
│                                                                  │
│ swarm-dashboard-dev (port 5173)                                  │
│   └── Vite React SPA                                             │
│       ├── fetch() → REST API                                     │
│       └── WebSocket subscriptions                                │
│                                                                  │
│ Other services: deploy-agent, mcp-factory, swarm-engine, etc     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Target Architecture

### 2.1 Convex Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   CONVEX SELF-HOSTED                             │
├─────────────────────────────────────────────────────────────────┤
│ Docker Container (ghcr.io/get-convex/convex-backend:latest)      │
│   ├── Port 3210: Convex API (queries/mutations)                  │
│   ├── Port 3211: HTTP Actions (webhooks)                         │
│   └── PostgreSQL backend (existing swarmdb)                      │
│                                                                  │
│ Convex Dashboard Container                                       │
│   └── Port 6791: Admin dashboard                                 │
├─────────────────────────────────────────────────────────────────┤
│                   APPLICATION LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│ /opt/swarm-platform/convex/                                      │
│   ├── schema.ts      → Type-safe schema definitions              │
│   ├── queries/       → Read operations (automatic subscriptions) │
│   ├── mutations/     → Write operations (ACID transactions)      │
│   ├── actions/       → External calls (VM spawn, Claude API)     │
│   └── http.ts        → HTTP endpoints (webhooks)                 │
├─────────────────────────────────────────────────────────────────┤
│                   FRONTEND                                       │
├─────────────────────────────────────────────────────────────────┤
│ Dashboard (React)                                                │
│   ├── useQuery() → Automatic real-time subscriptions             │
│   ├── useMutation() → Transactional writes                       │
│   └── useAction() → Long-running operations                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 What Changes

| Component | Before | After |
|-----------|--------|-------|
| Database | PostgreSQL (direct) | PostgreSQL (via Convex) |
| API Layer | Express.js REST | Convex queries/mutations |
| Real-time | Custom WebSocket | Automatic subscriptions |
| Auth | JWT middleware | Convex auth (JWT compatible) |
| Type Safety | Manual | End-to-end TypeScript |
| Transactions | pg client | Built-in ACID |

### 2.3 What Stays The Same

- PostgreSQL database (data layer)
- Firecracker/Wasp VMs (compute)
- SSH/Networking infrastructure
- GitHub integration
- Claude API calls
- Domain/SSL configuration

---

## 3. Infrastructure Decision Matrix

### 3.1 Where to Install Convex

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| **Same Droplet** | Lower latency to PostgreSQL, simpler networking, no additional cost | Shared resources with VMs | ✅ **SELECTED** |
| Separate Droplet | Resource isolation | Added latency, cost, complexity | ❌ |
| Cloud Convex | Zero maintenance | Latency, cost at scale, less control | ❌ |

**Rationale**: 
- Convex backend is lightweight (~200-500MB RAM)
- DEV droplet has 14GB available RAM
- PostgreSQL connection stays local (zero network latency)
- VM workloads are separate (Firecracker has its own memory allocation)

### 3.2 Storage Location

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Root partition `/opt` | Fast SSD, 173GB free | Competes with VMs | ❌ |
| **Mounted Volume** `/mnt/volume_sfo3_01` | 95GB dedicated, separate I/O | Network attached | ✅ **SELECTED** |
| Backup Volume `/mnt/swarm_volume_dev_db_backup` | Available | Meant for backups | ❌ |

**Storage Layout**:
```
/mnt/volume_sfo3_01/
├── convex/
│   ├── data/           # Convex internal state (if using SQLite fallback)
│   ├── storage/        # File storage
│   └── logs/           # Convex logs
└── backups/            # Migration backups
```

---

## 4. Phase 1: Convex Installation

### 4.1 Prerequisites

```bash
# Verify Docker installation
docker --version
docker compose version

# Verify PostgreSQL access
psql -h localhost -U swarm -d swarmdb -c "SELECT 1"
```

### 4.2 Installation Script

Create `/opt/swarm/scripts/install-convex.sh`:

```bash
#!/bin/bash
set -e

echo "=== Swarm Platform: Convex Installation ==="

# Variables
CONVEX_DIR="/opt/convex"
DATA_DIR="/mnt/volume_sfo3_01/convex"
PG_HOST="localhost"
PG_PORT="5432"
PG_DATABASE="swarmdb"
PG_USER="swarm"
PG_PASSWORD="swarm_dev_2024"

# Create directories
echo "[1/6] Creating directories..."
mkdir -p $CONVEX_DIR
mkdir -p $DATA_DIR/{data,storage,logs}
chown -R root:root $DATA_DIR

# Generate instance secret (32 bytes hex)
echo "[2/6] Generating instance secret..."
INSTANCE_SECRET=$(openssl rand -hex 32)
echo "INSTANCE_SECRET=$INSTANCE_SECRET" > $CONVEX_DIR/.env

# Create docker-compose.yml
echo "[3/6] Creating docker-compose.yml..."
cat > $CONVEX_DIR/docker-compose.yml << 'EOF'
version: '3.8'

services:
  backend:
    image: ghcr.io/get-convex/convex-backend:latest
    container_name: convex-backend
    restart: unless-stopped
    ports:
      - "3210:3210"  # Convex API
      - "3211:3211"  # HTTP Actions
    environment:
      - CONVEX_INSTANCE_NAME=swarm-convex
      - CONVEX_INSTANCE_SECRET=${INSTANCE_SECRET}
      - CONVEX_CLOUD_ORIGIN=https://convex.dev.swarmstack.net
      - CONVEX_SITE_ORIGIN=https://convex-http.dev.swarmstack.net
      # PostgreSQL connection
      - DATABASE_URL=postgres://${PG_USER}:${PG_PASSWORD}@host.docker.internal:${PG_PORT}/${PG_DATABASE}?sslmode=disable
      # Performance tuning
      - RUST_LOG=info
      - DISABLE_BEACON=false
    volumes:
      - ${DATA_DIR}/data:/convex_data
      - ${DATA_DIR}/storage:/convex_storage
      - ${DATA_DIR}/logs:/convex_logs
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3210/version"]
      interval: 30s
      timeout: 10s
      retries: 3

  dashboard:
    image: ghcr.io/get-convex/convex-dashboard:latest
    container_name: convex-dashboard
    restart: unless-stopped
    ports:
      - "6791:6791"
    environment:
      - NEXT_PUBLIC_DEPLOYMENT_URL=http://convex-backend:3210
    depends_on:
      - backend

networks:
  default:
    name: convex-network
EOF

# Substitute environment variables
echo "[4/6] Configuring environment..."
sed -i "s|\${INSTANCE_SECRET}|$INSTANCE_SECRET|g" $CONVEX_DIR/docker-compose.yml
sed -i "s|\${PG_USER}|$PG_USER|g" $CONVEX_DIR/docker-compose.yml
sed -i "s|\${PG_PASSWORD}|$PG_PASSWORD|g" $CONVEX_DIR/docker-compose.yml
sed -i "s|\${PG_PORT}|$PG_PORT|g" $CONVEX_DIR/docker-compose.yml
sed -i "s|\${PG_DATABASE}|$PG_DATABASE|g" $CONVEX_DIR/docker-compose.yml
sed -i "s|\${DATA_DIR}|$DATA_DIR|g" $CONVEX_DIR/docker-compose.yml

# Pull images
echo "[5/6] Pulling Docker images..."
cd $CONVEX_DIR
docker compose pull

# Start services
echo "[6/6] Starting Convex services..."
docker compose up -d

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
sleep 10

# Generate admin key
echo "=== Generating Admin Key ==="
docker compose exec -T backend ./generate_admin_key.sh

echo ""
echo "=== Installation Complete ==="
echo "Convex API: http://localhost:3210"
echo "Convex Dashboard: http://localhost:6791"
echo "Instance Secret saved to: $CONVEX_DIR/.env"
echo ""
echo "Next steps:"
echo "1. Save the admin key above"
echo "2. Configure Nginx reverse proxy"
echo "3. Run schema migration"
```

### 4.3 Nginx Configuration

Add to `/etc/nginx/sites-available/convex.dev.swarmstack.net`:

```nginx
# Convex API
server {
    listen 443 ssl http2;
    server_name convex.dev.swarmstack.net;

    ssl_certificate /etc/letsencrypt/live/dev.swarmstack.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.swarmstack.net/privkey.pem;

    location / {
        proxy_pass http://localhost:3210;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 86400;
    }
}

# Convex HTTP Actions
server {
    listen 443 ssl http2;
    server_name convex-http.dev.swarmstack.net;

    ssl_certificate /etc/letsencrypt/live/dev.swarmstack.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.swarmstack.net/privkey.pem;

    location / {
        proxy_pass http://localhost:3211;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Convex Dashboard (internal only)
server {
    listen 443 ssl http2;
    server_name convex-admin.dev.swarmstack.net;

    ssl_certificate /etc/letsencrypt/live/dev.swarmstack.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.swarmstack.net/privkey.pem;

    # IP whitelist - admin only
    allow YOUR_IP;
    deny all;

    location / {
        proxy_pass http://localhost:6791;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```


---

## 5. Phase 2: Schema Design

### 5.1 Convex Schema Definition

Create `/opt/swarm-platform/convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // USERS & AUTHENTICATION
  // ============================================
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.optional(v.string()),
    roleId: v.optional(v.id("roles")),
    tenantId: v.optional(v.string()),
    lastLogin: v.optional(v.number()), // Unix timestamp
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_tenant", ["tenantId"]),

  roles: defineTable({
    name: v.string(),
    level: v.number(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_name", ["name"]),

  permissions: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_category", ["category"]),

  rolePermissions: defineTable({
    roleId: v.id("roles"),
    permissionId: v.id("permissions"),
    createdAt: v.number(),
  })
    .index("by_role", ["roleId"])
    .index("by_permission", ["permissionId"]),

  // ============================================
  // PROJECTS
  // ============================================
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    branch: v.optional(v.string()),
    tenantId: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    state: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("paused")
    ),
    type: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_owner", ["ownerId"])
    .index("by_state", ["state"]),

  // ============================================
  // TICKETS
  // ============================================
  tickets: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    parentId: v.optional(v.id("tickets")),
    
    // Status tracking
    state: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("claimed"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("blocked"),
      v.literal("hold")
    ),
    priority: v.optional(v.number()),
    
    // Assignment
    assigneeId: v.optional(v.id("users")),
    assigneeType: v.optional(v.union(
      v.literal("human"),
      v.literal("agent")
    )),
    vmId: v.optional(v.string()),
    
    // Lease management (for agent work)
    leaseExpires: v.optional(v.number()),
    lastHeartbeat: v.optional(v.number()),
    
    // Dependencies (stored as arrays of ticket IDs)
    dependsOn: v.optional(v.array(v.id("tickets"))),
    blocks: v.optional(v.array(v.id("tickets"))),
    
    // Git/PR tracking
    branchName: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    filesInvolved: v.optional(v.array(v.string())),
    
    // Results
    progressLog: v.optional(v.string()),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
    outputs: v.optional(v.any()),
    
    // Verification
    verificationStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("skipped")
    )),
    holdReason: v.optional(v.string()),
    rejectionCount: v.optional(v.number()),
    
    // Estimation
    estimatedHours: v.optional(v.number()),
    actualHours: v.optional(v.number()),
    estimatedScope: v.optional(v.string()),
    
    // Design session reference
    designSession: v.optional(v.string()),
    
    // Multi-tenancy
    tenantId: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_state", ["state"])
    .index("by_parent", ["parentId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_tenant", ["tenantId"])
    .index("by_vm", ["vmId"])
    .index("by_state_tenant", ["state", "tenantId"])
    .index("by_project_state", ["projectId", "state"]),

  // ============================================
  // HITL (Human-in-the-Loop)
  // ============================================
  hitlSessions: defineTable({
    ticketId: v.optional(v.id("tickets")),
    projectId: v.optional(v.id("projects")),
    
    type: v.optional(v.union(
      v.literal("design"),
      v.literal("review"),
      v.literal("approval"),
      v.literal("clarification")
    )),
    state: v.union(
      v.literal("active"),
      v.literal("waiting"),
      v.literal("resolved"),
      v.literal("cancelled")
    ),
    
    // Project design fields
    projectName: v.optional(v.string()),
    description: v.optional(v.string()),
    projectType: v.optional(v.string()),
    repoUrl: v.optional(v.string()),
    supportingRepos: v.optional(v.any()), // JSON array
    repoAnalysis: v.optional(v.any()),    // JSON object
    
    // Spec generation
    draftSpec: v.optional(v.any()),
    finalSpec: v.optional(v.any()),
    
    // Chat/QA
    question: v.optional(v.string()),
    response: v.optional(v.string()),
    context: v.optional(v.string()),
    chatHistory: v.optional(v.array(v.any())),
    clarificationCount: v.optional(v.number()),
    
    // Assignment
    assigneeId: v.optional(v.id("users")),
    tenantId: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_project", ["projectId"])
    .index("by_state", ["state"])
    .index("by_tenant", ["tenantId"]),

  hitlMessages: defineTable({
    sessionId: v.id("hitlSessions"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_time", ["sessionId", "createdAt"]),

  hitlEvents: defineTable({
    sessionId: v.id("hitlSessions"),
    eventType: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_type", ["eventType"]),

  hitlApprovals: defineTable({
    sessionId: v.id("hitlSessions"),
    action: v.string(),
    context: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    approvedBy: v.optional(v.id("users")),
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"]),

  // ============================================
  // DESIGN SESSIONS
  // ============================================
  designSessions: defineTable({
    projectId: v.optional(v.id("projects")),
    name: v.optional(v.string()),
    state: v.optional(v.union(
      v.literal("draft"),
      v.literal("generating"),
      v.literal("complete"),
      v.literal("failed")
    )),
    spec: v.optional(v.string()),
    ticketsGenerated: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"]),

  // ============================================
  // SECRETS
  // ============================================
  secrets: defineTable({
    type: v.string(),
    value: v.string(),  // Should be encrypted in production
    description: v.optional(v.string()),
    tenantId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_tenant", ["tenantId"]),

  // ============================================
  // VM TRACKING (New - leverages Convex real-time)
  // ============================================
  vms: defineTable({
    vmId: v.number(),
    namespace: v.string(),
    ip: v.string(),
    pid: v.optional(v.number()),
    state: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("busy"),
      v.literal("stopping"),
      v.literal("stopped"),
      v.literal("error")
    ),
    assignedTicketId: v.optional(v.id("tickets")),
    lastHeartbeat: v.number(),
    metrics: v.optional(v.object({
      cpuPercent: v.optional(v.number()),
      memoryMb: v.optional(v.number()),
    })),
    createdAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_ticket", ["assignedTicketId"]),

  // ============================================
  // AGENT WORKFLOWS (Durable execution)
  // ============================================
  workflows: defineTable({
    type: v.string(),
    ticketId: v.optional(v.id("tickets")),
    vmId: v.optional(v.id("vms")),
    state: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    currentStep: v.string(),
    steps: v.array(v.object({
      name: v.string(),
      status: v.string(),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      result: v.optional(v.any()),
    })),
    retryCount: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_state", ["state"]),
});
```

### 5.2 Schema Comparison

| PostgreSQL | Convex | Notes |
|------------|--------|-------|
| `TEXT PRIMARY KEY` | `v.id("table")` | Auto-generated IDs |
| `TIMESTAMP` | `v.number()` | Unix timestamps (ms) |
| `JSONB` | `v.any()` or typed | Full JSON support |
| Foreign keys | `v.id("table")` | Type-safe references |
| Indexes | `.index()` | Explicit declarations |



---

## 6. Phase 3: Backend Migration

### 6.1 Migration Strategy

We'll use a **strangler fig pattern**: incrementally replace Express endpoints with Convex functions while keeping both systems running.

```
Week 1: Core queries (read-only) ──► Test with dashboard
Week 2: Mutations (writes) ──► Dual-write to both systems
Week 3: Real-time subscriptions ──► Replace WebSocket
Week 4: Actions (external calls) ──► Full cutover
```

### 6.2 Core Queries

Create `/opt/swarm-platform/convex/queries/tickets.ts`:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

// Get all tickets for a project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
  },
});

// Get available tickets (for agent claiming)
export const getAvailable = query({
  args: { tenantId: v.optional(v.string()) },
  handler: async (ctx, { tenantId }) => {
    let query = ctx.db
      .query("tickets")
      .withIndex("by_state", (q) => q.eq("state", "pending"));
    
    const tickets = await query.collect();
    
    // Filter by tenant if specified
    if (tenantId) {
      return tickets.filter(t => t.tenantId === tenantId);
    }
    return tickets;
  },
});

// Get ticket with full details
export const getById = query({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) return null;

    // Fetch related data
    const [project, parent, children] = await Promise.all([
      ticket.projectId ? ctx.db.get(ticket.projectId) : null,
      ticket.parentId ? ctx.db.get(ticket.parentId) : null,
      ctx.db
        .query("tickets")
        .withIndex("by_parent", (q) => q.eq("parentId", ticketId))
        .collect(),
    ]);

    return {
      ...ticket,
      project,
      parent,
      children,
    };
  },
});

// Get tickets assigned to a VM
export const getByVm = query({
  args: { vmId: v.string() },
  handler: async (ctx, { vmId }) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_vm", (q) => q.eq("vmId", vmId))
      .filter((q) => q.eq(q.field("state"), "in_progress"))
      .first();
  },
});

// Dashboard: Get ticket statistics
export const getStats = query({
  args: { tenantId: v.optional(v.string()) },
  handler: async (ctx, { tenantId }) => {
    const allTickets = await ctx.db.query("tickets").collect();
    
    const filtered = tenantId 
      ? allTickets.filter(t => t.tenantId === tenantId)
      : allTickets;

    const stats = {
      total: filtered.length,
      pending: filtered.filter(t => t.state === "pending").length,
      inProgress: filtered.filter(t => t.state === "in_progress").length,
      completed: filtered.filter(t => t.state === "completed").length,
      failed: filtered.filter(t => t.state === "failed").length,
      blocked: filtered.filter(t => t.state === "blocked").length,
    };

    return stats;
  },
});
```

### 6.3 Core Mutations

Create `/opt/swarm-platform/convex/mutations/tickets.ts`:

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Create a new ticket
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    parentId: v.optional(v.id("tickets")),
    priority: v.optional(v.number()),
    tenantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert("tickets", {
      ...args,
      state: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Claim a ticket (agent or human)
export const claim = mutation({
  args: {
    ticketId: v.id("tickets"),
    assigneeId: v.optional(v.id("users")),
    vmId: v.optional(v.string()),
    assigneeType: v.union(v.literal("human"), v.literal("agent")),
  },
  handler: async (ctx, { ticketId, assigneeId, vmId, assigneeType }) => {
    const ticket = await ctx.db.get(ticketId);
    
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    
    if (ticket.state !== "pending") {
      throw new Error(`Cannot claim ticket in state: ${ticket.state}`);
    }

    const now = Date.now();
    const leaseExpires = now + (30 * 60 * 1000); // 30 minute lease

    await ctx.db.patch(ticketId, {
      state: "claimed",
      assigneeId,
      vmId,
      assigneeType,
      leaseExpires,
      lastHeartbeat: now,
      startedAt: now,
      updatedAt: now,
    });

    return { success: true, leaseExpires };
  },
});

// Update ticket progress
export const updateProgress = mutation({
  args: {
    ticketId: v.id("tickets"),
    progressLog: v.optional(v.string()),
    state: v.optional(v.string()),
  },
  handler: async (ctx, { ticketId, progressLog, state }) => {
    const updates: any = {
      updatedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    if (progressLog) updates.progressLog = progressLog;
    if (state) updates.state = state;

    await ctx.db.patch(ticketId, updates);
  },
});

// Complete a ticket
export const complete = mutation({
  args: {
    ticketId: v.id("tickets"),
    result: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    outputs: v.optional(v.any()),
  },
  handler: async (ctx, { ticketId, result, prUrl, outputs }) => {
    const now = Date.now();

    await ctx.db.patch(ticketId, {
      state: "completed",
      result,
      prUrl,
      outputs,
      completedAt: now,
      updatedAt: now,
    });

    // Check if this unblocks any dependent tickets
    const blockedTickets = await ctx.db
      .query("tickets")
      .filter((q) => q.eq(q.field("state"), "blocked"))
      .collect();

    for (const blocked of blockedTickets) {
      if (blocked.dependsOn?.includes(ticketId)) {
        // Check if all dependencies are complete
        const deps = await Promise.all(
          blocked.dependsOn.map(id => ctx.db.get(id))
        );
        const allComplete = deps.every(d => d?.state === "completed");
        
        if (allComplete) {
          await ctx.db.patch(blocked._id, {
            state: "pending",
            updatedAt: now,
          });
        }
      }
    }
  },
});

// Fail a ticket
export const fail = mutation({
  args: {
    ticketId: v.id("tickets"),
    error: v.string(),
    retryable: v.optional(v.boolean()),
  },
  handler: async (ctx, { ticketId, error, retryable }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const rejectionCount = (ticket.rejectionCount || 0) + 1;
    const maxRetries = 3;

    if (retryable && rejectionCount < maxRetries) {
      // Reset for retry
      await ctx.db.patch(ticketId, {
        state: "pending",
        error,
        rejectionCount,
        assigneeId: undefined,
        vmId: undefined,
        leaseExpires: undefined,
        updatedAt: Date.now(),
      });
    } else {
      // Permanent failure
      await ctx.db.patch(ticketId, {
        state: "failed",
        error,
        rejectionCount,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Heartbeat (keep lease alive)
export const heartbeat = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const now = Date.now();
    const leaseExpires = now + (30 * 60 * 1000);

    await ctx.db.patch(ticketId, {
      lastHeartbeat: now,
      leaseExpires,
      updatedAt: now,
    });

    return { leaseExpires };
  },
});
```

### 6.4 Actions (External Calls)

Create `/opt/swarm-platform/convex/actions/vmActions.ts`:

```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// Spawn a VM for ticket execution
export const spawnVmForTicket = action({
  args: {
    ticketId: v.id("tickets"),
    vmNumber: v.number(),
  },
  handler: async (ctx, { ticketId, vmNumber }) => {
    // Get ticket details
    const ticket = await ctx.runQuery(api.queries.tickets.getById, { ticketId });
    if (!ticket) throw new Error("Ticket not found");

    // Call the VM spawn script
    const response = await fetch("http://localhost:8080/api/vms/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vmNumber, ticketId: ticket._id }),
    });

    if (!response.ok) {
      throw new Error(`VM spawn failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Register VM in Convex
    await ctx.runMutation(internal.mutations.vms.register, {
      vmId: vmNumber,
      namespace: `ns${vmNumber}`,
      ip: result.ip,
      pid: result.pid,
      assignedTicketId: ticketId,
    });

    // Update ticket with VM assignment
    await ctx.runMutation(api.mutations.tickets.claim, {
      ticketId,
      vmId: String(vmNumber),
      assigneeType: "agent",
    });

    return result;
  },
});

// Call Claude API for code generation
export const generateCode = action({
  args: {
    ticketId: v.id("tickets"),
    prompt: v.string(),
  },
  handler: async (ctx, { ticketId, prompt }) => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Log progress
    await ctx.runMutation(api.mutations.tickets.updateProgress, {
      ticketId,
      progressLog: `Code generated: ${result.content[0].text.substring(0, 100)}...`,
    });

    return result.content[0].text;
  },
});
```

### 6.5 HTTP Actions (Webhooks)

Create `/opt/swarm-platform/convex/http.ts`:

```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

const http = httpRouter();

// GitHub webhook handler
http.route({
  path: "/webhooks/github",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const payload = await request.json();

    // Verify signature (implement HMAC verification)
    // ...

    if (event === "pull_request") {
      if (payload.action === "closed" && payload.pull_request.merged) {
        // PR merged - mark ticket complete
        const prUrl = payload.pull_request.html_url;
        
        // Find ticket by PR URL
        const tickets = await ctx.runQuery(api.queries.tickets.getByPrUrl, { prUrl });
        if (tickets && tickets.length > 0) {
          await ctx.runMutation(api.mutations.tickets.complete, {
            ticketId: tickets[0]._id,
            result: "PR merged successfully",
            prUrl,
          });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Agent heartbeat endpoint
http.route({
  path: "/agent/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { ticketId, vmId, progress } = await request.json();

    await ctx.runMutation(api.mutations.tickets.heartbeat, {
      ticketId,
    });

    if (progress) {
      await ctx.runMutation(api.mutations.tickets.updateProgress, {
        ticketId,
        progressLog: progress,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// Agent claim ticket endpoint
http.route({
  path: "/agent/claim",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { vmId, tenantId } = await request.json();

    // Get available tickets
    const tickets = await ctx.runQuery(api.queries.tickets.getAvailable, {
      tenantId,
    });

    if (tickets.length === 0) {
      return new Response(JSON.stringify({ ticket: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Claim the highest priority ticket
    const sorted = [...tickets].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const ticket = sorted[0];

    try {
      await ctx.runMutation(api.mutations.tickets.claim, {
        ticketId: ticket._id,
        vmId: String(vmId),
        assigneeType: "agent",
      });

      return new Response(JSON.stringify({ ticket }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // Race condition - another agent claimed it
      return new Response(JSON.stringify({ ticket: null, error: "Already claimed" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
```



---

## 7. Phase 4: Frontend Migration

### 7.1 Convex Client Setup

Update `/opt/swarm-dashboard/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL || "https://convex.dev.swarmstack.net"
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
```

### 7.2 Auth Provider with Convex

Create `/opt/swarm-dashboard/src/providers/ConvexAuthProvider.tsx`:

```tsx
import { createContext, useContext, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface AuthContextType {
  user: any;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function ConvexAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("auth_token")
  );
  
  const loginMutation = useMutation(api.mutations.auth.login);
  const user = useQuery(api.queries.auth.getUser, token ? { token } : "skip");

  const login = async (email: string, password: string) => {
    try {
      const result = await loginMutation({ email, password });
      if (result.token) {
        localStorage.setItem("auth_token", result.token);
        setToken(result.token);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: user === undefined, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within ConvexAuthProvider");
  return context;
};
```

### 7.3 Real-time Dashboard Components

Replace WebSocket-based components with Convex subscriptions.

**Before (WebSocket):**
```tsx
// Old approach - manual WebSocket
useEffect(() => {
  const ws = new WebSocket(`${WS_URL}?token=${token}`);
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "ticket_update") {
      setTickets(prev => updateTicket(prev, data.ticket));
    }
  };
  return () => ws.close();
}, [token]);
```

**After (Convex):**
```tsx
// New approach - automatic subscriptions
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function TicketList({ projectId }: { projectId: string }) {
  // Automatically subscribes and updates in real-time!
  const tickets = useQuery(api.queries.tickets.getByProject, { 
    projectId: projectId as Id<"projects"> 
  });

  if (tickets === undefined) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {tickets.map(ticket => (
        <TicketCard key={ticket._id} ticket={ticket} />
      ))}
    </div>
  );
}
```

### 7.4 VM Monitoring Component

```tsx
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function VMMonitor() {
  // Real-time VM status - updates automatically
  const vms = useQuery(api.queries.vms.getAll);
  const stats = useQuery(api.queries.tickets.getStats);

  if (vms === undefined || stats === undefined) {
    return <LoadingSpinner />;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Stats Cards */}
      <StatCard title="Total Tickets" value={stats.total} />
      <StatCard title="In Progress" value={stats.inProgress} color="blue" />
      <StatCard title="Completed" value={stats.completed} color="green" />
      <StatCard title="Failed" value={stats.failed} color="red" />
      
      {/* VM Grid */}
      <div className="col-span-4 grid grid-cols-10 gap-2">
        {vms.map(vm => (
          <VMCard
            key={vm._id}
            vm={vm}
            className={
              vm.state === "running" ? "bg-green-100" :
              vm.state === "busy" ? "bg-blue-100" :
              vm.state === "error" ? "bg-red-100" :
              "bg-gray-100"
            }
          />
        ))}
      </div>
    </div>
  );
}
```

### 7.5 HITL Chat Component

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";

function HITLChat({ sessionId }: { sessionId: Id<"hitlSessions"> }) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Real-time messages - no polling needed!
  const messages = useQuery(api.queries.hitl.getMessages, { sessionId });
  const session = useQuery(api.queries.hitl.getSession, { sessionId });
  const sendMessage = useMutation(api.mutations.hitl.sendMessage);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    await sendMessage({
      sessionId,
      role: "user",
      content: input,
    });
    
    setInput("");
  };

  if (messages === undefined || session === undefined) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <ChatMessage
            key={msg._id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.createdAt}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your message..."
            className="flex-1 rounded-lg border px-4 py-2"
          />
          <button
            onClick={handleSend}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### 7.6 Environment Variables

Update `.env` files:

```bash
# .env.local (development)
VITE_CONVEX_URL=http://localhost:3210

# .env.production
VITE_CONVEX_URL=https://convex.dev.swarmstack.net
```

---

## 8. Phase 5: Testing & Validation

### 8.1 Unit Tests for Convex Functions

Create `/opt/swarm-platform/convex/tests/tickets.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("tickets", () => {
  test("create ticket", async () => {
    const t = convexTest(schema);
    
    const ticketId = await t.mutation(api.mutations.tickets.create, {
      title: "Test Ticket",
      description: "Test description",
      priority: 1,
    });

    const ticket = await t.query(api.queries.tickets.getById, { ticketId });
    
    expect(ticket).toBeDefined();
    expect(ticket?.title).toBe("Test Ticket");
    expect(ticket?.state).toBe("draft");
  });

  test("claim ticket - success", async () => {
    const t = convexTest(schema);
    
    // Create a pending ticket
    const ticketId = await t.mutation(api.mutations.tickets.create, {
      title: "Test Ticket",
    });
    await t.mutation(api.mutations.tickets.setState, {
      ticketId,
      state: "pending",
    });

    // Claim it
    const result = await t.mutation(api.mutations.tickets.claim, {
      ticketId,
      vmId: "vm-1",
      assigneeType: "agent",
    });

    expect(result.success).toBe(true);
    
    const ticket = await t.query(api.queries.tickets.getById, { ticketId });
    expect(ticket?.state).toBe("claimed");
    expect(ticket?.vmId).toBe("vm-1");
  });

  test("claim ticket - already claimed", async () => {
    const t = convexTest(schema);
    
    const ticketId = await t.mutation(api.mutations.tickets.create, {
      title: "Test Ticket",
    });
    
    // First claim succeeds
    await t.mutation(api.mutations.tickets.setState, {
      ticketId,
      state: "pending",
    });
    await t.mutation(api.mutations.tickets.claim, {
      ticketId,
      vmId: "vm-1",
      assigneeType: "agent",
    });

    // Second claim should fail
    await expect(
      t.mutation(api.mutations.tickets.claim, {
        ticketId,
        vmId: "vm-2",
        assigneeType: "agent",
      })
    ).rejects.toThrow("Cannot claim ticket in state: claimed");
  });
});
```

### 8.2 Integration Tests

Create `/opt/swarm-platform/convex/tests/integration.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("ticket workflow", () => {
  test("full ticket lifecycle", async () => {
    const t = convexTest(schema);

    // 1. Create project
    const projectId = await t.mutation(api.mutations.projects.create, {
      name: "Test Project",
      repoUrl: "https://github.com/test/repo",
    });

    // 2. Create ticket
    const ticketId = await t.mutation(api.mutations.tickets.create, {
      title: "Implement feature X",
      projectId,
      priority: 2,
    });

    // 3. Set to pending
    await t.mutation(api.mutations.tickets.setState, {
      ticketId,
      state: "pending",
    });

    // 4. Claim ticket
    await t.mutation(api.mutations.tickets.claim, {
      ticketId,
      vmId: "vm-0",
      assigneeType: "agent",
    });

    // 5. Update progress
    await t.mutation(api.mutations.tickets.updateProgress, {
      ticketId,
      state: "in_progress",
      progressLog: "Started code generation...",
    });

    // 6. Complete ticket
    await t.mutation(api.mutations.tickets.complete, {
      ticketId,
      result: "Feature implemented successfully",
      prUrl: "https://github.com/test/repo/pull/1",
    });

    // Verify final state
    const ticket = await t.query(api.queries.tickets.getById, { ticketId });
    expect(ticket?.state).toBe("completed");
    expect(ticket?.prUrl).toBe("https://github.com/test/repo/pull/1");
  });

  test("dependency blocking", async () => {
    const t = convexTest(schema);

    // Create parent ticket
    const parentId = await t.mutation(api.mutations.tickets.create, {
      title: "Parent Task",
    });

    // Create child that depends on parent
    const childId = await t.mutation(api.mutations.tickets.create, {
      title: "Child Task",
      dependsOn: [parentId],
    });

    // Set both to pending
    await t.mutation(api.mutations.tickets.setState, { ticketId: parentId, state: "pending" });
    await t.mutation(api.mutations.tickets.setState, { ticketId: childId, state: "blocked" });

    // Complete parent
    await t.mutation(api.mutations.tickets.claim, {
      ticketId: parentId,
      vmId: "vm-0",
      assigneeType: "agent",
    });
    await t.mutation(api.mutations.tickets.complete, {
      ticketId: parentId,
      result: "Done",
    });

    // Child should be unblocked
    const child = await t.query(api.queries.tickets.getById, { ticketId: childId });
    expect(child?.state).toBe("pending");
  });
});
```

### 8.3 Load Testing Script

Create `/opt/swarm-platform/scripts/convex-load-test.ts`:

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

const client = new ConvexHttpClient(process.env.CONVEX_URL!);

async function runLoadTest() {
  console.log("Starting load test...");
  
  const startTime = Date.now();
  const results = {
    creates: 0,
    claims: 0,
    errors: 0,
  };

  // Create 100 tickets
  const ticketIds = [];
  for (let i = 0; i < 100; i++) {
    try {
      const id = await client.mutation(api.mutations.tickets.create, {
        title: `Load Test Ticket ${i}`,
        priority: Math.floor(Math.random() * 5),
      });
      ticketIds.push(id);
      results.creates++;
    } catch (e) {
      results.errors++;
    }
  }

  // Set all to pending
  for (const id of ticketIds) {
    await client.mutation(api.mutations.tickets.setState, {
      ticketId: id,
      state: "pending",
    });
  }

  // Simulate 10 VMs claiming tickets concurrently
  const claimPromises = [];
  for (let vm = 0; vm < 10; vm++) {
    for (let claim = 0; claim < 10; claim++) {
      claimPromises.push(
        client.mutation(api.mutations.tickets.claimNext, {
          vmId: `vm-${vm}`,
          assigneeType: "agent",
        }).then(() => { results.claims++; })
          .catch(() => { /* Already claimed - expected */ })
      );
    }
  }

  await Promise.all(claimPromises);

  const duration = Date.now() - startTime;
  
  console.log(`
Load Test Results:
==================
Duration: ${duration}ms
Tickets created: ${results.creates}
Successful claims: ${results.claims}
Errors: ${results.errors}
Throughput: ${(results.creates / (duration / 1000)).toFixed(2)} creates/sec
  `);
}

runLoadTest().catch(console.error);
```

  default:
    name: convex-network
EOF

echo "Docker Compose file created"

# Step 4: Pull Docker images
echo "[STEP 4/8] Pulling Docker images..."
cd $CONVEX_DIR
docker compose pull
echo "Images pulled"

# Step 5: Start Convex services
echo "[STEP 5/8] Starting Convex services..."
docker compose up -d
echo "Waiting for services to be healthy..."
sleep 15

# Step 6: Generate admin key
echo "[STEP 6/8] Generating admin key..."
ADMIN_KEY=$(docker compose exec -T backend ./generate_admin_key.sh 2>/dev/null | tail -1)
echo "ADMIN_KEY=$ADMIN_KEY" >> $CONVEX_DIR/.env
echo "Admin key: $ADMIN_KEY"

# Step 7: Install Convex CLI and dependencies
echo "[STEP 7/8] Installing Convex dependencies..."
cd $PLATFORM_DIR
npm install convex@latest
echo "Convex CLI installed"

# Step 8: Configure environment
echo "[STEP 8/8] Configuring environment variables..."
cat >> $PLATFORM_DIR/.env << EOF

# Convex Configuration
CONVEX_SELF_HOSTED_URL=http://localhost:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=$ADMIN_KEY
EOF

echo ""
echo "============================================"
echo "  Convex Installation Complete!"
echo "============================================"
echo ""
echo "Services:"
echo "  - Convex API:       http://localhost:3210"
echo "  - Convex HTTP:      http://localhost:3211"
echo "  - Convex Dashboard: http://localhost:6791"
echo ""
echo "Admin Key: $ADMIN_KEY"
echo "(Saved to $CONVEX_DIR/.env)"
echo ""
echo "Next Steps:"
echo "  1. Deploy schema: cd $PLATFORM_DIR && npx convex dev"
echo "  2. Run data migration: npx ts-node scripts/migrate-to-convex.ts"
echo "  3. Update dashboard: Update VITE_CONVEX_URL in .env"
echo ""
```

### 10.2 Health Check Script

Create `/opt/convex/health-check.sh`:

```bash
#!/bin/bash

echo "=== Convex Health Check ==="

# Check Docker containers
echo -n "Backend container: "
docker inspect -f '{{.State.Status}}' convex-backend 2>/dev/null || echo "NOT FOUND"

echo -n "Dashboard container: "
docker inspect -f '{{.State.Status}}' convex-dashboard 2>/dev/null || echo "NOT FOUND"

# Check API endpoint
echo -n "API endpoint: "
curl -sf http://localhost:3210/version && echo " OK" || echo "FAIL"

# Check PostgreSQL connection
echo -n "PostgreSQL: "
docker compose exec -T backend ./health_check.sh 2>/dev/null && echo "OK" || echo "FAIL"

# Check disk usage
echo ""
echo "Disk Usage:"
df -h /mnt/volume_sfo3_01 | tail -1 | awk '{print "  Volume: "$3" used / "$2" total ("$5")"}'
du -sh /mnt/volume_sfo3_01/convex/* 2>/dev/null | sed 's/^/  /'

# Check memory
echo ""
echo "Container Memory:"
docker stats --no-stream --format "  {{.Name}}: {{.MemUsage}}" convex-backend convex-dashboard 2>/dev/null
```

### 10.3 Backup Script

Create `/opt/convex/backup.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/mnt/swarm_volume_dev_db_backup/convex"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "=== Convex Backup: $TIMESTAMP ==="

# 1. PostgreSQL backup (Convex data is in PostgreSQL)
echo "[1/3] Backing up PostgreSQL..."
pg_dump -h localhost -U swarm -d swarmdb > $BACKUP_DIR/swarmdb_${TIMESTAMP}.sql
gzip $BACKUP_DIR/swarmdb_${TIMESTAMP}.sql
echo "  Saved: swarmdb_${TIMESTAMP}.sql.gz"

# 2. Convex local storage (files, blobs)
echo "[2/3] Backing up Convex storage..."
tar -czf $BACKUP_DIR/convex_storage_${TIMESTAMP}.tar.gz -C /mnt/volume_sfo3_01/convex storage
echo "  Saved: convex_storage_${TIMESTAMP}.tar.gz"

# 3. Configuration backup
echo "[3/3] Backing up configuration..."
tar -czf $BACKUP_DIR/convex_config_${TIMESTAMP}.tar.gz -C /opt convex/docker-compose.yml convex/.env
echo "  Saved: convex_config_${TIMESTAMP}.tar.gz"

# Cleanup old backups (keep last 7 days)
echo ""
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

echo ""
echo "=== Backup Complete ==="
ls -lh $BACKUP_DIR/*${TIMESTAMP}*
```

### 10.4 Systemd Service (Optional)

Create `/etc/systemd/system/convex.service`:

```ini
[Unit]
Description=Convex Backend Service
Requires=docker.service postgresql.service
After=docker.service postgresql.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/convex
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable with:
```bash
systemctl daemon-reload
systemctl enable convex.service
```

---

## 11. Risk Assessment

### 11.1 Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Data loss during migration | Low | Critical | Full PostgreSQL backup before migration, incremental sync |
| Real-time subscriptions fail | Medium | High | Keep Express WebSocket as fallback for 2 weeks |
| Performance regression | Medium | Medium | Load test before cutover, monitor latency |
| Convex container crashes | Low | High | Docker restart policy, health checks, alerts |
| PostgreSQL connection issues | Low | Critical | Same-host deployment minimizes network issues |
| Schema incompatibilities | Medium | Medium | Comprehensive test suite, staged rollout |
| Frontend breaking changes | Medium | Medium | Feature flags, gradual migration |

### 11.2 Mitigation Strategies

**Data Protection:**
- Automated hourly backups during migration week
- Point-in-time recovery capability via PostgreSQL
- Export/import validation scripts

**Service Continuity:**
- Blue-green deployment with instant rollback
- Maintenance windows during low-traffic periods
- Health check endpoints with automatic alerting

**Performance:**
- Baseline metrics before migration
- Load testing with production-like data
- Query performance monitoring

---

## 12. Timeline

### 12.1 Detailed Schedule

```
┌────────────────────────────────────────────────────────────────┐
│                    CONVEX MIGRATION TIMELINE                    │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  WEEK 1: Infrastructure & Schema                                │
│  ├─ Day 1-2: Install Convex on DEV droplet                     │
│  ├─ Day 3-4: Create schema.ts, deploy to Convex                │
│  └─ Day 5:   Verify PostgreSQL integration                     │
│                                                                 │
│  WEEK 2: Backend Migration                                      │
│  ├─ Day 1-2: Migrate queries (read operations)                 │
│  ├─ Day 3-4: Migrate mutations (write operations)              │
│  └─ Day 5:   Migrate actions (VM spawn, Claude API)            │
│                                                                 │
│  WEEK 3: Frontend & Testing                                     │
│  ├─ Day 1-2: Update dashboard with Convex hooks                │
│  ├─ Day 3:   Replace WebSocket with subscriptions              │
│  ├─ Day 4:   Integration testing                               │
│  └─ Day 5:   Load testing, performance validation              │
│                                                                 │
│  WEEK 4: Cutover & Stabilization                                │
│  ├─ Day 1:   Final data sync, pre-cutover checks               │
│  ├─ Day 2:   CUTOVER (off-peak hours)                          │
│  ├─ Day 3-4: Monitor, fix issues                               │
│  └─ Day 5:   Decommission Express (keep for 2 weeks backup)    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 12.2 Go/No-Go Criteria

**Go Criteria (all must be true):**
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Load test shows <100ms p95 latency
- [ ] Data migration 100% complete
- [ ] Rollback tested and working
- [ ] Team trained on Convex dashboard
- [ ] Monitoring/alerting configured

**No-Go Triggers:**
- Any critical data discrepancy
- p95 latency >500ms
- Error rate >1%
- Rollback test fails

---

## Appendix A: File Structure After Migration

```
/opt/
├── convex/                         # Convex installation
│   ├── docker-compose.yml
│   ├── .env                        # Instance secret, admin key
│   ├── health-check.sh
│   └── backup.sh
│
├── swarm-platform/
│   ├── convex/                     # Convex functions
│   │   ├── schema.ts               # Database schema
│   │   ├── _generated/             # Auto-generated types
│   │   ├── queries/
│   │   │   ├── tickets.ts
│   │   │   ├── projects.ts
│   │   │   ├── users.ts
│   │   │   ├── vms.ts
│   │   │   └── hitl.ts
│   │   ├── mutations/
│   │   │   ├── tickets.ts
│   │   │   ├── projects.ts
│   │   │   ├── auth.ts
│   │   │   └── hitl.ts
│   │   ├── actions/
│   │   │   ├── vmActions.ts
│   │   │   └── claudeActions.ts
│   │   ├── http.ts                 # HTTP endpoints
│   │   └── crons.ts                # Scheduled jobs
│   │
│   ├── scripts/
│   │   ├── migrate-to-convex.ts
│   │   └── convex-load-test.ts
│   │
│   └── [legacy Express files]      # Keep for rollback
│
├── swarm-dashboard/
│   ├── src/
│   │   ├── providers/
│   │   │   └── ConvexAuthProvider.tsx
│   │   └── [updated components]
│   └── convex/                     # Symlink to ../swarm-platform/convex
│
└── /mnt/volume_sfo3_01/convex/     # Convex data (mounted volume)
    ├── data/
    ├── storage/
    └── logs/
```

---

## Appendix B: Quick Reference Commands

```bash
# Start Convex
cd /opt/convex && docker compose up -d

# Stop Convex
cd /opt/convex && docker compose down

# View logs
docker logs -f convex-backend
docker logs -f convex-dashboard

# Deploy schema changes
cd /opt/swarm-platform && npx convex dev

# Run migrations
cd /opt/swarm-platform && npx ts-node scripts/migrate-to-convex.ts

# Health check
/opt/convex/health-check.sh

# Backup
/opt/convex/backup.sh

# Get admin key
cat /opt/convex/.env | grep ADMIN_KEY

# Access dashboard
open http://localhost:6791
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-17 | Neural | Initial deep dive migration plan |

---

*End of Document*
