# WebSocket Phase 1 Final Steps (9-12)

## Session Goal
Complete DesignSession.jsx WebSocket integration - remove polling and finalize.

## Current State (Steps 1-8 Complete)

### ✅ Done
- **Step 1-2**: Identified polling pattern at line 101 (`setInterval(fetchSession, 3000)`)
- **Step 3**: Added import: `import { useSessionWebSocket } from '../hooks';`
- **Step 4-5**: Added useSessionWebSocket hook with all handlers
- **Step 6**: Implemented `onNewMessage` handler
- **Step 7**: Implemented `onSpecGenerated` handler
- **Step 8**: Implemented `onApprovalResolved` handler

### Current Code (lines 64-77)
```javascript
// WebSocket for real-time updates
const { isConnected, connectionState } = useSessionWebSocket(sessionId, {
  onSessionUpdate: (data) => {
    setSession(prev => ({
      ...prev,
      state: data.state || prev?.state,
      progress_percent: data.progress || prev?.progress_percent
    }));
  },
  onNewMessage: (data) => { if (data.message) { setMessages(prev => [...prev, data.message]); } },
  onSpecGenerated: (data) => { if (data.spec) { setSession(prev => ({ ...prev, spec_card: JSON.stringify(data.spec) })); } },
  onApprovalResolved: (data) => { fetchSession(); }
});
```

---

## Remaining Steps

### Step 9: Remove polling useEffect

**First, find the polling block:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "grep -n 'setInterval\|pollInterval' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

**The block to remove looks like:**
```javascript
useEffect(() => {
  if (!['completed', 'cancelled', 'failed'].includes(session?.state)) {
    pollIntervalRef.current = setInterval(fetchSession, 3000);
  }
  return () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };
}, [session?.state, fetchSession]);
```

**Replace with comment:**
```bash
# First, view exact lines to replace
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sed -n '110,125p' /opt/swarm-dashboard/src/pages/DesignSession.jsx"

# Then use sed to comment out the polling useEffect
# (adjust line numbers based on grep output above)
```

**Target replacement:**
```javascript
// Polling removed - using WebSocket for real-time updates
// See useSessionWebSocket hook above
```

---

### Step 10: Rebuild dashboard
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "cd /opt/swarm-dashboard && npm run build 2>&1 | tail -15"
```

**Expected output:** `✓ built in X.XXs` with no errors

---

### Step 11: Test in browser

1. Open https://dashboard.swarmstack.net
2. Navigate to a design session
3. Open browser DevTools → Network tab
4. **Verify NO 3-second polling requests** (no repeated GET to /api/sessions)
5. **Verify WebSocket connection** established (ws:// in Network tab)
6. Send a message, verify it appears without page refresh

---

### Step 12: Commit changes
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "cd /opt/swarm-dashboard && git add -A && git commit -m 'Remove polling from DesignSession - WebSocket approach complete

- Remove setInterval polling useEffect
- WebSocket handlers now provide real-time updates
- Reduces server load from 3s polling to event-driven updates' && git push origin main"
```

---

## Verification Commands

**Confirm polling removed:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "grep -n 'setInterval' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```
(Should return nothing)

**Check WebSocket hook still present:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "grep -n 'useSessionWebSocket' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

---

## Success Criteria
1. ✅ Polling useEffect removed (no setInterval calls)
2. ✅ Dashboard builds without errors
3. ✅ WebSocket connection visible in DevTools
4. ✅ No 3-second polling in Network tab
5. ✅ Messages appear in real-time
6. ✅ Changes committed to git

## Estimated Time
~15-20 minutes for steps 9-12
