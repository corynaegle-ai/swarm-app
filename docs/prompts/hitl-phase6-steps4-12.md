# HITL Phase 6 Completion - Steps 4-12

## Session Goal
Complete remaining frontend work for Build Flow: useHITL hook update, BuildConfirmModal, BuildProgress page, and wiring.

## Completed Steps
- ✅ Step 1: `update-spec` endpoint added to `/opt/swarm-platform/routes/hitl.js` (lines 261-291)
- ✅ Step 2: `start-build` endpoint added to `/opt/swarm-platform/routes/hitl.js` (lines 295-334)
- ✅ Step 3: Platform service restarted, endpoints verified working

---

## Step 4: Add startBuild to useHITL Hook

**File:** `/opt/swarm-dashboard/src/hooks/useHITL.js`

**4a: Find approveSpec function and add after it:**
```javascript
  // Start build (Gate 5 - from approved state)
  const startBuild = useCallback((sessionId, confirmed = true) =>
    apiCall(`${API_BASE}/${sessionId}/start-build`, {
      method: 'POST',
      body: JSON.stringify({ confirmed })
    }), [apiCall]);
```

**4b: Add `startBuild` to the return object**

**Verify:**
```bash
grep -n 'startBuild' /opt/swarm-dashboard/src/hooks/useHITL.js
```

---

## Step 5: Create BuildConfirmModal Component

**File:** `/opt/swarm-dashboard/src/components/BuildConfirmModal.jsx` (NEW)

```javascript
/**
 * BuildConfirmModal - Gate 5 confirmation before starting ticket generation
 */
import { useState } from 'react';

export default function BuildConfirmModal({ 
  session, 
  onConfirm, 
  onCancel, 
  isProcessing 
}) {
  const [confirmed, setConfirmed] = useState(false);

  const spec = (() => {
    try {
      if (!session?.spec_card) return null;
      return typeof session.spec_card === 'string' 
        ? JSON.parse(session.spec_card) 
        : session.spec_card;
    } catch { return null; }
  })();

  const estimatedTickets = spec?.features?.length * 3 || 10;
  const estimatedVMs = Math.min(estimatedTickets, 10);

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card build-confirm-modal">
        <h2>🚀 Start Build</h2>
        <p className="modal-subtitle">
          Ready to generate tickets from your approved specification?
        </p>

        <div className="estimate-grid">
          <div className="estimate-item">
            <span className="estimate-value">{estimatedTickets}</span>
            <span className="estimate-label">Estimated Tickets</span>
          </div>
          <div className="estimate-item">
            <span className="estimate-value">{estimatedVMs}</span>
            <span className="estimate-label">VMs to Spawn</span>
          </div>
          <div className="estimate-item">
            <span className="estimate-value">~{estimatedTickets * 2}min</span>
            <span className="estimate-label">Est. Duration</span>
          </div>
        </div>

        <div className="warning-box">
          <span className="warning-icon">⚠️</span>
          <p>
            This will create tickets and spawn AI agents to implement your project.
            This action cannot be undone.
          </p>
        </div>

        <label className="confirm-checkbox">
          <input 
            type="checkbox" 
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I understand and want to proceed with ticket generation</span>
        </label>

        <div className="modal-actions">
          <button 
            onClick={onCancel}
            className="action-btn cancel"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="action-btn success"
            disabled={!confirmed || isProcessing}
          >
            {isProcessing ? '⏳ Starting...' : '🚀 Start Build'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 6: Add Modal Styles

**File:** `/opt/swarm-dashboard/src/index.css` (append)

```css
/* Build Confirm Modal */
.build-confirm-modal {
  max-width: 500px;
  padding: 2rem;
}

.build-confirm-modal h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
}

.modal-subtitle {
  color: #888;
  margin-bottom: 1.5rem;
}

.estimate-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.estimate-item {
  text-align: center;
  padding: 1rem;
  background: rgba(0, 212, 255, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(0, 212, 255, 0.2);
}

.estimate-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #00d4ff;
}

