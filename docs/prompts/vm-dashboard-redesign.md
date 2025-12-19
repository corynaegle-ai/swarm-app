# VM Dashboard Redesign Implementation Prompt

## Context

You are implementing a comprehensive UI/UX redesign of the Swarm VM Dashboard. The dashboard manages Firecracker microVMs for a distributed AI agent platform.

**Infrastructure:**
- Droplet: 146.190.35.235
- SSH: `ssh -i ~/.ssh/swarm_key root@146.190.35.235`
- Dashboard repo: `/opt/swarm-dashboard` (React + Vite)
- Platform API: `/opt/swarm-platform` (Express.js on port 8080)
- Live URL: https://dashboard.swarmstack.net/vms

**Current File:** `/opt/swarm-dashboard/src/pages/VMs.jsx`

---

## Critical Issue to Fix First

The current VMs.jsx has an inline `<style>` block with LIGHT theme colors that conflicts with App.css DARK theme. **Remove all inline styles** and use App.css exclusively.

---

## Implementation Tasks

### Phase 1: Foundation (Do First)

#### 1.1 Install Dependencies

```bash
cd /opt/swarm-dashboard
npm install lucide-react react-hot-toast
```

#### 1.2 Setup Toast Provider

Edit `/opt/swarm-dashboard/src/main.jsx`:
```jsx
import { Toaster } from 'react-hot-toast';

// Wrap app or add after App component:
<Toaster 
  position="bottom-right"
  toastOptions={{
    duration: 4000,
    style: {
      background: '#1a1a2e',
      color: '#fff',
      border: '1px solid #333',
    },
    success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
    error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
  }}
/>
```

#### 1.3 Replace Browser Alerts

In VMs.jsx, replace:
- `alert(...)` → `toast.success(...)` or `toast.error(...)`
- `confirm(...)` → Custom confirmation modal OR use a simple state-based confirm

```jsx
import toast from 'react-hot-toast';

// Instead of: alert(`Spawned ${data.spawned} VMs`)
toast.success(`Spawned ${data.spawned} of ${data.requested} VMs`);

// Instead of: alert('Error: ' + err.message)
toast.error(err.message);
```

#### 1.4 Replace Emoji Icons with Lucide

```jsx
import { 
  Monitor,        // VM/computer icon
  RefreshCw,      // Refresh
  Rocket,         // Boot
  Trash2,         // Cleanup/delete
  Power,          // Power/kill
  Loader2,        // Spinner
  AlertCircle,    // Error
  CheckCircle,    // Success
  Clock,          // Time/uptime
  Cpu,            // CPU
  HardDrive,      // Memory/storage
  Activity,       // Status/health
  Server          // Server/VM
} from 'lucide-react';

// Usage examples:
<RefreshCw className={`icon ${loading ? 'spin' : ''}`} size={16} />
<Rocket size={16} /> Boot VMs
<Trash2 size={16} /> Cleanup All
```

---

### Phase 2: Enhanced Component Structure

