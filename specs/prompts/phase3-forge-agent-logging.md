# Phase 3: Integrate Activity Logger into Forge Agent

## Context

Phase 1 validated the activity logging API endpoints work correctly.
Phase 2 created the reusable `activity-logger.js` helper library at:
`/opt/swarm-app/apps/agents/lib/activity-logger.js`

**Exports**:
```javascript
const { logActivity, logActivityFireAndForget, CATEGORIES } = require('./lib/activity-logger');
```

**Categories Available**:
```javascript
CATEGORIES = {
  TICKET_CLAIMED, CODE_GENERATION, FILE_CREATED, FILE_MODIFIED,
  GIT_OPERATION, PR_CREATED, API_CALL, API_RESPONSE, ERROR, COMPLETION
}
```

---

## Objective

Integrate the activity logger into the Forge Agent so that agent execution is automatically logged to the ticket activity timeline.

---

## Work Items

### 3.1 Locate Forge Agent Entry Point

Find the main forge-agent file:
```bash
ls -la /opt/swarm-app/apps/agents/
find /opt/swarm-app -name "*forge*" -type f 2>/dev/null | head -10
```

### 3.2 Add Logger Import

At the top of the forge agent file, add:
```javascript
const { logActivity, logActivityFireAndForget, CATEGORIES } = require('./lib/activity-logger');
```

### 3.3 Add Logging Calls at Key Points

Insert logging at these critical execution points:

| Event | Category | Example Message |
|-------|----------|-----------------|
| Ticket claimed | `TICKET_CLAIMED` | "Agent claimed ticket for processing" |
| Starting code generation | `CODE_GENERATION` | "Starting code generation" |
| File created | `FILE_CREATED` | "Created file: {filename}" |
| File modified | `FILE_MODIFIED` | "Modified file: {filename}" |
| Git branch created | `GIT_OPERATION` | "Created branch: {branch}" |
| Git commit | `GIT_OPERATION` | "Committed changes: {message}" |
| PR created | `PR_CREATED` | "Created PR #{number}" |
| Claude API call | `API_CALL` | "Calling Claude API" |
| Claude API response | `API_RESPONSE` | "Received Claude response" |
| Error occurred | `ERROR` | "Error: {message}" |
| Task completed | `COMPLETION` | "Task completed successfully" |

### 3.4 Example Integration Pattern

```javascript
async function processTicket(ticket) {
  const ticketId = ticket.id;
  const agentId = process.env.AGENT_ID || 'forge-agent-1';

  // Log ticket claimed
  logActivityFireAndForget(ticketId, agentId, CATEGORIES.TICKET_CLAIMED, 
    'Agent claimed ticket for processing', { vm_id: process.env.VM_ID });

  try {
    // Log code generation start
    logActivityFireAndForget(ticketId, agentId, CATEGORIES.CODE_GENERATION,
      'Starting code generation', { model: 'claude-sonnet-4-20250514' });

    const result = await generateCode(ticket);

    // Log file operations
    for (const file of result.files) {
      logActivityFireAndForget(ticketId, agentId, CATEGORIES.FILE_CREATED,
        `Created file: ${file.path}`, { size: file.content.length });
    }

    // Log completion
    logActivityFireAndForget(ticketId, agentId, CATEGORIES.COMPLETION,
      'Task completed successfully', { files_created: result.files.length });

  } catch (error) {
    // Log error (but don't let logging failure mask the real error)
    logActivityFireAndForget(ticketId, agentId, CATEGORIES.ERROR,
      `Error: ${error.message}`, { stack: error.stack?.slice(0, 500) });
    throw error;
  }
}
```

---

## Validation Commands

After integration, test with a real ticket:

```bash
# Check PM2 for forge agent
pm2 list | grep -i forge

# Trigger a test ticket (if applicable)
# Or check logs for activity logging
pm2 logs forge-agent --lines 20

# Verify in database
sudo -u postgres psql -d swarmdb -c "
  SELECT event_type, new_value, created_at 
  FROM ticket_events 
  WHERE metadata->>'agent_id' LIKE 'forge%'
  ORDER BY created_at DESC 
  LIMIT 10;
"
```

---

## Success Criteria

- [ ] Logger imported at top of forge agent file
- [ ] `TICKET_CLAIMED` logged when agent picks up work
- [ ] `CODE_GENERATION` logged before Claude API calls
- [ ] `FILE_CREATED`/`FILE_MODIFIED` logged for file operations
- [ ] `GIT_OPERATION` logged for git commands
- [ ] `ERROR` logged on failures (without breaking error handling)
- [ ] `COMPLETION` logged when task finishes
- [ ] All logs visible in `ticket_events` table

---

## Files to Modify

| File | Change |
|------|--------|
| Forge agent main file | Add import + logging calls |

---

## Important Notes

1. **Fire-and-forget**: Use `logActivityFireAndForget()` for all logging - never await logging in the critical path
2. **Don't break error handling**: Logging in catch blocks should not mask the original error
3. **Include metadata**: Add useful context like file names, model used, PR numbers
4. **Agent ID**: Use environment variable `AGENT_ID` if available, else default

---

## Environment Reference

- **DEV Droplet**: 134.199.235.140
- **Node Path**: `/root/.nvm/versions/node/v22.21.1/bin`
- **Platform API**: `http://localhost:8080`
- **Agent Auth Key**: `agent-internal-key-dev`
- **Database**: `swarmdb` (PostgreSQL)

---

## Estimated Time: 45-60 minutes
