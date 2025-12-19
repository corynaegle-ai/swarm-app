# Swarm Dashboard Authentication - Implementation Prompt

**Use this prompt to start a new chat session for implementing authentication.**

---

## Quick Start

Copy this entire prompt into a new Claude chat to begin implementation.

---

## Project Context

You are implementing backend authentication for the Swarm Dashboard. Swarm is a distributed AI agent platform running on a DigitalOcean droplet (146.190.35.235).

**Target**: `/opt/swarm-tickets/` (Node.js/Express API on port 8080)

## Implementation Phases

| Phase | Description | Prompt File | Status |
|-------|-------------|-------------|--------|
| 1 | Create users table | [phase-1-users-table.md](./phase-1-users-table.md) | ✅ |
| 2 | Create auth module (JWT/bcrypt) | [phase-2-auth-module.md](./phase-2-auth-module.md) | ✅ |
| 3 | Add auth middleware | [phase-3-middleware.md](./phase-3-middleware.md) | ✅ |
| 4 | Add /api/auth routes | [phase-4-auth-routes.md](./phase-4-auth-routes.md) | ✅ |
| 5 | Add /api/admin/users routes | [phase-5-admin-routes.md](./phase-5-admin-routes.md) | ✅ |
| 6 | Create admin setup script | [phase-6-admin-setup.md](./phase-6-admin-setup.md) | ✅ |
| 7 | Test all endpoints | [phase-7-testing.md](./phase-7-testing.md) | ⏳ |

## Session Instructions

1. **Check current progress** in Notion Session Notes or `/opt/swarm-specs/session-notes/current.md`
2. **Read the prompt file** for the next incomplete phase
3. **Implement that phase only** - stay focused
4. **Update session notes** when phase completes
5. **End chat** if approaching 15-20 minutes

## SSH Access

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
```

## Key Files

```
/opt/swarm-tickets/
├── api-server-dashboard.js    # Main server - routes registered here
├── data/swarm.db              # SQLite database
├── auth.js                    # JWT/bcrypt utilities, middleware ✅
├── api-auth.js                # Auth + admin routes ✅
└── setup-admin.js             # Admin user creation ✅
```

## Anti-Freeze Protocol

- SSH timeout: 30s max
- Use `head -50` for file reads
- Max 3 chained commands
- Checkpoint progress before complex operations
- Session duration: 15-20 minutes max

## Design Spec Reference

Full design spec: `/opt/swarm-specs/docs/auth-design-spec.md`

GitHub: https://github.com/corynaegle-ai/swarm-specs/blob/main/docs/auth-design-spec.md

---

## Start Here

**Next step: Phase 7 - Testing**

Read `phase-7-testing.md` and verify all auth endpoints work correctly.
