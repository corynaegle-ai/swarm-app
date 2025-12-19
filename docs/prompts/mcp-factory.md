# MCP Factory - Build Prompt

## Overview

Build an **MCP Factory** system that generates fully-functional Model Context Protocol (MCP) servers from natural language specifications. The factory takes a description of desired tools/resources and outputs a complete, deployable MCP server package.

## What is MCP?

Model Context Protocol is Anthropic's open standard for connecting AI assistants to external data sources and tools. An MCP server exposes:
- **Tools**: Functions the AI can invoke (e.g., `search_files`, `create_task`)
- **Resources**: Data the AI can read (e.g., file contents, database records)
- **Prompts**: Reusable prompt templates

Reference: https://modelcontextprotocol.io/

## Goals

1. **Specification → Server**: Convert natural language or structured specs into working MCP servers
2. **Multi-Runtime**: Generate servers for Node.js (TypeScript) and Python (FastMCP)
3. **Production-Ready**: Include error handling, validation, logging, tests
4. **Swarm Integration**: Register generated servers in Swarm agent registry

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Factory                          │
├─────────────────────────────────────────────────────────┤
│  1. PARSER                                              │
│     • Natural language → structured spec                │
│     • Extract tools, resources, auth requirements       │
│                                                         │
│  2. GENERATOR                                           │
│     • Template-based code generation                    │
│     • TypeScript or Python output                       │
│     • Schema validation (Zod/Pydantic)                  │
│                                                         │
│  3. VALIDATOR                                           │
│     • Static analysis (ESLint/Ruff)                     │
│     • Type checking (tsc/mypy)                          │
│     • MCP protocol compliance check                     │
│                                                         │
│  4. PACKAGER                                            │
│     • npm/pip package structure                         │
│     • Docker container option                           │
│     • Claude Desktop config snippet                     │
│                                                         │
│  5. REGISTRY                                            │
│     • Store in Swarm agent registry                     │
│     • Version tracking                                  │
│     • Discovery API                                     │
└─────────────────────────────────────────────────────────┘
```

## Input Specification Format

```yaml
name: "github-issues"
description: "Manage GitHub issues and pull requests"
version: "1.0.0"
runtime: "typescript"  # or "python"

auth:
  type: "bearer"
  env_var: "GITHUB_TOKEN"

tools:
  - name: "list_issues"
    description: "List issues for a repository"
    parameters:
      - name: "owner"
        type: "string"
        required: true
      - name: "repo"
        type: "string"
        required: true
      - name: "state"
        type: "string"
        enum: ["open", "closed", "all"]
        default: "open"
    returns: "Array of issue objects"
    
  - name: "create_issue"
    description: "Create a new issue"
    parameters:
      - name: "owner"
        type: "string"
        required: true
      - name: "repo"
        type: "string"
        required: true
      - name: "title"
        type: "string"
        required: true
      - name: "body"
        type: "string"

resources:
  - name: "repo_readme"
    uri_template: "github://{owner}/{repo}/readme"
    description: "Repository README content"
    mime_type: "text/markdown"
```

## Output Structure (TypeScript)

```
mcp-github-issues/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── tools/
│   │   ├── list_issues.ts
│   │   └── create_issue.ts
│   ├── resources/
│   │   └── repo_readme.ts
│   ├── schemas.ts        # Zod schemas
│   └── client.ts         # API client wrapper
├── tests/
│   └── tools.test.ts
├── Dockerfile
└── README.md
```

## Output Structure (Python)

```
mcp_github_issues/
├── pyproject.toml
├── src/
│   └── mcp_github_issues/
│       ├── __init__.py
│       ├── server.py     # FastMCP server
│       ├── tools.py
│       ├── resources.py
│       └── schemas.py    # Pydantic models
├── tests/
│   └── test_tools.py
├── Dockerfile
└── README.md
```

## Key Implementation Details

### 1. Parser Phase
- Use Claude to extract structured spec from natural language
- Validate against JSON schema
- Infer missing fields (auth type from API patterns, etc.)

### 2. Generator Phase
Templates needed:
- `index.ts` / `server.py` - Server bootstrap
- `tool.ts` / `tool.py` - Individual tool template
- `resource.ts` / `resource.py` - Resource handler template
- `schemas.ts` / `schemas.py` - Type definitions
- `package.json` / `pyproject.toml` - Package manifest
- `Dockerfile` - Container build
- `README.md` - Documentation

### 3. Validator Phase
```bash
# TypeScript
npx tsc --noEmit
npx eslint src/

# Python
ruff check src/
mypy src/

# Protocol compliance
mcp-validator ./dist/index.js  # Custom tool
```

### 4. Packager Phase
- Generate Claude Desktop config:
```json
{
  "mcpServers": {
    "github-issues": {
      "command": "node",
      "args": ["/path/to/mcp-github-issues/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 5. Registry Integration
Store in `/opt/swarm-registry/registry.db`:
```sql
INSERT INTO agents (id, name, type, config, created_at)
VALUES (?, ?, 'mcp_server', ?, datetime('now'));
```

## API Endpoints

```
POST /api/mcp-factory/generate
  Body: { spec: "...", runtime: "typescript" | "python" }
  Returns: { job_id, status }

GET /api/mcp-factory/jobs/:id
  Returns: { status, output_url, errors }

GET /api/mcp-factory/templates
  Returns: List of available base templates

POST /api/mcp-factory/validate
  Body: { spec: "..." }
  Returns: { valid, errors, suggestions }
```

## Integration Points

| System | Integration |
|--------|-------------|
| Swarm Platform | Job tracking, tenant isolation |
| Swarm Verifier | Validate generated code before packaging |
| Agent Registry | Store MCP server definitions |
| GitHub | Push generated packages to repos |

## Success Criteria

1. Generate working MCP server from 3-sentence description
2. < 30 seconds generation time for simple servers
3. Generated servers pass MCP protocol tests
4. Works with Claude Desktop out of the box
5. Support at least 10 common API patterns (REST, GraphQL, DB, file system)

## Phase 1 Scope (MVP)

- [ ] TypeScript generation only
- [ ] REST API tools (GET, POST, PUT, DELETE)
- [ ] Bearer token auth
- [ ] Basic resource handlers
- [ ] npm package output
- [ ] Claude Desktop config generation

## Phase 2 Scope

- [ ] Python/FastMCP support
- [ ] OAuth2 authentication
- [ ] WebSocket resources
- [ ] Docker packaging
- [ ] Swarm registry integration
- [ ] Marketplace publishing

## Example Usage

**Input:**
```
Create an MCP server for Notion. It should be able to:
- Search pages by title
- Read page content
- Create new pages
- Update existing pages
Use the Notion API with bearer token auth.
```

**Output:**
Complete `mcp-notion/` package with all tools implemented, ready to install.

---

## Files to Create

| Path | Purpose |
|------|---------|
| `/opt/mcp-factory/` | Service root |
| `/opt/mcp-factory/src/parser.js` | Spec extraction |
| `/opt/mcp-factory/src/generator.js` | Code generation |
| `/opt/mcp-factory/src/validator.js` | Code validation |
| `/opt/mcp-factory/src/packager.js` | Package assembly |
| `/opt/mcp-factory/templates/` | Code templates |
| `/opt/mcp-factory/output/` | Generated packages |

## Reference Resources

- MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- FastMCP: https://github.com/jlowin/fastmcp
- MCP Examples: https://github.com/modelcontextprotocol/servers
