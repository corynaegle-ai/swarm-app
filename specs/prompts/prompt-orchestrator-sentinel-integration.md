# Prompt: Orchestrator Sentinel Integration

## Context

During Phase 4 E2E testing, we discovered that the swarm-verifier service returns structured review results but does NOT update the Platform API ticket state. The orchestrator (swarm-engine) must bridge this gap.

## Problem Statement

Currently, after a Forge agent completes code generation and transitions a ticket to `needs_review`, nothing happens. The Sentinel review process is disconnected from the ticket lifecycle.

**Missing Integration**:
```
Forge completes → ticket.state = 'needs_review' → ??? → Sentinel reviews → ??? → ticket updated
```

**Required Integration**:
```
Forge completes → ticket.state = 'needs_review' → Orchestrator polls → 
  Calls POST /verify → Parses response → Updates ticket via Platform API
```

## Current Architecture

### Services Involved

| Service | Port | Role |
|---------|------|------|
| swarm-platform-dev | 8080 | Platform API - ticket CRUD |
| swarm-verifier | 8090 | Code review (static + sentinel) |
| swarm-engine | 3456 | Orchestrator - should bridge these |

### Verifier API Contract

```bash
POST http://localhost:8090/verify
Content-Type: application/json

{
  "ticket_id": "TKT-XXX",
  "repo_url": "https://github.com/org/repo",
  "branch_name": "feature/TKT-XXX-description",
  "phases": ["static", "automated", "sentinel"],
  "acceptance_criteria": ["criterion 1", "criterion 2"]
}
```

**Response (success)**:
```json
{
  "ticket_id": "TKT-XXX",
  "status": "passed",
  "phases_completed": ["static", "automated", "sentinel"],
  "results": {
    "sentinel": {
      "decision": "APPROVE",
      "score": 85,
      "issues": {...}
    }
  },
  "ready_for_pr": true,
  "commit_sha": "abc123"
}
```

**Response (failure)**:
```json
{
  "ticket_id": "TKT-XXX",
  "status": "failed",
  "failed_phase": "sentinel",
  "sentinel_decision": "REJECT",
  "sentinel_score": 25,
  "feedback_for_agent": [
    "CRITICAL [file.js:18]: Issue description",
    "MAJOR [file.js:11]: Another issue"
  ]
}
```

### Platform API Ticket Endpoints

```bash
# Get needs_review tickets
GET http://localhost:8080/api/tickets?state=needs_review

# Update ticket after review
PATCH http://localhost:8080/api/tickets/:id
{
  "state": "completed" | "sentinel_failed",
  "verification_status": "passed" | "failed",
  "sentinel_feedback": {...},
  "rejection_count": N
}
```

### Ticket State Machine

```
ready → assigned → in_progress → needs_review → 
  ├─ completed (if APPROVE)
  └─ sentinel_failed (if REJECT) → 
       ├─ ready (if rejection_count < max_attempts) [reassign to Forge]
       └─ human_review (if rejection_count >= max_attempts)
```

## Implementation Requirements

### 1. Add Sentinel Polling Loop to swarm-engine

Location: `/opt/swarm-engine/src/` (or wherever engine source lives)

```javascript
// Pseudo-code for sentinel review loop
async function sentinelReviewLoop() {
  const POLL_INTERVAL = 30000; // 30 seconds
  
  while (true) {
    try {
      // 1. Fetch tickets needing review
      const tickets = await fetch('http://localhost:8080/api/tickets?state=needs_review')
        .then(r => r.json());
      
      for (const ticket of tickets) {
        await processSentinelReview(ticket);
      }
    } catch (err) {
      console.error('[sentinel-loop] Error:', err.message);
    }
    
    await sleep(POLL_INTERVAL);
  }
}

async function processSentinelReview(ticket) {
  const { id, branch_name, project } = ticket;
  
  // 2. Get project details for repo_url
  const projectData = await fetch(`http://localhost:8080/api/projects/${project.id}`)
    .then(r => r.json());
  
  // 3. Call verifier with full payload
  const verifyResponse = await fetch('http://localhost:8090/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticket_id: id,
      repo_url: projectData.repo_url,
      branch_name: branch_name,
      phases: ['static', 'automated', 'sentinel'],
      acceptance_criteria: ticket.acceptance_criteria || []
    })
  }).then(r => r.json());
  
  // 4. Update ticket based on result
  await updateTicketFromReview(ticket, verifyResponse, projectData.settings);
}

