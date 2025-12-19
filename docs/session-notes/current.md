# Current Session Notes

## Session: December 19, 2024 - Monorepo Creation

### Status: MONOREPO CREATED ✅

---

## Monorepo Setup Complete

### New Repository
- **GitHub**: https://github.com/corynaegle-ai/swarm-app
- **Local**: `~/Projects/swarm`

### Structure
```
swarm/
├── apps/
│   ├── platform/     # @swarm/platform - Backend API
│   └── dashboard/    # @swarm/dashboard - Frontend UI
├── docs/             # Specifications & documentation
├── package.json      # pnpm workspace root
├── pnpm-workspace.yaml
└── README.md
```

### Commands
```bash
cd ~/Projects/swarm

# Install all dependencies
pnpm install

# Development
pnpm dev:platform    # Start backend
pnpm dev:dashboard   # Start frontend
```

---

## Auto-Claude Configuration

### Ready to Add Project
Add the monorepo to Auto-Claude:
- Path: `~/Projects/swarm`
- This single project covers platform, dashboard, and docs

### API Key Configured ✅
`ANTHROPIC_API_KEY` set in `~/Projects/Auto-Claude/auto-claude/.env`

---

## Migration Notes

### Old Repos (can be archived)
| Repo | Status | Action |
|------|--------|--------|
| swarm-platform | Merged | Archive after testing |
| swarm-dashboard | Merged | Archive after testing |
| swarm-specs | Merged | Archive after testing |

### Kept Separate
| Repo | Reason |
|------|--------|
| swarm | Firecracker VM infrastructure scripts |

---

## Deployment Updates Required

After validating the monorepo works with Auto-Claude:

### DEV Droplet (134.199.235.140)
```bash
# Replace separate repos with monorepo
cd /opt
git clone https://github.com/corynaegle-ai/swarm-app.git swarm-app
cd swarm-app && pnpm install

# Update PM2 configs to point to new paths
# apps/platform → /opt/swarm-app/apps/platform
# apps/dashboard → /opt/swarm-app/apps/dashboard
```

### PM2 Ecosystem Updates
- `swarm-platform-dev` → `/opt/swarm-app/apps/platform/server.js`
- `swarm-dashboard-dev` → `/opt/swarm-app/apps/dashboard` (static serve)

---

## Quick Reference

### Droplet Access
```bash
# DEV
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# PROD
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH
```

### Auto-Claude
```bash
cd ~/Projects/Auto-Claude/auto-claude-ui && pnpm run start
```
