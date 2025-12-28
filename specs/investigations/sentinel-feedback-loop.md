# Investigation: Sentinel Feedback Loop & Forge Agent Retry System

## Problem Statement

When sentinel agents reject PRs, forge agents should:
1. Receive the feedback about why the PR was rejected
2. Retry the ticket with the feedback incorporated
3. Store rejection patterns in a learning feedback system for continuous improvement

Currently, tickets go to `sentinel_failed` state and stay there. The feedback loop is broken.

## Investigation Goals

1. **Find existing retry logic** - Code that transitions `sentinel_failed` → `ready` with feedback
2. **Find learning feedback system** - Code that stores sentinel rejection patterns
3. **Find unpromoted code** - Staged implementations in `/opt/swarm-app/docs/`, `/opt/swarm-specs/patches/`, or other locations
4. **Deploy missing components** - Get the full loop working

## Step 1: Query RAG for Feedback Loop Code

```bash
# On dev droplet (134.199.235.140)
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "sentinel feedback loop retry forge agent rejection learning", "limit": 10}' | jq -r '.results[] | "FILE: " + .file_path + "\n" + .content[:500] + "\n---"'
```

```bash
# Search for retry/rework logic
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "sentinel_failed rework retry ticket state transition feedback_for_agent", "limit": 10}' | jq -r '.results[] | "FILE: " + .file_path + "\n" + .content[:500] + "\n---"'
```

```bash
# Search for learning system
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "learning feedback system agent improvement pattern storage embedding", "limit": 10}' | jq -r '.results[] | "FILE: " + .file_path + "\n" + .content[:500] + "\n---"'
```

## Step 2: Search for Unpromoted Code

```bash
# Check swarm-app docs folder (known location for staged code)
ls -la /opt/swarm-app/docs/*.js 2>/dev/null
grep -r "sentinel_failed\|feedback_for_agent\|learning" /opt/swarm-app/docs/ 2>/dev/null | head -30

# Check swarm-specs patches
ls -la /opt/swarm-specs/patches/
grep -r "retry\|rework\|feedback" /opt/swarm-specs/patches/ 2>/dev/null | head -30

# Check for ticket-lifecycle module (referenced in engine.js errors)
find /opt -name "ticket-lifecycle.js" 2>/dev/null
cat /opt/swarm-platform/lib/ticket-lifecycle.js 2>/dev/null | head -100

# Check swarm-app platform lib
ls -la /opt/swarm-app/apps/platform/lib/ 2>/dev/null
```

## Step 3: Check Database for Feedback Tables

```bash
# Check for learning/feedback tables
sudo -u postgres psql -d swarmdb -c "\dt *feedback*"
sudo -u postgres psql -d swarmdb -c "\dt *learning*"
sudo -u postgres psql -d swarmdb -c "\dt *pattern*"

# Check ticket table for feedback columns
sudo -u postgres psql -d swarmdb -c "\d tickets" | grep -i feedback

# Check for sentinel_reviews table
sudo -u postgres psql -d swarmdb -c "\dt *sentinel*"
sudo -u postgres psql -d swarmdb -c "\dt *review*"
```

## Step 4: Search Engine Code for Missing Transitions

```bash
# Check current engine for any retry logic
grep -n "sentinel_failed\|rework\|retry\|feedback_for_agent" /opt/swarm/engine/lib/engine.js

# Check verifier for feedback storage
grep -rn "learning\|feedback\|pattern" /opt/swarm-verifier/src/ 2>/dev/null | head -30

# Check for cascade/unblock logic (mentioned in engine errors)
grep -n "cascade\|unblock" /opt/swarm/engine/lib/engine.js | head -20
```

## Step 5: Check Specs for Designed but Unimplemented Features

