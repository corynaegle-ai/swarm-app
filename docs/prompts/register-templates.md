# Register Templates in SQLite - Implementation Prompt

**Status:** ✅ COMPLETED (2025-12-10 ~06:50 UTC)

**Purpose:** Register the 5 existing templates into the SQLite registry database.
**Estimated Time:** 1 focused session (10-15 min)
**Prerequisites:** Templates exist, registry.db initialized

---

## Context

### Existing Templates

| Type | Template | Location |
|------|----------|----------|
| Agent | basic-agent | `/opt/swarm-agents/_templates/basic-agent/` |
| Agent | claude-agent | `/opt/swarm-agents/_templates/claude-agent/` |
| Agent | http-fetch-agent | `/opt/swarm-agents/_templates/http-fetch-agent/` |
| Workflow | linear-workflow | `/opt/swarm-workflows/_templates/linear-workflow/` |
| Workflow | parallel-workflow | `/opt/swarm-workflows/_templates/parallel-workflow/` |

### Target Database

```
/opt/swarm-registry/registry.db
├── agents table
└── workflows table
```

---

## Implementation Summary

### Step 1: Verify Templates Exist

```bash
ls -la /opt/swarm-agents/_templates/
ls -la /opt/swarm-workflows/_templates/
sqlite3 /opt/swarm-registry/registry.db ".tables"
```

### Step 2: Registration Script

Created `/opt/swarm-engine/cli/register-templates.js`:
- Uses `_template:` prefix naming convention
- Upserts (updates or inserts) templates
- Reads YAML configs from template directories

### Step 3: Execute Registration

```bash
swarm-register-templates
```

### Step 4: Verify

```bash
# Check agent templates
sqlite3 /opt/swarm-registry/registry.db \
  "SELECT name, version FROM agents WHERE name LIKE '_template:%';"

# Check workflow templates  
sqlite3 /opt/swarm-registry/registry.db \
  "SELECT name, version FROM workflows WHERE name LIKE '_template:%';"
```

---

## Naming Convention

| Type | Filesystem | Registry Name |
|------|------------|---------------|
| Agent Template | `/opt/swarm-agents/_templates/basic-agent/` | `_template:basic-agent` |
| Workflow Template | `/opt/swarm-workflows/_templates/linear-workflow/` | `_template:linear-workflow` |
| User Agent | `/opt/swarm-agents/my-agent/` | `my-agent` |
| User Workflow | `/opt/swarm-workflows/my-flow/` | `my-flow` |

The `_template:` prefix distinguishes templates from user-created items.

---

## Verification Checklist

- [x] Templates directories exist and contain YAML files
- [x] registry.db exists with agents and workflows tables
- [x] register-templates.js created
- [x] Symlink created at /usr/local/bin/swarm-register-templates
- [x] Script runs without errors
- [x] 3 agent templates registered
- [x] 2 workflow templates registered
- [x] Templates queryable via SQL
- [x] Re-running script updates (not duplicates) templates
