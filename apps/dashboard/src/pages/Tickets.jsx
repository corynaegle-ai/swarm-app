/**
 * Tickets Dashboard - Premium dark-themed ticket management
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, User, Clock } from 'lucide-react';
import { getRelativeTime } from '../utils/time.js';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import useTickets from '../hooks/useTickets';
import { useWebSocket } from '../hooks/useWebSocket';

const STATE_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', glow: '#6b7280' },
  ready: { label: 'Ready', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', glow: '#3b82f6' },
  blocked: { label: 'Blocked', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', glow: '#ef4444' },
  on_hold: { label: 'On Hold', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', glow: '#f59e0b' },
  assigned: { label: 'Assigned', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', glow: '#8b5cf6' },
  in_progress: { label: 'In Progress', color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)', glow: '#00d4ff' },
  verifying: { label: 'Verifying', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', glow: '#f97316' },
  in_review: { label: 'In Review', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', glow: '#a855f7' },
  changes_requested: { label: 'Changes', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', glow: '#f43f5e' },
  done: { label: 'Done', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', glow: '#10b981' },
  needs_review: { label: 'Needs Review', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', glow: '#fb923c' },
  cancelled: { label: 'Cancelled', color: '#4b5563', bg: 'rgba(75, 85, 99, 0.15)', glow: '#4b5563' }
};

const SCOPE_CONFIG = {
  small: { label: 'S', color: '#10b981', hint: 'Small' },
  medium: { label: 'M', color: '#f59e0b', hint: 'Medium' },
  large: { label: 'L', color: '#ef4444', hint: 'Large' }
};

const VERIFICATION_CONFIG = {
  unverified: { label: 'Unverified', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', icon: '○' },
  passed: { label: 'Passed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: '✓' },
  failed: { label: 'Failed', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: '✗' },
  verifying: { label: 'Verifying', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', icon: '⟳' }
};


/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format event description for activity timeline
 */
function formatEventDescription(event) {
  const actor = event.actor_id || 'System';
  
  switch (event.event_type) {
    case 'state_changed':
      return `${actor} changed status: ${event.previous_value} → ${event.new_value}`;
    case 'edited':
      const fields = JSON.parse(event.metadata || '{}').fields_changed || [];
      return `${actor} edited: ${fields.join(', ')}`;
    case 'requeued':
      return `${actor} requeued ticket${event.rationale ? `: "\${event.rationale}"` : ''}`;
    case 'assigned':
      return `Assigned to ${event.new_value}`;
    case 'completed':
      return `${actor} completed the ticket`;
    case 'dependency_added':
      return `${actor} added dependency: ${event.new_value?.slice(0, 8)}`;
    case 'dependency_removed':
      return `${actor} removed dependency: ${event.previous_value?.slice(0, 8)}`;
    case 'created':
      return `Ticket created by ${actor}`;
    default:
      return `${event.event_type} by ${actor}`;
  }
}