```bash
# Search specs for feedback loop design
grep -rn "feedback loop\|learning system\|retry workflow" /opt/swarm-specs/specs/ 2>/dev/null | head -20
grep -rn "feedback loop\|learning system\|retry workflow" /opt/swarm-specs/documentation/ 2>/dev/null | head -20

# Check review agent spec specifically
cat /opt/swarm-specs/specs/review-agent-spec.md 2>/dev/null | grep -A 20 "REJECT\|retry\|rework"
```

## Expected Findings

Based on the architecture, we should find:

### 1. Retry Workflow Code
```javascript
// Expected: Method to transition sentinel_failed → ready
async requeueForRework(ticketId, feedback) {
    await this.pgPool.query(`
        UPDATE tickets 
        SET state = 'ready',
            rework_count = COALESCE(rework_count, 0) + 1,
            sentinel_feedback = $2,
            assignee_id = NULL,
            vm_id = NULL
        WHERE id = $1
    `, [ticketId, JSON.stringify(feedback)]);
}
```

### 2. Learning Feedback Storage
```javascript
// Expected: Store patterns for agent learning
async storeLearningFeedback(ticketId, sentinelResult) {
    await this.pgPool.query(`
        INSERT INTO agent_learning (
            ticket_id, issue_category, issue_pattern, 
            file_type, severity, suggestion
        ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [...]);
}
```

### 3. Agent Context Enhancement
```javascript
// Expected: Inject learning into forge agent prompts
async getAgentContext(ticketId) {
    // Get past failures for similar tickets
    const patterns = await this.getLearningPatterns(ticket);
    return {
        ...ticket,
        avoidPatterns: patterns,
        previousFeedback: ticket.sentinel_feedback
    };
}
```

## Implementation Plan (if code not found)

### Phase 1: Basic Retry Loop
1. Add `requeueForRework()` method to engine
2. Add `sentinel_feedback` column to tickets table
3. Add `rework_count` column with max retry limit (3)
4. Modify `setSentinelFailed()` to auto-requeue if under limit

### Phase 2: Learning System
1. Create `agent_learning` table
2. Store all sentinel feedback with categorization
3. Create embedding index for semantic similarity
4. Query similar patterns when generating agent prompts

### Phase 3: Agent Enhancement
1. Modify forge agent to receive and use feedback
2. Inject "avoid these patterns" into prompts
3. Track improvement metrics over time

## Commands to Run Investigation

```bash
# Full investigation script - run on dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140 << 'INVESTIGATION'
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

echo "=== RAG SEARCH: Feedback Loop ==="
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "sentinel feedback retry rework forge agent", "limit": 5}' | jq -r '.results[] | .file_path'

echo -e "\n=== RAG SEARCH: Learning System ==="
curl -s -X POST http://localhost:8082/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "learning feedback pattern storage agent improvement", "limit": 5}' | jq -r '.results[] | .file_path'

echo -e "\n=== Staged Code in swarm-app/docs ==="
ls -la /opt/swarm-app/docs/*.js 2>/dev/null || echo "No JS files"

echo -e "\n=== Ticket Lifecycle Module ==="
find /opt -name "*lifecycle*.js" -o -name "*feedback*.js" 2>/dev/null

echo -e "\n=== Database Tables ==="
sudo -u postgres psql -d swarmdb -c "\dt" | grep -i "learn\|feedback\|pattern\|sentinel"

echo -e "\n=== Ticket Table Columns ==="
sudo -u postgres psql -d swarmdb -c "\d tickets" | grep -i "feedback\|rework\|retry"

echo -e "\n=== Engine Retry Logic ==="
grep -n "rework\|retry\|requeue\|feedback_for_agent" /opt/swarm/engine/lib/engine.js | head -10

INVESTIGATION
```

## Success Criteria

- [ ] Find existing retry/rework code
- [ ] Find learning feedback system code
- [ ] Identify what's staged vs deployed
- [ ] Create deployment plan for missing pieces
- [ ] Test full loop: sentinel_failed → ready → in_progress → ... → merged
