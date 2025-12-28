# Deploy FORGE Agent - Phase 2: Remaining Steps (2.5-2.8)

## Prerequisites (Already Complete)
- [x] Step 2.1: Engine CLI exists at `/opt/swarm/engine/cli/swarm-engine.js`
- [x] Step 2.2: CLI help works (`swarm-engine --help`)
- [x] Step 2.3: All dependencies installed
- [x] Step 2.4: PM2 shows `swarm-platform` online, engine not yet running

## SSH Access
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
```

---

## Step 2.5: Find or Create Test Ticket
```bash
# Find existing ready ticket:
sqlite3 /opt/swarm-platform/data/swarm.db \
  "SELECT id, title, state, assignee_type FROM tickets WHERE state='ready' AND assignee_type='agent' LIMIT 5;"

# If none exist, create one:
sqlite3 /opt/swarm-platform/data/swarm.db \
  "INSERT INTO tickets (title, description, state, assignee_type, project_id) \
   VALUES ('Test: Create hello.py', 'Create a Python file that prints Hello World', 'ready', 'agent', 1);"
```

**Expected**: At least one ticket with `state='ready'` and `assignee_type='agent'`

---

## Step 2.6: Run Single Ticket Test
```bash
swarm-engine run-ticket <TICKET_ID> --wait
```

**Watch for**:
- VM spawns successfully
- Agent code executes
- Ticket state changes: `ready → assigned → in_progress → done`
- Any errors in output

**If fails**: Stop, diagnose, fix before proceeding.

---

## Step 2.7: Start Daemon (Foreground Test)
```bash
swarm-engine start --max-vms=5 --foreground
```

**Watch for**:
- Engine polls for ready tickets
- No crash loops
- Ctrl+C to stop after confirming it works

---

## Step 2.8: Add to PM2
```bash
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
| DB connection error | Verify paths in engine config |
| VM spawn fails | Run `swarm-cleanup` first |
| Agent not found | Check registry.db entry |
| Ticket not picked up | Verify `state='ready'` and `assignee_type='agent'` |

---

## Key Files
| File | Purpose |
|------|---------|
| `/opt/swarm/engine/cli/swarm-engine.js` | CLI entry point |
| `/opt/swarm/engine/lib/engine.js` | Main orchestration loop |
| `/opt/swarm-registry/registry.db` | Agent registry |
| `/opt/swarm-platform/data/swarm.db` | Tickets database |
