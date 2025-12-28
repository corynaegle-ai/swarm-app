# Ticket System Enhancement Implementation Prompt

## Overview
Enhance the Swarm ticket system to support full CRUD operations, dependency visualization, repository linking, and activity tracking. This brings the ticket UI to feature parity with professional ticketing systems like Jira.

---

## Current System Context

### Database Schema (SQLite - `/opt/swarm-ui/src/db.js`)

**tickets table:**
```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  state TEXT DEFAULT 'draft' CHECK(state IN (
    'draft', 'ready', 'blocked', 'on_hold', 'assigned', 
    'in_progress', 'in_review', 'changes_requested', 'done', 'cancelled'
  )),
  epic TEXT,
  estimated_scope TEXT CHECK(estimated_scope IN ('small', 'medium', 'large')),
  files_hint TEXT,
  assignee_id TEXT,
  assignee_type TEXT CHECK(assignee_type IN ('agent', 'human')),
  branch_name TEXT,
  pr_url TEXT,
  hold_reason TEXT,
  rejection_count INTEGER DEFAULT 0,
  repo_url TEXT,
  rag_context JSONB,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

**dependencies table:**
```sql
CREATE TABLE dependencies (
  ticket_id TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (ticket_id, depends_on),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (depends_on) REFERENCES tickets(id)
);
```

**events table (audit log):**
```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  actor_type TEXT CHECK(actor_type IN ('human', 'design_agent', 'worker_agent', 'review_agent', 'orchestrator', 'system')),
  previous_value TEXT,
  new_value TEXT,
  metadata TEXT,
  rationale TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);
