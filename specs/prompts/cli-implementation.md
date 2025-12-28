# Swarm CLI Implementation Prompt

> **📁 MOVED TO GIT:** This document is now maintained in git at `/prompts/cli-implementation.md`
> Original Notion URL: https://www.notion.so/2c5c56ed45a7810aa988fb57d2769e3b

**Purpose:** Complete implementation guide for building `swarm-agent` and `swarm-workflow` CLI commands.  
**Estimated Time:** 2-3 focused sessions (15-20 min each)  
**Prerequisites:** Templates exist in `/opt/swarm-agents/_templates/` and `/opt/swarm-workflows/_templates/`

---

## Overview

Build two CLI tools that manage the agent and workflow lifecycle:

| CLI | Purpose | Location |
|-----|---------|----------|
| `swarm-agent` | Register, list, inspect, delete agents | `/opt/swarm-engine/cli/swarm-agent.js` |
| `swarm-workflow` | Register, list, inspect, enable/disable workflows | `/opt/swarm-engine/cli/swarm-workflow.js` |

Both CLIs interact with the same SQLite registry at `/opt/swarm-registry/registry.db`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Layer                                │
│  swarm-agent          swarm-workflow                        │
│  ├── list             ├── list                              │
│  ├── info             ├── info                              │
│  ├── register         ├── register                          │
│  ├── create           ├── create                            │
│  ├── delete           ├── delete                            │
│  └── templates        ├── enable/disable                    │
│                       ├── runs                              │
│                       └── templates                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Registry Layer                            │
│  /opt/swarm-registry/registry.db                            │
│  ├── agents table                                           │
│  ├── workflows table                                        │
│  ├── workflow_runs table                                    │
│  ├── step_executions table                                  │
│  └── triggers table                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Package Layer                             │
│  /opt/swarm-agents/           /opt/swarm-workflows/         │
│  ├── _templates/              ├── _templates/               │
│  │   ├── basic-agent/         │   ├── linear-workflow/      │
│  │   ├── claude-agent/        │   └── parallel-workflow/    │
│  │   └── http-fetch-agent/    ├── echo-chain/               │
│  ├── echo/                    └── ...                       │
│  └── ...                                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Setup & Dependencies

### Task 1.1: Create Engine Directory Structure
```bash
mkdir -p /opt/swarm-engine/cli
mkdir -p /opt/swarm-engine/lib
```

### Task 1.2: Create package.json

Create `/opt/swarm-engine/package.json`:
```json
{
  "name": "swarm-engine",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "swarm-agent": "./cli/swarm-agent.js",
    "swarm-workflow": "./cli/swarm-workflow.js"
  },
  "scripts": {
    "agent": "node cli/swarm-agent.js",
    "workflow": "node cli/swarm-workflow.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.6.0",
    "yaml": "^2.6.1",
    "chalk": "^5.3.0",
    "commander": "^12.1.0"
  }
}
```

### Task 1.3: Install Dependencies
```bash
cd /opt/swarm-engine
pnpm install
```

---

## Phase 2: swarm-agent CLI

### Command Reference

| Command | Description |
|---------|-------------|
| `swarm-agent list [--capability=X]` | List all registered agents |
| `swarm-agent info <name>` | Show agent details |
| `swarm-agent register <path>` | Register agent from path |
| `swarm-agent register --all` | Register all agents in /opt/swarm-agents/ |
| `swarm-agent create <name> [--template=X]` | Create new agent from template |
| `swarm-agent delete <name>` | Unregister agent |
| `swarm-agent templates` | List available templates |

### Task 2.1: Create swarm-agent.js

Create `/opt/swarm-engine/cli/swarm-agent.js`:
```javascript
#!/usr/bin/env node
import { Command } from 'commander';
import Database from 'better-sqlite3';
import YAML from 'yaml';
import chalk from 'chalk';
import { readFileSync, readdirSync, existsSync, cpSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

const AGENTS_DIR = '/opt/swarm-agents';
const TEMPLATES_DIR = join(AGENTS_DIR, '_templates');
const REGISTRY_DB = '/opt/swarm-registry/registry.db';

// Ensure registry exists
if (!existsSync(REGISTRY_DB)) {
    console.error(chalk.red('Registry database not found. Run swarm-init-registry first.'));
    process.exit(1);
}

// ... (full implementation in code)
```

### Task 2.2: Create Symlink
```bash
ln -sf /opt/swarm-engine/cli/swarm-agent.js /usr/local/bin/swarm-agent
chmod +x /opt/swarm-engine/cli/swarm-agent.js
```

### Task 2.3: Test swarm-agent
```bash
swarm-agent --help
swarm-agent templates
swarm-agent register --all
swarm-agent list
swarm-agent info echo
```

---

## Phase 3: swarm-workflow CLI

### Command Reference

| Command | Description |
|---------|-------------|
| `swarm-workflow list [--enabled]` | List all registered workflows |
| `swarm-workflow info <name>` | Show workflow details |
| `swarm-workflow register <path>` | Register workflow from path |
| `swarm-workflow register --all` | Register all workflows |
| `swarm-workflow create <name> [--template=X]` | Create from template |
| `swarm-workflow delete <name>` | Unregister workflow |
| `swarm-workflow enable <name>` | Enable a workflow |
| `swarm-workflow disable <name>` | Disable a workflow |
| `swarm-workflow runs [name] [--limit=N]` | Show recent runs |
| `swarm-workflow templates` | List available templates |