#### 2.1 New VMs.jsx Structure

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserMenu from '../components/UserMenu';
import toast from 'react-hot-toast';
import { 
  Monitor, RefreshCw, Rocket, Trash2, Power, Loader2,
  AlertCircle, Clock, Cpu, HardDrive, Activity, Server,
  Circle, Wifi
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function VMs() {
  const { user } = useAuth();
  const [status, setStatus] = useState({ count: 0, vms: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bootCount, setBootCount] = useState(1);
  const [booting, setBooting] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [killingPid, setKillingPid] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // For custom confirm modal

  // ... existing fetch/action functions but with toast instead of alert ...

  return (
    <div className="dashboard">
      {/* Header & Nav - keep existing */}
      
      <main className="dashboard-main">
        {/* Page Header */}
        <div className="page-header">
          <div className="page-title">
            <Server size={28} className="page-icon" />
            <div>
              <h2>Virtual Machines</h2>
              <p className="page-subtitle">Manage your Firecracker microVM fleet</p>
            </div>
          </div>
          <div className="page-actions">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>Auto-refresh</span>
            </label>
            <button onClick={fetchStatus} disabled={loading} className="btn btn-secondary">
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="alert-dismiss">×</button>
          </div>
        )}

        {/* Stats Grid - 4 cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon running">
              <Server size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{status.count}</div>
              <div className="stat-label">Running VMs</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon time">
              <Clock size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{lastUpdate ? lastUpdate.toLocaleTimeString() : '--'}</div>
              <div className="stat-label">Last Updated</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon capacity">
              <Activity size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-value">{status.count}/100</div>
              <div className="stat-label">Capacity</div>
              <div className="stat-bar">
                <div className="stat-bar-fill" style={{width: `${status.count}%`}}></div>
              </div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon health">
              <Wifi size={24} />
            </div>
            <div className="stat-content">
              <div className="stat-value healthy">{status.count > 0 ? 'Online' : 'Idle'}</div>
              <div className="stat-label">Fleet Status</div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="action-bar">
          <div className="action-group">
            <span className="action-label">Boot new VMs:</span>
            <select 
              value={bootCount} 
              onChange={(e) => setBootCount(parseInt(e.target.value))}
              className="select"
            >
              {[1, 2, 3, 5, 10, 20].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button onClick={bootVMs} disabled={booting} className="btn btn-primary">
              {booting ? <Loader2 size={16} className="spin" /> : <Rocket size={16} />}
              {booting ? 'Booting...' : 'Boot VMs'}
            </button>
          </div>
          
          <button
            onClick={() => setConfirmAction({ type: 'cleanup' })}
            disabled={cleaning || status.count === 0}
            className="btn btn-danger"
          >
            {cleaning ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            {cleaning ? 'Cleaning...' : 'Cleanup All'}
          </button>
        </div>

        {/* VM Table */}
        <div className="card">
          <div className="card-header">
            <h3>
              <Monitor size={18} />
              Running Instances
            </h3>
            <span className="badge">{status.count}</span>
          </div>
          
          <div className="card-body">
            {loading ? (
              <div className="skeleton-table">
                {[1,2,3].map(i => (
                  <div key={i} className="skeleton-row">
                    <div className="skeleton skeleton-sm"></div>
                    <div className="skeleton skeleton-lg"></div>
                    <div className="skeleton skeleton-sm"></div>
                  </div>
                ))}
              </div>
            ) : status.vms.length === 0 ? (
              <div className="empty-state">
                <Server size={48} className="empty-icon" />
                <h4>No VMs Running</h4>
                <p>Your fleet is idle. Boot some VMs to get started.</p>
                <button onClick={bootVMs} className="btn btn-primary">
                  <Rocket size={16} /> Boot Your First VM
                </button>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>PID</th>
                    <th>IP Address</th>
                    <th>Command</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {status.vms.map((vm, index) => (
                    <tr key={vm.pid} className="vm-row" style={{'--delay': `${index * 50}ms`}}>
                      <td>
                        <span className="status-dot online" title="Running">
                          <Circle size={8} fill="currentColor" />
                        </span>
                      </td>
                      <td className="monospace">{vm.pid}</td>
                      <td className="monospace">10.0.0.{index + 2}</td>
                      <td className="command-cell" title={vm.command}>
                        {vm.command}
                      </td>
                      <td>
                        <button
                          onClick={() => setConfirmAction({ type: 'kill', pid: vm.pid })}
                          disabled={killingPid === vm.pid}
                          className="btn btn-icon btn-ghost-danger"
                          title="Terminate VM"
                        >
                          {killingPid === vm.pid ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Power size={14} />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Confirmation Modal */}
        {confirmAction && (
          <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <AlertCircle size={24} className="text-warning" />
                <h4>Confirm Action</h4>
              </div>
              <div className="modal-body">
                {confirmAction.type === 'cleanup' ? (
                  <p>This will terminate <strong>ALL {status.count}</strong> running VMs. This action cannot be undone.</p>
                ) : (
                  <p>Terminate VM with PID <strong>{confirmAction.pid}</strong>?</p>
                )}
              </div>
              <div className="modal-footer">
                <button onClick={() => setConfirmAction(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (confirmAction.type === 'cleanup') {
                      cleanupAll();
                    } else {
                      killVM(confirmAction.pid);
                    }
                    setConfirmAction(null);
                  }} 
                  className="btn btn-danger"
                >
                  {confirmAction.type === 'cleanup' ? 'Cleanup All' : 'Terminate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

---

### Phase 3: CSS Styles

Add these styles to `/opt/swarm-dashboard/src/App.css`:

```css
/* ============================================
   VM Dashboard Redesign Styles
   ============================================ */

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.page-icon {
  color: #00d4ff;
}

.page-title h2 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  color: #fff;
}

.page-subtitle {
  margin: 0.25rem 0 0;
  color: #888;
  font-size: 0.9rem;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* Toggle Label */
.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #888;
  font-size: 0.9rem;
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #00d4ff;
  cursor: pointer;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
  color: #000;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
}

.btn-secondary {
  background: #2a2a3e;
  color: #fff;
  border: 1px solid #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #333;
  border-color: #444;
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.btn-icon {
  padding: 0.5rem;
  border-radius: 6px;
}

.btn-ghost-danger {
  background: transparent;
  color: #888;
}

.btn-ghost-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Select */
.select {
  padding: 0.625rem 1rem;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 8px;
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: #00d4ff;
}

/* Alerts */
.alert {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.alert-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.alert-dismiss {
  margin-left: auto;
  background: none;
  border: none;
  color: inherit;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.7;
}

.alert-dismiss:hover {
  opacity: 1;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid #333;
  border-radius: 12px;
  padding: 1.25rem;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon.running { background: rgba(0, 212, 255, 0.15); color: #00d4ff; }
.stat-icon.time { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
.stat-icon.capacity { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.stat-icon.health { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.stat-value.healthy { color: #22c55e; }

.stat-label {
  font-size: 0.8rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 0.25rem;
}

.stat-bar {
  height: 4px;
  background: #333;
  border-radius: 2px;
  margin-top: 0.5rem;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #00d4ff);
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* Action Bar */
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.action-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.action-label {
  color: #888;
  font-size: 0.9rem;
}

/* Card */
.card {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 12px;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid #333;
}

.card-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-body {
  padding: 0;
}

.badge {
  background: rgba(0, 212, 255, 0.15);
  color: #00d4ff;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

/* Table */
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  padding: 0.875rem 1.25rem;
  background: rgba(0, 0, 0, 0.2);
  color: #888;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.table td {
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid #2a2a3e;
  color: #fff;
}

.table tr:last-child td {
  border-bottom: none;
}

.table tbody tr {
  transition: background 0.15s ease;
}

.table tbody tr:hover {
  background: rgba(0, 212, 255, 0.05);
}

.vm-row {
  animation: slideIn 0.3s ease forwards;
  animation-delay: var(--delay, 0ms);
  opacity: 0;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.monospace {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 0.9rem;
}

.command-cell {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 0.8rem;
  color: #888;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Status Dot */
.status-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.status-dot.online { color: #22c55e; }
.status-dot.offline { color: #888; }
.status-dot.error { color: #ef4444; }

/* Empty State */
.empty-state {
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  color: #333;
  margin-bottom: 1rem;
}

.empty-state h4 {
  margin: 0 0 0.5rem;
  color: #fff;
  font-size: 1.25rem;
}

.empty-state p {
  margin: 0 0 1.5rem;
  color: #888;
}

/* Skeleton Loaders */
.skeleton-table {
  padding: 1rem;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  padding: 0.875rem 0;
  border-bottom: 1px solid #2a2a3e;
}

.skeleton-row:last-child {
  border-bottom: none;
}

.skeleton {
  background: linear-gradient(90deg, #2a2a3e 25%, #333 50%, #2a2a3e 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  height: 20px;
}

.skeleton-sm { width: 60px; }
.skeleton-lg { flex: 1; }

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  margin: 1rem;
  animation: modalIn 0.2s ease;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem;
  border-bottom: 1px solid #333;
}

.modal-header h4 {
  margin: 0;
  font-size: 1.1rem;
  color: #fff;
}

.text-warning { color: #fbbf24; }

.modal-body {
  padding: 1.25rem;
  color: #ccc;
  line-height: 1.6;
}

.modal-body p {
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid #333;
}

/* Spin Animation */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .page-actions {
    justify-content: space-between;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .action-bar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .action-group {
    justify-content: space-between;
  }
  
  .command-cell {
    max-width: 150px;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .table th:nth-child(3),
  .table td:nth-child(3),
  .table th:nth-child(4),
  .table td:nth-child(4) {
    display: none;
  }
}
```

---

### Phase 4: Build & Deploy

```bash
cd /opt/swarm-dashboard
npm run build
git add -A
git commit -m "Redesign VM dashboard - Lucide icons, toast notifications, modern UI"
git push origin main
```

---

## Key Requirements Summary

1. **Remove ALL inline styles** from VMs.jsx (the `<style>` block at the bottom)
2. **Install dependencies**: `lucide-react`, `react-hot-toast`
3. **Replace browser alerts** with toast notifications
4. **Replace emoji icons** with Lucide React icons
5. **Add confirmation modal** instead of browser confirm()
6. **Implement skeleton loaders** for loading state
7. **Expand to 4 stat cards** with icons and visual hierarchy
8. **Enhanced table** with status dots, IP column, row animations
9. **Improved empty state** with illustration and CTA
10. **Full responsive design** for mobile

## Design Tokens

- Primary: `#00d4ff` (cyan)
- Background: `#0a0a0f`, `#1a1a2e`, `#16213e`
- Border: `#333`, `#2a2a3e`
- Text: `#fff`, `#ccc`, `#888`
- Success: `#22c55e`
- Danger: `#ef4444`
- Warning: `#fbbf24`
- Purple accent: `#a855f7`

## Testing Checklist

- [ ] Page loads without console errors
- [ ] Auto-refresh toggle works
- [ ] Boot VMs shows toast on success/error
- [ ] Cleanup shows confirmation modal
- [ ] Kill VM shows confirmation modal
- [ ] Loading state shows skeleton
- [ ] Empty state displays correctly
- [ ] Responsive layout works on mobile
- [ ] All buttons have hover states
- [ ] Icons render correctly (no emoji fallback)