```

### Key Files to Modify

| File | Purpose | Location |
|------|---------|----------|
| `api-server-dashboard.js` | Main API server | `/opt/swarm-ui/api-server-dashboard.js` |
| `src/pages/Tickets.jsx` | Ticket list & detail UI | `/opt/swarm-ui/src/pages/Tickets.jsx` |
| `src/hooks/useTickets.js` | Ticket data fetching hook | `/opt/swarm-ui/src/hooks/useTickets.js` |
| `src/db.js` | Database initialization | `/opt/swarm-ui/src/db.js` |

### Existing API Endpoints (in `api-server-dashboard.js`)

```javascript
GET  /api/tickets              // List all tickets
GET  /api/tickets/:id          // Get single ticket
POST /api/tickets              // Create ticket
POST /api/tickets/claim        // Agent claims ticket
POST /api/tickets/complete     // Agent completes ticket
POST /api/tickets/release      // Release ticket back to pool
```

---

## Implementation Requirements

### REQUIREMENT 1: Enhanced Ticket Detail API

**Endpoint:** `GET /api/tickets/:id?include=dependencies,events`

**Current Response:**
```json
{
  "id": "abc123",
  "title": "...",
  "description": "...",
  "state": "in_progress",
  "created_at": "2024-12-18T...",
  "updated_at": "2024-12-18T...",
  "branch_name": "ticket-abc123",
  "repo_url": "https://github.com/org/repo",
  "pr_url": null
}
```

**Required Response:**
```json
{
  "id": "abc123",
  "title": "...",
  "description": "...",
  "acceptance_criteria": "...",
  "state": "in_progress",
  "epic": "Authentication",
  "estimated_scope": "medium",
  "assignee_id": "forge-agent-001",
  "assignee_type": "agent",
  "branch_name": "ticket-abc123",
  "repo_url": "https://github.com/org/repo",
  "pr_url": null,
  "rejection_count": 1,
  "created_at": "2024-12-18T09:15:00Z",
  "updated_at": "2024-12-18T11:32:00Z",
  "blocked_by": [
    { "id": "xyz789", "title": "Setup database schema", "state": "done" }
  ],
  "blocks": [
    { "id": "def456", "title": "Add protected routes", "state": "blocked" },
    { "id": "ghi012", "title": "User profile page", "state": "blocked" }
  ],
  "events": [
    {
      "id": 1,
      "event_type": "state_changed",
      "actor_id": "forge-agent-001",
      "actor_type": "worker_agent",
      "previous_value": "ready",
      "new_value": "assigned",
      "created_at": "2024-12-18T10:00:00Z"
    }
  ]
}
```

**Implementation:**
```javascript
// In api-server-dashboard.js, modify GET /api/tickets/:id
app.get('/api/tickets/:id', (req, res) => {
  const { id } = req.params;
  const include = (req.query.include || '').split(',');
  
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  
  const response = { ...ticket };
  
  if (include.includes('dependencies')) {
    // Get tickets this one depends on (blocked_by)
    response.blocked_by = db.prepare(`
      SELECT t.id, t.title, t.state 
      FROM dependencies d 
      JOIN tickets t ON d.depends_on = t.id 
      WHERE d.ticket_id = ?
    `).all(id);
    
    // Get tickets that depend on this one (blocks)
    response.blocks = db.prepare(`
      SELECT t.id, t.title, t.state 
      FROM dependencies d 
      JOIN tickets t ON d.ticket_id = t.id 
      WHERE d.depends_on = ?
    `).all(id);
  }
  
  if (include.includes('events')) {
    response.events = db.prepare(`
      SELECT * FROM events 
      WHERE ticket_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all(id);
  }
  
  res.json(response);
});
```

---

### REQUIREMENT 2: Ticket Edit Endpoint

**Endpoint:** `PATCH /api/tickets/:id`

**Request Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "acceptance_criteria": "Updated criteria",
  "epic": "New Epic",
  "estimated_scope": "large"
}
```

**Response:**
```json
{
  "ticket": { /* updated ticket object */ },
  "event_id": 123
}
```

**Implementation:**
```javascript
// Add to api-server-dashboard.js
app.patch('/api/tickets/:id', (req, res) => {
  const { id } = req.params;
  const allowedFields = ['title', 'description', 'acceptance_criteria', 'epic', 'estimated_scope', 'files_hint'];
  const updates = {};
  const changes = {};
  
  // Get current ticket for comparison
  const currentTicket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!currentTicket) return res.status(404).json({ error: 'Ticket not found' });
  
  // Build update object
  for (const field of allowedFields) {
    if (req.body[field] !== undefined && req.body[field] !== currentTicket[field]) {
      updates[field] = req.body[field];
      changes[field] = { from: currentTicket[field], to: req.body[field] };
    }
  }
  
  if (Object.keys(updates).length === 0) {
    return res.json({ ticket: currentTicket, event_id: null, message: 'No changes' });
  }
  
  // Build dynamic UPDATE query
  const setClauses = Object.keys(updates).map(f => `${f} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  
  db.prepare(`
    UPDATE tickets 
    SET ${setClauses}, updated_at = datetime('now') 
    WHERE id = ?
  `).run(...values);
  
  // Log event
  const eventResult = db.prepare(`
    INSERT INTO events (ticket_id, event_type, actor_id, actor_type, previous_value, new_value, metadata)
    VALUES (?, 'edited', ?, 'human', ?, ?, ?)
  `).run(
    id,
    req.user?.id || 'anonymous',
    JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from]))),
    JSON.stringify(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to]))),
    JSON.stringify({ fields_changed: Object.keys(changes) })
  );
  
  const updatedTicket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  
  // Broadcast update
  broadcast('ticket_updated', { ticket_id: id, changes });
  
  res.json({ ticket: updatedTicket, event_id: eventResult.lastInsertRowid });
});
```

---

### REQUIREMENT 3: Requeue Endpoint

**Endpoint:** `POST /api/tickets/:id/requeue`

**Request Body:**
```json
{
  "reason": "Agent failed, retrying with fresh context"
}
```

**Response:**
```json
{
  "ticket": { /* ticket with state: 'ready' */ },
  "previous_state": "in_progress"
}
```

**Implementation:**
```javascript
// Add to api-server-dashboard.js
app.post('/api/tickets/:id/requeue', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  
  // Only allow requeue from certain states
  const requeueableStates = ['in_progress', 'assigned', 'in_review', 'changes_requested', 'done'];
  if (!requeueableStates.includes(ticket.state)) {
    return res.status(400).json({ 
      error: 'Cannot requeue', 
      message: `Ticket in state '${ticket.state}' cannot be requeued` 
    });
  }
  
  const previousState = ticket.state;
  
  db.prepare(`
    UPDATE tickets 
    SET state = 'ready',
        assignee_id = NULL,
        assignee_type = NULL,
        lease_expires = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
  
  // Log event
  db.prepare(`
    INSERT INTO events (ticket_id, event_type, actor_id, actor_type, previous_value, new_value, rationale)
    VALUES (?, 'requeued', ?, 'human', ?, 'ready', ?)
  `).run(id, req.user?.id || 'anonymous', previousState, reason || 'Manual requeue');
  
  const updatedTicket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  
  broadcast('ticket_requeued', { ticket_id: id, previous_state: previousState });
  
  res.json({ ticket: updatedTicket, previous_state: previousState });
});
```

---

### REQUIREMENT 4: Dependency Management Endpoints

**Add Dependency:**
```
POST /api/tickets/:id/dependencies
Body: { "depends_on": "other-ticket-id" }
```

**Remove Dependency:**
```
DELETE /api/tickets/:id/dependencies/:depends_on_id
```

**Implementation:**
```javascript
// Add dependency
app.post('/api/tickets/:id/dependencies', (req, res) => {
  const { id } = req.params;
  const { depends_on } = req.body;
  
  if (!depends_on) return res.status(400).json({ error: 'depends_on required' });
  if (id === depends_on) return res.status(400).json({ error: 'Ticket cannot depend on itself' });
  
  // Verify both tickets exist
  const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(id);
  const dependsOnTicket = db.prepare('SELECT id, state FROM tickets WHERE id = ?').get(depends_on);
  
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (!dependsOnTicket) return res.status(404).json({ error: 'Dependency ticket not found' });
  
  // Check for circular dependency (simple check)
  const wouldCreateCycle = db.prepare(`
    SELECT 1 FROM dependencies WHERE ticket_id = ? AND depends_on = ?
  `).get(depends_on, id);
  
  if (wouldCreateCycle) {
    return res.status(400).json({ error: 'Would create circular dependency' });
  }
  
  try {
    db.prepare('INSERT INTO dependencies (ticket_id, depends_on) VALUES (?, ?)').run(id, depends_on);
    
    // If dependency is not done, block this ticket
    if (dependsOnTicket.state !== 'done') {
      db.prepare(`UPDATE tickets SET state = 'blocked' WHERE id = ? AND state = 'ready'`).run(id);
    }
    
    // Log event
    db.prepare(`
      INSERT INTO events (ticket_id, event_type, actor_type, new_value)
      VALUES (?, 'dependency_added', 'human', ?)
    `).run(id, depends_on);
    
    broadcast('dependency_added', { ticket_id: id, depends_on });
    
    res.json({ success: true, ticket_id: id, depends_on });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return res.status(409).json({ error: 'Dependency already exists' });
    }
    throw err;
  }
});

// Remove dependency
app.delete('/api/tickets/:id/dependencies/:depends_on', (req, res) => {
  const { id, depends_on } = req.params;
  
  const result = db.prepare('DELETE FROM dependencies WHERE ticket_id = ? AND depends_on = ?').run(id, depends_on);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Dependency not found' });
  }
  
  // Check if ticket can be unblocked
  const remainingBlockers = db.prepare(`
    SELECT COUNT(*) as count FROM dependencies d
    JOIN tickets t ON d.depends_on = t.id
    WHERE d.ticket_id = ? AND t.state != 'done'
  `).get(id);
  
  if (remainingBlockers.count === 0) {
    db.prepare(`UPDATE tickets SET state = 'ready' WHERE id = ? AND state = 'blocked'`).run(id);
  }
  
  // Log event
  db.prepare(`
    INSERT INTO events (ticket_id, event_type, actor_type, previous_value)
    VALUES (?, 'dependency_removed', 'human', ?)
  `).run(id, depends_on);
  
  broadcast('dependency_removed', { ticket_id: id, depends_on });
  
  res.json({ success: true });
});
```

---

### REQUIREMENT 5: Enhanced Ticket Detail UI Component

**File:** `/opt/swarm-ui/src/pages/Tickets.jsx`

**New/Modified Sections:**


#### 5.1 Repository Links Section

```jsx
{/* Add after description block in ticket detail modal */}
{(selectedTicket.repo_url || selectedTicket.branch_name || selectedTicket.pr_url) && (
  <div className="detail-block repository-section">
    <label>🔗 Repository & Code</label>
    <div className="repo-links">
      {selectedTicket.repo_url && (
        <a 
          href={selectedTicket.repo_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="repo-link"
        >
          <span className="link-icon">📁</span>
          <span className="link-text">Repository</span>
          <span className="link-url">{selectedTicket.repo_url.replace('https://github.com/', '')}</span>
        </a>
      )}
      {selectedTicket.branch_name && selectedTicket.repo_url && (
        <a 
          href={`${selectedTicket.repo_url}/tree/${selectedTicket.branch_name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="repo-link"
        >
          <span className="link-icon">🌿</span>
          <span className="link-text">Branch</span>
          <span className="link-url">{selectedTicket.branch_name}</span>
        </a>
      )}
      {selectedTicket.pr_url && (
        <a 
          href={selectedTicket.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="repo-link pr-link"
        >
          <span className="link-icon">🔀</span>
          <span className="link-text">Pull Request</span>
          <span className="link-url">{selectedTicket.pr_url.split('/').pop()}</span>
        </a>
      )}
    </div>
  </div>
)}
```

#### 5.2 Dependencies Section

```jsx
{/* Add dependencies section */}
{(selectedTicket.blocked_by?.length > 0 || selectedTicket.blocks?.length > 0) && (
  <div className="detail-block dependencies-section">
    <label>🔀 Dependencies</label>
    <div className="dependencies-container">
      {selectedTicket.blocked_by?.length > 0 && (
        <div className="dependency-group blocked-by">
          <span className="dep-label">⛔ Blocked By:</span>
          <div className="dep-tickets">
            {selectedTicket.blocked_by.map(dep => (
              <button
                key={dep.id}
                className={`dep-ticket state-${dep.state}`}
                onClick={() => handleSelectTicket(dep.id)}
              >
                <span className="dep-id">{dep.id.slice(0, 8)}</span>
                <span className="dep-title">{dep.title}</span>
                <span className={`dep-state ${dep.state}`}>{dep.state}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedTicket.blocks?.length > 0 && (
        <div className="dependency-group blocks">
          <span className="dep-label">🚧 Blocks:</span>
          <div className="dep-tickets">
            {selectedTicket.blocks.map(dep => (
              <button
                key={dep.id}
                className={`dep-ticket state-${dep.state}`}
                onClick={() => handleSelectTicket(dep.id)}
              >
                <span className="dep-id">{dep.id.slice(0, 8)}</span>
                <span className="dep-title">{dep.title}</span>
                <span className={`dep-state ${dep.state}`}>{dep.state}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
)}
```

#### 5.3 Activity Timeline Section

```jsx
{/* Add activity timeline */}
{selectedTicket.events?.length > 0 && (
  <div className="detail-block activity-section">
    <label>📊 Activity</label>
    <div className="activity-timeline">
      {selectedTicket.events.slice(0, 10).map(event => (
        <div key={event.id} className={`activity-item event-${event.event_type}`}>
          <span className="activity-icon">
            {event.event_type === 'state_changed' && '🔄'}
            {event.event_type === 'edited' && '✏️'}
            {event.event_type === 'requeued' && '🔁'}
            {event.event_type === 'assigned' && '👤'}
            {event.event_type === 'completed' && '✅'}
            {event.event_type === 'dependency_added' && '🔗'}
            {event.event_type === 'dependency_removed' && '✂️'}
          </span>
          <span className="activity-time">
            {formatRelativeTime(event.created_at)}
          </span>
          <span className="activity-description">
            {formatEventDescription(event)}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

#### 5.4 Edit Mode Implementation

```jsx
// Add state for edit mode
const [isEditing, setIsEditing] = useState(false);
const [editForm, setEditForm] = useState({});

// Initialize edit form when entering edit mode
const handleStartEdit = () => {
  setEditForm({
    title: selectedTicket.title,
    description: selectedTicket.description || '',
    acceptance_criteria: selectedTicket.acceptance_criteria || '',
    epic: selectedTicket.epic || '',
    estimated_scope: selectedTicket.estimated_scope || 'medium'
  });
  setIsEditing(true);
};

// Save changes
const handleSaveEdit = async () => {
  try {
    const response = await fetch(`/api/tickets/${selectedTicket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    
    if (!response.ok) throw new Error('Failed to update ticket');
    
    const { ticket } = await response.json();
    setSelectedTicket(ticket);
    setIsEditing(false);
    refreshTickets(); // Refresh the ticket list
  } catch (err) {
    console.error('Edit failed:', err);
    alert('Failed to save changes');
  }
};

// In the modal header, add edit button
<div className="modal-header">
  <h2>{selectedTicket.id.slice(0, 8)}</h2>
  {!isEditing ? (
    <button className="edit-btn" onClick={handleStartEdit}>✏️ Edit</button>
  ) : (
    <div className="edit-actions">
      <button className="save-btn" onClick={handleSaveEdit}>💾 Save</button>
      <button className="cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
    </div>
  )}
  <button className="modal-close" onClick={handleCloseModal}>×</button>
</div>

// Editable title field
{isEditing ? (
  <input
    type="text"
    className="edit-title-input"
    value={editForm.title}
    onChange={e => setEditForm({...editForm, title: e.target.value})}
  />
) : (
  <h3 className="ticket-title">{selectedTicket.title}</h3>
)}

// Editable description
{isEditing ? (
  <textarea
    className="edit-description-textarea"
    value={editForm.description}
    onChange={e => setEditForm({...editForm, description: e.target.value})}
    rows={6}
  />
) : (
  <div className="description-box">{selectedTicket.description}</div>
)}
```

#### 5.5 Action Buttons (Requeue, Cancel, etc.)

```jsx
{/* Add action buttons at bottom of modal */}
<div className="ticket-actions">
  {['in_progress', 'assigned', 'in_review', 'changes_requested', 'done'].includes(selectedTicket.state) && (
    <button 
      className="action-btn requeue-btn"
      onClick={() => handleRequeue(selectedTicket.id)}
    >
      🔄 Requeue
    </button>
  )}
  
  {selectedTicket.state !== 'cancelled' && selectedTicket.state !== 'done' && (
    <button 
      className="action-btn cancel-btn"
      onClick={() => handleCancel(selectedTicket.id)}
    >
      🗑️ Cancel
    </button>
  )}
  
  {selectedTicket.state === 'in_review' && (
    <button 
      className="action-btn complete-btn"
      onClick={() => handleMarkComplete(selectedTicket.id)}
    >
      ✅ Approve & Complete
    </button>
  )}
</div>

// Handler functions
const handleRequeue = async (ticketId) => {
  if (!confirm('Requeue this ticket? It will be available for agents to claim again.')) return;
  
  const reason = prompt('Reason for requeue (optional):');
  
  try {
    const response = await fetch(`/api/tickets/${ticketId}/requeue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    
    if (!response.ok) throw new Error('Requeue failed');
    
    const { ticket } = await response.json();
    setSelectedTicket(ticket);
    refreshTickets();
  } catch (err) {
    console.error('Requeue failed:', err);
    alert('Failed to requeue ticket');
  }
};
```

---

### REQUIREMENT 6: CSS Styles

**Add to existing stylesheet or create new file:**

```css
/* Repository Links */
.repository-section .repo-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.repo-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  color: #60a5fa;
  text-decoration: none;
  transition: all 0.2s;
}

.repo-link:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
}

.repo-link .link-icon {
  font-size: 18px;
}

.repo-link .link-text {
  font-weight: 600;
  min-width: 80px;
}

.repo-link .link-url {
  color: #94a3b8;
  font-family: monospace;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repo-link.pr-link {
  background: rgba(168, 85, 247, 0.1);
  border-color: rgba(168, 85, 247, 0.3);
  color: #c084fc;
}

/* Dependencies Section */
.dependencies-section .dependencies-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dependency-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dependency-group .dep-label {
  font-weight: 600;
  color: #94a3b8;
  font-size: 13px;
}

.dependency-group.blocked-by .dep-label {
  color: #f87171;
}

.dependency-group.blocks .dep-label {
  color: #fbbf24;
}

.dep-tickets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dep-ticket {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.dep-ticket:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.dep-ticket .dep-id {
  font-family: monospace;
  font-size: 11px;
  color: #64748b;
}

.dep-ticket .dep-title {
  font-size: 13px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-ticket .dep-state {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.dep-state.done { background: rgba(16, 185, 129, 0.2); color: #10b981; }
.dep-state.blocked { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
.dep-state.in_progress { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
.dep-state.ready { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }

/* Activity Timeline */
.activity-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  font-size: 13px;
}

.activity-item .activity-icon {
  font-size: 14px;
}

.activity-item .activity-time {
  color: #64748b;
  font-size: 11px;
  min-width: 60px;
}

.activity-item .activity-description {
  color: #cbd5e1;
}

/* Action Buttons */
.ticket-actions {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 16px;
}

.action-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.action-btn.requeue-btn {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.action-btn.requeue-btn:hover {
  background: rgba(59, 130, 246, 0.3);
}

.action-btn.cancel-btn {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.action-btn.cancel-btn:hover {
  background: rgba(239, 68, 68, 0.3);
}

.action-btn.complete-btn {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.action-btn.complete-btn:hover {
  background: rgba(16, 185, 129, 0.3);
}

/* Edit Mode */
.edit-title-input {
  width: 100%;
  padding: 12px;
  font-size: 18px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 8px;
  color: white;
}

.edit-description-textarea {
  width: 100%;
  padding: 12px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 8px;
  color: white;
  resize: vertical;
  min-height: 120px;
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.save-btn, .cancel-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.save-btn {
  background: #10b981;
  color: white;
  border: none;
}

.cancel-btn {
  background: transparent;
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

---

### REQUIREMENT 7: Helper Functions

```javascript
// Add to Tickets.jsx or a utils file

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format event description for activity timeline
 */
function formatEventDescription(event) {
  const actor = event.actor_id || 'System';
  
  switch (event.event_type) {
    case 'state_changed':
      return `${actor} changed status: ${event.previous_value} → ${event.new_value}`;
    case 'edited':
      const fields = JSON.parse(event.metadata || '{}').fields_changed || [];
      return `${actor} edited: ${fields.join(', ')}`;
    case 'requeued':
      return `${actor} requeued ticket${event.rationale ? `: "${event.rationale}"` : ''}`;
    case 'assigned':
      return `Assigned to ${event.new_value}`;
    case 'completed':
      return `${actor} completed the ticket`;
    case 'dependency_added':
      return `${actor} added dependency: ${event.new_value?.slice(0, 8)}`;
    case 'dependency_removed':
      return `${actor} removed dependency: ${event.previous_value?.slice(0, 8)}`;
    case 'created':
      return `Ticket created by ${actor}`;
    default:
      return `${event.event_type} by ${actor}`;
  }
}
```

---

## Acceptance Criteria

### API Endpoints
- [ ] `GET /api/tickets/:id?include=dependencies,events` returns full ticket with dependencies and activity
- [ ] `PATCH /api/tickets/:id` updates allowed fields and logs event
- [ ] `POST /api/tickets/:id/requeue` resets ticket to ready state
- [ ] `POST /api/tickets/:id/dependencies` adds dependency with cycle detection
- [ ] `DELETE /api/tickets/:id/dependencies/:depends_on` removes dependency

### UI Features
- [ ] Ticket detail shows clickable repository link
- [ ] Ticket detail shows clickable branch link (constructed from repo_url + branch_name)
- [ ] Ticket detail shows clickable PR link when available
- [ ] Dependencies section shows "Blocked By" tickets (clickable)
- [ ] Dependencies section shows "Blocks" tickets (clickable)
- [ ] Activity timeline shows recent events with icons and relative timestamps
- [ ] Edit button enters edit mode for title, description, acceptance criteria
- [ ] Save button persists changes and exits edit mode
- [ ] Requeue button available for appropriate states
- [ ] All actions broadcast WebSocket updates

### Data Integrity
- [ ] All edits logged to events table with previous/new values
- [ ] Circular dependency prevention on add
- [ ] Automatic blocking/unblocking based on dependency state
- [ ] WebSocket broadcasts for all mutations

---

## Testing Checklist

1. **Edit Ticket**: Change title → verify event logged → verify UI updates
2. **Requeue Ticket**: Requeue in_progress ticket → verify state=ready → verify assignee cleared
3. **Add Dependency**: Add dep between two tickets → verify blocking behavior
4. **Remove Dependency**: Remove dep → verify unblocking if no other blockers
5. **Repository Links**: Verify all 3 link types render correctly and open in new tab
6. **Activity Timeline**: Verify events appear in chronological order with correct formatting

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `/opt/swarm-ui/api-server-dashboard.js` | Add PATCH, requeue, dependency endpoints |
| `/opt/swarm-ui/src/pages/Tickets.jsx` | Add edit mode, dependencies, activity, repo links |
| `/opt/swarm-ui/src/pages/Tickets.css` (or inline) | Add styles for new sections |
| `/opt/swarm-ui/src/hooks/useTickets.js` | Update fetch to include dependencies/events |

---

## Notes for Implementation

1. **Query RAG before modifying any file** to find existing patterns
2. **Use existing broadcast() function** for WebSocket updates
3. **Follow existing code style** in api-server-dashboard.js (ES modules, async/await)
4. **Test each endpoint** with curl before integrating UI
5. **Preserve backward compatibility** - existing API consumers should not break