async function updateTicketFromReview(ticket, review, projectSettings) {
  const maxAttempts = projectSettings?.max_review_attempts || 3;
  const newRejectionCount = (ticket.rejection_count || 0) + (review.status === 'failed' ? 1 : 0);
  
  let newState;
  if (review.status === 'passed') {
    newState = 'completed';  // Ready for PR/deploy
  } else if (newRejectionCount >= maxAttempts) {
    newState = 'human_review';  // Escalate
  } else {
    newState = 'sentinel_failed';  // Will be reassigned to Forge
  }
  
  await fetch(`http://localhost:8080/api/tickets/${ticket.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: newState,
      verification_status: review.status,
      sentinel_feedback: {
        decision: review.sentinel_decision,
        score: review.sentinel_score,
        feedback: review.feedback_for_agent,
        commit_sha: review.commit_sha
      },
      rejection_count: newRejectionCount
    })
  });
  
  console.log(`[sentinel] Ticket ${ticket.id}: ${review.status} → ${newState}`);
}
```

### 2. Add Reassignment Loop for Failed Reviews

When `sentinel_failed` tickets exist and `rejection_count < max_attempts`, transition back to `ready` for Forge to retry with feedback.

```javascript
async function reassignFailedTickets() {
  const failed = await fetch('http://localhost:8080/api/tickets?state=sentinel_failed')
    .then(r => r.json());
  
  for (const ticket of failed) {
    const project = await getProject(ticket.project_id);
    const maxAttempts = project.settings?.max_review_attempts || 3;
    
    if (ticket.rejection_count < maxAttempts) {
      // Reset for Forge retry - include feedback for context
      await fetch(`http://localhost:8080/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          state: 'ready',
          assignee_id: null,
          vm_id: null
          // Keep sentinel_feedback so Forge sees what to fix
        })
      });
      console.log(`[reassign] Ticket ${ticket.id} back to ready (attempt ${ticket.rejection_count + 1}/${maxAttempts})`);
    }
  }
}
```

### 3. Configuration

Add to swarm-engine config:

```javascript
module.exports = {
  // Existing config...
  
  SENTINEL_POLL_INTERVAL_MS: 30000,
  VERIFIER_URL: 'http://localhost:8090',
  PLATFORM_API_URL: 'http://localhost:8080',
  DEFAULT_REVIEW_PHASES: ['static', 'automated', 'sentinel'],
  REASSIGN_DELAY_MS: 60000  // Wait before reassigning failed tickets
};
```

## Files to Modify

1. **swarm-engine** - Add sentinel review loop
   - Check: `ls -la /opt/swarm-engine/` or `pm2 show swarm-engine`
   - Look for main entry point and add polling loop

2. **Platform API** - May need PATCH endpoint enhancement
   - Location: `/opt/swarm-app/apps/platform/routes/tickets*.js`
   - Ensure sentinel_feedback column accepts JSON

## Acceptance Criteria

1. [ ] Orchestrator polls for `needs_review` tickets every 30s
2. [ ] Calls POST /verify with correct payload (phases includes sentinel)
3. [ ] Updates ticket state based on review result:
   - APPROVE → `completed`
   - REJECT (under max) → `sentinel_failed`
   - REJECT (at max) → `human_review`
4. [ ] Stores sentinel_feedback JSON in ticket
5. [ ] Increments rejection_count on failures
6. [ ] Failed tickets reassigned to `ready` for Forge retry (with delay)
7. [ ] Logs review decisions for observability

## Test Verification

```bash
# 1. Create ticket in needs_review state
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "UPDATE tickets SET state = 'needs_review' WHERE id = 'TKT-E2E-IMPL-001'"

# 2. Watch orchestrator logs
pm2 logs swarm-engine --lines 50

# 3. Verify ticket updated
PGPASSWORD=swarm_dev_2024 psql -h localhost -U swarm -d swarmdb -c \
  "SELECT id, state, verification_status, rejection_count FROM tickets WHERE id = 'TKT-E2E-IMPL-001'"
```

## Reference Data

- Dev Droplet: 134.199.235.140
- Test Ticket: TKT-E2E-IMPL-001
- Test Branch: feature/TKT-E2E-IMPL-001-login
- Test Repo: https://github.com/corynaegle-ai/swarm-test-repo

---
*Created: 2025-12-26 | Phase 4 Follow-up*
