# MCP Factory Design Document

**Status**: 📋 DESIGN COMPLETE | **Created**: 2025-12-10 | **Version**: 1.0  
**Source**: Notion (migrated 2025-12-11)

---

## Executive Summary

The MCP Factory is a system for generating Model Context Protocol (MCP) servers from specifications. It extends Swarm's "Agent Factory" vision by enabling rapid creation of tooling infrastructure — not just agents, but the tools agents use.

> **Core Value Proposition**: Generate production-ready MCP servers in minutes instead of days. From natural language description to deployed service.

**Key Capabilities**:
- Accept specifications via YAML, JSON, or natural language
- Generate complete MCP server code with tool definitions
- Support multiple deployment targets: Local, Docker, MicroVM
- Provide trigger system for webhooks, cron, file watchers
- Maintain registry for discovery and management

---

## Strategic Context

```
┌─────────────────────────────────────────────────────────────────┐
│                    SWARM ECOSYSTEM                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Agent Factory          MCP Factory           Runtime          │
│   ─────────────          ───────────           ───────          │
│   Builds AGENTS    +     Builds TOOLS    →     Runs ALL         │
│   (Claude-powered)       (MCP servers)         (Firecracker)    │
│                                                                 │
│   Together: End-to-end AI system manufacturing                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why MCP Factory?**

Every agent needs tools. Currently, building MCP servers requires:
- Understanding the MCP protocol
- Writing boilerplate server code
- Implementing tool handlers
- Setting up deployment infrastructure
- Managing auth, triggers, and lifecycle

MCP Factory automates all of this, enabling:
- Agents to request their own tools (self-extending)
- Rapid prototyping of tool integrations
- Standardized, tested MCP server output
- Multi-target deployment flexibility

---

## Architecture Overview

### Hybrid Integration Approach

MCP Factory is implemented as a **well-isolated module** within the existing Swarm API, with clean interfaces enabling future extraction if needed.

| Benefit | Description |
|---------|-------------|
| Single API surface | Users learn one endpoint |
| Shared auth | Reuse existing Bearer token system |
| Code separation | MCP factory in own directory with clean interfaces |
| Easy extraction | Module becomes service when/if needed |
| Ticket integration | Complex generation can spawn tickets naturally |

---

## System Components

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         MCP FACTORY SYSTEM                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐         │
│  │   INTAKE    │───▶│   GENERATOR     │───▶│    RUNTIME       │         │
│  │             │    │                 │    │                  │         │
│  │ • NL Prompt │    │ • Schema Parser │    │ • Local Runner   │         │
│  │ • YAML Spec │    │ • Code Gen      │    │ • Docker Builder │         │
│  │ • JSON Spec │    │ • Test Gen      │    │ • VM Deployer    │         │
│  │ • Template  │    │ • Doc Gen       │    │ • Health Checks  │         │
│  └─────────────┘    └─────────────────┘    └──────────────────┘         │
│         │                   │                       │                    │
│         ▼                   ▼                       ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                    REGISTRY & DISCOVERY                      │        │
│  │  • MCP Server catalog    • Version management                │        │
│  │  • Capability index      • Dependency tracking               │        │
│  │  • Auth policies         • Usage metrics                     │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────┐        │
│  │                    TRIGGER SYSTEM                            │        │
│  │  • Webhooks (HTTP endpoints)    • Cron (scheduled jobs)      │        │
│  │  • File watchers (chokidar)     • Queue consumers            │        │
│  │  • Startup hooks                • Database listeners         │        │
│  └─────────────────────────────────────────────────────────────┘        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## User Interaction Patterns

### Pattern 1: Natural Language Specification

```
User: "Create an MCP server that:
       - Connects to our PostgreSQL inventory database
       - Has tools for: search_products, get_stock_level, update_inventory
       - Requires API key authentication
       - Returns results paginated at 50 items"

MCP Factory generates:
       - Complete MCP server with tool definitions
       - Database connection pool
       - Auth middleware
       - Pagination logic
       - Test suite
       - Deployment configs
```

### Pattern 2: YAML Specification

```yaml
name: inventory-mcp
version: 1.0.0
transport: stdio

auth:
  type: api_key
  header: X-API-Key
  
connections:
  - name: inventory_db
    type: postgresql
    envVar: DATABASE_URL

tools:
  - name: search_products
    description: Search products by name, SKU, or category
    parameters:
      query:
        type: string
        required: true
      category:
        type: string
        enum: [electronics, clothing, food]
      limit:
        type: integer
        default: 50
    returns:
      type: array
      items:
        type: object
        properties:
          id: { type: string }
          name: { type: string }
          price: { type: number }
    connection: inventory_db

triggers:
  - type: cron
    schedule: "0 */6 * * *"
    tool: sync_catalog
    
  - type: webhook
    path: /inventory-update
    tool: refresh_cache
