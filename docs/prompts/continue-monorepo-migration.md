# Continue: Monorepo Migration & Auto-Claude Testing

## Context
Monorepo deployed to DEV droplet. Platform migrated to new path. Dashboard still on old path.

## What's Done ✅
1. **GitHub secret verified**: `DEV_SSH_KEY` is set
2. **GitHub Actions working**: Deploy workflow triggers on push to main
3. **DEV droplet synced**: `/opt/swarm-app` has latest code
4. **Platform migrated**: Now running from `/opt/swarm-app/apps/platform/server.js`
5. **Platform healthy**: `curl http://134.199.235.140:8080/health` returns healthy
6. **Deploy workflow improved**: Added `git checkout -- . && git clean -fd` before pull

## What's Pending
1. **Migrate dashboard to monorepo path** (currently at `/opt/swarm-dashboard`)
2. **Test local dev with SSH tunnel**:
   ```bash
   # Terminal 1: Start tunnel
   ~/Projects/swarm/scripts/tunnel-dev-db.sh
   
   # Terminal 2: Start platform
   cd ~/Projects/swarm/apps/platform && pnpm dev
   ```
3. **Test Auto-Claude** with the monorepo project
4. **Commit workflow fix** and verify auto-deploy

## Quick Commands
```bash
# SSH to DEV
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Check PM2 status
pm2 list

# Test platform health
curl http://134.199.235.140:8080/health

# Start Auto-Claude
cd ~/Projects/Auto-Claude/auto-claude-ui && pnpm run start
```

## PM2 Current State (DEV)
| App | Path | Status |
|-----|------|--------|
| swarm-platform-dev | /opt/swarm-app/apps/platform ✅ | online |
| swarm-dashboard-dev | /opt/swarm-dashboard ❌ OLD | online |

## Next Steps
1. Migrate dashboard PM2 to monorepo path
2. Commit the workflow fix to git
3. Test local development with SSH tunnel
4. Test Auto-Claude creating a branch and PR
5. Archive old repos after validation