### Task 3.1: Create swarm-workflow.js

Create `/opt/swarm-engine/cli/swarm-workflow.js`:
```javascript
#!/usr/bin/env node
import { Command } from 'commander';
import Database from 'better-sqlite3';
import YAML from 'yaml';
import chalk from 'chalk';
import { readFileSync, readdirSync, existsSync, cpSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

const WORKFLOWS_DIR = '/opt/swarm-workflows';
const TEMPLATES_DIR = join(WORKFLOWS_DIR, '_templates');
const REGISTRY_DB = '/opt/swarm-registry/registry.db';

// ... (full implementation in code)
```

### Task 3.2: Create Symlink
```bash
ln -sf /opt/swarm-engine/cli/swarm-workflow.js /usr/local/bin/swarm-workflow
chmod +x /opt/swarm-engine/cli/swarm-workflow.js
```

### Task 3.3: Test swarm-workflow
```bash
swarm-workflow --help
swarm-workflow templates
swarm-workflow register --all
swarm-workflow list
swarm-workflow info echo-chain
```


---

## Phase 4: Database Initialization Script

### Task 4.1: Create init-registry.js

Create `/opt/swarm-engine/cli/init-registry.js`:
```javascript
#!/usr/bin/env node
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';

const REGISTRY_DB = '/opt/swarm-registry/registry.db';

// Ensure directory exists
const dir = dirname(REGISTRY_DB);
if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(chalk.green('Created registry directory'));
}

// ... (full schema initialization)
```

### Task 4.2: Create Symlink
```bash
ln -sf /opt/swarm-engine/cli/init-registry.js /usr/local/bin/swarm-init-registry
chmod +x /opt/swarm-engine/cli/init-registry.js
```

---

## Phase 5: Integration Testing

### Task 5.1: Full Test Sequence
```bash
# 1. Initialize registry (if not exists)
swarm-init-registry

# 2. Verify database
sqlite3 /opt/swarm-registry/registry.db ".tables"

# 3. List templates
swarm-agent templates
swarm-workflow templates

# 4. Register all agents and workflows
swarm-agent register --all
swarm-workflow register --all

# 5. List registered items
swarm-agent list
swarm-workflow list

# 6. Show detailed info
swarm-agent info echo
swarm-workflow info echo-chain

# 7. Create new agent from template
swarm-agent create my-test-agent --template=basic-agent
ls -la /opt/swarm-agents/my-test-agent/

# 8. Create new workflow from template
swarm-workflow create my-test-flow --template=linear-workflow
ls -la /opt/swarm-workflows/my-test-flow/

# 9. Enable/disable workflow
swarm-workflow disable echo-chain
swarm-workflow list
swarm-workflow enable echo-chain

# 10. Check workflow runs (should be empty initially)
swarm-workflow runs --limit=5
```

---

## Verification Checklist

### Phase 1: Setup
- [ ] /opt/swarm-engine directory created
- [ ] package.json created
- [ ] Dependencies installed (better-sqlite3, yaml, chalk, commander)

### Phase 2: swarm-agent
- [ ] swarm-agent.js created
- [ ] Symlink created at /usr/local/bin/swarm-agent
- [ ] `swarm-agent --help` works
- [ ] `swarm-agent templates` shows templates
- [ ] `swarm-agent register --all` registers agents
- [ ] `swarm-agent list` shows registered agents
- [ ] `swarm-agent info <name>` shows details
- [ ] `swarm-agent create <name>` creates from template
- [ ] `swarm-agent delete <name>` removes agent

### Phase 3: swarm-workflow
- [ ] swarm-workflow.js created
- [ ] Symlink created at /usr/local/bin/swarm-workflow
- [ ] `swarm-workflow --help` works
- [ ] `swarm-workflow templates` shows templates
- [ ] `swarm-workflow register --all` registers workflows
- [ ] `swarm-workflow list` shows registered workflows
- [ ] `swarm-workflow info <name>` shows details
- [ ] `swarm-workflow create <name>` creates from template
- [ ] `swarm-workflow enable/disable` toggles state
- [ ] `swarm-workflow runs` shows run history

### Phase 4: Database
- [ ] init-registry.js created
- [ ] Registry database initialized
- [ ] All tables exist

### Phase 5: Integration
- [ ] Full test sequence passes
- [ ] Agents registered in database
- [ ] Workflows registered in database
- [ ] Templates work for creating new items

---

## Quick Reference

### SSH Access
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin
```

### Key Paths

| Path | Purpose |
|------|---------|
| `/opt/swarm-engine/` | CLI and execution code |
| `/opt/swarm-engine/cli/` | CLI scripts |
| `/opt/swarm-registry/registry.db` | SQLite registry |
| `/opt/swarm-agents/` | Agent packages |
| `/opt/swarm-agents/_templates/` | Agent templates |
| `/opt/swarm-workflows/` | Workflow definitions |
| `/opt/swarm-workflows/_templates/` | Workflow templates |

### Git Workflow
```bash
swarm-session-start
# ... implement CLI ...
gcp "feat(cli): implement swarm-agent and swarm-workflow commands"
swarm-session-end
```
