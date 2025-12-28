# Execution Engine Testing - Tests 2-6

**Date:** 2025-12-14
**Previous Session:** Test 2 failed - VM spawned but SSH timed out
**Estimated Time:** 30-40 minutes

---

## Blocking Issue from Test 2

VM spawns but SSH connection to 10.0.0.2 times out. Debug this first:

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH

# Clean state
swarm-cleanup

# Spawn VM manually to test
swarm-spawn-ns 1
sleep 3

# Check VM is running
pgrep -a firecracker

# Check network namespace exists
ip netns list

# Test connectivity from host
ping -c 2 10.0.0.2
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@10.0.0.2 "echo success"

# If ping fails, check bridge/tap config
ip addr show br0
ip link show tap1
```

**Likely causes:**
1. TAP device not attached to bridge
2. Namespace routing issue
3. VM didn't get SSH service started (entropy issue)

---

## Test 2: Single Ticket Execution (Echo Agent) - RETRY

After fixing networking:

```bash
# Clean up failed ticket
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id='test-echo-001';"

# Create fresh ticket with correct fields
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-echo-002', 'test-project', 'Echo Test 2', 'Test ticket for echo agent', 'ready', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', 'agent', 'agent');"

# Execute
swarm-engine run-ticket test-echo-002 --wait
```

**Expected:** state='done', outputs populated

---

## Test 3: Claude Agent Execution

```bash
# Find Claude agent
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name FROM agents WHERE name LIKE '%claude%';"

# Check API key is set
echo $ANTHROPIC_API_KEY | head -c 20

# Create ticket (replace CLAUDE_AGENT_ID with actual ID)
CLAUDE_ID=$(sqlite3 /opt/swarm-registry/registry.db "SELECT id FROM agents WHERE name LIKE '%claude%' LIMIT 1;")
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode, inputs) VALUES ('test-claude-001', 'test-project', 'Claude Test', 'Write a haiku about distributed systems', 'ready', '$CLAUDE_ID', '$CLAUDE_ID', 'agent', 'agent', '{\"prompt\":\"Write a haiku about distributed systems\"}');"

# Execute
swarm-engine run-ticket test-claude-001 --wait

# Check result
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT state, outputs, error FROM tickets WHERE id='test-claude-001';"
```

**Expected:** Claude API called, outputs populated with haiku, state='done'

---

## Test 4: Engine Polling Mode

**Terminal 1 (engine):**
```bash
swarm-engine start --foreground --max-vms=2
```

**Terminal 2 (inject ticket):**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:\$PATH && sqlite3 /opt/swarm-platform/data/swarm.db \"INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-poll-001', 'test-project', 'Poll Test', 'Auto-pickup test', 'ready', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', 'agent', 'agent');\""
```

**Expected:** Engine auto-detects ticket, spawns VM, executes, completes

---

## Test 5: Multi-VM Parallel Execution

```bash
# Create 5 tickets
ECHO_ID='0d72b1b5-a98e-4356-bf52-f654d0509dc4'
for i in 1 2 3 4 5; do
  sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-parallel-00$i', 'test-project', 'Parallel Test $i', 'Parallel execution test', 'ready', '$ECHO_ID', '$ECHO_ID', 'agent', 'agent');"
done

# Verify
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id LIKE 'test-parallel%';"

# Execute with 5 VM capacity
swarm-engine start --foreground --max-vms=5
# Let run until all complete, then Ctrl+C

# Check results
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id LIKE 'test-parallel%';"
```

**Expected:** 5 VMs spawn, all tickets reach state='done'

---

## Test 6: Workflow Execution

```bash
# Check workflows exist
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name FROM workflows LIMIT 5;"

# If workflow exists, get ID
WORKFLOW_ID=$(sqlite3 /opt/swarm-registry/registry.db "SELECT id FROM workflows LIMIT 1;")

# Create workflow ticket
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, execution_mode, workflow_id) VALUES ('test-workflow-001', 'test-project', 'Workflow Test', 'Test workflow execution', 'ready', 'workflow', '$WORKFLOW_ID');"

# Execute
swarm-engine run-ticket test-workflow-001 --wait

# Verify workflow execution logged
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT 1;"
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM step_executions ORDER BY started_at DESC LIMIT 5;"
```

**Expected:** Workflow runs, step_executions populated

---

## Cleanup

```bash
swarm-cleanup
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id LIKE 'test-%';"
```

---

## Key Schema Reference

**tickets table requires for agent execution:**
- `state`: 'ready'
- `agent_id`: UUID from agents table
- `assignee_id`: same as agent_id
- `assignee_type`: 'agent'
- `execution_mode`: 'agent'

**Agent IDs:**
- Echo: `0d72b1b5-a98e-4356-bf52-f654d0509dc4`
- Claude: (check registry)

---

## Success Criteria

| Test | Pass Criteria |
|------|---------------|
| 2. Echo Agent | state='done', no SSH timeout |
| 3. Claude Agent | API called, outputs has response |
| 4. Polling Mode | Auto-pickup works |
| 5. Multi-VM | 5 parallel completions |
| 6. Workflow | step_executions populated |