.estimate-label {
  font-size: 0.75rem;
  color: #888;
  text-transform: uppercase;
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.warning-icon {
  font-size: 1.25rem;
}

.warning-box p {
  margin: 0;
  font-size: 0.875rem;
  color: #ffa500;
}

.confirm-checkbox {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  cursor: pointer;
}

.confirm-checkbox input {
  width: 18px;
  height: 18px;
  accent-color: #00d4ff;
}

.confirm-checkbox span {
  font-size: 0.875rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

/* Build Progress Page */
.build-progress-page .build-progress-main {
  padding: 2rem;
}

.build-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.build-content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.progress-section {
  grid-column: 1 / -1;
  padding: 1.5rem;
}

.build-progress-bar {
  height: 24px;
  background: rgba(255,255,255,0.1);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.build-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #00ff88);
  border-radius: 12px;
  transition: width 0.5s ease;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  color: #888;
  font-size: 0.875rem;
}

.complete-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
}

.complete-banner.success {
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid rgba(0, 255, 136, 0.3);
  color: #00ff88;
}

.complete-banner.error {
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.3);
  color: #ff4444;
}

.logs-section, .tickets-section {
  padding: 1.5rem;
  max-height: 400px;
  overflow-y: auto;
}

.logs-container {
  font-family: monospace;
  font-size: 0.875rem;
}

