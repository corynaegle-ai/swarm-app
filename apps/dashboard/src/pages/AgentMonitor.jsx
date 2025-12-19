/**
 * Agent Monitor - Real-time agent monitoring dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import useAgents from '../hooks/useAgents';
import { 
  Bot, RefreshCw, Skull, Activity, Clock, Server, 
  AlertCircle, CheckCircle, Pause, Play, X, ExternalLink,
  Terminal, Wifi, WifiOff
} from 'lucide-react';

const STATUS_CONFIG = {
  running: { label: 'Running', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: Activity, pulse: true },
  idle: { label: 'Idle', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: Pause, pulse: false },
  starting: { label: 'Starting', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Play, pulse: true },
  error: { label: 'Error', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: AlertCircle, pulse: false },
  terminated: { label: 'Terminated', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', icon: Skull, pulse: false }
};

export default function AgentMonitor() {
  const { user } = useAuth();
  const { listAgents, getStats, getAgent, getAgentLogs, terminateAgent, loading } = useAgents();
  
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({ total: 0, byStatus: {}, byType: {} });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentLogs, setAgentLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [terminating, setTerminating] = useState(null);
  const [confirmTerminate, setConfirmTerminate] = useState(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [agentData, statsData] = await Promise.all([
        listAgents({ status: filterStatus || undefined }),
        getStats()
      ]);
      setAgents(agentData.agents || []);
      setStats(statsData);
      setLastUpdate(new Date());
      setLocalError(null);
    } catch (err) {
      setLocalError(err.message);
    }
  }, [listAgents, getStats, filterStatus]);

  // Auto-refresh effect
  useEffect(() => {
    fetchData();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchData, 5000);
    }
    return () => clearInterval(interval);
  }, [fetchData, autoRefresh]);

  // Fetch logs when agent selected
  const handleSelectAgent = async (agent) => {
    setSelectedAgent(agent);
    setLogsLoading(true);
    try {
      const logsData = await getAgentLogs(agent.id, { limit: 50 });
      setAgentLogs(logsData.logs || []);
    } catch (err) {
      setAgentLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  // Handle terminate
  const handleTerminate = async (agentId) => {
    setTerminating(agentId);
    try {
      await terminateAgent(agentId);
      await fetchData();
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(null);
      }
      setConfirmTerminate(null);
    } catch (err) {
      alert('Failed to terminate: ' + err.message);
    } finally {
      setTerminating(null);
    }
  };

  // Format runtime
  const formatRuntime = (startTime) => {
    if (!startTime) return '—';
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
    if (diffMins > 0) return `${diffMins}m ${diffSecs % 60}s`;
    return `${diffSecs}s`;
  };

  // Format timestamp
  const formatTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="page-container">
      
      <Sidebar />

      <main className="page-main agents-main">
        {/* Hero Stats Section */}
        <div className="agents-hero">
          <div className="hero-title">
            <h2>Agent Monitor</h2>
            <p className="hero-subtitle">Real-time monitoring of AI coding agents</p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat running">
              <span className="stat-number">{stats.byStatus?.running || 0}</span>
              <span className="stat-label">Running</span>
            </div>
            <div className="hero-stat idle">
              <span className="stat-number">{stats.byStatus?.idle || 0}</span>
              <span className="stat-label">Idle</span>
            </div>
            <div className="hero-stat error">
              <span className="stat-number">{stats.byStatus?.error || 0}</span>
              <span className="stat-label">Errored</span>
            </div>
            <div className="hero-stat total">
              <span className="stat-number">{stats.total || 0}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="agents-controls">
          <div className="control-left">
            <select 
              className="filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div className="control-right">
            <label className="auto-refresh-toggle">
              <input 
                type="checkbox" 
                checked={autoRefresh} 
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span>Auto-refresh</span>
            </label>
            <button className="refresh-btn" onClick={fetchData} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
              Refresh
            </button>
            {lastUpdate && (
              <span className="last-update">Updated {formatTime(lastUpdate)}</span>
            )}
          </div>
        </div>

        {/* Error State */}
        {localError && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{localError}</span>
          </div>
        )}

        {/* Agents Grid */}
        <div className="agents-grid">
          {loading && agents.length === 0 ? (
            <div className="loading-state">
              <div className="loading-pulse" />
              <p>Loading agents...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="empty-state">
              <Bot size={48} />
              <p>No agents found</p>
              <span className="empty-hint">Agents will appear when VMs claim tickets</span>
            </div>
          ) : (
            agents.map(agent => {
              const statusCfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle;
              const StatusIcon = statusCfg.icon;
              return (
                <div 
                  key={agent.id} 
                  className={`agent-card ${agent.status}`}
                  onClick={() => handleSelectAgent(agent)}
                >
                  <div className="agent-header">
                    <div className="agent-identity">
                      <Bot size={20} className="agent-icon" />
                      <span className="agent-vm">VM #{agent.vm_id}</span>
                    </div>
                    <div 
                      className={`status-badge ${agent.status} ${statusCfg.pulse ? 'pulse' : ''}`}
                      style={{ 
                        background: statusCfg.bg, 
                        color: statusCfg.color,
                        borderColor: statusCfg.color 
                      }}
                    >
                      <StatusIcon size={12} />
                      <span>{statusCfg.label}</span>
                    </div>
                  </div>
                  
                  <div className="agent-details">
                    <div className="detail-row">
                      <span className="detail-label">Ticket</span>
                      <span className="detail-value ticket-link">
                        {agent.ticket_title ? (
                          <>#{agent.ticket_id}: {agent.ticket_title.slice(0, 30)}{agent.ticket_title.length > 30 ? '...' : ''}</>
                        ) : (
                          <span className="no-ticket">No ticket assigned</span>
                        )}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Project</span>
                      <span className="detail-value">{agent.project_name || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Runtime</span>
                      <span className="detail-value runtime">{formatRuntime(agent.started_at)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">IP</span>
                      <span className="detail-value ip">{agent.ip_address || '—'}</span>
                    </div>
                  </div>

                  <div className="agent-footer">
                    <span className="heartbeat-indicator">
                      {agent.last_heartbeat ? (
                        <><Wifi size={12} className="connected" /> {formatTime(agent.last_heartbeat)}</>
                      ) : (
                        <><WifiOff size={12} className="disconnected" /> No heartbeat</>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Agent Detail Modal */}
        {selectedAgent && (
          <div className="modal-overlay" onClick={() => setSelectedAgent(null)}>
            <div className="modal-content agent-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-area">
                  <span className="modal-agent-id">Agent #{selectedAgent.id}</span>
                  <h3>VM #{selectedAgent.vm_id}</h3>
                  <div 
                    className={`status-badge large ${selectedAgent.status}`}
                    style={{ 
                      background: STATUS_CONFIG[selectedAgent.status]?.bg,
                      color: STATUS_CONFIG[selectedAgent.status]?.color 
                    }}
                  >
                    {STATUS_CONFIG[selectedAgent.status]?.label || selectedAgent.status}
                  </div>
                </div>
                <button className="modal-close" onClick={() => setSelectedAgent(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <div className="agent-info-grid">
                  <div className="info-item">
                    <label>Ticket</label>
                    <span>
                      {selectedAgent.ticket_id ? (
                        <Link to={`/tickets?id=${selectedAgent.ticket_id}`} className="ticket-link">
                          #{selectedAgent.ticket_id}: {selectedAgent.ticket_title}
                        </Link>
                      ) : '—'}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Project</label>
                    <span>{selectedAgent.project_name || '—'}</span>
                  </div>
                  <div className="info-item">
                    <label>IP Address</label>
                    <code>{selectedAgent.ip_address || '—'}</code>
                  </div>
                  <div className="info-item">
                    <label>Started</label>
                    <span>{selectedAgent.started_at ? new Date(selectedAgent.started_at).toLocaleString() : '—'}</span>
                  </div>
                  <div className="info-item">
                    <label>Runtime</label>
                    <span className="runtime">{formatRuntime(selectedAgent.started_at)}</span>
                  </div>
                  <div className="info-item">
                    <label>Last Heartbeat</label>
                    <span>{selectedAgent.last_heartbeat ? new Date(selectedAgent.last_heartbeat).toLocaleString() : 'Never'}</span>
                  </div>
                </div>

                {/* Logs Panel */}
                <div className="logs-panel">
                  <div className="logs-header">
                    <Terminal size={16} />
                    <span>Activity Log</span>
                  </div>
                  <div className="logs-container">
                    {logsLoading ? (
                      <div className="logs-loading">Loading logs...</div>
                    ) : agentLogs.length === 0 ? (
                      <div className="logs-empty">No activity recorded</div>
                    ) : (
                      agentLogs.map((log, i) => (
                        <div key={i} className={`log-entry ${log.type}`}>
                          <span className="log-time">{formatTime(log.timestamp || log.created_at)}</span>
                          <span className="log-type">{log.type || log.event_type}</span>
                          <span className="log-message">{log.message || log.details || log.status || '—'}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="modal-actions">
                  {selectedAgent.status !== 'terminated' && (
                    <button 
                      className="btn-danger"
                      onClick={() => setConfirmTerminate(selectedAgent.id)}
                      disabled={terminating === selectedAgent.id}
                    >
                      <Skull size={16} />
                      {terminating === selectedAgent.id ? 'Terminating...' : 'Terminate Agent'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Terminate Confirmation */}
        {confirmTerminate && (
          <div className="modal-overlay" onClick={() => setConfirmTerminate(null)}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-icon">
                <Skull size={32} />
              </div>
              <h3>Terminate Agent?</h3>
              <p>This will kill the agent process and clean up the VM. This action cannot be undone.</p>
              <div className="confirm-actions">
                <button className="btn-secondary" onClick={() => setConfirmTerminate(null)}>
                  Cancel
                </button>
                <button 
                  className="btn-danger"
                  onClick={() => handleTerminate(confirmTerminate)}
                  disabled={terminating}
                >
                  {terminating ? 'Terminating...' : 'Yes, Terminate'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Styles */}
      <style>{`
        .agents-dashboard { min-height: 100vh; background: #0a0a0a; }
        .agents-main { padding: 0 2rem 2rem 2rem; }
        
        /* Hero Section */
        .agents-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 2rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin-bottom: 1.5rem;
        }
        .hero-title h2 {
          font-size: 1.75rem;
          font-weight: 600;
          color: #fff;
          margin: 0 0 0.5rem 0;
        }
        .hero-subtitle {
          color: #666;
          font-size: 0.95rem;
          margin: 0;
        }
        .hero-stats {
          display: flex;
          gap: 1rem;
        }
        .hero-stat {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          padding: 1rem 1.5rem;
          text-align: center;
          min-width: 100px;
          transition: all 0.3s ease;
        }
        .hero-stat:hover {
          transform: translateY(-2px);
          border-color: rgba(0, 212, 255, 0.3);
        }
        .hero-stat.running { border-left: 3px solid #10b981; }
        .hero-stat.idle { border-left: 3px solid #3b82f6; }
        .hero-stat.error { border-left: 3px solid #ef4444; }
        .hero-stat.total { border-left: 3px solid #00d4ff; }
        .stat-number {
          display: block;
          font-size: 1.75rem;
          font-weight: 700;
        }
        .hero-stat.running .stat-number { color: #10b981; }
        .hero-stat.idle .stat-number { color: #3b82f6; }
        .hero-stat.error .stat-number { color: #ef4444; }
        .hero-stat.total .stat-number { color: #00d4ff; }
        .stat-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          margin-top: 0.25rem;
        }

        /* Controls */
        .agents-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .control-left, .control-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .filter-select {
          background: #1a1a2e;
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
        }
        .filter-select:focus { outline: none; border-color: #00d4ff; }
        .auto-refresh-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #888;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .auto-refresh-toggle input { accent-color: #00d4ff; }
        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          color: #00d4ff;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .refresh-btn:hover { background: rgba(0, 212, 255, 0.2); }
        .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .last-update { color: #666; font-size: 0.85rem; }

        /* Error Banner */
        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        /* Agent Grid */
        .agents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1rem;
        }
        .loading-state, .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 4rem 2rem;
          color: #666;
        }
        .loading-pulse {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(0, 212, 255, 0.2);
          border-top-color: #00d4ff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }
        .empty-state svg { opacity: 0.3; margin-bottom: 1rem; }
        .empty-hint { font-size: 0.9rem; color: #555; display: block; margin-top: 0.5rem; }

        /* Agent Card */
        .agent-card {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 1.25rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .agent-card:hover {
          transform: translateY(-2px);
          border-color: rgba(0, 212, 255, 0.3);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .agent-card.running { border-left: 3px solid #10b981; }
        .agent-card.idle { border-left: 3px solid #3b82f6; }
        .agent-card.error { border-left: 3px solid #ef4444; }
        .agent-card.starting { border-left: 3px solid #f59e0b; }
        .agent-card.terminated { border-left: 3px solid #6b7280; opacity: 0.7; }

        .agent-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .agent-identity {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .agent-icon { color: #00d4ff; }
        .agent-vm {
          font-weight: 600;
          font-size: 1.1rem;
          color: #fff;
        }
        .status-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid;
        }
        .status-badge.pulse {
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .agent-details {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
        }
        .detail-label { color: #666; }
        .detail-value { color: #ccc; }
        .detail-value.ticket-link { color: #00d4ff; }
        .detail-value.runtime { font-family: monospace; color: #f59e0b; }
        .detail-value.ip { font-family: monospace; color: #8b5cf6; }
        .no-ticket { color: #555; font-style: italic; }

        .agent-footer {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .heartbeat-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: #666;
        }
        .heartbeat-indicator .connected { color: #10b981; }
        .heartbeat-indicator .disconnected { color: #ef4444; }

        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .agent-modal {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          width: 90%;
          max-width: 700px;
          max-height: 85vh;
          overflow-y: auto;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .modal-title-area h3 {
          margin: 0.25rem 0 0.75rem;
          font-size: 1.25rem;
        }
        .modal-agent-id {
          font-size: 0.75rem;
          color: #00d4ff;
          font-family: monospace;
        }
        .status-badge.large {
          font-size: 0.85rem;
          padding: 0.4rem 1rem;
        }
        .modal-close {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 0.5rem;
        }
        .modal-close:hover { color: #fff; }
        .modal-body { padding: 1.5rem; }

        .agent-info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .info-item label {
          display: block;
          font-size: 0.75rem;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.35rem;
        }
        .info-item span, .info-item code {
          color: #fff;
          font-size: 0.95rem;
        }
        .info-item code {
          font-family: monospace;
          background: rgba(0, 212, 255, 0.1);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }
        .info-item .ticket-link {
          color: #00d4ff;
          text-decoration: none;
        }
        .info-item .ticket-link:hover { text-decoration: underline; }
        .info-item .runtime { color: #f59e0b; font-family: monospace; }

        /* Logs Panel */
        .logs-panel {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }
        .logs-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          color: #888;
          font-size: 0.85rem;
        }
        .logs-container {
          max-height: 250px;
          overflow-y: auto;
          padding: 0.5rem;
          font-family: monospace;
          font-size: 0.8rem;
        }
        .logs-loading, .logs-empty {
          padding: 2rem;
          text-align: center;
          color: #666;
        }
        .log-entry {
          display: grid;
          grid-template-columns: 80px 80px 1fr;
          gap: 0.75rem;
          padding: 0.4rem 0.5rem;
          border-radius: 4px;
        }
        .log-entry:hover { background: rgba(255,255,255,0.03); }
        .log-time { color: #666; }
        .log-type { color: #8b5cf6; font-weight: 500; }
        .log-entry.heartbeat .log-type { color: #10b981; }
        .log-entry.error .log-type { color: #ef4444; }
        .log-entry.state_change .log-type { color: #f59e0b; }
        .log-message { color: #ccc; }

        /* Modal Actions */
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        .btn-danger {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 0.6rem 1.25rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-danger:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: #ef4444;
        }
        .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Confirm Modal */
        .confirm-modal {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          max-width: 400px;
        }
        .confirm-icon {
          width: 64px;
          height: 64px;
          background: rgba(239, 68, 68, 0.15);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
          color: #ef4444;
        }
        .confirm-modal h3 {
          margin: 0 0 0.75rem;
          color: #fff;
        }
        .confirm-modal p {
          color: #888;
          font-size: 0.95rem;
          margin: 0 0 1.5rem;
        }
        .confirm-actions {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
        }
        .btn-secondary {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
          color: #888;
          padding: 0.6rem 1.25rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          border-color: rgba(255,255,255,0.4);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
