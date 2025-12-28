# WebSocket Phase 1 Remaining Steps (6-12)

## Session Goal
Complete DesignSession.jsx WebSocket integration - implement remaining handlers and remove polling.

## Current State (Steps 1-5 Complete)

### ✅ Done
- **Step 1-2**: Identified polling pattern at line 101 (`setInterval(fetchSession, 3000)`)
- **Step 3**: Added import: `import { useSessionWebSocket } from '../hooks';`
- **Step 4**: Added useSessionWebSocket hook call with all handler stubs
- **Step 5**: Implemented `onSessionUpdate` handler

### Current Code (lines 65-77)
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
  onNewMessage: (data) => {},
  onSpecGenerated: (data) => {},
  onApprovalResolved: (data) => {}
});
```

---

## Remaining Steps

### Step 6: Implement onNewMessage handler
Replace empty `onNewMessage: (data) => {}` with:
```javascript
onNewMessage: (data) => {
  if (data.message) {
    setMessages(prev => [...prev, data.message]);
  }
},
```

**Command:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sed -i 's/onNewMessage: (data) => {},/onNewMessage: (data) => { if (data.message) { setMessages(prev => [...prev, data.message]); } },/' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

### Step 7: Implement onSpecGenerated handler
Replace empty `onSpecGenerated: (data) => {}` with:
```javascript
onSpecGenerated: (data) => {
  if (data.spec) {
    setSession(prev => ({ ...prev, spec_card: JSON.stringify(data.spec) }));
  }
},
```

**Command:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sed -i 's/onSpecGenerated: (data) => {},/onSpecGenerated: (data) => { if (data.spec) { setSession(prev => ({ ...prev, spec_card: JSON.stringify(data.spec) })); } },/' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

### Step 8: Implement onApprovalResolved handler
Replace empty `onApprovalResolved: (data) => {}` with:
```javascript
onApprovalResolved: (data) => {
  fetchSession();
}
```

**Command:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sed -i 's/onApprovalResolved: (data) => {}/onApprovalResolved: (data) => { fetchSession(); }/' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

### Step 9: Remove polling useEffect
Find and comment out/remove the polling useEffect block (around lines 110-120 after edits):

**First, verify current line numbers:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "grep -n 'setInterval\|pollInterval' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

**Then remove the polling useEffect (replace with comment):**
The block to remove looks like:
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

Replace with:
```javascript
// Polling removed - using WebSocket for real-time updates
// See useSessionWebSocket hook above
```

### Step 10: Rebuild dashboard
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "cd /opt/swarm-dashboard && npm run build"
```

### Step 11: Test in browser
1. Open https://dashboard.swarmstack.net
2. Navigate to a design session
3. Open browser DevTools → Network tab
4. Verify NO 3-second polling requests
5. Verify WebSocket connection established (ws:// in Network)
6. Send a message, verify it appears without page refresh

### Step 12: Commit changes
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "cd /opt/swarm-dashboard && git add -A && git commit -m 'Replace polling with WebSocket in DesignSession' && git push origin main"
```

---

## Verification Commands

**Check final hook implementation:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "sed -n '65,80p' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```

**Confirm polling removed:**
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235 "grep -n 'setInterval' /opt/swarm-dashboard/src/pages/DesignSession.jsx"
```
(Should return nothing or only the comment)

---

## Success Criteria
1. ✅ All 4 WebSocket handlers implemented
2. ✅ Polling useEffect removed
3. ✅ Dashboard builds without errors
4. ✅ WebSocket connection visible in DevTools
5. ✅ Messages appear in real-time
6. ✅ Changes committed to git

## Estimated Time
~30-45 minutes for steps 6-12
