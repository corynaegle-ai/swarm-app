# Session Notes - 2025-12-13

## Session: Repository Cleanup & Auth Redirect + HITL/Projects Integration

### Repository Consolidation (Completed)

**GitHub repos archived (set to read-only):**
- `archive-do-not-use-swarm-tickets`
- `archive-do-not-use-swarm-api`  
- `archive-do-not-use-project-swarm`

**Active repositories (4 total):**
| Repo | Droplet Path | Local Path | Purpose |
|------|--------------|------------|---------|
| swarm | /opt/swarm | ~/swarm-local | VMM core, Firecracker scripts |
| swarm-platform | /opt/swarm-platform | ~/swarm-platform | Unified API (port 8080) |
| swarm-dashboard | /opt/swarm-dashboard | ~/swarm-dashboard | React SPA frontend |
| swarm-specs | /opt/swarm-specs | ~/swarm-specs-local | Documentation |

**Critical fix - swarm-dashboard:**
- Was NOT on GitHub, only on droplet
- Created `corynaegle-ai/swarm-dashboard`, pushed all commits
- Cloned to local machine

### Database Migration (Completed)

**Problem found:** Database was at `/opt/swarm-tickets/data/swarm.db` which got orphaned when we archived folders. App recreated empty DB, breaking login.

**Fix applied:**
1. Copied database from archived location to `/opt/swarm-platform/data/swarm.db`
2. Updated `db.js` to use new path
3. Restarted PM2
4. Cleaned up stale `/opt/swarm-tickets` directory

**New database location:** `/opt/swarm-platform/data/swarm.db`

### Auth Redirect Change (Completed)

Modified `ProtectedRoute.jsx`:
- Unauthenticated users now redirect to `https://swarmstack.net` (landing page)
- Instead of `/login` route which was deleted

### HITL → Projects Integration (In Progress)

**Problem identified:** CreateProject page works (creates HITL sessions), but approved sessions don't create Projects or repos.

**Solution designed - Repo Setup Flow:**

```
[Approve Spec] → Modal appears:
┌─────────────────────────────────────────┐
│  🚀 Ready to Build!                     │
│                                         │
│  Where should we put your code?         │
│                                         │
│  ○ Create new repo (we'll handle it)    │
│    → swarmstack-projects/farmlink-app   │
│                                         │
│  ○ Use my existing repo                 │
│    [github.com/myuser/myrepo    ]       │
│    [PAT or SSH key              ] 🔒    │
│                                         │
│  [Cancel]              [Start Building] │
└─────────────────────────────────────────┘
```

**Database migration completed:**
```sql
-- Added to projects table:
repo_provider TEXT DEFAULT 'github'    -- github, gitlab, etc
repo_owner TEXT                        -- org or username
repo_name TEXT                         -- repository name
repo_mode TEXT DEFAULT 'managed'       -- 'managed' or 'linked'
credentials_secret_id TEXT             -- FK to secrets for linked repos
hitl_session_id TEXT                   -- FK back to HITL session
```

### Next Steps (Current Task)

1. **Create GitHub org** `swarmstack-projects` for managed repos
2. Generate org-level PAT for Swarm to create repos
3. Store system PAT in secrets
4. Build backend endpoints:
   - `POST /api/projects/provision-repo` - creates repo in org
   - `POST /api/projects/link-repo` - validates & links user repo
5. Build `RepoSetupModal` component in frontend
6. Wire into DesignSession.jsx approve flow

---

## Key File Locations

| Purpose | Path |
|---------|------|
| Database | `/opt/swarm-platform/data/swarm.db` |
| API Server | `/opt/swarm-platform/server.js` |
| HITL Routes | `/opt/swarm-platform/routes/hitl.js` |
| Projects Routes | `/opt/swarm-platform/routes/projects.js` |
| Dashboard Source | `/opt/swarm-dashboard/src/` |
| CreateProject Page | `/opt/swarm-dashboard/src/pages/CreateProject.jsx` |
| useHITL Hook | `/opt/swarm-dashboard/src/hooks/useHITL.js` |

## Commands Reference

```bash
# API server
pm2 restart swarm-platform
pm2 logs swarm-platform --lines 20

# Database
sqlite3 /opt/swarm-platform/data/swarm.db

# Dashboard rebuild
cd /opt/swarm-dashboard && npm run build
```
