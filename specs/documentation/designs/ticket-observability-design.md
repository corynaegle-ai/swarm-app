# Ticket-Centric Agent Observability Design

**Date:** 2024-12-22  
**Author:** Claude (Systems Architect)  
**Status:** Draft  

---

## 1. Executive Summary

This design enhances Swarm's observability by making the **ticket the primary window into agent activity**. Users can view any ticket and see: the current status, which agent is working on it (with a link to the agent page), and a real-time log of everything that agent is doing.

### Core Principle
> The ticket is both the unit of work AND the unit of observability.

---

## 2. Current State Analysis

### 2.1 Existing Schema

**tickets table:**
- `assignee_id`, `assignee_type` - Who's assigned (but no structured agent link)
- `vm_id` - Which VM (but not which named agent)
- `progress_log` - JSON field with simple `{entries: [{timestamp, event, message}]}`

**agent_instances table:**
- `id` (auto-increment integer)
- `agent_type` - Currently just 'worker'
- `vm_id`, `ticket_id`, `status`
- `metadata` (JSONB) - Flexible extra data

**ticket_events table:**
- Event sourcing for state changes
- `actor_type` enum: human, design_agent, worker_agent, review_agent, orchestrator, system

**agent_definitions table:**
- Template catalog for agent types
- Has `name`, `capabilities`, `runtime`

### 2.2 Existing UI

**AgentMonitor.jsx:**
- Real-time grid of running agent instances
- Shows VM ID, status, ticket (if any)
- Modal with activity log (heartbeats + events)
- Can terminate agents

**Tickets.jsx:**
- Table/Kanban of tickets
- Modal shows activity timeline from `ticket_events`
- Shows assignee as generic "Agent" or "Human"

### 2.3 Gaps

1. **No named agent types** - Just "worker", not "Forge Agent #12"
2. **No agent link from ticket** - Can't click through to agent page
3. **Separate log systems** - `progress_log` on ticket vs `ticket_events` vs agent heartbeats
4. **No real-time streaming** - Must refresh to see updates

---

## 3. Proposed Design

### 3.1 Named Agent Types

Replace generic "worker" with named agent roles:

| Agent Type | ID Prefix | Role | Icon | Color |
|------------|-----------|------|------|-------|
| **Forge** | `forge-` | Code generation | 🔨 | Orange #f97316 |
| **Sentinel** | `sentinel-` | Code review | 🛡️ | Blue #3b82f6 |
| **Architect** | `architect-` | Design/planning | 📐 | Purple #8b5cf6 |
| **Scout** | `scout-` | Context gathering | 🔍 | Green #10b981 |
| **Herald** | `herald-` | Notifications/PR | 📢 | Yellow #eab308 |

Agent instance IDs become: `forge-12`, `sentinel-3`, `architect-1`

### 3.2 Schema Changes

```sql
-- Enhance agent_instances
ALTER TABLE agent_instances 
  ADD COLUMN agent_name TEXT GENERATED ALWAYS AS (
    agent_type || '-' || id
  ) STORED;

-- Or simpler: just update agent_type to use new values
UPDATE agent_instances SET agent_type = 'forge' WHERE agent_type = 'worker';

-- Add index for quick lookup
CREATE INDEX idx_agent_instances_name ON agent_instances(agent_type, id);

-- Add direct FK from tickets to agent_instances
ALTER TABLE tickets ADD COLUMN agent_instance_id INTEGER REFERENCES agent_instances(id);
```

### 3.3 Unified Activity Log

Create a unified view combining all log sources:

```sql
-- New: ticket_activity_log view
CREATE VIEW ticket_activity_log AS
SELECT 
  te.ticket_id,
  te.created_at as timestamp,
  te.event_type as category,
  te.actor_type,
  te.actor_id,
  COALESCE(te.new_value, te.rationale) as message,
  te.metadata,
  'event' as source
FROM ticket_events te

UNION ALL

SELECT
  ai.ticket_id,
  h.created_at as timestamp,
  'heartbeat' as category,
  ai.agent_type as actor_type,
  ai.agent_type || '-' || ai.id as actor_id,
  h.message,
  jsonb_build_object('progress', h.progress) as metadata,
  'heartbeat' as source
FROM heartbeats h
JOIN agent_instances ai ON h.agent_id = ai.id

ORDER BY timestamp DESC;
```

### 3.4 Real-Time Log Categories

Standardize log entry types for consistent UI rendering:

| Category | Description | Example |
|----------|-------------|---------|
| `claim` | Agent claimed ticket | "Claimed by Forge #12" |
| `context` | Loading files/repo | "Loading 3 context files" |
| `think` | LLM reasoning | "Planning implementation..." |
| `code` | Writing files | "Writing src/auth.js" |
| `git` | Git operations | "Committed: feat: add auth" |
| `pr` | PR operations | "Created PR #52" |
| `verify` | Verification | "Running acceptance checks" |
| `review` | Code review | "Sentinel reviewing..." |
| `error` | Errors | "Build failed: missing dep" |
| `complete` | Completion | "Ticket marked complete" |

### 3.5 API Enhancements

