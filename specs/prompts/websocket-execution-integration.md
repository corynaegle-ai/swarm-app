# WebSocket Integration: Real-Time Agent Execution Updates

## Persona

You are a senior full-stack engineer specializing in real-time systems. You understand WebSocket event flows, React state management, and distributed system communication patterns.

## Problem Statement

The Swarm dashboard has WebSocket hooks ready, but agent execution events are NOT being broadcast to connected clients. When agents execute tickets, users see stale data until they manually refresh.

**Expected flow:**
```
Engine claims ticket → WS: "assigned" → UI updates
Engine spawns VM     → WS: "vm_assigned" → UI shows VM ID
Agent generates code → WS: "progress" → UI shows progress
Agent creates PR     → WS: "pr_created" → UI shows PR link
Engine completes     → WS: "done" → UI updates state
```

**Current reality:**
- Engine executes silently
- UI polls or shows stale data
- No real-time feedback

## Current Architecture

### Frontend (Ready ✅)
```
Dashboard Hooks:
├── useWebSocket.js          # Core WebSocket with auto-reconnect
├── useSessionWebSocket.js   # HITL session events
├── useTicketActivity.js     # Ticket activity timeline
└── useTickets.js            # Ticket list updates

Pages Using Hooks:
├── Tickets.jsx              # useWebSocket for list updates
├── TicketDetail.jsx         # useTicketActivity for timeline
└── DesignSession.jsx        # useSessionWebSocket for chat
```

### Backend (Partially Ready ⚠️)
```
Platform:
├── websocket.js             # WS server with broadcast helpers
├── routes/internal.js       # /api/internal/ticket-event endpoint
└── routes/tickets.js        # REST endpoints (has some broadcasts)

Engine:
├── lib/broadcast.js         # Broadcast utilities (UNUSED!)
├── lib/engine.js            # Execution loop (NO broadcasts)
└── lib/executor.js          # Step execution (NO broadcasts)
```

## The Gap

**packages/engine/lib/broadcast.js** exists with these methods:
```javascript
broadcastStateChange(ticketId, newState, extra)
broadcastProgress(ticketId, phase, message, extra)
broadcastPRCreated(ticketId, prUrl, extra)
broadcastActivity(ticketId, category, message, actorId, metadata)
```

**BUT** neither `engine.js` nor `executor.js` call these methods!

## Tasks

### Phase 1: Wire Engine Broadcasts (Priority: HIGH)

**File:** `/opt/swarm-app/packages/engine/lib/engine.js`

Add broadcasts to the execution flow:

```javascript
import broadcast from './broadcast.js';

// In executeTicket() method:
async executeTicket(ticket) {
  const ticketId = ticket.id;
  
  // 1. Broadcast: Starting execution
  await broadcast.stateChange(ticketId, 'in_progress', {
    phase: 'starting',
    message: 'Agent execution starting'
  });
  
  // 2. After VM assignment
  const vm = await this.vmManager.assignVM(ticket);
  await broadcast.progress(ticketId, 'vm_assigned', `VM ${vm.id} assigned`, {
    vmId: vm.id
  });
  
  // 3. During agent execution
  await broadcast.progress(ticketId, 'executing', 'Agent generating code...', {
    agentId: ticket.assignee_id
  });
  
  // 4. After PR creation (if applicable)
  if (result.prUrl) {
    await broadcast.prCreated(ticketId, result.prUrl, {
      branch: result.branch
    });
  }
  
  // 5. On completion
  await broadcast.stateChange(ticketId, 'done', {
    phase: 'completed',
    duration: Date.now() - startTime
  });
  
  // 6. On failure
  // (in catch block)
  await broadcast.stateChange(ticketId, 'failed', {
    error: error.message
  });
}
```

### Phase 2: Add Activity Events

**File:** `/opt/swarm-app/packages/engine/lib/engine.js`

Log activity events for the timeline:

```javascript
// On ticket claim
await broadcast.activity(ticketId, 'execution', 
  'Execution started', ticket.assignee_id, 
  { trigger: 'engine_poll' });

// On code generation
await broadcast.activity(ticketId, 'agent',
  'Code generation completed', ticket.assignee_id,
  { files: result.files?.length || 0 });

// On PR creation
await broadcast.activity(ticketId, 'git',
  `PR created: ${result.prUrl}`, 'system',
  { prUrl: result.prUrl, branch: result.branch });

// On sentinel review (if applicable)
await broadcast.activity(ticketId, 'review',
  'Submitted for sentinel review', 'system',
  { nextState: 'in_review' });
```

### Phase 3: Update Internal API Handler

**File:** `/opt/swarm-app/apps/platform/routes/internal.js`

Verify the ticket-event handler broadcasts correctly:

```javascript
router.post('/ticket-event', (req, res) => {
  const { ticketId, event, ...data } = req.body;
  
  // Log for debugging
  console.log(`[Internal] Ticket event: ${ticketId} - ${event}`, data);
  
  switch (event) {
    case 'state_change':
      broadcast.ticketUpdate(ticketId, data.state, {
        phase: data.phase,
        message: data.message,
        ...data
      });
      break;
      
    case 'progress':
      broadcast.toRoom(`ticket:${ticketId}`, 'ticket:progress', {
        ticketId,
        phase: data.phase,
        message: data.message,
        ...data
      });
      break;
      
    case 'pr_created':
      broadcast.toRoom(`ticket:${ticketId}`, 'ticket:pr', {
        ticketId,
        prUrl: data.prUrl,
        ...data
      });
      break;
      
    case 'activity':
      broadcast.toRoom(`ticket:${ticketId}`, 'ticket:activity', {
        ticketId,
        entry: {
          category: data.category,
          message: data.message,
          actor_id: data.actorId,
          metadata: data.metadata,
          timestamp: new Date().toISOString()
        }
      });
      break;
  }
  
  res.json({ success: true, event });
});
```

