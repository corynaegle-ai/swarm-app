# Execution Engine Testing Prompt

**Date:** 2025-12-14
**Priority:** HIGH
**Estimated Time:** 30-45 minutes

---

## Objective

Test and verify the Swarm Execution Engine can:
1. Execute single tickets via CLI
2. Run Claude-powered agents with API calls
3. Poll for and execute tickets automatically
4. Handle multiple VMs in parallel

---

## Prerequisites

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH
```

---

## Test 1: Verify Engine Status

```bash
swarm-engine status
swarm-engine --help
```

**Expected:** CLI responds, shows available commands.

---

## Test 2: Single Ticket Execution (Echo Agent)

```bash
# Check for existing test ticket
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT id, title, status, agent_id FROM tickets WHERE agent_id='echo' LIMIT 3;"

# If none exist, create one
sqlite3 /opt/swarm-tickets/data/swarm.db "INSERT INTO tickets (title, description, status, agent_id, tenant_id, priority) VALUES ('Echo Test', 'Test ticket for echo agent', 'open', 'echo', 'default', 'medium');"

# Get the ticket ID
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT id FROM tickets ORDER BY id DESC LIMIT 1;"

# Execute it
swarm-engine run-ticket <ID> --wait
```

**Expected:** Ticket executes, status changes to `completed`.

---

## Test 3: Claude Agent Execution

### 3a: Verify Claude agent exists
```bash
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name, type FROM agents WHERE name LIKE '%claude%' OR id LIKE '%claude%';"
```

### 3b: Check API key availability
```bash
# On droplet
echo $ANTHROPIC_API_KEY | head -c 20

# Or check in secrets
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT key, substr(value, 1, 20) FROM secrets WHERE key='ANTHROPIC_API_KEY';"
```

### 3c: Create Claude agent ticket
```bash
sqlite3 /opt/swarm-tickets/data/swarm.db "INSERT INTO tickets (title, description, status, agent_id, tenant_id, priority) VALUES ('Claude Test', 'Write a haiku about distributed systems', 'open', 'claude', 'default', 'medium');"

# Get ID and run
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT id FROM tickets ORDER BY id DESC LIMIT 1;"
swarm-engine run-ticket <ID> --wait
```

**Expected:** Claude API called, response generated, ticket completed.

---

## Test 4: Engine Polling Mode

### Terminal 1 - Start engine in foreground
```bash
swarm-engine start --foreground --max-vms=2
```

### Terminal 2 - Create open ticket
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sqlite3 /opt/swarm-tickets/data/swarm.db \"INSERT INTO tickets (title, description, status, agent_id, tenant_id, priority) VALUES ('Poll Test', 'Auto-picked up ticket', 'open', 'echo', 'default', 'medium');\""
```

**Expected:** Engine detects new ticket, spawns VM, executes, completes.

---

## Test 5: Multi-VM Parallel Execution

```bash
# Create 5 open tickets
for i in 1 2 3 4 5; do
  sqlite3 /opt/swarm-tickets/data/swarm.db "INSERT INTO tickets (title, description, status, agent_id, tenant_id, priority) VALUES ('Parallel Test $i', 'Parallel execution test', 'open', 'echo', 'default', 'medium');"
done

# Verify created
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT id, title, status FROM tickets WHERE title LIKE 'Parallel Test%';"

# Start engine with 5 VM capacity
swarm-engine start --foreground --max-vms=5
```

**Expected:** 
- All 5 tickets picked up
- 5 VMs spawn in parallel (or near-parallel)
- All complete without race conditions
- Check with: `sqlite3 ... "SELECT id, status FROM tickets WHERE title LIKE 'Parallel Test%';"`

---

## Test 6: Workflow Execution (if applicable)

```bash
# Check for workflows
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name FROM workflows LIMIT 5;"

# If workflow exists, create ticket with workflow_id
sqlite3 /opt/swarm-tickets/data/swarm.db "INSERT INTO tickets (title, description, status, execution_mode, workflow_id, tenant_id, priority) VALUES ('Workflow Test', 'Test workflow execution', 'open', 'workflow', '<WORKFLOW_ID>', 'default', 'medium');"

swarm-engine run-ticket <ID> --wait

# Verify logging
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT 1;"
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM step_executions ORDER BY started_at DESC LIMIT 5;"
```

**Expected:** workflow_runs and step_executions tables populated.

---

## Troubleshooting

### Engine won't start
```bash
# Check for existing processes
ps aux | grep swarm-engine
pm2 list

# Check logs
tail -50 /var/log/swarm-engine.log
```

### VM spawn failures
```bash
swarm-cleanup
ls /opt/swarm/snapshots/
```

### Database locked
```bash
fuser /opt/swarm-tickets/data/swarm.db
```

---

## Success Criteria

| Test | Pass Criteria |
|------|---------------|
| Engine Status | CLI responds |
| Single Ticket | Executes, status=completed |
| Claude Agent | API called, response generated |
| Polling Mode | Auto-detects and executes new tickets |
| Multi-VM | 5 tickets complete in parallel |
| Workflow | Logs to step_executions table |

---

## Post-Test Cleanup

```bash
swarm-cleanup
sqlite3 /opt/swarm-tickets/data/swarm.db "DELETE FROM tickets WHERE title LIKE '%Test%';"
```

---

## Key Files

| File | Purpose |
|------|---------|
| /opt/swarm/engine/lib/engine.js | Main SwarmEngine class |
| /opt/swarm/engine/lib/executor.js | StepExecutor - runs agents in VMs |
| /opt/swarm/engine/cli/swarm-engine.js | CLI entry point |
| /opt/swarm-tickets/data/swarm.db | Ticket store |
| /opt/swarm-registry/registry.db | Agent/workflow registry |
