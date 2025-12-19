# Continue: Local Dev Environment & Auto-Claude Testing

## Context
Monorepo created and configured. Local dev environment partially set up. GitHub Actions deploy workflow created.

## What's Done ✅
1. **Monorepo created**: `~/Projects/swarm` → github.com/corynaegle-ai/swarm-app
2. **Structure**: `apps/platform`, `apps/dashboard`, `docs/`
3. **Auto-Claude installed**: `~/Projects/Auto-Claude` with API key configured
4. **GitHub Actions**: `.github/workflows/deploy-dev.yml` for auto-deploy on push
5. **DEV droplet**: Monorepo cloned to `/opt/swarm-app`, tested working
6. **SSH key secret**: `DEV_SSH_KEY` added to GitHub repo

## What's Pending
1. **Verify GitHub secret was set**: `gh secret list --repo corynaegle-ai/swarm-app`
2. **Test local dev with SSH tunnel**:
   ```bash
   # Terminal 1: Start tunnel
   ~/Projects/swarm/scripts/tunnel-dev-db.sh
   
   # Terminal 2: Start platform
   cd ~/Projects/swarm/apps/platform && pnpm dev
   ```
3. **Test Auto-Claude** with the monorepo project
4. **Update session notes** in git

## Key Files
| File | Purpose |
|------|---------|
| `apps/platform/.env` | Local config (uses tunnel port 5433) |
| `apps/platform/.env.example` | Template for others |
| `scripts/tunnel-dev-db.sh` | SSH tunnel to DEV PostgreSQL |
| `.github/workflows/deploy-dev.yml` | Auto-deploy on push to main |

## Droplet Access
```bash
# DEV
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
```

## Quick Reference
- **Monorepo local**: `~/Projects/swarm`
- **Monorepo GitHub**: github.com/corynaegle-ai/swarm-app
- **Auto-Claude**: `~/Projects/Auto-Claude/auto-claude-ui && pnpm run start`
- **Session notes**: `~/Projects/swarm/docs/session-notes/current.md`

## Next Steps
1. Verify the GitHub Actions workflow triggers on next push
2. Test Auto-Claude creating a task branch and making changes
3. Verify auto-deploy works when PR merged to main
4. Archive old repos (swarm-platform, swarm-dashboard, swarm-specs)
