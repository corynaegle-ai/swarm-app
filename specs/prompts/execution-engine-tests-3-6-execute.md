# Execute Execution Engine Tests 3-6

**Goal:** Complete remaining engine validation tests in a single focused session.
**Time Budget:** 25-30 minutes
**Prerequisites:** Tests 1-2 passed, host route fix applied, echo agent main.js renamed

---

## Quick Reference

| Resource | Value |
|----------|-------|
| Droplet | `ssh -i ~/.ssh/swarm_key root@146.190.35.235` |
| Echo Agent ID | `0d72b1b5-a98e-4356-bf52-f654d0509dc4` |
| PATH | `export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v22.12.0/bin:$PATH` |
| Platform DB | `/opt/swarm-platform/data/swarm.db` |
| Registry DB | `/opt/swarm-registry/registry.db` |

---

## Test 3: Claude Agent Execution

**Objective:** Verify Claude API integration works inside VM

```bash
# Setup
swarm-cleanup --force
echo $ANTHROPIC_API_KEY | head -c 20  # Verify key exists

# Get Claude agent ID
CLAUDE_ID=$(sqlite3 /opt/swarm-registry/registry.db "SELECT id FROM agents WHERE name LIKE '%claude%' LIMIT 1;")
echo "Claude ID: $CLAUDE_ID"

# Create ticket
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode, inputs) VALUES ('test-claude-001', 'test-project', 'Claude Test', 'Write a haiku about distributed systems', 'ready', '$CLAUDE_ID', '$CLAUDE_ID', 'agent', 'agent', '{\"prompt\":\"Write a haiku about distributed systems\"}');"

# Execute
swarm-engine run-ticket test-claude-001 --wait

# Verify
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT state, outputs, error FROM tickets WHERE id='test-claude-001';"
```

**Pass:** state='done', outputs contains haiku, no error

**If fails:**
- No Claude agent → Skip, note in session
- main.js missing → `mv index.js main.js` in agent dir
- API key missing → Check executor.js loadSecrets()

---

## Test 4: Engine Polling Mode

**Objective:** Engine auto-detects new tickets without manual trigger

**Terminal 1 - Start engine foreground:**
```bash
swarm-cleanup --force
swarm-engine start --foreground --max-vms=2
```

**Terminal 2 - Inject ticket while engine running:**
```bash
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-poll-001', 'test-project', 'Poll Test', 'Auto-pickup test', 'ready', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', '0d72b1b5-a98e-4356-bf52-f654d0509dc4', 'agent', 'agent');"
```

**Watch Terminal 1** for auto-detection and execution.

**Pass:** Engine detects ticket, spawns VM, completes without manual intervention

---

## Test 5: Multi-VM Parallel Execution

**Objective:** 5 VMs execute concurrently

```bash
swarm-cleanup --force
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id LIKE 'test-parallel%';"

# Create 5 tickets
ECHO_ID='0d72b1b5-a98e-4356-bf52-f654d0509dc4'
for i in 1 2 3 4 5; do
  sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, agent_id, assignee_id, assignee_type, execution_mode) VALUES ('test-parallel-00$i', 'test-project', 'Parallel Test $i', 'Parallel execution test', 'ready', '$ECHO_ID', '$ECHO_ID', 'agent', 'agent');"
done

# Run with 5 VM capacity
swarm-engine start --foreground --max-vms=5
# Wait for completions, then Ctrl+C

# Verify all done
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, state FROM tickets WHERE id LIKE 'test-parallel%';"
```

**Pass:** All 5 tickets state='done'

---

## Test 6: Workflow Execution

**Objective:** Workflow orchestration with step tracking

```bash
# Check if workflows exist
sqlite3 /opt/swarm-registry/registry.db "SELECT id, name FROM workflows LIMIT 3;"

# If none exist, skip and note. Otherwise:
WORKFLOW_ID=$(sqlite3 /opt/swarm-registry/registry.db "SELECT id FROM workflows LIMIT 1;")
echo "Workflow ID: $WORKFLOW_ID"

# Create workflow ticket
sqlite3 /opt/swarm-platform/data/swarm.db "INSERT INTO tickets (id, project_id, title, description, state, execution_mode, workflow_id) VALUES ('test-workflow-001', 'test-project', 'Workflow Test', 'Test workflow execution', 'ready', 'workflow', '$WORKFLOW_ID');"

# Execute
swarm-engine run-ticket test-workflow-001 --wait

# Verify step executions logged
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT 1;"
sqlite3 /opt/swarm-registry/registry.db "SELECT * FROM step_executions ORDER BY started_at DESC LIMIT 3;"
```

**Pass:** workflow_runs and step_executions tables populated

---

## Cleanup

```bash
swarm-cleanup --force
sqlite3 /opt/swarm-platform/data/swarm.db "DELETE FROM tickets WHERE id LIKE 'test-%';"
```

---

## Results Template

| Test | Status | Notes |
|------|--------|-------|
| 3. Claude Agent | ⬜ | |
| 4. Polling Mode | ⬜ | |
| 5. Multi-VM (5x) | ⬜ | |
| 6. Workflow | ⬜ | |

**Blockers Found:**
- (none yet)

**Session Notes Update:**
- Update `/opt/swarm-specs/session-notes/current.md` with results
- `cd /opt/swarm-specs && git add -A && git commit -m "Engine tests 3-6 results" && git push`
