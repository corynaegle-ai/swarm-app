# Current Session Notes

## Session: December 19, 2024 - Monorepo Migration

### Status: PLATFORM MIGRATED ✅ | DASHBOARD PENDING

---

## Monorepo Deployment Progress

### Completed
- GitHub Actions deploy workflow working
- DEV droplet synced to `/opt/swarm-app`
- Platform migrated to monorepo path
- Platform health check passing
- PM2 config saved

### Pending
- Dashboard migration to monorepo path
- Local dev testing with SSH tunnel
- Auto-Claude testing

---

## Key Paths

### DEV Droplet (134.199.235.140)
| Component | Old Path | New Path | Status |
|-----------|----------|----------|--------|
| Platform | /opt/swarm-platform | /opt/swarm-app/apps/platform | ✅ Migrated |
| Dashboard | /opt/swarm-dashboard | /opt/swarm-app/apps/dashboard | ❌ Pending |

### Local Mac
- Monorepo: `~/Projects/swarm`
- Auto-Claude: `~/Projects/Auto-Claude`

---

## Commands Reference

```bash
# DEV SSH
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Test platform
curl http://134.199.235.140:8080/health

# Local dev (requires tunnel)
~/Projects/swarm/scripts/tunnel-dev-db.sh  # Terminal 1
cd ~/Projects/swarm/apps/platform && pnpm dev  # Terminal 2

# Auto-Claude
cd ~/Projects/Auto-Claude/auto-claude-ui && pnpm run start
```

---

## Continuation Prompt
`~/Projects/swarm/docs/prompts/continue-monorepo-migration.md`
