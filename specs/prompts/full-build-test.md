# Continuation Prompt: Full Build Test - Process 12 Tickets End-to-End

## Context
Session: December 23, 2025
Quality gates validated - 12 tickets with concrete file paths ready for execution.

**Test Session:** `test-qg2-1766467131`
**Project ID:** `cf61a32b-b45f-448c-b9fa-4e566e1855af`
**Tickets:** 12 ready (all have `files_hint`, mix of `files_to_create` and `files_to_modify`)

---

## Task: Run Full Build Test

### Pre-Flight Checks

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Verify tickets are in ready state
sudo -u postgres psql -d swarmdb -c "
SELECT state, COUNT(*) 
FROM tickets 
WHERE design_session = 'test-qg2-1766467131'
GROUP BY state;"

# Check engine is running
pm2 list | grep swarm-engine

# Verify ANTHROPIC_API_KEY is set
grep ANTHROPIC_API_KEY /opt/swarm-app/ecosystem.config.js | head -1
```

### Start Engine Processing

```bash
# Restart engine to pick up tickets
pm2 restart swarm-engine

# Watch logs in real-time (Ctrl+C to stop)
pm2 logs swarm-engine --lines 20
```

### Monitor Progress

```bash
# Check ticket states as they process
watch -n 10 'sudo -u postgres psql -d swarmdb -c "
SELECT state, COUNT(*) as count
FROM tickets 
WHERE design_session = '\''test-qg2-1766467131'\''
GROUP BY state
ORDER BY count DESC;"'
```

### Expected State Transitions

| State | Meaning |
|-------|---------|
| `ready` | Waiting for engine pickup |
| `in_progress` | Agent working on ticket |
| `needs_review` | Agent completed, awaiting review |
| `on_hold` | Agent failed, needs intervention |
| `done` | Ticket complete and merged |

### Success Criteria

- [ ] All 12 tickets transition from `ready` → `in_progress`
- [ ] Agents generate files (check logs for "Wrote file")
- [ ] PRs created on GitHub (check logs for "PR created")
- [ ] Zero "No files generated" errors
- [ ] Most tickets reach `needs_review` or `done`

### Troubleshooting

```bash
# If tickets stuck in ready
pm2 logs swarm-engine --lines 100 | grep -E "(error|Error|failed|claim)"

# Check specific ticket
sudo -u postgres psql -d swarmdb -c "
SELECT id, title, state, error_message, updated_at
FROM tickets 
WHERE design_session = 'test-qg2-1766467131'
AND state = 'on_hold';"

# View agent activity
sudo -u postgres psql -d swarmdb -c "
SELECT LEFT(title, 30) as ticket, state, 
       rag_context->'files_to_create' as create,
       rag_context->'files_to_modify' as modify
FROM tickets
WHERE design_session = 'test-qg2-1766467131'
ORDER BY updated_at DESC
LIMIT 10;"
```

### After Test Complete

```bash
# Summary of results
sudo -u postgres psql -d swarmdb -c "
SELECT state, COUNT(*) as count,
       ROUND(COUNT(*) * 100.0 / 12, 1) as pct
FROM tickets 
WHERE design_session = 'test-qg2-1766467131'
GROUP BY state
ORDER BY count DESC;"

# Check for any errors
sudo -u postgres psql -d swarmdb -c "
SELECT LEFT(title, 40) as title, LEFT(error_message, 60) as error
FROM tickets 
WHERE design_session = 'test-qg2-1766467131'
AND error_message IS NOT NULL;"
```

---

## Environment Reference

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| Node Path | /root/.nvm/versions/node/v22.21.1/bin |
| Database | `sudo -u postgres psql -d swarmdb` |
| Engine Logs | `pm2 logs swarm-engine` |
| Platform Logs | `pm2 logs swarm-platform-dev` |

---

## Session Notes
Update `/opt/swarm-specs/session-notes/current.md` via git before ending.

**Goal:** Validate end-to-end flow: tickets with quality gates → agent execution → file generation → PR creation.
