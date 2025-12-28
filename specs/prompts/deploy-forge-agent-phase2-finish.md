# Deploy FORGE Agent - Phase 2: Finish (Steps 2.6-2.8)

## Prerequisites (Already Complete)
- [x] Step 2.1-2.4: Engine CLI installed and dependencies ready
- [x] Step 2.5: Test ticket exists (`engine-test-001`)

## SSH Access
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
```

---

## Step 2.6: Run Single Ticket Test

```bash
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
cd /opt/swarm/engine
swarm-engine run-ticket engine-test-001 --wait
```

**Watch for**:
- VM spawns successfully
- Agent code executes
- Ticket state changes: `ready → assigned → in_progress → done`

**Verify ticket state changed**:
```bash
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id='engine-test-001';"
```

**If fails**: Check logs, run `swarm-cleanup`, diagnose before proceeding.

---

## Step 2.7: Start Daemon (Foreground Test)

```bash
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
swarm-engine start --max-vms=5 --foreground
```

**Watch for**:
- Engine polls for ready tickets
- No crash loops
- Ctrl+C to stop after confirming it works (10-15 seconds)

---

## Step 2.8: Add to PM2

```bash
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
pm2 start /opt/swarm/engine/cli/swarm-engine.js --name swarm-engine -- start --max-vms=5
pm2 save
pm2 list
```

**Expected**: `swarm-engine` shows as `online` in PM2 list

---

## Verification

```bash
swarm-engine status
pm2 logs swarm-engine --lines 20
```

---

## Success Criteria
- [ ] Single ticket test passes (step 2.6)
- [ ] Daemon starts without crash (step 2.7)
- [ ] PM2 shows engine running (step 2.8)
- [ ] `swarm-engine status` shows operational

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| DB connection error | DB is at `/opt/swarm-platform/data/swarm.db` |
| VM spawn fails | Run `swarm-cleanup` first |
| Command not found | `export PATH=/usr/local/bin:/usr/bin:/bin:$PATH` |
| Ticket not picked up | Verify `state='ready'` and `assignee_type='agent'` |

---

## Key Files
| File | Purpose |
|------|---------|
| `/opt/swarm/engine/cli/swarm-engine.js` | CLI entry point |
| `/opt/swarm/engine/lib/engine.js` | Main orchestration loop |
| `/opt/swarm-registry/registry.db` | Agent registry |
| `/opt/swarm-platform/data/swarm.db` | Tickets database |
