# Execution Engine Testing - Tests 3-6

**Date:** 2025-12-14
**Previous Session:** Tests 1-2 passed. Blocking issues resolved.
**Estimated Time:** 25-30 minutes

---

## Completed

| Test | Status | Notes |
|------|--------|-------|
| Blocking | ✅ | Added host route `10.0.0.0/24` to spawn script |
| Test 2 | ✅ | Echo agent works, renamed index.js → main.js |

---

## Test 3: Claude Agent Execution

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH

# Find Claude agent
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name, path FROM agents WHERE name LIKE '%claude%';"

# Check API key is available
echo $ANTHROPIC_API_KEY | head -c 20

# Get Claude agent ID
CLAUDE_ID=$(sqlite3 /opt/swarm-registry/registry.db "SELECT id FROM agents WHERE name LIKE '%claude%' LIMIT 1;")
echo "Claude ID: $CLAUDE_ID"

# Verify Claude agent has main.js (not index.js)
ls -la $(sqlite3 /opt/swarm-registry/registry.db "SELECT path FROM agents WHERE name LIKE '%claude%' LIMIT 1;")/

# Create ticket
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode, inputs) VALUES ('test-claude-001', 'test-project', 'Claude Test', 'Write a haiku about distributed systems', 'ready', '$CLAUDE_ID', '$CLAUDE_ID', 'agent', 'agent', '{\"prompt\":\"Write a haiku about distributed systems\"}');"

# Execute
swarm-engine run-ticket test-claude-001 --wait

# Check result
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT state, outputs, error FROM tickets WHERE id='test-claude-001';"
```

**Expected:** Claude API called, outputs populated with haiku, state='done'

**Troubleshooting:**
- If "main.js not found" → rename entry point like echo agent
- If API key missing → check /opt/swarm/engine/lib/executor.js loadSecrets()

---

## Test 4: Engine Polling Mode

**Terminal 1 (engine in foreground):**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH
swarm-cleanup --force
swarm-engine start --foreground --max-vms=2
```

**Terminal 2 (inject ticket while engine running):**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:\$PATH && sqlite3 /opt/swarm-platform/data/swarm.db \"INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-poll-001', 'test-project', 'Poll Test', 'Auto-pickup test', 'ready', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', 'agent', 'agent');\""
```

**Watch Terminal 1** - engine should auto-detect and execute ticket.

**Expected:** Engine auto-detects ticket, spawns VM, executes, completes

---

## Test 5: Multi-VM Parallel Execution

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH

# Cleanup
swarm-cleanup --force
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id LIKE 'test-parallel%';"

# Create 5 tickets
ECHO_ID='0d72b1b5-a98e-4356-bf52-f654d0509dc4'
for i in 1 2 3 4 5; do
  sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-parallel-00$i', 'test-project', 'Parallel Test $i', 'Parallel execution test', 'ready', '$ECHO_ID', '$ECHO_ID', 'agent', 'agent');"
done

# Verify
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id LIKE 'test-parallel%';"

# Execute with 5 VM capacity (foreground to watch)
swarm-engine start --foreground --max-vms=5
# Let run until all complete, then Ctrl+C

# Check results
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id LIKE 'test-parallel%';"
```

**Expected:** 5 VMs spawn (possibly staggered), all tickets reach state='done'

---

## Test 6: Workflow Execution

```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH

# Check workflows exist
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name FROM workflows LIMIT 5;"

# If no workflows, skip this test or create one first
# Otherwise get workflow ID
WORKFLOW_ID=$(sqlite3 /opt/swarm-registry/registry.db "SELECT id FROM workflows LIMIT 1;")
echo "Workflow ID: $WORKFLOW_ID"

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
swarm-cleanup --force
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id LIKE 'test-%';"
```

---

## Success Criteria Summary

| Test | Pass Criteria |
|------|---------------|
| 3. Claude Agent | API called, haiku in outputs, state='done' |
| 4. Polling Mode | Auto-pickup works without manual trigger |
| 5. Multi-VM | 5 parallel completions |
| 6. Workflow | step_executions table populated |

---

## Key Learnings Applied

1. **Entry points:** Agents must have `main.js` (executor default)
2. **Host route:** Spawn script now adds `10.0.0.0/24` route automatically
3. **Echo agent ID:** `0d72b1b5-a98e-4356-bf52-f654d0509dc4`
