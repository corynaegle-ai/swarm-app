# Next Steps: FORGE Agent Retry Logic Verification

## Context

The FORGE agent retry logic has been implemented and deployed to the dev droplet (134.199.235.140). The implementation adds internal validation and self-correction before reporting failure to the orchestrator.

## Files Deployed

| File | Path | Purpose |
|------|------|---------|
| `code-validator.js` | `/opt/swarm/agents/coder/lib/` | Syntax, lint, type validation |
| `index.js` | `/opt/swarm/agents/coder/` | Updated with retry loop (750 lines) |

## Verification Steps

### 1. Syntax Check the Deployed Code

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && node --check /opt/swarm/agents/coder/index.js'
```

### 2. Verify Files Are in Place

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'ls -la /opt/swarm/agents/coder/lib/ && head -30 /opt/swarm/agents/coder/index.js'
```

### 3. Test Validator Module Standalone

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'cd /opt/swarm/agents/coder && node -e "
const v = require(\"./lib/code-validator.js\");
const testFiles = [{path: \"test.js\", content: \"const x = 1; console.log(x\"}];
v.validateSyntax(testFiles).then(console.log);
"'
```

Expected: Should return syntax error for missing closing paren.

### 4. Create Test Ticket for Retry Flow

Create a ticket in the system that will trigger validation failures:

```bash
curl -X POST http://134.199.235.140:8080/api/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Retry Logic",
    "description": "Create a simple function. IMPORTANT: For testing, intentionally generate code with a syntax error on first attempt.",
    "acceptance_criteria": ["Function compiles without errors", "Function returns expected value"],
    "repo_url": "https://github.com/corynaegle-ai/swarm-test-repo",
    "project_id": "test-project"
  }'
```

### 5. Monitor Agent Execution

Watch logs for retry behavior:

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'journalctl -f -u swarm-agent 2>/dev/null || tail -f /var/log/swarm-agent.log 2>/dev/null || echo "Check PM2: pm2 logs coder-agent"'
```

Look for:
- `"msg":"Starting generation attempt"` with attempt > 1
- `"msg":"Validation failed"` followed by retry
- `"msg":"Validation passed"` on successful retry
- `attempts` field in completion logs

### 6. Verify Attempt History in Response

After a ticket completes, check the response includes:
- `attempts: N` (number of attempts taken)
- `attemptHistory: [...]` (details per attempt)

## Acceptance Criteria Checklist

- [ ] Syntax errors trigger automatic retry with error in prompt
- [ ] Maximum 3 internal attempts before failing to orchestrator
- [ ] Git state is reset between attempts (no leftover bad code)
- [ ] Attempt history is included in success/failure response
- [ ] Non-retryable errors (API, network) fail immediately without retry
- [ ] Agent logs show retry activity at WARN level

## Rollback If Needed

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'ls /opt/swarm/agents/coder/*.bak* | tail -1 | xargs -I {} cp {} /opt/swarm/agents/coder/index.js'
```

## Related Files

- Design doc: `/Users/cory.naegle/projects/swarm-specs-local/designs/forge-agent-retry-logic.md`
- Implementation prompt: `/Users/cory.naegle/projects/swarm-specs-local/prompts/forge-agent-retry-implementation.md`
- Local copies: `/Users/cory.naegle/projects/swarm-specs-local/tmp/forge-retry/`