.log-entry {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.logs-empty {
  color: #666;
  font-style: italic;
}

.tickets-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ticket-item {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem;
  background: rgba(255,255,255,0.05);
  border-radius: 6px;
}

.ticket-title {
  font-weight: 500;
}

.ticket-type {
  font-size: 0.75rem;
  color: #888;
  text-transform: uppercase;
}
```

---

## Step 7: Wire Modal into SpecReview.jsx

**File:** `/opt/swarm-dashboard/src/pages/SpecReview.jsx`

**7a: Add import at top:**
```javascript
import BuildConfirmModal from '../components/BuildConfirmModal';
```

**7b: Add state (~line 30):**
```javascript
const [showBuildModal, setShowBuildModal] = useState(false);
```

**7c: Add startBuild to useHITL destructure:**
```javascript
const { 
  getSession, approveSpec, requestRevision, updateSpec, startBuild,
  loading, error, clearError 
} = useHITL();
```

**7d: Add handler after handleApprove:**
```javascript
// Handle start build (Gate 5)
const handleStartBuild = async () => {
  setIsProcessing(true);
  try {
    await startBuild(sessionId, true);
    toast.success('Build started! Generating tickets...');
    setShowBuildModal(false);
    navigate(`/build/${sessionId}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    setIsProcessing(false);
  }
};
```

**7e: Add button in header-actions (after Approve button):**
```javascript
{session?.state === 'approved' && (
  <button 
    onClick={() => setShowBuildModal(true)}
    className="action-btn primary"
    disabled={isProcessing}
  >
    🚀 Start Build
  </button>
)}
```

**7f: Add modal before closing `</main>`:**
```javascript
{showBuildModal && (
  <BuildConfirmModal
    session={session}
    onConfirm={handleStartBuild}
    onCancel={() => setShowBuildModal(false)}
    isProcessing={isProcessing}
  />
)}
```

---

## Step 8: Create BuildProgress Page

**File:** `/opt/swarm-dashboard/src/pages/BuildProgress.jsx` (NEW)

```javascript
/**
 * BuildProgress - Real-time ticket generation progress display
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserMenu from '../components/UserMenu';
import useHITL from '../hooks/useHITL';
import { useSessionWebSocket } from '../hooks';

export default function BuildProgress() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getSession } = useHITL();
  
  const [session, setSession] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [logs, setLogs] = useState([]);

  const { isConnected } = useSessionWebSocket(sessionId, {
    onSessionUpdate: (data) => {
      setSession(prev => ({ ...prev, ...data }));
    },
    onTicketCreated: (data) => {
      if (data.ticket) {
        setTickets(prev => [...prev, data.ticket]);
        setLogs(prev => [...prev, `✅ Ticket created: ${data.ticket.title}`]);
      }
    },
    onBuildComplete: () => {
      setLogs(prev => [...prev, '🎉 Build complete!']);
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getSession(sessionId);
        setSession(data.session);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, [sessionId, getSession]);

  const spec = (() => {
    try {
      if (!session?.spec_card) return null;
      return typeof session.spec_card === 'string' 
        ? JSON.parse(session.spec_card) 
        : session.spec_card;
    } catch { return null; }
  })();

  const expectedTickets = spec?.features?.length * 3 || 10;
  const progress = Math.min(100, Math.round((tickets.length / expectedTickets) * 100));
  const isComplete = session?.state === 'completed';
  const isFailed = session?.state === 'failed';

  return (
    <div className="dashboard build-progress-page">
      <header className="dashboard-header">
        <h1>🐝 Swarm Dashboard</h1>
        <UserMenu />
      </header>
      
      <nav className="dashboard-nav">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/tickets">Tickets</Link>
        <Link to="/projects/new">New Project</Link>
      </nav>

      <main className="build-progress-main">
        <div className="build-header glass-card">
          <h2>🔨 Building: {session?.project_name || 'Project'}</h2>
          <span className={`connection-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Live' : '🔴 Disconnected'}
          </span>
        </div>

        <div className="build-content-grid">
          <div className="progress-section glass-card">
            <h3>📊 Progress</h3>
            <div className="build-progress-bar">
              <div className="build-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-stats">
              <span>{tickets.length} / {expectedTickets} tickets</span>
              <span>{progress}%</span>
            </div>

            {isComplete && (
              <div className="complete-banner success">
                🎉 Build Complete!
                <button onClick={() => navigate('/tickets')} className="action-btn primary">
                  View Tickets
                </button>
              </div>
            )}

            {isFailed && (
              <div className="complete-banner error">
                ⚠️ Build Failed
                <button onClick={() => navigate(`/design/${sessionId}`)} className="action-btn secondary">
                  Back to Design
                </button>
              </div>
            )}
          </div>

          <div className="logs-section glass-card">
            <h3>📜 Build Logs</h3>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p className="logs-empty">Waiting for build events...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="log-entry">{log}</div>
                ))
              )}
            </div>
          </div>

          <div className="tickets-section glass-card">
            <h3>📝 Tickets Created ({tickets.length})</h3>
            <div className="tickets-list">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="ticket-item">
                  <span className="ticket-title">{ticket.title}</span>
                  <span className="ticket-type">{ticket.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
```

---

## Step 9: Add Route in App.jsx

**File:** `/opt/swarm-dashboard/src/App.jsx`

**9a: Add import:**
```javascript
import BuildProgress from './pages/BuildProgress';
```

**9b: Add route after `/review/:sessionId`:**
```javascript
<Route path="/build/:sessionId" element={
  <ProtectedRoute>
    <BuildProgress />
  </ProtectedRoute>
} />
```

---

## Step 10: Rebuild Dashboard

```bash
cd /opt/swarm-dashboard && npm run build 2>&1 | tail -15
```

**Expected:** `✓ built in X.XXs` with no errors

---

## Step 11: Browser Testing

1. Open https://dashboard.swarmstack.net
2. Navigate to approved session → `/review/:sessionId`
3. Verify "🚀 Start Build" button visible
4. Click button → modal appears with estimates
5. Check checkbox → click "Start Build"
6. Verify redirect to `/build/:sessionId`
7. Verify progress page renders

---

## Step 12: Git Commits

**Dashboard:**
```bash
cd /opt/swarm-dashboard && git add -A && git commit -m 'Phase 6: Build confirmation modal and progress page

- BuildConfirmModal component (Gate 5)
- BuildProgress page with real-time updates  
- startBuild in useHITL hook
- /build/:sessionId route
- Modal and progress CSS styles' && git push origin main
```

**Platform:**
```bash
cd /opt/swarm-platform && git add -A && git commit -m 'Add update-spec and start-build HITL endpoints

- POST /api/hitl/:sessionId/update-spec
- POST /api/hitl/:sessionId/start-build (Gate 5)' && git push origin main
```

---

## Verification Checklist

| Item | Command |
|------|---------|
| startBuild in hook | `grep -n 'startBuild' /opt/swarm-dashboard/src/hooks/useHITL.js` |
| BuildConfirmModal | `ls /opt/swarm-dashboard/src/components/BuildConfirmModal.jsx` |
| BuildProgress | `ls /opt/swarm-dashboard/src/pages/BuildProgress.jsx` |
| Route exists | `grep -n 'BuildProgress' /opt/swarm-dashboard/src/App.jsx` |
| Build succeeds | No errors from `npm run build` |

## Success Criteria

- ✅ startBuild function in useHITL hook
- ✅ BuildConfirmModal shows estimates + checkbox
- ✅ Start Build button on approved sessions
- ✅ BuildProgress page displays
- ✅ All committed to git
