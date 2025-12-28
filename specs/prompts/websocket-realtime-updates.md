# WebSocket Real-Time Updates Implementation

## Problem Statement

Dashboard pages (AgentMonitor, KanbanBoard) use polling with short intervals that exhaust rate limits:
- AgentMonitor: 5s refresh → 2 API calls/refresh → 24 req/min → **360 req/15min** (limit: 100)
- Users hit "Too many requests" after ~4 minutes of viewing

## Solution

Replace polling with WebSocket push-based updates using existing infrastructure.

---

## Current Infrastructure (Already Built)

### Backend WebSocket Server (`apps/platform/websocket.js`)
```javascript
// Broadcast functions already exist:
broadcast.toRoom(roomId, eventType, payload)    // Send to room
broadcast.toTenant(tenantId, eventType, payload) // Send to tenant
broadcast.ticketUpdate(ticketId, state, extra)   // Ticket state changes
broadcast.ticketProgress(ticketId, phase, msg)   // Ticket progress
```

### Frontend WebSocket Hook (`apps/dashboard/src/hooks/useWebSocket.js`)
```javascript
// Already implemented with:
- Auto-connect with JWT auth
- Room subscriptions (session, tenant, project)
- Auto-reconnect with exponential backoff
- Event handler registration
- Connection state management

// Usage pattern (from Tickets.jsx):
const { isConnected } = useWebSocket({
  room: user?.tenant_id ? `tenant:${user.tenant_id}` : null,
  handlers: { 'ticket:update': handleTicketUpdate },
  enabled: !!user?.tenant_id
});
```

---

## Implementation Tasks

### Phase 1: Backend - Add Agent Event Broadcasting

**File: `apps/platform/websocket.js`**

Add to the `broadcast` object:
```javascript
/**
 * Send agent status update
 */
agentUpdate(tenantId, agentId, status, extra = {}) {
  this.toTenant(tenantId, 'agent:update', {
    agentId,
    status,
    action: 'status_change',
    ...extra
  });
},

/**
 * Send agent stats update (debounced - max 1/second)
 */
agentStatsUpdate(tenantId, stats) {
  this.toTenant(tenantId, 'agent:stats', {
    stats,
    action: 'stats_refresh'
  });
},

/**
 * Send agent heartbeat received
 */
agentHeartbeat(tenantId, agentId, heartbeat) {
  this.toTenant(tenantId, 'agent:heartbeat', {
    agentId,
    ...heartbeat
  });
},

/**
 * Send agent terminated
 */
agentTerminated(tenantId, agentId, reason) {
  this.toTenant(tenantId, 'agent:terminated', {
    agentId,
    reason
  });
}
```

**File: `apps/platform/routes/agents.js`**

Import and use broadcast in mutation endpoints:
```javascript
const { broadcast } = require('../websocket');

// After agent status changes:
broadcast.agentUpdate(req.user.tenantId, agentId, newStatus, { timestamp: Date.now() });

// After agent termination:
broadcast.agentTerminated(req.user.tenantId, agentId, 'manual');
```

**File: `apps/platform/routes/internal.js`**

Add agent event endpoint for VM-to-platform notifications:
```javascript
router.post('/agent-event', (req, res) => {
  const { tenantId, agentId, event, ...data } = req.body;
  
  switch (event) {
    case 'status_change':
      broadcast.agentUpdate(tenantId, agentId, data.status, data);
      break;
    case 'heartbeat':
      broadcast.agentHeartbeat(tenantId, agentId, data);
      break;
    case 'terminated':
      broadcast.agentTerminated(tenantId, agentId, data.reason);
      break;
  }
  
  res.json({ success: true });
});
```

---

### Phase 2: Frontend - AgentMonitor WebSocket Integration

**File: `apps/dashboard/src/pages/AgentMonitor.jsx`**

```javascript
// Add imports
import { useWebSocket } from '../hooks/useWebSocket';

// Inside component, after existing state declarations:

// WebSocket handlers for real-time updates
const handleAgentUpdate = useCallback((data) => {
  console.log('[WS] Agent update:', data);
  
  if (data.action === 'status_change') {
    // Update single agent in state
    setAgents(prev => prev.map(agent => 
      agent.id === data.agentId 
        ? { ...agent, status: data.status, updated_at: data.timestamp }
        : agent
    ));
  }
  
  if (data.action === 'stats_refresh') {
    setStats(data.stats);
  }
  
  setLastUpdate(new Date());
}, []);

const handleAgentTerminated = useCallback((data) => {
  console.log('[WS] Agent terminated:', data);
  // Remove from list or update status
  setAgents(prev => prev.map(agent =>
    agent.id === data.agentId
      ? { ...agent, status: 'terminated' }
      : agent
  ));
}, []);

const handleAgentStats = useCallback((data) => {
  setStats(data.stats);
  setLastUpdate(new Date());
}, []);

// WebSocket connection
const { isConnected } = useWebSocket({
  room: user?.tenant_id ? `tenant:${user.tenant_id}` : null,
  handlers: {
    'agent:update': handleAgentUpdate,
    'agent:stats': handleAgentStats,
    'agent:terminated': handleAgentTerminated,
    'agent:heartbeat': (data) => {
      // Optional: update heartbeat indicator for specific agent
      setAgents(prev => prev.map(agent =>
        agent.id === data.agentId
          ? { ...agent, last_heartbeat: data.timestamp }
          : agent
      ));
    }
  },
  enabled: !!user?.tenant_id
});

// CHANGE: Remove auto-refresh interval, keep manual refresh only
useEffect(() => {
  fetchData(); // Initial load only
}, [fetchData]);

// Add connection status indicator to UI
// In JSX header section:
{isConnected ? (
  <span className="ws-status connected" title="Real-time updates active">
    <span className="pulse-dot"></span> Live
  </span>
) : (
  <span className="ws-status disconnected" title="Reconnecting...">
    ⚡ Connecting...
  </span>
)}
```

