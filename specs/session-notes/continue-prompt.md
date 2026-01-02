# Monorepo Migration Status - PROD (146.190.35.235)

## Migration Complete ✅

### PM2 Services (all from monorepo)
| Service | PM2 Name | Location | Port | Status |
|---------|----------|----------|------|--------|
| Platform API | swarm-platform | /opt/swarm-app/apps/platform | 8080 | ✅ Online |
| MCP Factory | mcp-factory | /opt/swarm-app/apps/mcp-factory | 3456 | ✅ Online |
| Dashboard | static | /opt/swarm-app/apps/dashboard | Caddy | ✅ Static |

### Archived Legacy Repos (.legacy)
- /opt/swarm-dashboard.legacy
- /opt/swarm-mcp-factory.legacy
- /opt/swarm-platform.legacy

### Support Directories (not services)
| Directory | Purpose | Migrate? |
|-----------|---------|----------|
| /opt/swarm-agents | Agent templates (echo, forge) | No - static files |
| /opt/swarm-registry | registry.db, secrets | No - data directory |
| /opt/swarm-specs | Documentation | No - git repo for specs |
| /opt/swarm-verifier | Phase 5 verification | Later - not active yet |

### Monorepo Structure (/opt/swarm-app/apps)
```
apps/
├── dashboard/     # React SPA
├── mcp-factory/   # MCP server generator
└── platform/      # Main API (tickets, auth, admin)
```

## Next Tasks
1. Clean up archived .legacy directories (rm -rf)
2. Consider adding swarm-verifier to monorepo when Phase 5 is implemented
3. Document the monorepo structure in /opt/swarm-specs

## Prompt for Next Session
```
Continue Swarm development. Check ~/repos/swarm-specs-local/session-notes/continue-prompt.md

Status: Monorepo migration complete on PROD. All services running from /opt/swarm-app.
Options:
- Clean up .legacy directories
- Work on Phase 5 HITL UI 
- Implement Agent Execution Engine
- Other feature work
```