export default function Tickets() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { listTickets, getStats, getProjects, updateTicket, patchTicket, requeueTicket, createTicket, getTicketWithDetails, loading, error } = useTickets();
  
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ total: 0, byState: {} });
  const [projects, setProjects] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [filterState, setFilterState] = useState(searchParams.get('state') || '');
  const [filterProject, setFilterProject] = useState(searchParams.get('project') || '');
  const [localError, setLocalError] = useState(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({ title: '', description: '', project_id: '', estimated_scope: 'M' });
  const [refreshing, setRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Define fetchData first so it can be used in WebSocket handler
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [ticketData, statsData, projectData] = await Promise.all([
        listTickets({ state: filterState || undefined, projectId: filterProject || undefined }),
        getStats(),
        getProjects()
      ]);
      setTickets(ticketData.tickets || []);
      setStats(statsData);
      setProjects(projectData.projects || []);
      setLocalError(null);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [listTickets, getStats, getProjects, filterState, filterProject]);

  // WebSocket for real-time updates
  const handleTicketUpdate = useCallback((data) => {
    console.log('[WS] Ticket update received:', data);
    if (data.action) {
      fetchData();
      if (selectedTicket && data.ticket?.id === selectedTicket.id) {
        setSelectedTicket(prev => ({ ...prev, ...data.ticket }));
      }
    }
  }, [fetchData, selectedTicket]);

  const { isConnected } = useWebSocket({
    room: user?.tenant_id ? `tenant:${user.tenant_id}` : null,
    handlers: {
      'ticket:update': handleTicketUpdate
    },
    enabled: !!user?.tenant_id
  });

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterState) params.set('state', filterState);
    if (filterProject) params.set('project', filterProject);
    setSearchParams(params, { replace: true });
  }, [filterState, filterProject, setSearchParams]);

  const handleStateChange = async (ticketId, newState) => {
    try {
      await updateTicket(ticketId, { state: newState });
      await fetchData();
      setSelectedTicket(prev => prev ? { ...prev, state: newState } : null);
    } catch (err) {
      alert('Failed to update: ' + err.message);
    }
  };
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicket.title.trim()) {
      alert("Title is required");
      return;
    }
    try {
      await createTicket(newTicket);
      setShowNewTicket(false);
      setNewTicket({ title: "", description: "", project_id: "", estimated_scope: 'M' });
      await fetchData();
    } catch (err) {
      alert("Failed to create ticket: " + err.message);
    }
  };



  // === Edit Mode Handlers ===
  const handleStartEdit = () => {
    setEditForm({
      title: selectedTicket.title,
      description: selectedTicket.description || '',
      acceptance_criteria: selectedTicket.acceptance_criteria || '',
      epic: selectedTicket.epic || '',
      estimated_scope: selectedTicket.estimated_scope || 'medium'
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      await patchTicket(selectedTicket.id, editForm);
      const updated = await getTicketWithDetails(selectedTicket.id);
      setSelectedTicket(updated.ticket);
      setIsEditing(false);
      await fetchData();
    } catch (err) {
      console.error('Edit failed:', err);
      alert('Failed to save changes: ' + err.message);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
  };

  // === Action Button Handlers ===
  const handleRequeue = async (ticketId) => {
    if (!confirm('Requeue this ticket? It will be available for agents to claim again.')) return;
    const reason = prompt('Reason for requeue (optional):');
    try {
      await requeueTicket(ticketId, reason);
      const updated = await getTicketWithDetails(ticketId);
      setSelectedTicket(updated.ticket);
      await fetchData();
    } catch (err) {
      console.error('Requeue failed:', err);
      alert('Failed to requeue ticket: ' + err.message);
    }
  };

  const handleCancelTicket = async (ticketId) => {
    if (!confirm('Cancel this ticket? This action cannot be easily undone.')) return;
    const reason = prompt('Reason for cancellation:');
    try {
      await patchTicket(ticketId, { state: 'cancelled' }, reason);
      const updated = await getTicketWithDetails(ticketId);
      setSelectedTicket(updated.ticket);
      await fetchData();
    } catch (err) {
      console.error('Cancel failed:', err);
      alert('Failed to cancel ticket: ' + err.message);
    }
  };

  const handleMarkComplete = async (ticketId) => {
    if (!confirm('Mark this ticket as complete?')) return;
    try {
      await patchTicket(ticketId, { state: 'done' });
      const updated = await getTicketWithDetails(ticketId);
      setSelectedTicket(updated.ticket);
      await fetchData();
    } catch (err) {
      console.error('Complete failed:', err);
      alert('Failed to complete ticket: ' + err.message);
    }
  };

  const handleSelectTicket = async (ticketId) => {
    try {
      const data = await getTicketWithDetails(ticketId);
      setSelectedTicket(data.ticket);
    } catch (err) {
      console.error('Failed to load ticket:', err);
    }
  };

  const getProjectName = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Unknown';
  };


  // Calculate active filters count
  const activeFilters = [filterState, filterProject].filter(Boolean).length;

  return (
    <div className="page-container">
      
      <Sidebar />
      
      <main className="page-main ">
        {/* Hero Stats Section */}
        <div className="tickets-hero">
          <div className="hero-title">
            <h2>Ticket Management</h2>
            <p className="hero-subtitle">Track and manage your agent work queue</p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat total">
              <span className="stat-number">{stats.total || 0}</span>
              <span className="stat-label">Total Tickets</span>
            </div>
            <div className="hero-stat active">
              <span className="stat-number">
                {(stats.byState?.in_progress || 0) + (stats.byState?.assigned || 0)}
              </span>
              <span className="stat-label">Active</span>
            </div>
            <div className="hero-stat pending">
              <span className="stat-number">
                {(stats.byState?.ready || 0) + (stats.byState?.needs_review || 0)}
              </span>
              <span className="stat-label">Pending</span>
            </div>
            <div className="hero-stat done">
              <span className="stat-number">{stats.byState?.done || 0}</span>
              <span className="stat-label">Completed</span>
            </div>
          </div>
        </div>

        {/* State Pills - Clickable Filters */}
        <div className="state-pills">
          {Object.entries(stats.byState || {}).filter(([_, count]) => count > 0).map(([state, count]) => (
            <button
              key={state}
              className={`state-pill ${filterState === state ? 'active' : ''}`}
              style={{
                '--pill-color': STATE_CONFIG[state]?.color,
                '--pill-bg': STATE_CONFIG[state]?.bg,
                '--pill-glow': STATE_CONFIG[state]?.glow
              }}
              onClick={() => setFilterState(filterState === state ? '' : state)}
            >
              <span className="pill-count">{count}</span>
              <span className="pill-label">{STATE_CONFIG[state]?.label || state}</span>
            </button>
          ))}
        </div>


        {/* Filter Toolbar */}
        <div className="filters-toolbar">
          <div className="filter-group">
            <div className="filter-select-wrapper">
              <select 
                value={filterState} 
                onChange={e => setFilterState(e.target.value)}
                className="filter-select"
              >
                <option value="">All States</option>
                {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              <span className="select-arrow">▾</span>
            </div>
            <div className="filter-select-wrapper">
              <select 
                value={filterProject} 
                onChange={e => setFilterProject(e.target.value)}
                className="filter-select"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <span className="select-arrow">▾</span>
            </div>
            {activeFilters > 0 && (
              <button 
                className="clear-filters"
                onClick={() => { setFilterState(''); setFilterProject(''); }}
              >
                Clear ({activeFilters})
              </button>
            )}
          </div>
          <button 
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={fetchData}
            disabled={loading || refreshing}
          >
            <span className="refresh-icon">↻</span>
            {refreshing ? "Refreshing..." : "Refresh"}</button>
          <button className="new-ticket-btn" onClick={() => setShowNewTicket(true)}>+ New Ticket</button>
          <Link to="/tickets/kanban" className="kanban-link">📋 Kanban</Link>
        </div>

        {/* Error Banner */}
        {(error || localError) && (
          <div className="error-banner">
            <span className="error-icon">⚠</span>
            {error || localError}
            <button className="error-dismiss" onClick={() => setLocalError(null)}>×</button>
          </div>
        )}

        {/* Tickets Table */}
        <div className="tickets-container">
          <table className="tickets-table">
            <thead>
              <tr>
                <th className="th-title">Ticket</th>
                <th className="th-project">Project</th>
                <th className="th-state">State</th>
                <th className="th-scope">Scope</th>
                <th className="th-verify">Verify</th>
                <th className="th-assignee">Assignee</th>
                <th className="th-created">Created</th>
                <th className="th-updated">Updated</th>
                <th className="th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {loading && tickets.length === 0 ? (
                <tr>
                  <td colSpan="9" className="loading-row">
                    <div className="loading-pulse"></div>
                    Loading tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-row">
                    <div className="empty-state">
                      <span className="empty-icon">📋</span>
                      <p>No tickets found</p>
                      <span className="empty-hint">
                        {activeFilters > 0 ? 'Try adjusting your filters' : 'Create a project to generate tickets'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : tickets.map(ticket => (
                <tr 
                  key={ticket.id} 
                  className="ticket-row"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <td className="td-title">
                    <div className="ticket-title-cell">
                      <span className="ticket-id">#{ticket.id}</span>
                      <span className="ticket-title">{ticket.title}</span>
                      {ticket.vm_id && (
                        <Link 
                          to={`/vms?highlight=${ticket.vm_id}`} 
                          className="vm-badge"
                          onClick={e => e.stopPropagation()}
                        >
                          VM {ticket.vm_id}
                        </Link>
                      )}
                      {ticket.pr_url && (
                        <a 
                          href={ticket.pr_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="pr-badge"
                          onClick={e => e.stopPropagation()}
                        >
                          PR
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="td-project">
                    <span className="project-name">{getProjectName(ticket.project_id)}</span>
                  </td>
                  <td className="td-state">
                    <span 
                      className="state-badge"
                      style={{
                        color: STATE_CONFIG[ticket.state]?.color,
                        backgroundColor: STATE_CONFIG[ticket.state]?.bg,
                        boxShadow: `0 0 12px ${STATE_CONFIG[ticket.state]?.bg}`
                      }}
                    >
                      {STATE_CONFIG[ticket.state]?.label || ticket.state}
                    </span>
                  </td>
                  <td className="td-scope">
                    {ticket.estimated_scope && (
                      <span 
                        className="scope-badge"
                        style={{ color: SCOPE_CONFIG[ticket.estimated_scope]?.color }}
                        title={SCOPE_CONFIG[ticket.estimated_scope]?.hint}
                      >
                        {SCOPE_CONFIG[ticket.estimated_scope]?.label}
                      </span>
                    )}
                  </td>
                  <td className="td-verify">
                    <span 
                      className="verify-badge"
                      style={{
                        color: VERIFICATION_CONFIG[ticket.verification_status || 'unverified']?.color,
                        backgroundColor: VERIFICATION_CONFIG[ticket.verification_status || 'unverified']?.bg
                      }}
                      title={VERIFICATION_CONFIG[ticket.verification_status || 'unverified']?.label}
                    >
                      {VERIFICATION_CONFIG[ticket.verification_status || 'unverified']?.icon}
                    </span>
                  </td>
                  <td className="td-assignee">
                    <span className="assignee-badge">
                      {ticket.assignee_type === 'agent' ? <Bot size={14} /> : <User size={14} />}
                      <span className="assignee-id">{ticket.assignee_id || '—'}</span>
                    </span>
                  </td>
                  <td className="td-created">
                    <span className="time-ago">
                      <Clock size={14} />
                      {getRelativeTime(ticket.created_at) || '—'}
                    </span>
                  </td>
                  <td className="td-updated">
                    <span className="time-ago">{getRelativeTime(ticket.updated_at) || '—'}</span>
                  </td>
                  <td className="td-actions">
                    <button 
                      className="view-btn"
                      onClick={e => { e.stopPropagation(); setSelectedTicket(ticket); }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>


        {/* Ticket Detail Modal */}
        {selectedTicket && (
          <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title-area">
                  <span className="modal-ticket-id">#{selectedTicket.id}</span>
                  {isEditing ? (
                    <input
                      type="text"
                      className="edit-title-input"
                      value={editForm.title}
                      onChange={e => setEditForm({...editForm, title: e.target.value})}
                    />
                  ) : (
                    <h2>{selectedTicket.title}</h2>
                  )}
                </div>
                <div className="modal-header-actions">
                  {!isEditing ? (
                    <button className="edit-btn" onClick={handleStartEdit}>✏️ Edit</button>
                  ) : (
                    <div className="edit-actions">
                      <button className="save-btn" onClick={handleSaveEdit}>💾 Save</button>
                      <button className="cancel-edit-btn" onClick={handleCancelEdit}>Cancel</button>
                    </div>
                  )}
                  <button className="modal-close" onClick={() => { setSelectedTicket(null); setIsEditing(false); }}>×</button>
                </div>
              </div>
              
              <div className="modal-body">
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>State</label>
                    <select 
                      value={selectedTicket.state}
                      onChange={e => handleStateChange(selectedTicket.id, e.target.value)}
                      className="state-select"
                      style={{
                        borderColor: STATE_CONFIG[selectedTicket.state]?.color,
                        color: STATE_CONFIG[selectedTicket.state]?.color
                      }}
                    >
                      {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="detail-item">
                    <label>Project</label>
                    <span className="detail-value">{getProjectName(selectedTicket.project_id)}</span>
                  </div>
                  
                  <div className="detail-item">
                    <label>Scope</label>
                    <span className="detail-value">
                      {selectedTicket.estimated_scope ? (
                        <span style={{ color: SCOPE_CONFIG[selectedTicket.estimated_scope]?.color }}>
                          {SCOPE_CONFIG[selectedTicket.estimated_scope]?.hint}
                        </span>
                      ) : '—'}
                    </span>
                  </div>
                  
                  <div className="detail-item">
                    <label>Assignee</label>
                    <span className="detail-value">
                      {selectedTicket.assignee_type === 'agent' ? <><Bot size={14} /> Agent</> : <><User size={14} /> Human</>}
                      {selectedTicket.assignee_id ? `: ${selectedTicket.assignee_id}` : ' (Unassigned)'}
                    </span>
                  </div>
                  
                  <div className="detail-item">
                    <label>Verification</label>
                    <span className="detail-value">
                      <span 
                        className="verify-badge-modal"
                        style={{
                          color: VERIFICATION_CONFIG[selectedTicket.verification_status || 'unverified']?.color,
                          backgroundColor: VERIFICATION_CONFIG[selectedTicket.verification_status || 'unverified']?.bg
                        }}
                      >
                        {VERIFICATION_CONFIG[selectedTicket.verification_status || 'unverified']?.icon}{' '}
                        {VERIFICATION_CONFIG[selectedTicket.verification_status || 'unverified']?.label}
                      </span>
                      {selectedTicket.rejection_count > 0 && (
                        <span className="rejection-count">({selectedTicket.rejection_count} retries)</span>
                      )}
                    </span>
                  </div>
                </div>

                {selectedTicket.vm_id && (
                  <div className="detail-link-row">
                    <label>Virtual Machine</label>
                    <Link to={`/vms?highlight=${selectedTicket.vm_id}`} className="detail-link">
                      View VM #{selectedTicket.vm_id} →
                    </Link>
                  </div>
                )}

                {/* Repository Links Section */}
                {(selectedTicket.repo_url || selectedTicket.branch_name || selectedTicket.pr_url) && (
                  <div className="detail-block repository-section">
                    <label>🔗 Repository & Code</label>
                    <div className="repo-links">
                      {selectedTicket.repo_url && (
                        <a 
                          href={selectedTicket.repo_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="repo-link"
                        >
                          <span className="link-icon">📁</span>
                          <span className="link-text">Repository</span>
                          <span className="link-url">{selectedTicket.repo_url.replace('https://github.com/', '')}</span>
                        </a>
                      )}
                      {selectedTicket.branch_name && (
                        <a 
                          href={selectedTicket.repo_url ? `${selectedTicket.repo_url}/tree/${selectedTicket.branch_name}` : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repo-link"
                        >
                          <span className="link-icon">🌿</span>
                          <span className="link-text">Branch</span>
                          <span className="link-url">{selectedTicket.branch_name}</span>
                        </a>
                      )}
                      {selectedTicket.pr_url && (
                        <a 
                          href={selectedTicket.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repo-link pr-link"
                        >
                          <span className="link-icon">🔀</span>
                          <span className="link-text">Pull Request</span>
                          <span className="link-url">#{selectedTicket.pr_url.split('/').pop()}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div className="detail-block">
                  <label>Description</label>
                  <div className="description-box">
                    {selectedTicket.description || 'No description provided'}
                  </div>
                </div>

                {selectedTicket.acceptance_criteria && (
                  <div className="detail-block">
                    <label>Acceptance Criteria</label>
                    <div className="description-box criteria">
                      {selectedTicket.acceptance_criteria}
                    </div>
                  </div>
                )}

                {selectedTicket.verification_evidence && (
                  <div className="detail-block verification-feedback">
                    <label>
                      Verification Feedback
                      {selectedTicket.verification_status === 'failed' && <span className="feedback-status failed"> (Failed)</span>}
                      {selectedTicket.verification_status === 'passed' && <span className="feedback-status passed"> (Passed)</span>}
                    </label>
                    <div className="description-box feedback">
                      <pre>{selectedTicket.verification_evidence}</pre>
                    </div>
                  </div>
                )}

                
                {/* Dependencies Section */}
                {(selectedTicket.blocked_by?.length > 0 || selectedTicket.blocks?.length > 0) && (
                  <div className="detail-block dependencies-section">
                    <label>🔀 Dependencies</label>
                    <div className="dependencies-container">
                      {selectedTicket.blocked_by?.length > 0 && (
                        <div className="dependency-group blocked-by">
                          <span className="dep-label">⛔ Blocked By:</span>
                          <div className="dep-tickets">
                            {selectedTicket.blocked_by.map(dep => (
                              <button
                                key={dep.id}
                                className={`dep-ticket state-${dep.state}`}
                                onClick={() => handleSelectTicket(dep.id)}
                              >
                                <span className="dep-id">{dep.id.slice(0, 8)}</span>
                                <span className="dep-title">{dep.title}</span>
                                <span className={`dep-state ${dep.state}`}>{dep.state}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedTicket.blocks?.length > 0 && (
                        <div className="dependency-group blocks">
                          <span className="dep-label">🚧 Blocks:</span>
                          <div className="dep-tickets">
                            {selectedTicket.blocks.map(dep => (
                              <button
                                key={dep.id}
                                className={`dep-ticket state-${dep.state}`}
                                onClick={() => handleSelectTicket(dep.id)}
                              >
                                <span className="dep-id">{dep.id.slice(0, 8)}</span>
                                <span className="dep-title">{dep.title}</span>
                                <span className={`dep-state ${dep.state}`}>{dep.state}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Activity Timeline Section */}
                {selectedTicket.events?.length > 0 && (
                  <div className="detail-block activity-section">
                    <label>📊 Activity</label>
                    <div className="activity-timeline">
                      {selectedTicket.events.slice(0, 10).map(event => (
                        <div key={event.id} className={`activity-item event-${event.event_type}`}>
                          <span className="activity-icon">
                            {event.event_type === 'state_changed' && '🔄'}
                            {event.event_type === 'edited' && '✏️'}
                            {event.event_type === 'requeued' && '🔁'}
                            {event.event_type === 'assigned' && '👤'}
                            {event.event_type === 'completed' && '✅'}
                            {event.event_type === 'created' && '🆕'}
                            {event.event_type === 'dependency_added' && '🔗'}
                            {event.event_type === 'dependency_removed' && '✂️'}
                          </span>
                          <span className="activity-time">
                            {formatRelativeTime(event.created_at)}
                          </span>
                          <span className="activity-description">
                            {formatEventDescription(event)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="detail-timestamps">
                  <span><Clock size={14} /> Created: {new Date(selectedTicket.created_at).toLocaleString()}</span>
                  <span><Clock size={14} /> Updated: {new Date(selectedTicket.updated_at).toLocaleString()}</span>
                </div>
                {/* Action Buttons */}
                <div className="ticket-actions">
                  {['in_progress', 'assigned', 'in_review', 'changes_requested', 'done'].includes(selectedTicket.state) && (
                    <button 
                      className="action-btn requeue-btn"
                      onClick={() => handleRequeue(selectedTicket.id)}
                    >
                      🔄 Requeue
                    </button>
                  )}
                  
                  {selectedTicket.state !== 'cancelled' && selectedTicket.state !== 'done' && (
                    <button 
                      className="action-btn cancel-btn"
                      onClick={() => handleCancelTicket(selectedTicket.id)}
                    >
                      🗑️ Cancel
                    </button>
                  )}
                  
                  {selectedTicket.state === 'in_review' && (
                    <button 
                      className="action-btn complete-btn"
                      onClick={() => handleMarkComplete(selectedTicket.id)}
                    >
                      ✅ Approve & Complete
                    </button>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* New Ticket Modal */}
        {showNewTicket && (
          <div className="modal-overlay" onClick={() => setShowNewTicket(false)}>
            <div className="modal-content new-ticket-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create New Ticket</h2>
                <button className="modal-close" onClick={() => setShowNewTicket(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title *</label>
                  <input
                    type="text"
                    value={newTicket.title}
                    onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                    placeholder="Enter ticket title..."
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newTicket.description}
                    onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                    placeholder="Describe the work to be done..."
                    className="form-textarea"
                    rows={6}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Project</label>
                    <select
                      value={newTicket.project_id}
                      onChange={e => setNewTicket({...newTicket, project_id: e.target.value})}
                      className="form-select"
                    >
                      <option value="">No Project</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Estimated Scope</label>
                    <div className="scope-selector">
                      {['S', 'M', 'L'].map(scope => (
                        <button
                          key={scope}
                          type="button"
                          className={`scope-btn ${newTicket.estimated_scope === scope ? 'active' : ''}`}
                          onClick={() => setNewTicket({...newTicket, estimated_scope: scope})}
                        >
                          {scope}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="cancel-btn" onClick={() => setShowNewTicket(false)}>Cancel</button>
                  <button 
                    className="create-btn" 
                    onClick={handleCreateTicket}
                    disabled={!newTicket.title.trim()}
                  >
                    Create Ticket
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


      {/* Premium Dark Theme Styles */}
      <style>{`
        .tickets-dashboard { min-height: 100vh; background: #0a0a0a; }
        . { padding: 0 2rem 2rem 2rem; }
        
        /* Hero Section */
        .tickets-hero {
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
        .hero-stat.total { border-left: 3px solid #00d4ff; }
        .hero-stat.active { border-left: 3px solid #8b5cf6; }
        .hero-stat.pending { border-left: 3px solid #f59e0b; }
        .hero-stat.done { border-left: 3px solid #10b981; }
        .stat-number {
          display: block;
          font-size: 1.75rem;
          font-weight: 700;
          background: linear-gradient(135deg, #fff 0%, #aaa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-stat.total .stat-number { background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%); -webkit-background-clip: text; background-clip: text; }
        .hero-stat.active .stat-number { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); -webkit-background-clip: text; background-clip: text; }
        .hero-stat.pending .stat-number { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); -webkit-background-clip: text; background-clip: text; }
        .hero-stat.done .stat-number { background: linear-gradient(135deg, #10b981 0%, #059669 100%); -webkit-background-clip: text; background-clip: text; }
        .stat-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          margin-top: 0.25rem;
        }

        /* State Pills */
        .state-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .state-pill {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.9rem;
          background: var(--pill-bg);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.85rem;
        }
        .state-pill:hover {
          border-color: var(--pill-color);
          box-shadow: 0 0 15px var(--pill-bg);
        }
        .state-pill.active {
          border-color: var(--pill-color);
          box-shadow: 0 0 20px var(--pill-bg), inset 0 0 20px var(--pill-bg);
        }
        .pill-count {
          font-weight: 700;
          color: var(--pill-color);
        }
        .pill-label {
          color: #888;
        }
        .state-pill.active .pill-label { color: #ccc; }


        /* Filters Toolbar */
        .filters-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }
        .filter-group {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }
        .filter-select-wrapper {
          position: relative;
        }
        .filter-select {
          appearance: none;
          background: #1a1a2e;
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          padding: 0.6rem 2rem 0.6rem 1rem;
          border-radius: 8px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 140px;
        }
        .filter-select:hover { border-color: rgba(0, 212, 255, 0.3); }
        .filter-select:focus { outline: none; border-color: #00d4ff; }
        .filter-select option { background: #1a1a2e; color: #fff; }
        .select-arrow {
          position: absolute;
          right: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
          pointer-events: none;
          font-size: 0.75rem;
        }
        .clear-filters {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 0.6rem 1rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }
        .clear-filters:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }
        .kanban-link { display: flex; align-items: center; gap: 0.5rem; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); color: #a855f7; padding: 0.6rem 1rem; border-radius: 8px; text-decoration: none; font-size: 0.9rem; transition: all 0.2s; } .kanban-link:hover { background: rgba(168, 85, 247, 0.2); border-color: #a855f7; } .refresh-btn {
        .new-ticket-btn { display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1)); border: 1px solid rgba(34, 197, 94, 0.4); color: #22c55e; padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s; } .new-ticket-btn:hover { background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(16, 185, 129, 0.2)); border-color: #22c55e; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3); }
        .new-ticket-modal { max-width: 500px; }
        .form-group { margin-bottom: 1.25rem; }
        .form-group label { display: block; color: #9ca3af; font-size: 0.85rem; margin-bottom: 0.5rem; font-weight: 500; }
        .form-input, .form-textarea, .form-select { width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.75rem 1rem; color: #fff; font-size: 0.95rem; transition: all 0.2s; }
        .form-input:focus, .form-textarea:focus, .form-select:focus { outline: none; border-color: rgba(59, 130, 246, 0.5); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        .form-input::placeholder, .form-textarea::placeholder { color: rgba(255,255,255,0.3); }
        .form-textarea { resize: vertical; min-height: 180px; font-family: inherit; }
        .form-select { cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; background-size: 1.25rem; padding-right: 2.5rem; }
        .form-select option { background: #1a1a2e; color: #fff; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .scope-selector { display: flex; gap: 0.5rem; }
        .scope-btn { flex: 1; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: #9ca3af; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .scope-btn:hover { border-color: rgba(59, 130, 246, 0.3); color: #fff; }
        .scope-btn.active { background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.2)); border-color: #3b82f6; color: #3b82f6; }
        .form-actions { display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); }
        .cancel-btn { padding: 0.75rem 1.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: #9ca3af; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .cancel-btn:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
        .create-btn { padding: 0.75rem 1.5rem; border-radius: 8px; border: none; background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .create-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4); }
        .create-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
          border: none;
          color: #000;
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .refresh-btn:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3); }
        .refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .refresh-icon { font-size: 1.1rem; transition: transform 0.3s; }
        .refresh-btn.spinning .refresh-icon { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Error Banner */
        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        .error-icon { font-size: 1.1rem; }
        .error-dismiss {
          margin-left: auto;
          background: none;
          border: none;
          color: #ef4444;
          font-size: 1.25rem;
          cursor: pointer;
          opacity: 0.7;
        }
        .error-dismiss:hover { opacity: 1; }


        /* Tickets Table */
        .tickets-container {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          overflow: hidden;
        }
        .tickets-table {
          width: 100%;
          border-collapse: collapse;
        }
        .tickets-table th {
          padding: 1rem 1.25rem;
          text-align: left;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          background: rgba(0,0,0,0.2);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .tickets-table td {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          vertical-align: middle;
        }
        .ticket-row {
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ticket-row:hover {
          background: rgba(0, 212, 255, 0.03);
        }
        .ticket-row:last-child td { border-bottom: none; }
        
        /* Table Cells */
        .ticket-title-cell {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .ticket-id {
          font-size: 0.7rem;
          color: #00d4ff;
          font-family: monospace;
          font-weight: 600;
        }
        .ticket-title {
          font-weight: 500;
          color: #fff;
          max-width: 350px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .vm-badge, .pr-badge {
          display: inline-block;
          font-size: 0.65rem;
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
          text-decoration: none;
          font-weight: 600;
          margin-right: 0.35rem;
        }
        .vm-badge {
          background: rgba(139, 92, 246, 0.15);
          color: #8b5cf6;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }
        .vm-badge:hover { background: rgba(139, 92, 246, 0.25); }
        .pr-badge {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .pr-badge:hover { background: rgba(16, 185, 129, 0.25); }
        
        .project-name {
          color: #888;
          font-size: 0.9rem;
        }
        .state-badge {
          display: inline-block;
          padding: 0.3rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .scope-badge {
          font-weight: 800;
          font-size: 1rem;
        }
        .verify-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .verify-badge-modal {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.6rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .rejection-count {
          margin-left: 0.5rem;
          color: #ef4444;
          font-size: 0.8rem;
        }
        .th-verify { width: 60px; text-align: center; }
        .td-verify { text-align: center; }
        .verification-feedback label .feedback-status.failed { color: #ef4444; }
        .verification-feedback label .feedback-status.passed { color: #10b981; }
        .verification-feedback .description-box.feedback {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .verification-feedback .description-box.feedback pre {
          margin: 0;
          white-space: pre-wrap;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          color: #d4d4d8;
        }
        .assignee-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.9rem;
        }
        .assignee-id { color: #888; }
        .time-ago {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          color: #666;
          font-size: 0.85rem;
        }
        .view-btn {
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          color: #00d4ff;
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .view-btn:hover {
          background: rgba(0, 212, 255, 0.2);
          border-color: #00d4ff;
        }

        /* Empty & Loading States */
        .loading-row, .empty-row {
          text-align: center;
          padding: 3rem 1rem !important;
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
        .empty-state {
          color: #666;
        }
        .empty-icon {
          font-size: 2.5rem;
          display: block;
          margin-bottom: 0.75rem;
          opacity: 0.5;
        }
        .empty-state p { margin: 0 0 0.5rem; font-size: 1.1rem; color: #888; }
        .empty-hint { font-size: 0.9rem; color: #555; }


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
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal-content {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          width: 90%;
          max-width: 600px;
          max-height: 85vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .modal-title-area { flex: 1; }
        .modal-ticket-id {
          font-size: 0.75rem;
          color: #00d4ff;
          font-family: monospace;
          font-weight: 600;
          display: block;
          margin-bottom: 0.25rem;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #fff;
          line-height: 1.4;
        }
        .modal-close {
          background: rgba(255,255,255,0.05);
          border: none;
          color: #666;
          font-size: 1.5rem;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
        
        .modal-body { padding: 1.5rem; }
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
        }
        .detail-item label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          margin-bottom: 0.5rem;
        }
        .detail-value {
          color: #fff;
          font-size: 0.95rem;
        }
        .state-select {
          background: rgba(0,0,0,0.3);
          border: 2px solid;
          color: inherit;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
        }
        .state-select:focus { outline: none; }
        .state-select option { background: #1a1a2e; color: #fff; }
        
        .detail-link-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0;
          border-top: 1px solid rgba(255,255,255,0.04);
        }
        .detail-link-row label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
        }
        .detail-link {
          color: #00d4ff;
          text-decoration: none;
          font-size: 0.9rem;
        }
        .detail-link:hover { text-decoration: underline; }
        .branch-code {
          background: rgba(0,0,0,0.3);
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.85rem;
          color: #10b981;
        }
        
        .detail-block {
          margin-top: 1.25rem;
        }
        .detail-block label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          margin-bottom: 0.5rem;
        }
        .description-box {
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 8px;
          padding: 1rem;
          color: #ccc;
          font-size: 0.9rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .description-box.criteria {
          border-left: 3px solid #00d4ff;
        }

        /* Repository Links Section */
        .repository-section .repo-links {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .repo-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 8px;
          color: #60a5fa;
          text-decoration: none;
          transition: all 0.2s;
        }
        .repo-link:hover {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.5);
        }
        .repo-link .link-icon {
          font-size: 18px;
        }
        .repo-link .link-text {
          font-weight: 600;
          min-width: 80px;
        }
        .repo-link .link-url {
          color: #94a3b8;
          font-family: monospace;
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .repo-link.pr-link {
          background: rgba(168, 85, 247, 0.1);
          border-color: rgba(168, 85, 247, 0.3);
          color: #c084fc;
        }

        
        .detail-timestamps {
          display: flex;
          gap: 2rem;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255,255,255,0.04);
          font-size: 0.8rem;
          color: #555;
        }
        .detail-timestamps span {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        /* Active nav state */
        .dashboard-nav a.active {
          color: #00d4ff;
          background: rgba(0, 212, 255, 0.1);
        }
      
        /* Dependencies Section */
        .dependencies-section .dependencies-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .dependency-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .dependency-group .dep-label {
          font-weight: 600;
          color: #94a3b8;
          font-size: 13px;
        }
        .dependency-group.blocked-by .dep-label {
          color: #f87171;
        }
        .dependency-group.blocks .dep-label {
          color: #fbbf24;
        }
        .dep-tickets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .dep-ticket {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          color: #e2e8f0;
        }
        .dep-ticket:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .dep-ticket .dep-id {
          font-family: monospace;
          font-size: 11px;
          color: #64748b;
        }
        .dep-ticket .dep-title {
          font-size: 13px;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dep-ticket .dep-state {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .dep-state.done { background: rgba(16, 185, 129, 0.2); color: #10b981; }
        .dep-state.blocked { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .dep-state.in_progress { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
        .dep-state.ready { background: rgba(251, 191, 36, 0.2); color: #fbbf24; }
        .dep-state.pending { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }
        .dep-state.draft { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }

        /* Activity Timeline */
        .activity-timeline {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 200px;
          overflow-y: auto;
        }
        .activity-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          font-size: 13px;
        }
        .activity-item .activity-icon {
          font-size: 14px;
        }
        .activity-item .activity-time {
          color: #64748b;
          font-size: 11px;
          min-width: 60px;
        }
        .activity-item .activity-description {
          color: #cbd5e1;
        }

        /* Action Buttons */
        .ticket-actions {
          display: flex;
          gap: 12px;
          padding: 16px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin-top: 16px;
        }
        .action-btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .action-btn.requeue-btn {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .action-btn.requeue-btn:hover {
          background: rgba(59, 130, 246, 0.3);
        }
        .action-btn.cancel-btn {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .action-btn.cancel-btn:hover {
          background: rgba(239, 68, 68, 0.3);
        }
        .action-btn.complete-btn {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .action-btn.complete-btn:hover {
          background: rgba(16, 185, 129, 0.3);
        }

        /* Edit Mode */
        .modal-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .edit-btn {
          padding: 6px 12px;
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 6px;
          color: #60a5fa;
          cursor: pointer;
          font-size: 13px;
        }
        .edit-btn:hover {
          background: rgba(59, 130, 246, 0.3);
        }
        .edit-title-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 18px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(59, 130, 246, 0.5);
          border-radius: 8px;
          color: white;
        }
        .edit-description-textarea {
          width: 100%;
          padding: 12px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(59, 130, 246, 0.5);
          border-radius: 8px;
          color: white;
          resize: vertical;
          min-height: 120px;
        }
        .edit-actions {
          display: flex;
          gap: 8px;
        }
        .save-btn {
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          background: #10b981;
          color: white;
          border: none;
        }
        .save-btn:hover {
          background: #059669;
        }
        .cancel-edit-btn {
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          background: transparent;
          color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .cancel-edit-btn:hover {
          background: rgba(255, 255, 255, 0.05);
        }

      `}</style>
    </main>
    </div>
  );
}
