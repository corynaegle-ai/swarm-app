# Deploy FORGE Agent - Phase 2: Start Engine

## Objective
Make the FORGE execution engine operational so tickets can be automatically executed by VMs.

## Prerequisites (Already Complete)
- [x] FORGE agent deployed to `/opt/swarm-agents/forge-agent/`
- [x] Agent registered in registry.db (`forge-agent-001`)
- [x] FORGE persona file created
- [x] Schema alignment verified

## SSH Access
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
```

---

## Step 2.1: Verify Engine CLI Exists
```bash
cd /opt/swarm/engine
ls -la cli/
# Confirm swarm-engine.js exists
# Check for symlink:
which swarm-engine
```

**Expected**: `swarm-engine.js` present, possibly symlinked to `/usr/local/bin/swarm-engine`

---

## Step 2.2: Test CLI Help
```bash
node /opt/swarm/engine/cli/swarm-engine.js --help
# OR if symlinked:
swarm-engine --help
```

**Expected**: Help output showing available commands (`run-ticket`, `start`, `status`, etc.)

---

## Step 2.3: Check Dependencies
```bash
cd /opt/swarm/engine
cat package.json | head -30
npm ls --depth=0 2>&1 | head -20
```

**Expected**: No missing dependencies, node_modules populated

---

## Step 2.4: Check PM2 Status
```bash
pm2 list
```

**Expected**: Engine NOT running yet. Note other services (ticket-api, etc.)

---

## Step 2.5: Find or Create Test Ticket
```bash
# Find existing ready ticket:
sqlite3 /opt/swarm-tickets/data/swarm.db \
  "SELECT id, title, state, assignee_type FROM tickets WHERE state='ready' AND assignee_type='agent' LIMIT 5;"

# If none exist, create one:
sqlite3 /opt/swarm-tickets/data/swarm.db \
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
# OR
pm2 logs swarm-engine --lines 20
```

---

## Success Criteria
- [ ] `swarm-engine --help` works
- [ ] Single ticket test passes
- [ ] Daemon starts without crash
- [ ] PM2 shows engine running
- [ ] `swarm-engine status` shows operational

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CLI not found | Check symlink or use full path |
| Missing dependencies | `cd /opt/swarm/engine && npm install` |
| DB connection error | Verify paths in engine config |
| VM spawn fails | Run `swarm-cleanup` first |
| Agent not found | Check registry.db entry |

---

## Key Files
| File | Purpose |
|------|---------|
| `/opt/swarm/engine/cli/swarm-engine.js` | CLI entry point |
| `/opt/swarm/engine/lib/engine.js` | Main orchestration loop |
| `/opt/swarm/engine/lib/executor.js` | VM execution logic |
| `/opt/swarm-registry/registry.db` | Agent registry |
| `/opt/swarm-tickets/data/swarm.db` | Tickets database |