**New endpoint: GET /api/tickets/:id/activity**
```javascript
// Returns unified activity log
{
  ticket_id: "abc123",
  current_agent: {
    id: "forge-12",
    type: "forge",
    display_name: "Forge Agent #12",
    status: "running",
    vm_id: 47,
    link: "/agents/12"  // For UI navigation
  },
  activity: [
    {
      timestamp: "2024-12-22T17:52:01Z",
      category: "claim",
      actor: { type: "forge", id: "forge-12", display: "🔨 Forge #12" },
      message: "Claimed ticket",
      metadata: {}
    },
    // ...more entries
  ]
}
```

**WebSocket enhancement: ticket activity stream**
```javascript
// Subscribe to ticket activity
ws.send(JSON.stringify({ 
  type: 'subscribe', 
  channel: 'ticket:abc123:activity' 
}));

// Receive real-time updates
{
  type: 'activity',
  ticket_id: 'abc123',
  entry: {
    timestamp: "...",
    category: "code",
    actor: { type: "forge", id: "forge-12", display: "🔨 Forge #12" },
    message: "Writing src/middleware/auth.js"
  }
}
```

---

## 4. UI Components

### 4.1 Enhanced Ticket Detail Modal

```
┌─────────────────────────────────────────────────────────────┐
│  TICKET: implement-user-auth-middleware          [X Close]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status: ● IN_PROGRESS          Scope: Medium               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CURRENT AGENT                                      │    │
│  │  🔨 Forge Agent #12                    [View Agent] │    │
│  │  VM: 47  •  Runtime: 4m 32s  •  ● Connected         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ACTIVITY LOG                              [Filter ▾] [↻]   │
│  ───────────────────────────────────────────────────────    │
│  17:52:58  🛡️ Sentinel #3   ✅ APPROVED (score: 94)        │
│  17:52:42  🛡️ Sentinel #3   LLM review in progress...      │
│  17:52:35  🛡️ Sentinel #3   Running static analysis        │
│  17:52:30  🛡️ Sentinel #3   Claimed for review             │
│  17:52:27  🔨 Forge #12     Created PR #52                  │
│  17:52:22  🔨 Forge #12     Committed: "feat: add auth"     │
│  17:52:15  🔨 Forge #12     Writing src/middleware/auth.js  │
│  17:52:08  🔨 Forge #12     Planning implementation...      │
│  17:52:03  🔨 Forge #12     Loading context (3 files)       │
│  17:52:01  🔨 Forge #12     Claimed ticket                  │
│  ───────────────────────────────────────────────────────    │
│                                                             │
│  [View PR #52]  [View Branch]  [Reassign]  [Cancel Build]   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Agent Badge Component

```jsx
// AgentBadge.jsx - Reusable component
function AgentBadge({ agent, showLink = true }) {
  const config = AGENT_CONFIG[agent.type];
  
  return (
    <div className="agent-badge" style={{ borderColor: config.color }}>
      <span className="agent-icon">{config.icon}</span>
      <span className="agent-name">{config.label} #{agent.instance_number}</span>
      {agent.status === 'running' && <span className="pulse" />}
      {showLink && (
        <Link to={`/agents/${agent.id}`} className="agent-link">
          View →
        </Link>
      )}
    </div>
  );
}

const AGENT_CONFIG = {
  forge:     { icon: '🔨', label: 'Forge',     color: '#f97316' },
  sentinel:  { icon: '🛡️', label: 'Sentinel',  color: '#3b82f6' },
  architect: { icon: '📐', label: 'Architect', color: '#8b5cf6' },
  scout:     { icon: '🔍', label: 'Scout',     color: '#10b981' },
  herald:    { icon: '📢', label: 'Herald',    color: '#eab308' },
};
```

### 4.3 Activity Log Component

```jsx
// TicketActivityLog.jsx
function TicketActivityLog({ ticketId }) {
  const { activity, currentAgent, loading } = useTicketActivity(ticketId);
  const [filter, setFilter] = useState('all');
  
  const filteredActivity = useMemo(() => {
    if (filter === 'all') return activity;
    return activity.filter(a => a.category === filter);
  }, [activity, filter]);
  
  return (
    <div className="activity-log">
      <div className="log-header">
        <h4>Activity Log</h4>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="code">Code</option>
          <option value="git">Git</option>
          <option value="review">Review</option>
          <option value="error">Errors</option>
        </select>
      </div>
      
      <div className="log-entries">
        {filteredActivity.map((entry, i) => (
          <ActivityEntry key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ActivityEntry({ entry }) {
  return (
    <div className={`activity-entry category-${entry.category}`}>
      <span className="time">{formatTime(entry.timestamp)}</span>
      <span className="actor">
        {AGENT_CONFIG[entry.actor.type]?.icon} {entry.actor.display}
      </span>
      <span className="message">{entry.message}</span>
    </div>
  );
}
```

### 4.4 Enhanced Agents Page

```
┌─────────────────────────────────────────────────────────────┐
│  AGENTS                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔨 FORGE AGENTS (Code Generation)                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Forge #12  ● Active  VM 47  [implement-user-auth]   │    │
│  │ Forge #13  ● Active  VM 48  [add-logging-service]   │    │
│  │ Forge #14  ○ Idle    —      Available               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  🛡️ SENTINEL AGENTS (Code Review)                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Sentinel #3  ● Active  VM 22  Reviewing PR #52      │    │
│  │ Sentinel #4  ○ Idle    —      Available             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  📐 ARCHITECT AGENTS (Design)                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Architect #1  ○ Idle   —      Available             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Clicking a ticket link goes to ticket detail; clicking the agent row goes to agent detail.

---

## 5. Agent Logging API

### 5.1 Agent-Side Logging

Agents must call a logging endpoint during execution:

```javascript
// In pull-agent-v2.js or worker-agent.js
async function logActivity(ticketId, category, message, metadata = {}) {
  await fetch(`${API_URL}/api/tickets/${ticketId}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: AGENT_ID,  // e.g., 'forge-12'
      category,            // claim, context, think, code, git, etc.
      message,
      metadata
    })
  });
}

