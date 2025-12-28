# Kanban WebSocket Implementation Prompt

## Objective
Add real-time WebSocket updates to KanbanBoard.jsx to **eliminate polling and avoid API rate limits**. Follow the existing pattern in Tickets.jsx, then validate both pages receive live ticket status changes via push notifications.

## Problem Statement
- **Polling creates rate limit issues** - Multiple dashboard tabs hitting `/api/tickets` creates unnecessary API load
- **WebSocket push is more efficient** - Server broadcasts changes once, all clients receive instantly
- **Better UX** - No refresh delay, instant updates across all open tabs

## Current State
| Page | Update Mechanism | Rate Limit Risk |
|------|------------------|-----------------|
| Tickets.jsx | ✅ WebSocket push | Low - event-driven |
| KanbanBoard.jsx | ❌ Manual only | Medium - if polling added later |

## Context
- **Tickets.jsx**: Already has WebSocket via `useWebSocket` hook - NO polling
- **KanbanBoard.jsx**: Missing WebSocket - only updates on drag-drop or page refresh
- **Platform**: Server broadcasts `ticket:update` events to tenant rooms
- **Target**: DEV droplet (134.199.235.140) monorepo at `/opt/swarm-app`

## Implementation Steps

### Step 1: Add WebSocket to KanbanBoard.jsx

Query RAG for current KanbanBoard.jsx code:
```bash
curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "KanbanBoard import useState useEffect", "limit": 3}'
```

**Add import** (after existing imports):
```javascript
import { useWebSocket } from '../hooks/useWebSocket';
```

**Add useAuth import** (if not already present - needed for tenant_id):
```javascript
import { useAuth } from '../context/AuthContext';
```

**Add WebSocket handler** (inside KanbanBoard function, after fetchData definition):
```javascript
// Get user for tenant room subscription
const { user } = useAuth();

// WebSocket for real-time updates (replaces polling)
const handleTicketUpdate = useCallback((data) => {
  console.log('[WS] Kanban ticket update:', data);
  if (data.action) {
    fetchData();  // Refresh on push notification
  }
}, [fetchData]);

const { isConnected } = useWebSocket({
  room: user?.tenant_id ? `tenant:${user.tenant_id}` : null,
  handlers: {
    'ticket:update': handleTicketUpdate
  },
  enabled: !!user?.tenant_id
});
```

**Add connection indicator** (optional, in header area near title):
```jsx
<div className="kanban-title">
  <h2>📋 Kanban Board {isConnected && <span title="Live updates active">🟢</span>}</h2>
  <p>Drag and drop tickets between columns</p>
</div>
```

### Step 2: Deploy to DEV

```bash
# SSH to dev droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140

# Navigate to dashboard
cd /opt/swarm-app/apps/dashboard

# Edit KanbanBoard.jsx
nano src/pages/KanbanBoard.jsx
# Apply changes from Step 1

# Rebuild dashboard
npm run build

# Static files served by Caddy - no restart needed
echo "Build complete - Caddy serves static files automatically"
```

### Step 3: Validate Push-Based Updates

#### Test 1: Verify NO Polling Exists
1. Open browser to Kanban page
2. Open Network tab (F12 → Network)
3. Filter by "tickets" or "api"
4. Wait 30 seconds
5. **Expected**: No repeated API calls (only initial load)

#### Test 2: WebSocket Connection
1. Open browser console (F12 → Console)
2. Navigate to Kanban page
3. Look for: `[WebSocket] Connected` and room subscription
4. **Expected**: WebSocket connects and subscribes to tenant room

#### Test 3: Push Update Reception
1. Keep Kanban page open with console visible
2. In terminal, trigger a ticket update via API:
```bash
# Get a valid token first, then:
curl -X PATCH https://api.dev.swarmstack.net/api/tickets/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state": "in_progress"}'
```
3. **Expected**: Console shows `[WS] Kanban ticket update` and board refreshes

#### Test 4: Cross-Page Sync (Both Push)
1. Open Tickets page in Tab 1
2. Open Kanban board in Tab 2
3. Drag a card in Kanban to new column
4. **Expected**: Tickets page auto-updates (no polling, WebSocket push)
5. Change state via dropdown in Tickets page
6. **Expected**: Kanban board auto-updates (no polling, WebSocket push)

#### Test 5: Multi-Tab Efficiency
1. Open 5 Kanban tabs
2. Monitor Network tab in each
3. Make one change
4. **Expected**: All tabs update from single WebSocket broadcast, NOT 5 separate API polls

### Validation Checklist

| Test | Expected | Pass? |
|------|----------|-------|
| No setInterval/polling in code | ✅ | ☐ |
| No repeated API calls in Network tab | ✅ | ☐ |
| WebSocket connects on page load | ✅ | ☐ |
| Console shows `[WS]` messages on update | ✅ | ☐ |
| Cross-tab sync works instantly | ✅ | ☐ |
| Multiple tabs = 1 broadcast, not N polls | ✅ | ☐ |

## Rollback
If issues occur, revert KanbanBoard.jsx:
```bash
cd /opt/swarm-app
git checkout apps/dashboard/src/pages/KanbanBoard.jsx
npm run build --prefix apps/dashboard
```

## Success Criteria
- [ ] Zero polling/setInterval in dashboard code
- [ ] Both pages use WebSocket push exclusively
- [ ] API rate limit risk eliminated
- [ ] All open tabs sync via single broadcast
- [ ] Drag-drop still works on Kanban

## Architecture After Implementation
```
┌─────────────────────────────────────────────────────────────┐
│                     Platform API                             │
│  ┌─────────────┐                    ┌──────────────────┐    │
│  │ Ticket API  │───state change────▶│ WebSocket Server │    │
│  └─────────────┘                    └────────┬─────────┘    │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                          broadcast: ticket:update
                                               │
              ┌────────────────────────────────┼────────────────┐
              ▼                                ▼                ▼
     ┌────────────────┐              ┌────────────────┐  ┌────────────┐
     │  Tickets.jsx   │              │ KanbanBoard.jsx│  │  Tab N...  │
     │  (WebSocket)   │              │  (WebSocket)   │  │ (WebSocket)│
     └────────────────┘              └────────────────┘  └────────────┘
         fetchData()                     fetchData()        fetchData()
              │                               │                  │
              └───────────── NO POLLING ──────┴──────────────────┘
```

## Files Modified
- `apps/dashboard/src/pages/KanbanBoard.jsx` - Add WebSocket integration

## Related Code
- `apps/dashboard/src/hooks/useWebSocket.js` - WebSocket hook
- `apps/dashboard/src/pages/Tickets.jsx` - Working reference implementation
- `apps/platform/websocket.js` - Server-side broadcast methods