---

### Phase 3: Frontend - KanbanBoard WebSocket Integration

**File: `apps/dashboard/src/pages/KanbanBoard.jsx`**

```javascript
// Add imports
import { useWebSocket } from '../hooks/useWebSocket';

// Inside component, add WebSocket handlers:

const handleTicketUpdate = useCallback((data) => {
  console.log('[WS] Ticket update:', data);
  
  // Update ticket in local state
  setTickets(prev => prev.map(ticket =>
    ticket.id === data.ticketId
      ? { ...ticket, state: data.state, ...data.ticket }
      : ticket
  ));
  
  // If viewing this ticket in modal, update it
  if (selectedTicket?.id === data.ticketId) {
    setSelectedTicket(prev => ({ ...prev, state: data.state, ...data.ticket }));
  }
}, [selectedTicket]);

// WebSocket connection - subscribe to tenant room for all ticket updates
const { isConnected } = useWebSocket({
  room: user?.tenant_id ? `tenant:${user.tenant_id}` : null,
  handlers: {
    'ticket:update': handleTicketUpdate,
    'ticket:created': (data) => {
      // Add new ticket to board if matches current filter
      if (!filterProject || data.ticket.project_id === filterProject) {
        setTickets(prev => [data.ticket, ...prev]);
      }
    },
    'ticket:deleted': (data) => {
      setTickets(prev => prev.filter(t => t.id !== data.ticketId));
    }
  },
  enabled: !!user?.tenant_id
});

// Keep initial load, remove polling if any exists
useEffect(() => {
  fetchData();
}, [fetchData]);

// Add connection indicator to header (after project filter):
<div className="connection-status">
  {isConnected ? (
    <span className="live-indicator">
      <span className="pulse"></span> Live
    </span>
  ) : (
    <span className="reconnecting">Reconnecting...</span>
  )}
</div>
```

---

### Phase 4: Backend - Emit Events on Mutations

**File: `apps/platform/routes/tickets.js`**

Ensure ticket mutations broadcast WebSocket events:
```javascript
const { broadcast } = require('../websocket');

// After ticket update:
router.patch('/:id', requireAuth, async (req, res) => {
  // ... existing update logic ...
  
  // Broadcast update to subscribers
  broadcast.ticketUpdate(ticket.id, ticket.state, {
    projectId: ticket.project_id,
    tenantId: req.user.tenantId,
    ticket: ticket,
    action: 'updated'
  });
  
  // Also broadcast to tenant for dashboard-wide updates
  broadcast.toTenant(req.user.tenantId, 'ticket:update', {
    ticketId: ticket.id,
    state: ticket.state,
    ticket: ticket,
    action: 'updated'
  });
  
  res.json(ticket);
});

// After ticket creation:
router.post('/', requireAuth, async (req, res) => {
  // ... existing create logic ...
  
  broadcast.toTenant(req.user.tenantId, 'ticket:created', {
    ticketId: ticket.id,
    ticket: ticket
  });
  
  res.status(201).json(ticket);
});
```

---

### Phase 5: CSS for Connection Indicators

**File: `apps/dashboard/src/pages/AgentMonitor.css`** (and KanbanBoard.css)

```css
/* WebSocket Connection Status */
.ws-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.ws-status.connected {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.ws-status.disconnected {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}

.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #10b981;
}

.live-indicator .pulse {
  width: 8px;
  height: 8px;
  background: currentColor;
  border-radius: 50%;
  animation: pulse 2s infinite;
}
```

---

## Testing Checklist

1. **AgentMonitor Page**
   - [ ] Page loads with initial data fetch
   - [ ] No polling interval (check Network tab)
   - [ ] "Live" indicator shows when connected
   - [ ] Agent status changes reflect immediately when another user/agent updates
   - [ ] Terminate agent updates UI immediately
   - [ ] Reconnects automatically after disconnect

2. **KanbanBoard Page**
   - [ ] Page loads with initial data fetch
   - [ ] No polling interval
   - [ ] "Live" indicator visible
   - [ ] Drag-drop still works (optimistic + server)
   - [ ] Another user's ticket move shows in real-time
   - [ ] New tickets appear automatically

3. **Rate Limiting**
   - [ ] Can leave page open for 30+ minutes without errors
   - [ ] Multiple tabs work without hitting limits
   - [ ] API rate limit errors eliminated

---

## Rollback Plan

If issues arise, revert to polling by:
1. Remove `useWebSocket` hook usage
2. Restore `setInterval(fetchData, 5000)` in useEffect
3. Remove connection status indicators

---

## Files to Modify

| File | Changes |
|------|---------|
| `apps/platform/websocket.js` | Add agent broadcast methods |
| `apps/platform/routes/agents.js` | Emit WS events on mutations |
| `apps/platform/routes/tickets.js` | Emit WS events on mutations |
| `apps/platform/routes/internal.js` | Add /agent-event endpoint |
| `apps/dashboard/src/pages/AgentMonitor.jsx` | Add useWebSocket, remove polling |
| `apps/dashboard/src/pages/KanbanBoard.jsx` | Add useWebSocket integration |
| `apps/dashboard/src/pages/AgentMonitor.css` | Add connection indicator styles |
| `apps/dashboard/src/pages/KanbanBoard.css` | Add connection indicator styles |

---

## Success Metrics

- Zero "Too many requests" errors on dashboard pages
- Real-time updates < 100ms latency
- CPU/memory usage reduced (no polling timers)
- Better UX with live indicators
