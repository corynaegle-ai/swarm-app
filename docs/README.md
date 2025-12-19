# SwarmSpecs

Central documentation repository for Project Swarm - a distributed AI agent coordination system.

## Repository Structure

```
SwarmSpecs/
├── design-docs/       # Technical design documents and proposals
├── session-notes/     # Development session notes (replaces Notion)
├── architecture/      # System architecture diagrams and docs
├── specs/             # Formal specifications and requirements
├── runbooks/          # Operational procedures and troubleshooting
└── references/        # External references, research, links
```

## Quick Links

| Resource | Description |
|----------|-------------|
| [Current Session](session-notes/current.md) | Active session notes |
| [Architecture Overview](architecture/overview.md) | System architecture |
| [Infrastructure Reference](references/infrastructure.md) | Droplet, VMs, networking |

## Session Workflow

```
1. Start fresh Claude chat
2. State goal: "Continue [task] from SwarmSpecs session notes"
3. Claude reads session-notes/current.md
4. Execute focused task (15-20 min max)
5. Update session-notes/current.md
6. Commit and push
7. End chat cleanly
```

## Key Principle

> **Git is the persistent memory, not the conversation.**
> Each chat is ephemeral — session notes are the source of truth.

## Related Repositories

- [swarm](https://github.com/corynaegle-ai/swarm) - Core infrastructure
- [swarm-tickets](https://github.com/corynaegle-ai/swarm-tickets) - Ticketing system

## Infrastructure

| Resource | Value |
|----------|-------|
| Droplet | 146.190.35.235 |
| API | https://api.swarmstack.net |
| VMs | Firecracker microVMs with snapshot restore |
