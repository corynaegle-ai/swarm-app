import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import { 
  RefreshCw, Trash2, Power, Loader2,
  AlertCircle, Clock, Activity, Server, Circle, Wifi, Plus
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
  const [confirmAction, setConfirmAction] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/swarm/status`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch VM status');
      const data = await res.json();
      setStatus(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    let interval;
    if (autoRefresh) interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, autoRefresh]);

  const bootVMs = async () => {
    if (booting) return;
    setBooting(true);
    try {
      const res = await fetch(`${API_BASE}/api/swarm/boot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count: bootCount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Boot failed');
      await fetchStatus();
      toast.success(`Spawned ${data.spawned} of ${data.requested} VMs`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBooting(false);
    }
  };


  const cleanupAll = async () => {
    if (cleaning) return;
    setCleaning(true);
    try {
      const res = await fetch(`${API_BASE}/api/swarm/cleanup`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cleanup failed');
      await fetchStatus();
      toast.success(`Cleaned up: ${data.before} → ${data.after} VMs`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCleaning(false);
    }
  };

  const killVM = async (pid) => {
    if (killingPid) return;
    setKillingPid(pid);
    try {
      const res = await fetch(`${API_BASE}/api/swarm/kill/${pid}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kill failed');
      await fetchStatus();
      toast.success(`Terminated VM ${pid}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setKillingPid(null);
    }
  };

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        <header className="page-header">
          <div>
            <h1>Virtual Machines</h1>
            <p className="page-subtitle">Manage your Firecracker microVM fleet</p>
          </div>
          <div className="header-actions">
            <label className="toggle-label">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Auto-refresh</span>
            </label>
            <button onClick={fetchStatus} disabled={loading} className="btn-secondary">
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </header>


        {error && (
          <div className="alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className="vm-stats">
          <div className="vm-stat">
            <div className="vm-stat-icon"><Server size={24} /></div>
            <div className="vm-stat-content">
              <span className="vm-stat-value">{status.count}</span>
              <span className="vm-stat-label">Running VMs</span>
            </div>
          </div>
          <div className="vm-stat">
            <div className="vm-stat-icon"><Clock size={24} /></div>
            <div className="vm-stat-content">
              <span className="vm-stat-value">{lastUpdate ? lastUpdate.toLocaleTimeString() : '--'}</span>
              <span className="vm-stat-label">Last Updated</span>
            </div>
          </div>
          <div className="vm-stat">
            <div className="vm-stat-icon"><Activity size={24} /></div>
            <div className="vm-stat-content">
              <span className="vm-stat-value">{status.count}/100</span>
              <span className="vm-stat-label">Capacity</span>
              <div className="capacity-bar"><div className="capacity-fill" style={{width: `${status.count}%`}} /></div>
            </div>
          </div>
          <div className="vm-stat">
            <div className="vm-stat-icon"><Wifi size={24} /></div>
            <div className="vm-stat-content">
              <span className={`vm-stat-value ${status.count > 0 ? 'online' : ''}`}>{status.count > 0 ? 'Online' : 'Idle'}</span>
              <span className="vm-stat-label">Fleet Status</span>
            </div>
          </div>
        </div>

        <div className="vm-actions">
          <div className="boot-group">
            <span>Boot new VMs:</span>
            <select value={bootCount} onChange={(e) => setBootCount(parseInt(e.target.value))} className="form-select">
              {[1, 2, 3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button onClick={bootVMs} disabled={booting} className="btn-primary">
              {booting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              {booting ? 'Booting...' : 'Boot VMs'}
            </button>
          </div>
          <button onClick={() => setConfirmAction({ type: 'cleanup' })} disabled={cleaning || status.count === 0} className="btn-danger">
            {cleaning ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            {cleaning ? 'Cleaning...' : 'Cleanup All'}
          </button>
        </div>


        <div className="card">
          <div className="card-header">
            <span className="card-title">Running Instances</span>
            <span className="badge-primary">{status.count}</span>
          </div>
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : status.vms.length === 0 ? (
            <div className="empty-state">
              <Server size={48} />
              <p>No VMs running. Boot some to get started.</p>
            </div>
          ) : (
            <table className="data-table">
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
                  <tr key={vm.pid}>
                    <td><span className="status-online"><Circle size={8} fill="currentColor" /></span></td>
                    <td style={{fontFamily:'monospace'}}>{vm.pid}</td>
                    <td style={{fontFamily:'monospace'}}>10.0.0.{index + 2}</td>
                    <td className="cmd-cell">{vm.command}</td>
                    <td>
                      <button onClick={() => setConfirmAction({ type: 'kill', pid: vm.pid })} disabled={killingPid === vm.pid} className="btn-icon-danger">
                        {killingPid === vm.pid ? <Loader2 size={14} className="spin" /> : <Power size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {confirmAction && (
          <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h4>Confirm Action</h4>
              <p>{confirmAction.type === 'cleanup' 
                ? `Terminate ALL ${status.count} running VMs?` 
                : `Terminate VM ${confirmAction.pid}?`}</p>
              <div className="modal-actions">
                <button onClick={() => setConfirmAction(null)} className="btn-secondary">Cancel</button>
                <button onClick={() => { confirmAction.type === 'cleanup' ? cleanupAll() : killVM(confirmAction.pid); setConfirmAction(null); }} className="btn-danger">
                  {confirmAction.type === 'cleanup' ? 'Cleanup All' : 'Terminate'}
                </button>
              </div>
            </div>
          </div>
        )}


      <style>{`
        .vm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .vm-stat { background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1.25rem; display: flex; align-items: flex-start; gap: 1rem; }
        .vm-stat-icon { width: 48px; height: 48px; border-radius: 10px; background: rgba(0, 212, 255, 0.1); color: #00d4ff; display: flex; align-items: center; justify-content: center; }
        .vm-stat-content { display: flex; flex-direction: column; }
        .vm-stat-value { font-size: 1.5rem; font-weight: 700; color: #fff; }
        .vm-stat-value.online { color: #22c55e; }
        .vm-stat-label { font-size: 0.8rem; color: #71717a; }
        .capacity-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; margin-top: 0.5rem; width: 100%; }
        .capacity-fill { height: 100%; background: linear-gradient(90deg, #00d4ff, #22c55e); border-radius: 2px; transition: width 0.3s; }
        .vm-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding: 1rem 1.25rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
        .boot-group { display: flex; align-items: center; gap: 0.75rem; }
        .boot-group span { color: #a1a1aa; font-size: 0.875rem; }
        .boot-group .form-select { width: 80px; }
        .toggle-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: #a1a1aa; cursor: pointer; }
        .toggle-label input { accent-color: #00d4ff; }
        .status-online { color: #22c55e; display: flex; align-items: center; }
        .cmd-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.8rem; color: #71717a; }
        .btn-icon-danger { padding: 0.5rem; background: transparent; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #ef4444; cursor: pointer; transition: all 0.15s; }
        .btn-icon-danger:hover { background: rgba(239, 68, 68, 0.15); }
        .alert-error { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: #ef4444; margin-bottom: 1.5rem; }
        .alert-error button { margin-left: auto; background: none; border: none; color: inherit; cursor: pointer; font-size: 1.25rem; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 200; }
        .modal { background: #18181b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem; max-width: 400px; width: 90%; }
        .modal h4 { margin-bottom: 1rem; color: #fff; }
        .modal p { color: #a1a1aa; margin-bottom: 1.5rem; }
        .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
        .badge-primary { background: rgba(0, 212, 255, 0.15); color: #00d4ff; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @media (max-width: 1024px) { .vm-stats { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .vm-stats { grid-template-columns: 1fr; } .vm-actions { flex-direction: column; gap: 1rem; } }
      `}</style>
      </main>
    </div>
  );
}