// Usage examples:
await logActivity(ticketId, 'claim', 'Claimed ticket');
await logActivity(ticketId, 'context', 'Loading 3 context files', { files: [...] });
await logActivity(ticketId, 'code', 'Writing src/auth.js', { path: 'src/auth.js', lines: 47 });
await logActivity(ticketId, 'git', 'Committed', { sha: 'abc123', message: 'feat: add auth' });
```

### 5.2 Server-Side Endpoint

```javascript
// POST /api/tickets/:id/activity
router.post('/:id/activity', async (req, res) => {
  const { id } = req.params;
  const { agent_id, category, message, metadata } = req.body;
  
  // Insert into ticket_events
  await execute(`
    INSERT INTO ticket_events (ticket_id, event_type, actor_id, actor_type, new_value, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, category, agent_id, agent_id.split('-')[0] + '_agent', message, metadata]);
  
  // Broadcast via WebSocket
  broadcast(`ticket:${id}:activity`, {
    type: 'activity',
    ticket_id: id,
    entry: { timestamp: new Date(), category, actor: { id: agent_id }, message, metadata }
  });
  
  res.json({ success: true });
});
```

---

## 6. Implementation Plan

### Phase 1: Schema & API (Day 1)
1. Add `agent_type` values: forge, sentinel, architect, scout, herald
2. Create `ticket_activity_log` view
3. Add `GET /api/tickets/:id/activity` endpoint
4. Add `POST /api/tickets/:id/activity` endpoint
5. Enhance WebSocket to support ticket activity subscriptions

### Phase 2: Agent Updates (Day 1-2)
1. Update `pull-agent-v2.js` to use `logActivity()` calls
2. Add agent type to agent registration
3. Test with mock ticket execution

### Phase 3: UI Components (Day 2-3)
1. Create `AgentBadge` component
2. Create `TicketActivityLog` component  
3. Create `useTicketActivity` hook with WebSocket
4. Enhance ticket detail modal with new components
5. Update Agents page with grouped agent types

### Phase 4: Integration & Polish (Day 3)
1. End-to-end test: ticket → agent → logs → UI
2. Add log filtering and search
3. Performance optimization (log pagination)
4. Error handling and edge cases

---

## 7. Migration Notes

### Backward Compatibility
- Existing `progress_log` field remains (deprecated)
- Existing `ticket_events` continue to work
- Agent `agent_type = 'worker'` treated as 'forge'

### Data Migration
```sql
-- Migrate existing workers to forge
UPDATE agent_instances SET agent_type = 'forge' WHERE agent_type = 'worker';

-- Backfill ticket events with actor display names
-- (Optional: run as background job)
```

---

## 8. Success Metrics

1. **User can see agent name on ticket** - Not just "Agent" but "🔨 Forge #12"
2. **User can click through to agent** - Link works bidirectionally
3. **Real-time log updates** - Under 500ms latency
4. **Unified activity view** - All log sources in one timeline
5. **Multi-agent visibility** - See when ticket changes hands (Forge → Sentinel)

---

## Appendix A: Full Agent Config

```javascript
const AGENT_TYPES = {
  forge: {
    icon: '🔨',
    label: 'Forge',
    description: 'Code generation agent',
    color: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.15)',
    capabilities: ['code_generation', 'file_creation', 'git_commit']
  },
  sentinel: {
    icon: '🛡️',
    label: 'Sentinel',
    description: 'Code review agent',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.15)',
    capabilities: ['code_review', 'static_analysis', 'approval']
  },
  architect: {
    icon: '📐',
    label: 'Architect',
    description: 'Design and planning agent',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.15)',
    capabilities: ['design', 'ticket_creation', 'planning']
  },
  scout: {
    icon: '🔍',
    label: 'Scout',
    description: 'Context gathering agent',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    capabilities: ['file_search', 'rag_query', 'context_assembly']
  },
  herald: {
    icon: '📢',
    label: 'Herald',
    description: 'Notification and PR agent',
    color: '#eab308',
    bgColor: 'rgba(234, 179, 8, 0.15)',
    capabilities: ['pr_creation', 'notifications', 'status_updates']
  }
};
```
