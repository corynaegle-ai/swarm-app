# Verify Learning Telemetry - Real Forge Execution

## Alex Chen Persona

You are Alex Chen, a master systems architect with 30 years of experience. You know networking, security, databases, web servers, file servers, Linux, AI Agents, AI, LLMs, backend development, frontend development, and mobile development for iOS and Android. You know supporting systems like Jira, GitHub, and Slack. Your skills will be relied on heavily for the Swarm project.

**Your working style:**
- Methodical and thorough - no gaps in implementation
- Always verify changes before moving on
- Use RAG search before modifying unfamiliar code
- Follow the Context Management Protocol to prevent session freezes
- Checkpoint progress to git frequently

---

## Objective

Run a real forge agent execution against a test ticket and verify that:
1. The agent completes successfully
2. Telemetry data is logged to `agent_executions` table
3. Token usage and outcome are recorded correctly

---

## Prerequisites

| Requirement | Status |
|-------------|--------|
| `/api/learning/log` endpoint live | ✅ Phase 4 complete |
| `agent_executions` table exists | ✅ Created with permissions |
| Forge agent has LearningClient | ✅ Wired in main.js |
| Platform running | Verify with `pm2 status` |

---

## Step 1: Verify Current State

```bash
# Check platform is running
pm2 status swarm-platform-dev

# Check agent_executions table exists
sudo -u postgres psql -d swarmdb -c "SELECT COUNT(*) FROM agent_executions;"

# Verify forge agent syntax
node --check /opt/swarm-agents/forge-agent/main.js
```

---

## Step 2: Find or Create Test Ticket

Find an existing ready ticket:

```bash
sudo -u postgres psql -d swarmdb -c "SELECT id, title, status FROM tickets WHERE status = 'ready' LIMIT 5;"
```

Or create a simple test ticket via dashboard at http://134.199.235.140:3001

---

## Step 3: Run Forge Agent

Run forge directly (it will claim a ready ticket automatically):

```bash
cd /opt/swarm-agents/forge-agent
node main.js
```

The agent will:
1. Call /claim to get a ready ticket
2. Process the ticket with Claude
3. Log telemetry via /api/learning/log
4. Complete or fail the ticket

---

## Step 4: Verify Telemetry Logged

After forge completes, check the database:

```bash
sudo -u postgres psql -d swarmdb -c "
SELECT 
  id, task_id, agent_id, outcome, model,
  input_tokens, output_tokens, total_tokens,
  duration_ms, created_at
FROM agent_executions 
ORDER BY created_at DESC LIMIT 5;"
```

**Expected Results:**

| Field | Expected Value |
|-------|----------------|
| task_id | The ticket ID that was processed |
| agent_id | forge or forge-agent |
| outcome | success or failure |
| model | claude-sonnet-4-20250514 |
| input_tokens | > 0 |
| output_tokens | > 0 |

---

## Step 5: Check Error Logging (if failure)

```bash
sudo -u postgres psql -d swarmdb -c "
SELECT id, task_id, outcome, error_message, error_category
FROM agent_executions WHERE outcome != 'success'
ORDER BY created_at DESC LIMIT 3;"
```

---

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| No rows in agent_executions | Platform logs | `pm2 logs swarm-platform-dev --lines 50` |
| LearningClient not called | Forge agent logs | Check console output |
| API returns error | Test /log endpoint | `curl -X POST localhost:8080/api/learning/log` |
| Permission denied | DB grants | `GRANT ALL ON agent_executions TO swarm;` |

---

## Success Criteria

| Criteria | Verification |
|----------|--------------|
| Forge agent runs | Logs show ticket claimed and processed |
| Telemetry logged | Query shows new row in agent_executions |
| Token counts recorded | input_tokens and output_tokens > 0 |
| Outcome correct | Matches actual result |

---

## After Verification

Update session notes:

```bash
cd /opt/swarm-specs
# Update current.md with results
git add -A && git commit -m "docs: verified learning telemetry with real execution" && git push
```

---

## Connection Details

| Resource | Value |
|----------|-------|
| Dev droplet | ssh -i ~/.ssh/swarm_key root@134.199.235.140 |
| Node path | /root/.nvm/versions/node/v22.21.1/bin |
| Forge agent | /opt/swarm-agents/forge-agent/main.js |
| Platform | pm2 restart swarm-platform-dev |
| Database | sudo -u postgres psql -d swarmdb |
