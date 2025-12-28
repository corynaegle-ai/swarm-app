# CLI Design Specification

**Status**: 📋 DOCUMENTED FOR FUTURE IMPLEMENTATION  
**Created**: 2025-12-09  
**Source**: Notion (migrated 2025-12-11)

---

## Executive Summary

Design specification for `swarm` CLI tool. **Recommendation: Build later, not now.** Current `swarm-*` shell scripts are sufficient for single-operator use.

---

## Implementation Decision

### When to Build
- [ ] Second operator onboarded
- [ ] CI/CD pipeline needs programmatic access
- [ ] 20+ scripts causing discoverability issues
- [ ] Open source release planned

### Quick Win (Now)
Simple wrapper for discoverability:
```bash
#!/bin/bash
# /usr/local/bin/swarm
case "$1" in
  help|"") ls /opt/swarm/bin/swarm-* | sed 's|.*/swarm-||' ;;
  *) /opt/swarm/bin/swarm-"$1" "${@:2}" ;;
esac
```

---

## Architecture Decision: Local vs Remote

| Phase | Location | Rationale |
|-------|----------|-----------|
| 1 | Remote only | Wrap existing scripts, zero new infra |
| 2 | HTTP API expansion | Enables local client later |
| 3 | Local thin client | Talks to API, multi-droplet support |

**Key insight:** HTTP API is the pivot point. API-first means local vs remote becomes a config flag.

---

## Command Structure

```
swarm <resource> <action> [target] [--flags]
```

### Resource Groups

| Resource | Purpose |
|----------|---------|
| `swarm project` | Design & manage projects |
| `swarm ticket` | Ticket CRUD & workflow |
| `swarm agent` | VM/agent lifecycle |
| `swarm fleet` | Multi-agent orchestration |
| `swarm snapshot` | Snapshot management |
| `swarm network` | TAP/bridge diagnostics |
| `swarm config` | CLI configuration |

---

## Command Reference

### Ticket Commands
```bash
# CRUD
swarm ticket list [--status open|claimed|done|failed]
swarm ticket show <id> [--with-deps] [--with-children]
swarm ticket create --title "..." --parent <id>
swarm ticket update <id> --status done

# Workflow
swarm ticket claim <id> --agent <agent-id>
swarm ticket release <id>
swarm ticket ready                     # List claimable
```

### Agent Commands
```bash
# Lifecycle
swarm agent start [--count 10] [--snapshot prod]
swarm agent stop <id|--all>
swarm agent restart <id>

# Status
swarm agent list [--format table|json]
swarm agent ps                         # Quick status

# Debugging
swarm agent ssh <id>                   # Interactive shell
swarm agent logs <id> [--follow] [--tail 100]
```

### Fleet Commands
```bash
# Launch
swarm fleet launch <project-id> --agents 50 --strategy parallel
swarm fleet launch <project-id> --strategy wave --wave-size 10

# Monitor
swarm fleet status [--watch]
swarm fleet progress <project-id>      # Progress bar

# Control
swarm fleet pause
swarm fleet resume
swarm fleet scale --agents 100
swarm fleet abort [--cleanup]
```

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | Node.js | Reuse existing modules |
| CLI framework | Commander.js | Mature subcommand support |
| Config | ~/.swarmrc (TOML) | Human-readable |
| TUI | blessed or ink | Dashboard mode |
| Packaging | npm global + binary | Easy install |

---

## Implementation Phases

### Phase 1: Core (Week 1)
- ticket, agent commands
- Basic CRUD operations
- Wrap existing scripts

### Phase 2: Orchestration (Week 2)
- Fleet commands
- Project design integration
- Watch/follow modes

### Phase 3: TUI Dashboard (Week 3)
- `swarm dashboard`
- Interactive ticket browser
- Real-time log viewer

---

*Migrated to git: December 11, 2025*
