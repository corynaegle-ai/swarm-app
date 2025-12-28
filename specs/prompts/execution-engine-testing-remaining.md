# Execution Engine Testing - Remaining Tests

**Date:** 2025-12-14
**Status:** Test 1 PASSED, Tests 2-6 remaining
**Estimated Time:** 25-35 minutes

---

## Completed

### Test 1: Engine Status ✅
- Fixed DB path: `/opt/swarm-platform/data/swarm.db`
- Fixed tickets table: `state` (not `status`), values: 'ready', 'in_progress'
- Fixed vm_assignments: `status='running'`
- CLI now shows: Pending: 1, Running: 0, Active VMs: 0

---

## Remaining Tests

### Test 2: Single Ticket Execution (Echo Agent)

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH

# Check for echo agent
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name, type FROM agents WHERE id='echo' OR name LIKE '%echo%';"

# Create test ticket (note: uses 'state' not 'status')
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id) VALUES ('test-echo-001', 'test-project', 'Echo Test', 'Test ticket for echo agent', 'ready', 'echo');"

# Execute
swarm-engine run-ticket test-echo-001 --wait
```

**Expected:** Ticket state changes to 'done'.

---

### Test 3: Claude Agent Execution

```bash
# Check Claude agent exists
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name, type FROM agents WHERE name LIKE '%claude%' OR id LIKE '%claude%';"

# Check API key
echo $ANTHROPIC_API_KEY | head -c 20

# Create Claude ticket
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id) VALUES ('test-claude-001', 'test-project', 'Claude Test', 'Write a haiku about distributed systems', 'ready', 'claude');"

# Execute
swarm-engine run-ticket test-claude-001 --wait
```

**Expected:** Claude API called, response in outputs field, state='done'.

---

### Test 4: Engine Polling Mode

**Terminal 1:**
```bash
swarm-engine start --foreground --max-vms=2
```

**Terminal 2:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sqlite3 /opt/swarm-platform/data/swarm.db \"INSERT INTO tickets (id, project_id, title, description, state, agent_id) VALUES ('test-poll-001', 'test-project', 'Poll Test', 'Auto-pickup test', 'ready', 'echo');\""
```

**Expected:** Engine auto-detects, spawns VM, executes, completes.

---

### Test 5: Multi-VM Parallel Execution

```bash
# Create 5 tickets
for i in 1 2 3 4 5; do
  sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id) VALUES ('test-parallel-00$i', 'test-project', 'Parallel Test $i', 'Parallel execution test', 'ready', 'echo');"
done

# Verify
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, title, state FROM tickets WHERE id LIKE 'test-parallel%';"

# Execute with 5 VM capacity
swarm-engine start --foreground --max-vms=5
```

**Expected:** 5 VMs spawn, all tickets complete.

---

### Test 6: Workflow Execution

```bash
# Check workflows exist
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name FROM workflows LIMIT 5;"

# If workflow exists, create ticket
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, execution_mode, workflow_id) VALUES ('test-workflow-001', 'test-project', 'Workflow Test', 'Test workflow execution', 'ready', 'workflow', '<WORKFLOW_ID>');"

swarm-engine run-ticket test-workflow-001 --wait

# Verify logs
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT 1;"
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM step_executions ORDER BY started_at DESC LIMIT 5;"
```

---

## Key Schema Notes

**tickets table (swarm-platform):**
- Uses `state` column: draft, ready, blocked, on_hold, assigned, in_progress, verifying, in_review, changes_requested, done, needs_review, cancelled
- Requires: id, project_id, title

**vm_assignments table (swarm-registry):**
- Uses `status` column: running, completed, failed

---

## Cleanup

```bash
swarm-cleanup
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id LIKE 'test-%';"
```

---

## Success Criteria

| Test | Pass Criteria |
|------|---------------|
| 2. Single Ticket | state='done' after execution |
| 3. Claude Agent | API called, outputs populated |
| 4. Polling Mode | Auto-pickup and execution |
| 5. Multi-VM | 5 parallel completions |
| 6. Workflow | step_executions populated |
