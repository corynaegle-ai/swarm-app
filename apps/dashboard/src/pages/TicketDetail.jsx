/**
 * TicketDetail - Full ticket view with real-time activity timeline
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  Clock,
  User,
  Bot,
  Tag,
  RefreshCw
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ActivityTimeline from '../components/ActivityTimeline';
import { useTicketActivity } from '../hooks/useTicketActivity';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Ticket state styling config
const STATE_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
  ready: { label: 'Ready', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  blocked: { label: 'Blocked', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  on_hold: { label: 'On Hold', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  assigned: { label: 'Assigned', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  in_progress: { label: 'In Progress', color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)' },
  verifying: { label: 'Verifying', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  in_review: { label: 'In Review', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  done: { label: 'Done', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  cancelled: { label: 'Cancelled', color: '#4b5563', bg: 'rgba(75, 85, 99, 0.15)' }
};

/**
 * Fetch ticket details
 */
async function fetchTicket(ticketId) {
  const token = localStorage.getItem('swarm_token');
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch ticket');
  }
  
  return res.json();
}

/**
 * Format relative time
 */
function formatTime(dateString) {
  if (!dateString) return '-';
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

export default function TicketDetail() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Activity timeline hook
  const {
    activity,
    loading: activityLoading,
    error: activityError,
    isConnected,
    refresh: refreshActivity,
    activityEndRef
  } = useTicketActivity(ticketId);

  // Fetch ticket data
  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchTicket(ticketId);
      setTicket(data);
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  // Get state config
  const stateConfig = ticket?.state ? STATE_CONFIG[ticket.state] || STATE_CONFIG.draft : null;

  if (loading) {
    return (
      <div className="layout-container">
        <Sidebar />
        <main className="main-content">
          <div className="loading-spinner">
            <div className="spinner" />
            <p>Loading ticket...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="layout-container">
        <Sidebar />
        <main className="main-content">
          <div className="error-container" style={{ padding: '2rem', textAlign: 'center' }}>
            <h2 style={{ color: '#ef4444' }}>Error</h2>
            <p style={{ color: '#888', marginTop: '0.5rem' }}>{error || 'Ticket not found'}</p>
            <button 
              onClick={() => navigate('/tickets')}
              style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#00d4ff', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Back to Tickets
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="layout-container">
      <Sidebar />
      <main className="main-content">
        <div style={{ padding: '1.5rem 2rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <button 
              onClick={() => navigate('/tickets')}
              style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ fontSize: '1.5rem', color: '#fff', marginBottom: '0.25rem' }}>
                {ticket.id}
              </h1>
              <p style={{ color: '#888', fontSize: '0.875rem' }}>{ticket.title}</p>
            </div>
            <span 
              style={{ 
                marginLeft: 'auto',
                padding: '0.35rem 0.75rem', 
                borderRadius: '4px', 
                fontSize: '0.75rem',
                fontWeight: '600',
                color: stateConfig?.color,
                background: stateConfig?.bg
              }}
            >
              {stateConfig?.label || ticket.state}
            </span>
          </div>

          {/* Main grid layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.5rem' }}>
            {/* Left column - Ticket details */}
            <div>
              {/* Description */}
              <div style={{ background: '#1a1a2e', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', color: '#888', marginBottom: '0.75rem' }}>Description</h3>
                <p style={{ color: '#e0e0e0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {ticket.description || 'No description provided'}
                </p>
              </div>

              {/* Acceptance Criteria */}
              {ticket.acceptance_criteria && (
                <div style={{ background: '#1a1a2e', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.875rem', color: '#888', marginBottom: '0.75rem' }}>Acceptance Criteria</h3>
                  <p style={{ color: '#e0e0e0', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {ticket.acceptance_criteria}
                  </p>
                </div>
              )}

              {/* Metadata grid */}
              <div style={{ background: '#1a1a2e', borderRadius: '8px', padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.875rem', color: '#888', marginBottom: '0.75rem' }}>Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Agent</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e0e0e0' }}>
                      <Bot size={14} />
                      {ticket.assigned_agent || 'Unassigned'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Created</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e0e0e0' }}>
                      <Clock size={14} />
                      {formatTime(ticket.created_at)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Scope</div>
                    <div style={{ color: '#e0e0e0' }}>{ticket.scope || 'medium'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Updated</div>
                    <div style={{ color: '#e0e0e0' }}>{formatTime(ticket.updated_at)}</div>
                  </div>
                </div>

                {/* Links */}
                {(ticket.branch_name || ticket.pr_url) && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #333' }}>
                    {ticket.branch_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <GitBranch size={14} style={{ color: '#8b5cf6' }} />
                        <code style={{ color: '#8b5cf6', fontSize: '0.875rem' }}>{ticket.branch_name}</code>
                      </div>
                    )}
                    {ticket.pr_url && (
                      <a 
                        href={ticket.pr_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', textDecoration: 'none', fontSize: '0.875rem' }}
                      >
                        <ExternalLink size={14} />
                        View Pull Request
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right column - Activity Timeline */}
            <div>
              <ActivityTimeline
                activity={activity}
                loading={activityLoading}
                error={activityError}
                isConnected={isConnected}
                onRefresh={refreshActivity}
                activityEndRef={activityEndRef}
                title="Agent Activity"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
