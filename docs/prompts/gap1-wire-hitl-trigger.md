# GAP #1: Wire HITL Trigger to Execution Engine

## Context

The Build Feature workflow has HITL session management and an execution engine, but there are two specific issues preventing tickets from being executed:

**Issue 1**: HITL assigns `coder-system` as the agent ID, but the actual coding agent is `forge` (ID: `forge-agent-001`)

**Issue 2**: When the engine runs under PM2, `/usr/local/bin` is not in PATH, so `swarm-cleanup-ns` fails

---

## Environment

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| SSH Command | `ssh -i ~/.ssh/swarm_key root@134.199.235.140` |
| PATH Export | `export PATH=/root/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:$PATH` |

### Current State

| Component | Status | Evidence |
|-----------|--------|----------|
| swarm-engine | ✅ Running | PM2 shows online, 26m+ uptime |
| Ticket activation | ✅ Working | Tickets transition to 'ready' state |
| Agent lookup | ❌ Failing | `Agent not found: coder-system` |
| VM cleanup | ❌ Failing | `swarm-cleanup-ns: not found` |

---

## Files to Modify

### 1. Fix Agent ID Assignment

**File**: `/opt/swarm-platform/routes/hitl.js`

**Location**: Around line 458-462

**Current (Wrong)**:
```javascript
SET state = 'ready',
    assignee_type = 'agent',
    assignee_id = 'coder-system',
```

**Should Be**:
```javascript
SET state = 'ready',
    assignee_type = 'agent',
    assignee_id = 'forge-agent-001',
```

The agent ID must match an entry in `/opt/swarm-registry/registry.db` agents table:
- Correct ID: `forge-agent-001`
- Agent name: `forge`
- Version: `2.0.0`

---

### 2. Fix PATH in Engine PM2 Config

**File**: `/opt/swarm/engine/pm2.config.js`

**Check current config** and ensure PATH includes `/usr/local/bin`:

```javascript
module.exports = {
  apps: [{
    name: 'swarm-engine',
    script: 'lib/engine.js',
    cwd: '/opt/swarm/engine',
    env: {
      NODE_ENV: 'production',
      PATH: '/usr/local/bin:/root/.nvm/versions/node/v22.21.1/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    }
  }]
};
```

After modifying, restart the engine:
```bash
cd /opt/swarm/engine && pm2 restart swarm-engine
```

---

## Verification Steps

### Step 1: Verify Agent Exists
```bash
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name, version FROM agents WHERE id = 'forge-agent-001';"
```

Expected output:
```
forge-agent-001|forge|2.0.0
```

### Step 2: Test HITL Ticket Creation
1. Open dashboard at http://134.199.235.140:3000
2. Start a new HITL session
3. Complete design phase
4. Click "Start Build"
5. Verify tickets are created with `assignee_id = 'forge-agent-001'`

```bash
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, assignee_id, state FROM tickets WHERE state = 'ready' LIMIT 5;"
```

### Step 3: Verify Engine Picks Up Tickets
Watch engine logs:
```bash
pm2 logs swarm-engine --lines 20 --nostream
```

**Success indicators**:
- `Found X ready tickets (capacity: Y)`
- `Dispatching ticket TKT-XXXXX`
- No `Agent not found` errors
- No `swarm-cleanup-ns: not found` errors

### Step 4: Verify PATH Fix
Test that cleanup script is accessible:
```bash
# In a new PM2 process test
pm2 start --interpreter bash --name test-path -x -- -c 'which swarm-cleanup-ns && echo "PATH OK"'
pm2 logs test-path --lines 5 --nostream
pm2 delete test-path
```

---

## Execution Checklist

- [ ] SSH to droplet: `ssh -i ~/.ssh/swarm_key root@134.199.235.140`
- [ ] Export PATH: `export PATH=/root/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:$PATH`
- [ ] Edit hitl.js: Change `coder-system` to `forge-agent-001`
- [ ] Restart platform: `pm2 restart swarm-platform swarm-platform-dev`
- [ ] Edit/verify engine pm2.config.js: Ensure PATH includes `/usr/local/bin`
- [ ] Restart engine: `cd /opt/swarm/engine && pm2 restart swarm-engine`
- [ ] Save PM2 config: `pm2 save`
- [ ] Test via dashboard or API
- [ ] Verify engine logs show successful dispatch

---

## Rollback (if needed)

```bash
# Revert hitl.js change
cd /opt/swarm-platform && git checkout routes/hitl.js

# Restart services
pm2 restart swarm-platform swarm-platform-dev swarm-engine
```

---

## Next Gap After Completion

Once GAP #1 is verified working, proceed to **GAP #3**: Wire the verifier into the executor flow (worker generates code → calls verifier → creates PR on pass).

---

## Session Notes Update

After completing this gap, update session notes:
```bash
cd /opt/swarm-specs
# Update session-notes/current.md
git add -A && git commit -m "GAP #1 complete: HITL trigger wired to engine" && git push
```