```

### Pattern 3: Template + Customization

```
┌────────────────────────────────────────────────────────┐
│  MCP SERVER TEMPLATES                                  │
├────────────────────────────────────────────────────────┤
│  [Database Connector]  - PostgreSQL, MySQL, MongoDB    │
│  [API Wrapper]         - REST, GraphQL, gRPC           │
│  [File System]         - Local, S3, GCS                │
│  [Communication]       - Slack, Email, SMS             │
│  [DevOps]              - GitHub, Jira, CI/CD           │
│  [AI/ML]               - Embeddings, Vector DB         │
│  [Custom]              - Start from scratch            │
└────────────────────────────────────────────────────────┘
```

---

## Deployment Targets

| Target | Use Case | Isolation | Scaling | Complexity |
|--------|----------|-----------|---------|------------|
| **Local** | Development, testing, personal tools | None (same process) | Manual | Low |
| **Docker** | Team sharing, CI/CD, portable deployment | Container | Docker Compose/Swarm | Medium |
| **MicroVM** | Production, multi-tenant, high isolation | Full VM | Firecracker pool | High |

### Target Commands

```bash
# Local Development
mcp-deploy inventory-mcp --target local
# → Runs: node /opt/mcp-servers/inventory-mcp/src/index.js
# → Claude connects via stdio transport

# Docker Container
mcp-deploy inventory-mcp --target docker
# → Builds: docker build -t swarm-mcp/inventory-mcp:1.0.0 .
# → HTTP transport on container network

# Firecracker MicroVM
mcp-deploy inventory-mcp --target microvm --pool production
# → Restores Firecracker snapshot
# → Full process isolation, dedicated resources
```

---

## Trigger System

| Trigger | Use Case | Implementation |
|---------|----------|----------------|
| **Webhook** | External system notifications | Express/Fastify HTTP endpoint |
| **Cron** | Scheduled tasks | node-cron or systemd timers |
| **File System** | File changes, uploads | chokidar watcher |
| **Queue** | Async job processing | Redis, RabbitMQ, SQS consumers |
| **Database** | Row changes, events | PostgreSQL LISTEN/NOTIFY, Mongo change streams |
| **Startup** | Initialization | Runs once on server boot |

---

## API Specification

### Endpoints

```
POST   /mcp/create              Create MCP server from spec
POST   /mcp/create/natural      Create from natural language
POST   /mcp/deploy/:name        Deploy server to target
GET    /mcp/servers             List all servers
GET    /mcp/servers/:name       Get server details
DELETE /mcp/servers/:name       Remove server
POST   /mcp/servers/:name/stop  Stop running server
POST   /mcp/servers/:name/start Start stopped server
GET    /mcp/servers/:name/logs  Get server logs
GET    /mcp/templates           List available templates
```

---

## CLI Interface

```bash
# Create from different sources
mcp-create --spec ./inventory-mcp.yaml
mcp-create --json '{"name": "test", "tools": [...]}'
mcp-create --prompt "A server that queries our product database"
mcp-create --template database --name inventory-mcp

# Deploy to targets
mcp-deploy inventory-mcp --target local
mcp-deploy inventory-mcp --target docker --port 3001
mcp-deploy inventory-mcp --target microvm --pool production

# Management commands
mcp-list                           # List all servers
mcp-status inventory-mcp           # Health check + details
mcp-logs inventory-mcp             # View logs
mcp-stop inventory-mcp             # Stop server
mcp-start inventory-mcp            # Start stopped server
mcp-remove inventory-mcp           # Delete server

# Testing
mcp-test inventory-mcp search_products '{"query": "laptop"}'
mcp-test inventory-mcp --all       # Run all tool tests
```

---

## Directory Structure

```
/opt/swarm/mcp-factory/
├── index.js                 # Main module export
├── lib/
│   ├── spec-parser.js       # YAML/JSON/NL parsing & validation
│   ├── generator.js         # Code generation engine
│   ├── triggers.js          # Trigger system handlers
│   ├── runtime.js           # Deployment management
│   ├── registry.js          # Server catalog & discovery
│   └── claude-extractor.js  # NL → structured spec via Claude
├── templates/
│   ├── base/                # Core server template files
│   ├── database/            # DB connector templates
│   ├── api/                 # API wrapper templates
│   └── devops/              # DevOps tool templates
├── schema/
│   └── mcp-spec.schema.json # JSON Schema for validation
└── prompts/
    └── nl-extraction.md     # Prompt for NL → spec
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- Spec Parser: YAML/JSON parsing, validation
- NL Extraction: Claude-based spec extraction
- Basic Generator: Tool definitions, server scaffold
- Local Runtime: npx runner, hot reload
- CLI Foundation: mcp-create, mcp-deploy local

### Phase 2: Production Features (Week 3-4)
- Docker Target: Dockerfile gen, build, run
- MicroVM Target: Firecracker deployment
- Registry: SQLite catalog, discovery API
- Trigger System: Webhooks, cron, file watchers
- API Integration: Mount on api.swarmstack.net/mcp/*

### Phase 3: Templates & Polish (Week 5-6)
- Template Library: Database, API, DevOps templates
- Auth Layer: API key, OAuth2 support
- Test Generation: Auto-generate test suites
- Documentation: README gen, API docs
- Metrics & Logging: Tool invocation tracking

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Secrets in generated code | Never bake secrets; use envVar references |
| Malicious tool code | Sandbox execution in microVM isolation |
| API abuse | Rate limiting on /mcp/* endpoints |
| Unauthorized access | Bearer token auth on all endpoints |
| Code injection in NL | Validate generated spec against schema |
| Resource exhaustion | Limits on server count per user |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to generate simple MCP server | < 30 seconds |
| Time to deploy to Docker | < 2 minutes |
| Time to deploy to microVM | < 1 minute |
| Spec validation accuracy | > 95% |
| NL → spec extraction quality | > 80% usable |
| Generated server test pass rate | > 90% |

---

*Migrated to git: December 11, 2025*
