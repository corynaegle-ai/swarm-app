# FORGE Agent Retry Logic - E2E Test

## Objective

Create and execute a test ticket that triggers the FORGE agent's internal retry loop by causing intentional validation failures, then verify the agent self-corrects before reporting to the orchestrator.

## Prerequisites

- DEV droplet: 134.199.235.140
- FORGE agent deployed with retry logic: `/opt/swarm/agents/coder/index.js`
- Code validator module: `/opt/swarm/agents/coder/lib/code-validator.js`
- Test repo available: `https://github.com/corynaegle-ai/swarm-test-repo`

---

## Step 1: Verify Platform API is Running

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && pm2 list | grep swarm-platform'
```

Expected: `swarm-platform-dev` status `online`

---

## Step 2: Create Test Ticket via API

Create a ticket designed to challenge the LLM and potentially trigger validation errors:

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'curl -s -X POST http://localhost:3001/api/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-jwt-token-dev" \
  -d '\''
{
  "title": "RETRY-TEST: Complex async function with error handling",
  "description": "Create a Node.js module that implements a retry wrapper for async functions. The module should handle edge cases that commonly cause syntax errors:\n\n1. Nested async/await with try-catch\n2. Arrow functions with implicit returns\n3. Template literals with expressions\n4. Destructuring in function parameters\n5. Optional chaining and nullish coalescing\n\nIMPORTANT: This is a test to verify retry logic. Generate complex code that exercises the validator.",
  "acceptance_criteria": [
    "Module exports a retryAsync(fn, maxRetries, delayMs) function",
    "Handles both sync and async function inputs",
    "Implements exponential backoff",
    "Returns detailed error info on final failure",
    "All code passes ESLint with no errors",
    "No TypeScript errors if .ts file"
  ],
  "repo_url": "https://github.com/corynaegle-ai/swarm-test-repo",
  "branch": "test-retry-logic",
  "file_paths": ["src/utils/retry-wrapper.js"],
  "project_id": "7874e840-eb1e-44b1-b690-a84f05ec308f",
  "priority": "high",
  "tags": ["test", "retry-validation"]
}'\'' | jq .'
```

Record the returned ticket ID: `__TICKET_ID__`

---

## Step 3: Trigger Agent Execution

Option A - Via Engine (if running):
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'curl -s -X POST http://localhost:3002/api/execute \
  -H "Content-Type: application/json" \
  -d "{\"ticketId\": \"__TICKET_ID__\"}" | jq .'
```

Option B - Direct agent test (standalone):
```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
  cd /opt/swarm/agents/coder && \
  TICKET_API_URL=http://localhost:3001 \
  ANTHROPIC_API_KEY=$(cat /opt/swarm/.env | grep ANTHROPIC | cut -d= -f2) \
  GITHUB_TOKEN=$(cat /opt/swarm/.env | grep GITHUB_TOKEN | cut -d= -f2) \
  node index.js --ticket-id __TICKET_ID__ --dry-run 2>&1 | head -100'
```

---

## Step 4: Monitor for Retry Behavior

### Watch Real-Time Logs

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
  pm2 logs swarm-engine --lines 50 | grep -E "attempt|retry|validation|FORGE"'
```

### Check Activity Log for Ticket

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && \
  PGPASSWORD=swarm_dev_password psql -h localhost -U swarm_dev -d swarm_dev -c "
    SELECT event_type, metadata->>'attempt' as attempt, metadata->>'status' as status, created_at 
    FROM ticket_activity 
    WHERE ticket_id = '\''__TICKET_ID__'\'' 
    ORDER BY created_at DESC 
    LIMIT 20;
  "'
```

---

## Step 5: Verify Retry Indicators

### Success Indicators (retry worked)

Look for these patterns in logs:

```
✓ "Starting generation attempt" with attempt > 1
✓ "Validation failed" followed by retry  
✓ "Validation passed" on attempt 2 or 3
✓ Final result includes: attempts: 2 (or 3)
✓ attemptHistory array with error details from failed attempts
```

### Failure Indicators (retry exhausted)

```
✓ "Validation failed after 3 attempts"
✓ errorType: "validation_exhausted"
✓ attemptHistory shows 3 entries with errors
```

---

## Step 6: Query Final Ticket State

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'curl -s http://localhost:3001/api/tickets/__TICKET_ID__ \
  -H "Authorization: Bearer test-jwt-token-dev" | jq ".ticket.status, .ticket.metadata"'
```

Expected fields in metadata:
- `attempts`: Number of generation attempts (1-3)
- `attemptHistory`: Array of attempt details
- `prUrl`: If successful, the created PR

---

## Step 7: Cleanup Test Ticket

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'curl -s -X DELETE http://localhost:3001/api/tickets/__TICKET_ID__ \
  -H "Authorization: Bearer test-jwt-token-dev" | jq .'
```

---

## Alternative: Guaranteed Failure Ticket

If you want to guarantee validation failures to test max retries:

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'curl -s -X POST http://localhost:3001/api/tickets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-jwt-token-dev" \
  -d '\''
{
  "title": "RETRY-TEST: Impossible validation requirements",
  "description": "Create a JavaScript file that:\n1. Uses TypeScript syntax (will fail JS validation)\n2. Has intentional syntax that looks valid but isnt\n3. Uses undefined variables\n\nThis ticket is designed to exhaust retry attempts for testing purposes.",
  "acceptance_criteria": [
    "Use TypeScript generics in a .js file",
    "Include async/await without proper function wrapping"
  ],
  "repo_url": "https://github.com/corynaegle-ai/swarm-test-repo",
  "branch": "test-retry-exhaustion",
  "file_paths": ["src/impossible.js"],
  "project_id": "7874e840-eb1e-44b1-b690-a84f05ec308f",
  "priority": "low",
  "tags": ["test", "retry-exhaustion"]
}'\'' | jq .'
```

---

## Acceptance Criteria Checklist

| Criteria | Status |
|----------|--------|
| Ticket created successfully | ⬜ |
| Agent picks up ticket | ⬜ |
| First attempt triggers validation | ⬜ |
| Validation errors detected | ⬜ |
| Retry prompt includes error context | ⬜ |
| Second attempt shows in logs | ⬜ |
| Either: validation passes on retry | ⬜ |
| Or: 3 attempts exhausted with proper error | ⬜ |
| attemptHistory populated in response | ⬜ |
| Activity events logged to PostgreSQL | ⬜ |

---

## Troubleshooting

### Agent not picking up ticket
```bash
# Check engine is running
pm2 status swarm-engine

# Check ticket is in correct status
psql -c "SELECT status FROM tickets WHERE id = '__TICKET_ID__'"
```

### No retry behavior visible
```bash
# Verify retry config in agent
grep -A5 "RETRY_CONFIG" /opt/swarm/agents/coder/index.js

# Check validator is loaded
node -e "require('/opt/swarm/agents/coder/lib/code-validator.js')"
```

### Validation always passes (no retry needed)
- Use the "Guaranteed Failure Ticket" option above
- Or modify ticket to request TypeScript in .js file
