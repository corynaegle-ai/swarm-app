/**
 * TicketDetail - Individual ticket view with real-time WebSocket updates
 * 
 * Features:
 * - Fetches ticket with dependencies and events
 * - Subscribes to WebSocket for real-time status + activity updates
 * - Live agent activity feed
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import Sidebar from '../components/Sidebar';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATE_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
  ready: { label: 'Ready', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  blocked: { label: 'Blocked', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  on_hold: { label: 'On Hold', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  assigned: { label: 'Assigned', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  in_progress: { label: 'In Progress', color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)' },
  verifying: { label: 'Verifying', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  in_review: { label: 'In Review', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  changes_requested: { label: 'Changes', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
  done: { label: 'Done', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  needs_review: { label: 'Needs Review', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)' },
  cancelled: { label: 'Cancelled', color: '#4b5563', bg: 'rgba(75, 85, 99, 0.15)' }
};

const VERIFICATION_CONFIG = {
  unverified: { label: 'Unverified', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', icon: '○' },
  passed: { label: 'Passed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: '✓' },
  failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: '✗' },
  verifying: { label: 'Verifying', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: '⟳' }
};

const ACTIVITY_ICONS = {
  state_change: '🔄',
  agent_assigned: '🤖',
  branch_created: '🌿',
  code_pushed: '📤',
  pr_created: '🔗',
  verification_started: '🔍',
  verification_passed: '✅',
  verification_failed: '❌',
  review_requested: '👀',
  comment_added: '💬',
  escalated: '⚠️',
  default: '📌'
};

export default function TicketDetail() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const activityEndRef = useRef(null);

  // WebSocket handlers for real-time updates
  const wsHandlers = {
    'ticket:update': (data) => {
      console.log('[TicketDetail] WebSocket ticket:update:', data);
      if (data.ticketId === ticketId) {
        setTicket(prev => prev ? { ...prev, state: data.state, ...data.updates } : prev);
      }
    },
    'ticket:activity': (data) => {
      console.log('[TicketDetail] WebSocket ticket:activity:', data);
      if (data.ticket_id === ticketId) {
        setEvents(prev => [data, ...prev].slice(0, 100));
      }
    },
    'ticket:progress': (data) => {
      console.log('[TicketDetail] WebSocket ticket:progress:', data);
      if (data.ticketId === ticketId) {
        // Add progress as an activity entry
        setEvents(prev => [{
          id: `progress-${Date.now()}`,
          event_type: data.phase || 'progress',
          event_data: { message: data.message },
          created_at: new Date().toISOString()
        }, ...prev].slice(0, 100));
      }
    },
    'pr:created': (data) => {
      console.log('[TicketDetail] WebSocket pr:created:', data);
      if (data.ticketId === ticketId) {
        setTicket(prev => prev ? { ...prev, pr_url: data.prUrl } : prev);
        setEvents(prev => [{
          id: `pr-${Date.now()}`,
          event_type: 'pr_created',
          event_data: { pr_url: data.prUrl },
          created_at: new Date().toISOString()
        }, ...prev].slice(0, 100));
      }
    }
  };

  // Subscribe to WebSocket room for this ticket
  const { state: wsState, subscribe, unsubscribe } = useWebSocket({
    room: `ticket:${ticketId}`,
    handlers: wsHandlers,
    enabled: !!ticketId && !!token,
    config: { debug: true }
  });

  // Fetch ticket data with dependencies and events
  const fetchTicket = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/api/tickets/${ticketId}?include=dependencies,events`,
        { credentials: 'include' }
      );
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch ticket');
      }
      
      setTicket(data.ticket);
      setEvents(data.ticket.events || []);
      setError(null);
    } catch (err) {
      console.error('Fetch ticket error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
    }
  }, [ticketId, fetchTicket]);

  // Update ticket state
  const handleStateChange = async (newState) => {
    try {
      setUpdating(true);
      const res = await fetch(`${API_BASE}/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ state: newState })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      
      // Ticket will also update via WebSocket, but update immediately for responsiveness
      setTicket(prev => prev ? { ...prev, state: newState } : prev);
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const getActivityIcon = (eventType) => {
    return ACTIVITY_ICONS[eventType] || ACTIVITY_ICONS.default;
  };

  if (loading) {
    return (
      <div className="page-container">
        <Sidebar />
        <main className="page-main">
          <div className="loading-state">
            <div className="loading-pulse"></div>
            Loading ticket...
          </div>
        </main>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="page-container">
        <Sidebar />
        <main className="page-main">
          <div className="error-state">
            <span className="error-icon">⚠</span>
            <h2>Ticket Not Found</h2>
            <p>{error || 'The requested ticket could not be found.'}</p>
            <Link to="/tickets" className="back-link">← Back to Tickets</Link>
          </div>
        </main>
      </div>
    );
  }

  const stateConfig = STATE_CONFIG[ticket.state] || STATE_CONFIG.draft;
  const verifyConfig = VERIFICATION_CONFIG[ticket.verification_status] || VERIFICATION_CONFIG.unverified;

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        {/* Header */}
        <div className="ticket-header">
          <div className="header-nav">
            <Link to="/tickets" className="back-link">← Back to Tickets</Link>
            <div className="ws-indicator" title={`WebSocket: ${wsState}`}>
              <span className={`ws-dot ${wsState === 'connected' ? 'connected' : 'disconnected'}`}></span>
              {wsState === 'connected' ? 'Live' : 'Offline'}
            </div>
          </div>
          <div className="header-main">
            <div className="header-title">
              <span className="ticket-id">#{ticket.id}</span>
              <h1>{ticket.title}</h1>
            </div>
            <div className="header-actions">
              <select
                value={ticket.state}
                onChange={(e) => handleStateChange(e.target.value)}
                disabled={updating}
                className="state-select"
                style={{
                  borderColor: stateConfig.color,
                  color: stateConfig.color
                }}
              >
                {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              <button onClick={fetchTicket} className="refresh-btn" disabled={loading}>
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="ticket-content">
          {/* Left: Details */}
          <div className="ticket-details">
            {/* Status Cards */}
            <div className="status-cards">
              <div className="status-card">
                <span className="card-label">State</span>
                <span 
                  className="state-badge"
                  style={{ backgroundColor: stateConfig.bg, color: stateConfig.color }}
                >
                  {stateConfig.label}
                </span>
              </div>
              <div className="status-card">
                <span className="card-label">Verification</span>
                <span 
                  className="verify-badge"
                  style={{ backgroundColor: verifyConfig.bg, color: verifyConfig.color }}
                >
                  {verifyConfig.icon} {verifyConfig.label}
                </span>
              </div>
              {ticket.rejection_count > 0 && (
                <div className="status-card warn">
                  <span className="card-label">Retries</span>
                  <span className="retry-count">{ticket.rejection_count}</span>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="detail-section">
              <h3>Description</h3>
              <div className="description-content">
                {ticket.description || 'No description provided.'}
              </div>
            </div>

            {/* Acceptance Criteria */}
            {ticket.acceptance_criteria && (
              <div className="detail-section">
                <h3>Acceptance Criteria</h3>
                <pre className="criteria-content">{ticket.acceptance_criteria}</pre>
              </div>
            )}

            {/* Links */}
            <div className="detail-section links-section">
              <h3>Links & Resources</h3>
              <div className="links-grid">
                {ticket.vm_id && (
                  <Link to={`/vms?highlight=${ticket.vm_id}`} className="link-card">
                    <span className="link-icon">🖥️</span>
                    <span className="link-label">VM #{ticket.vm_id}</span>
                  </Link>
                )}
                {ticket.branch_name && (
                  <div className="link-card">
                    <span className="link-icon">🌿</span>
                    <code className="branch-name">{ticket.branch_name}</code>
                  </div>
                )}
                {ticket.pr_url && (
                  <a href={ticket.pr_url} target="_blank" rel="noopener noreferrer" className="link-card external">
                    <span className="link-icon">🔗</span>
                    <span className="link-label">Pull Request</span>
                  </a>
                )}
              </div>
            </div>

            {/* Dependencies */}
            {(ticket.blocked_by?.length > 0 || ticket.blocks?.length > 0) && (
              <div className="detail-section">
                <h3>Dependencies</h3>
                {ticket.blocked_by?.length > 0 && (
                  <div className="dep-group">
                    <span className="dep-label">Blocked by:</span>
                    {ticket.blocked_by.map(dep => (
                      <Link key={dep.id} to={`/tickets/${dep.id}`} className="dep-link">
                        <span className={`dep-state state-${dep.state}`}>●</span>
                        {dep.title}
                      </Link>
                    ))}
                  </div>
                )}
                {ticket.blocks?.length > 0 && (
                  <div className="dep-group">
                    <span className="dep-label">Blocks:</span>
                    {ticket.blocks.map(dep => (
                      <Link key={dep.id} to={`/tickets/${dep.id}`} className="dep-link">
                        <span className={`dep-state state-${dep.state}`}>●</span>
                        {dep.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timestamps */}
            <div className="detail-section timestamps">
              <div className="timestamp">
                <span className="ts-label">Created:</span>
                <span className="ts-value">{formatDate(ticket.created_at)}</span>
              </div>
              <div className="timestamp">
                <span className="ts-label">Updated:</span>
                <span className="ts-value">{formatDate(ticket.updated_at)}</span>
              </div>
            </div>
          </div>

          {/* Right: Activity Feed */}
          <div className="activity-panel">
            <div className="activity-header">
              <h3>Agent Activity</h3>
              <span className="activity-count">{events.length} events</span>
            </div>
            <div className="activity-feed">
              {events.length === 0 ? (
                <div className="no-activity">
                  <span className="empty-icon">📭</span>
                  <p>No activity yet</p>
                  <span className="empty-hint">Events will appear here in real-time</span>
                </div>
              ) : (
                events.map((event, idx) => (
                  <div key={event.id || idx} className="activity-item">
                    <span className="activity-icon">{getActivityIcon(event.event_type)}</span>
                    <div className="activity-content">
                      <span className="activity-type">{event.event_type?.replace(/_/g, ' ')}</span>
                      {event.event_data?.message && (
                        <span className="activity-message">{event.event_data.message}</span>
                      )}
                      {event.event_data?.from_state && event.event_data?.to_state && (
                        <span className="activity-transition">
                          {STATE_CONFIG[event.event_data.from_state]?.label || event.event_data.from_state}
                          {' → '}
                          {STATE_CONFIG[event.event_data.to_state]?.label || event.event_data.to_state}
                        </span>
                      )}
                      <span className="activity-time">{formatRelativeTime(event.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
              <div ref={activityEndRef} />
            </div>
          </div>
        </div>

        {/* Styles */}
        <style>{`
          .ticket-header {
            border-bottom: 1px solid rgba(255,255,255,0.08);
            padding-bottom: 1.5rem;
            margin-bottom: 1.5rem;
          }
          .header-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }
          .back-link {
            color: #6b7280;
            text-decoration: none;
            font-size: 0.9rem;
            transition: color 0.2s;
          }
          .back-link:hover { color: #00d4ff; }
          .ws-indicator {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.85rem;
            color: #6b7280;
          }
          .ws-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #6b7280;
          }
          .ws-dot.connected {
            background: #10b981;
            box-shadow: 0 0 8px #10b981;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .header-main {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 2rem;
          }
          .header-title { flex: 1; }
          .ticket-id {
            color: #6b7280;
            font-size: 0.85rem;
            font-family: monospace;
          }
          .header-title h1 {
            margin: 0.25rem 0 0 0;
            font-size: 1.5rem;
            color: #fff;
          }
          .header-actions {
            display: flex;
            gap: 0.75rem;
          }
          .state-select {
            appearance: none;
            background: rgba(0,0,0,0.3);
            border: 1px solid;
            border-radius: 8px;
            padding: 0.5rem 2rem 0.5rem 1rem;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%236b7280' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 0.5rem center;
            background-size: 1.5rem;
          }
          .state-select option { background: #1a1a2e; color: #fff; }
          .refresh-btn {
            background: rgba(0, 212, 255, 0.1);
            border: 1px solid rgba(0, 212, 255, 0.3);
            color: #00d4ff;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .refresh-btn:hover { background: rgba(0, 212, 255, 0.2); }

          /* Content Grid */
          .ticket-content {
            display: grid;
            grid-template-columns: 1fr 380px;
            gap: 2rem;
          }
          .ticket-details { display: flex; flex-direction: column; gap: 1.5rem; }
          .status-cards {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
          }
          .status-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 10px;
            padding: 1rem 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .status-card.warn { border-color: rgba(245, 158, 11, 0.3); }
          .card-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            color: #6b7280;
            letter-spacing: 0.5px;
          }
          .state-badge, .verify-badge {
            padding: 0.35rem 0.75rem;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
          }
          .retry-count {
            font-size: 1.5rem;
            font-weight: 700;
            color: #f59e0b;
          }
          .detail-section {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 1.25rem;
          }
          .detail-section h3 {
            margin: 0 0 1rem 0;
            font-size: 0.9rem;
            color: #9ca3af;
            font-weight: 500;
          }
          .description-content {
            color: #d1d5db;
            line-height: 1.6;
            white-space: pre-wrap;
          }
          .criteria-content {
            background: rgba(0,0,0,0.2);
            padding: 1rem;
            border-radius: 8px;
            font-size: 0.85rem;
            color: #9ca3af;
            overflow-x: auto;
            margin: 0;
          }
          .links-grid {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
          }
          .link-card {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(0,0,0,0.2);
            padding: 0.6rem 1rem;
            border-radius: 8px;
            text-decoration: none;
            color: #d1d5db;
            border: 1px solid rgba(255,255,255,0.08);
            transition: all 0.2s;
          }
          .link-card:hover {
            border-color: rgba(0, 212, 255, 0.3);
            background: rgba(0, 212, 255, 0.05);
          }
          .link-card.external .link-label { color: #3b82f6; }
          .branch-name {
            font-size: 0.85rem;
            color: #10b981;
          }

          /* Dependencies */
          .dep-group {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          .dep-label {
            color: #6b7280;
            font-size: 0.85rem;
            min-width: 80px;
          }
          .dep-link {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.25rem 0.6rem;
            background: rgba(255,255,255,0.05);
            border-radius: 6px;
            text-decoration: none;
            color: #9ca3af;
            font-size: 0.85rem;
            transition: all 0.2s;
          }
          .dep-link:hover { background: rgba(255,255,255,0.1); color: #fff; }
          .dep-state { font-size: 0.6rem; }
          .dep-state.state-done { color: #10b981; }
          .dep-state.state-in_progress { color: #00d4ff; }
          .dep-state.state-blocked { color: #ef4444; }
          .timestamps {
            display: flex;
            gap: 2rem;
          }
          .timestamp {
            display: flex;
            gap: 0.5rem;
            font-size: 0.85rem;
          }
          .ts-label { color: #6b7280; }
          .ts-value { color: #9ca3af; }

          /* Activity Panel */
          .activity-panel {
            background: linear-gradient(135deg, rgba(26, 26, 46, 0.8) 0%, rgba(22, 33, 62, 0.6) 100%);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            max-height: calc(100vh - 250px);
          }
          .activity-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
          }
          .activity-header h3 {
            margin: 0;
            font-size: 1rem;
            color: #fff;
          }
          .activity-count {
            font-size: 0.8rem;
            color: #6b7280;
            background: rgba(255,255,255,0.05);
            padding: 0.25rem 0.6rem;
            border-radius: 10px;
          }
          .activity-feed {
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
          }
          .no-activity {
            text-align: center;
            padding: 3rem 1rem;
            color: #6b7280;
          }
          .no-activity .empty-icon { font-size: 2rem; display: block; margin-bottom: 0.5rem; }
          .no-activity p { margin: 0 0 0.25rem 0; color: #9ca3af; }
          .empty-hint { font-size: 0.8rem; }
          .activity-item {
            display: flex;
            gap: 0.75rem;
            padding: 0.75rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.04);
          }
          .activity-item:last-child { border-bottom: none; }
          .activity-icon { font-size: 1.1rem; }
          .activity-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }
          .activity-type {
            font-size: 0.85rem;
            color: #d1d5db;
            text-transform: capitalize;
          }
          .activity-message {
            font-size: 0.8rem;
            color: #9ca3af;
          }
          .activity-transition {
            font-size: 0.8rem;
            color: #00d4ff;
            font-family: monospace;
          }
          .activity-time {
            font-size: 0.75rem;
            color: #4b5563;
          }

          /* States */
          .loading-state, .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            color: #6b7280;
          }
          .loading-pulse {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(0, 212, 255, 0.2);
            border-top-color: #00d4ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 1rem;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .error-state .error-icon { font-size: 3rem; margin-bottom: 1rem; }
          .error-state h2 { margin: 0 0 0.5rem 0; color: #ef4444; }
          .error-state p { margin: 0 0 1.5rem 0; }
          
          /* Responsive */
          @media (max-width: 1024px) {
            .ticket-content {
              grid-template-columns: 1fr;
            }
            .activity-panel {
              max-height: 400px;
            }
          }
        `}</style>
      </main>
    </div>
  );
}
