# Deploy FORGE Agent - Phase 2: Continue from Step 6

## Prerequisites (Already Complete)
- [x] Steps 2.1-2.4: Engine CLI installed and dependencies ready
- [x] Step 2.5: Test ticket exists (`engine-test-001`)
- [x] Step 5: Ticket verified and reset to `ready` state
- [x] Fixed swarm-cleanup syntax error (line 61 pgrep issue)

## SSH Access (if reconnecting)
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH
cd /opt/swarm/engine
```

---

## Step 6: Run Single Ticket Test

```bash
swarm-engine run-ticket engine-test-001 --wait
```

**Watch for**:
- VM spawns successfully
- Agent code executes
- Ticket state transitions: `ready → assigned → in_progress → done`

**Verify final state**:
```bash
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id='engine-test-001';"
```

**Expected**: `engine-test-001|done`

---

## Step 7: Start Daemon (Foreground Test)

```bash
swarm-engine start --max-vms=5 --foreground
```

- Watch for polling behavior, no crash loops
- Ctrl+C after 10-15 seconds once confirmed working

---

## Step 8: Add to PM2

```bash
pm2 start /opt/swarm/engine/cli/swarm-engine.js --name swarm-engine -- start --max-vms=5
pm2 save
pm2 list
```

**Expected**: `swarm-engine` shows as `online`

---

## Verification

```bash
swarm-engine status
pm2 logs swarm-engine --lines 20
```

---

## Success Criteria
- [ ] Single ticket test passes (step 6)
- [ ] Daemon starts without crash (step 7)
- [ ] PM2 shows engine running (step 8)
- [ ] `swarm-engine status` shows operational