### Phase 4: Frontend Event Handlers

**File:** `/opt/swarm-app/apps/dashboard/src/hooks/useTicketActivity.js`

Ensure all event types are handled:

```javascript
const { isConnected } = useWebSocket({
  room: ticketId ? `ticket:${ticketId}` : null,
  enabled: enabled && !!ticketId,
  handlers: {
    'ticket:activity': handleActivityUpdate,
    'ticket:update': (data) => {
      // Trigger parent refresh or update local state
      console.log('[WS] Ticket updated:', data);
    },
    'ticket:progress': (data) => {
      // Could show progress indicator
      console.log('[WS] Ticket progress:', data.phase, data.message);
    },
    'ticket:pr': (data) => {
      // PR created - add to activity
      handleActivityUpdate({
        ticket_id: data.ticketId,
        entry: {
          category: 'git',
          message: `PR created: ${data.prUrl}`,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
});
```

### Phase 5: TicketDetail Real-Time Updates

**File:** `/opt/swarm-app/apps/dashboard/src/pages/TicketDetail.jsx`

Add ticket state refresh on WebSocket events:

```javascript
// In useTicketActivity options, add a callback for state changes
const {
  activity,
  isConnected,
  // ... other returns
} = useTicketActivity(ticketId, {
  onTicketUpdate: (data) => {
    // Refresh ticket data when state changes
    if (data.state && data.state !== ticket?.state) {
      loadTicket();
    }
  }
});
```

Or enhance useTicketActivity to return ticket updates.

## Testing Checklist

### Test 1: Basic Broadcast
```bash
# On dev droplet - manually trigger a broadcast
curl -X POST http://localhost:8080/api/internal/ticket-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer swarm-internal-dev-key-2024" \
  -d '{
    "ticketId": "TKT-TEST-001",
    "event": "state_change",
    "state": "in_progress",
    "message": "Test broadcast"
  }'
```

### Test 2: Dashboard Receives Event
1. Open TicketDetail page for a ticket
2. Open browser DevTools → Network → WS
3. Run the curl command above
4. Verify WS message received

### Test 3: Full Execution Flow
1. Create a test ticket assigned to forge-v3
2. Set state to 'ready'
3. Watch engine logs: `pm2 logs swarm-engine`
4. Watch dashboard for real-time updates
5. Verify activity timeline updates without refresh

## Environment

| Resource | Value |
|----------|-------|
| Dev Droplet | 134.199.235.140 |
| Node Path | /root/.nvm/versions/node/v22.21.1/bin |
| Platform Port | 8080 |
| WebSocket Path | /ws |
| Internal API Key | swarm-internal-dev-key-2024 |

## Key Files

| File | Location | Purpose |
|------|----------|---------|
| Engine | /opt/swarm-app/packages/engine/lib/engine.js | Main execution loop |
| Engine Broadcast | /opt/swarm-app/packages/engine/lib/broadcast.js | Broadcast utilities |
| Platform WS | /opt/swarm-app/apps/platform/websocket.js | WebSocket server |
| Internal API | /opt/swarm-app/apps/platform/routes/internal.js | Engine→Platform bridge |
| Activity Hook | /opt/swarm-app/apps/dashboard/src/hooks/useTicketActivity.js | Frontend hook |
| TicketDetail | /opt/swarm-app/apps/dashboard/src/pages/TicketDetail.jsx | Detail page |

## Commands

```bash
# SSH to dev
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Set PATH
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Restart services after changes
pm2 restart swarm-engine swarm-platform-dev

# Watch logs
pm2 logs swarm-engine --lines 50
pm2 logs swarm-platform-dev --lines 50

# Rebuild dashboard
cd /opt/swarm-app/apps/dashboard && npm run build
pm2 restart swarm-dashboard-dev
```

## Success Criteria

1. ✅ Engine broadcasts state changes during execution
2. ✅ Engine broadcasts progress updates (vm_assigned, executing, etc.)
3. ✅ Engine broadcasts PR creation
4. ✅ Engine broadcasts activity events for timeline
5. ✅ Internal API routes events to WebSocket
6. ✅ Dashboard receives events in real-time
7. ✅ TicketDetail activity timeline updates without refresh
8. ✅ Tickets list updates state in real-time

## Estimated Time

| Phase | Time |
|-------|------|
| Phase 1: Engine Broadcasts | 1 hour |
| Phase 2: Activity Events | 30 min |
| Phase 3: Internal API | 30 min |
| Phase 4: Frontend Handlers | 30 min |
| Phase 5: TicketDetail Updates | 30 min |
| Testing | 30 min |
| **Total** | **3-4 hours** |

## Git Workflow

```bash
# After changes
cd /opt/swarm-app
git add -A
git commit -m "feat: wire up real-time WebSocket broadcasts for agent execution"
git push

# Update session notes
echo "## WebSocket Integration Complete - $(date)" >> specs/session-notes/current.md
git add specs/session-notes/current.md
git commit -m "docs: update session notes"
git push
```
