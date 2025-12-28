# HITL Phase 6: Agent Execution Wiring

## Context

HITL flow reaches `approved` state with a `spec_card` JSON. The `start-build` endpoint exists but only transitions state - it doesn't trigger actual execution.

**Completed Infrastructure:**
- ✅ SwarmEngine at `/opt/swarm/engine/lib/engine.js` - polls tickets, dispatches to VMs
- ✅ `run-ticket.js` CLI - works standalone
- ✅ `POST /api/hitl/:id/start-build` - transitions to `building` state
- ✅ Tickets table in `/opt/swarm-platform/data/swarm.db`

**Missing:**
- ⬜ Ticket generator (spec_card → tickets in DB)
- ⬜ Engine client (platform → engine communication)
- ⬜ Wiring in start-build route

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  HITL Session (approved state)                              │
│  spec_card JSON contains features/requirements              │
└─────────────────────┬───────────────────────────────────────┘
                      │ POST /api/hitl/:id/start-build
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Ticket Generator Service                                │
│  - Parse spec_card JSON                                     │
│  - Create parent ticket (epic)                              │
│  - Create child tickets for each feature                    │
│  - Insert into tickets table with session_id reference      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Engine Trigger                                          │
│  - Either: HTTP call to engine API                          │
│  - Or: Direct import of SwarmEngine                         │
│  - Or: Set ticket status='ready' and let engine poll        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. SwarmEngine (already exists)                            │
│  - Polls for ready tickets                                  │
│  - Dispatches to VMs                                        │
│  - Updates ticket status on completion                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Ticket Generator Service

Create `/opt/swarm-platform/services/ticket-generator.js`

### Input: spec_card JSON structure
```json
{
  "name": "Project Name",
  "description": "...",
  "features": [
    {
      "title": "Feature 1",
      "description": "...",
      "acceptance_criteria": ["...", "..."]
    }
  ],
  "technical_requirements": ["...", "..."],
  "repository": "owner/repo"
}
```

### Output: Tickets in DB
```sql
-- Parent ticket (epic)
INSERT INTO tickets (id, session_id, type, title, description, status, parent_id)
VALUES ('TKT-001', 'session-uuid', 'epic', 'Project Name', '...', 'ready', NULL);

-- Child tickets (one per feature)
INSERT INTO tickets (id, session_id, type, title, description, status, parent_id, acceptance_criteria)
VALUES ('TKT-002', 'session-uuid', 'feature', 'Feature 1', '...', 'blocked', 'TKT-001', '["..."]');
```

### Function Signature
```javascript
/**
 * Generate tickets from approved spec card
 * @param {string} sessionId - HITL session ID
 * @param {object} specCard - Parsed spec_card JSON
 * @param {string} tenantId - For multi-tenant isolation
 * @returns {object} { epicId, ticketIds: string[], count: number }
 */
async function generateTickets(sessionId, specCard, tenantId) {
  // 1. Validate spec_card structure
  // 2. Generate ticket IDs (TKT-XXX format)
  // 3. Create epic ticket
  // 4. Create feature tickets with parent reference
  // 5. Return created ticket info
}
```

---

## Step 2: Verify/Create Tickets Table Schema

Check existing schema in `/opt/swarm-platform/data/swarm.db`:

```sql
-- Required columns (verify or add)
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  session_id TEXT,           -- Link to HITL session
  tenant_id TEXT,
  type TEXT,                 -- 'epic', 'feature', 'task', 'bug'
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,  -- JSON array
  status TEXT DEFAULT 'pending',  -- pending, ready, claimed, running, completed, failed
  parent_id TEXT,            -- For epic→feature hierarchy
  assigned_vm TEXT,
  branch_name TEXT,
  pr_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
```

---

## Step 3: Wire start-build Route

Update `/opt/swarm-platform/routes/hitl.js` POST `/:sessionId/start-build`:

```javascript
const { generateTickets } = require('../services/ticket-generator');

router.post('/:sessionId/start-build', async (req, res) => {
  const { confirmed } = req.body;
  if (!confirmed) {
    return res.status(400).json({ error: 'User confirmation required' });
  }

  const db = getDb();
  const session = db.prepare('SELECT * FROM hitl_sessions WHERE id = ?').get(req.params.sessionId);
  
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.state !== 'approved') {
    return res.status(400).json({ error: 'Session must be approved', currentState: session.state });
  }

  try {
    // 1. Parse spec card
    const specCard = JSON.parse(session.spec_card);
    
    // 2. Generate tickets
    const result = await generateTickets(session.id, specCard, session.tenant_id);
    
    // 3. Transition to building state
    db.prepare(`
      UPDATE hitl_sessions 
      SET state = 'building', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.sessionId);

    // 4. Broadcast update
    broadcast.sessionUpdate(req.params.sessionId, 'building', 90);

    res.json({ 
      success: true, 
      state: 'building',
      epic_id: result.epicId,
      ticket_count: result.count,
      message: `Created ${result.count} tickets. Engine will pick them up.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## Step 4: Engine Polling (Already Works)

SwarmEngine at `/opt/swarm/engine/lib/engine.js` already polls for `status='ready'` tickets.

Verify the poll query matches our tickets table:
```javascript
// In engine.js _prepareStatements()
this.stmts.getReadyTickets = this.ticketsDb.prepare(`
  SELECT * FROM tickets 
  WHERE status = 'ready' 
  ORDER BY created_at ASC 
  LIMIT ?
`);
```

---

## Step 5: Progress Updates (Optional Enhancement)

Add WebSocket broadcasts as tickets complete:

```javascript
// In engine after ticket completion
broadcast.ticketUpdate(sessionId, ticketId, 'completed');
broadcast.sessionProgress(sessionId, calculateProgress(sessionId));
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `/opt/swarm-platform/services/ticket-generator.js` | CREATE |
| `/opt/swarm-platform/routes/hitl.js` | MODIFY start-build |
| `/opt/swarm-platform/db/index.js` | VERIFY tickets schema |
| `/opt/swarm/engine/lib/engine.js` | VERIFY poll query |

---

## Testing

```bash
# 1. Create approved session with spec_card
curl -X POST http://localhost:8080/api/hitl \
  -H "Content-Type: application/json" \
  -d '{"project_name":"Test","description":"Test project"}'

# 2. Manually set to approved with spec_card (or go through flow)
sqlite3 /opt/swarm-platform/data/swarm.db "UPDATE hitl_sessions SET state='approved', spec_card='{\"name\":\"Test\",\"features\":[{\"title\":\"F1\",\"description\":\"Feature 1\"}]}' WHERE id='<session-id>'"

# 3. Trigger build
curl -X POST http://localhost:8080/api/hitl/<session-id>/start-build \
  -H "Content-Type: application/json" \
  -d '{"confirmed":true}'

# 4. Verify tickets created
sqlite3 /opt/swarm-platform/data/swarm.db "SELECT id, type, title, status FROM tickets WHERE session_id='<session-id>'"
```

---

## Success Criteria

- [ ] `generateTickets()` creates epic + feature tickets from spec_card
- [ ] Tickets appear in DB with correct session_id and parent relationships
- [ ] start-build returns ticket count and epic ID
- [ ] SwarmEngine picks up ready tickets (verify with logs)
- [ ] Session transitions through building → completed when all tickets done

---

## Session Notes Location

Update `/opt/swarm-specs/session-notes/current.md` with progress.
