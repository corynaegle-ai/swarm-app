# WebSocket Integration & Track 1 HITL Completion Prompt

## Session Goal
Complete real-time WebSocket integration for HITL sessions and finish Track 1 remaining items.

## Current State (2025-12-14)

### ✅ Completed
1. **Backend WebSocket Server** - `/opt/swarm-platform/websocket.js` (350+ lines)
   - JWT authentication via query string
   - Room-based subscriptions (session:id, tenant:id)
   - Heartbeat every 30s, auto-reconnect support
   - Broadcast helpers: sessionUpdate, sessionMessage, approvalRequested, approvalResolved, buildProgress, specGenerated, ticketsGenerated

2. **React Hooks Created** - `/opt/swarm-dashboard/src/hooks/`
   - `useWebSocket.js` - Core WebSocket with auto-reconnect, room subscriptions
   - `useSessionWebSocket.js` - Convenience wrapper for HITL sessions
   - `index.js` - Clean exports

3. **Backend Broadcasts Wired Up** (commit `cd90902`)
   - clarification-agent.js: State changes + all messages
   - ai-dispatcher.js: specGenerated after spec creation
   - hitl.js: approvalResolved after approval
   - websocket.js: Added specGenerated, ticketsGenerated methods

### ❌ Remaining Work

#### Phase 1: Update DesignSession Component (Priority: HIGH)
Replace polling with WebSocket in `/opt/swarm-dashboard/src/pages/DesignSession.jsx`

Current polling pattern (REMOVE):
```javascript
useEffect(() => {
  pollIntervalRef.current = setInterval(fetchSession, 3000);
}, [session?.state]);
```

Target WebSocket pattern (ADD):
```javascript
import { useSessionWebSocket } from '../hooks';

// Inside component:
const { isConnected, connectionState } = useSessionWebSocket(sessionId, {
  onSessionUpdate: (data) => {
    setSession(prev => ({ ...prev, state: data.state, progress_percent: data.progress }));
  },
  onNewMessage: (data) => {
    setMessages(prev => [...prev, data.message]);
  },
  onSpecGenerated: (data) => {
    setSession(prev => ({ ...prev, spec_card: JSON.stringify(data.spec) }));
  },
  onApprovalResolved: (data) => {
    // Refresh session after approval
    fetchSession();
  }
});
```

#### Phase 2: Add Connection Status UI
Show WebSocket connection status in DesignSession header:
```jsx
<div className="connection-status">
  {isConnected ? (
    <span className="text-green-500">● Live</span>
  ) : (
    <span className="text-yellow-500">● Reconnecting...</span>
  )}
</div>
```

#### Phase 3: Timeout Handling for Approvals (Track 1 remaining)
Add timeout mechanism for pending approvals in `/opt/swarm-platform/`:

1. Add `expires_at` column to hitl_approvals table
2. Create background job to check expired approvals
3. Auto-transition expired approvals to 'timeout' status
4. Broadcast timeout events via WebSocket

#### Phase 4: Testing
1. Open two browser tabs with same session
2. Verify messages appear in real-time without refresh
3. Test reconnection by killing/restarting swarm-platform
4. Verify state changes propagate immediately

## Key Files

| File | Purpose |
|------|---------|
| `/opt/swarm-platform/websocket.js` | WebSocket server |
| `/opt/swarm-platform/routes/hitl.js` | HITL REST endpoints |
| `/opt/swarm-platform/services/ai-dispatcher.js` | AI action dispatch |
| `/opt/swarm-platform/agents/clarification-agent.js` | Clarification flow |
| `/opt/swarm-dashboard/src/hooks/useWebSocket.js` | React WebSocket hook |
| `/opt/swarm-dashboard/src/hooks/useSessionWebSocket.js` | Session-specific hook |
| `/opt/swarm-dashboard/src/pages/DesignSession.jsx` | Session UI (needs update) |

## Commands

```bash
# SSH to droplet
ssh root@146.190.35.235

# Check service status
pm2 status

# Restart platform after changes
pm2 restart swarm-platform

# View logs
pm2 logs swarm-platform --lines 50

# Rebuild dashboard
cd /opt/swarm-dashboard && npm run build

# Test WebSocket connection
wscat -c "wss://dashboard.swarmstack.net/ws?token=YOUR_JWT"
```

## Git Repos
- Platform: `/opt/swarm-platform` → github.com/corynaegle-ai/swarm-platform
- Dashboard: `/opt/swarm-dashboard` → github.com/corynaegle-ai/swarm-dashboard
- Specs: `/opt/swarm-specs` → github.com/corynaegle-ai/swarm-specs

## Estimated Time
- Phase 1 (DesignSession update): 1 hour
- Phase 2 (Connection status UI): 30 minutes
- Phase 3 (Timeout handling): 1-2 hours
- Phase 4 (Testing): 30 minutes
- **Total: 3-4 hours**

## Success Criteria
1. DesignSession shows messages in real-time without polling
2. Connection status indicator visible in UI
3. Multiple tabs stay in sync
4. Approvals have configurable timeout with auto-expiration
5. All changes committed and pushed to git
