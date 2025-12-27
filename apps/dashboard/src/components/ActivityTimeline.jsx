/**
 * ActivityTimeline - Real-time agent activity display component
 * Shows color-coded, icon-decorated activity entries with expandable metadata
 */
import { useState, useEffect, useRef } from 'react';
import {
  Ticket,
  Cpu,
  FilePlus,
  FileEdit,
  GitBranch,
  GitPullRequest,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronRight,
  Clock
} from 'lucide-react';
import './ActivityTimeline.css';

// Category configuration with colors and icons
const CATEGORY_CONFIG = {
  ticket_claimed: {
    icon: Ticket,
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.15)',
    label: 'Claimed'
  },
  code_generation: {
    icon: Cpu,
    color: '#00d4ff',
    bg: 'rgba(0, 212, 255, 0.15)',
    label: 'Code Generation'
  },
  file_created: {
    icon: FilePlus,
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.15)',
    label: 'File Created'
  },
  file_modified: {
    icon: FileEdit,
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    label: 'File Modified'
  },
  git_operation: {
    icon: GitBranch,
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.15)',
    label: 'Git Operation'
  },
  pr_created: {
    icon: GitPullRequest,
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.15)',
    label: 'PR Created'
  },
  error: {
    icon: AlertTriangle,
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.15)',
    label: 'Error'
  }
};

// Default config for unknown categories
const DEFAULT_CONFIG = {
  icon: Clock,
  color: '#6b7280',
  bg: 'rgba(107, 114, 128, 0.15)',
  label: 'Activity'
};

/**
 * Format timestamp to relative time
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffSecs < 10) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString();
}

/**
 * Format absolute timestamp
 */
function formatAbsoluteTime(isoString) {
  return new Date(isoString).toLocaleString();
}

/**
 * Single activity entry with expandable metadata
 */
function ActivityEntry({ entry, isNew }) {
  const [expanded, setExpanded] = useState(false);
  const config = CATEGORY_CONFIG[entry.category] || DEFAULT_CONFIG;
  const Icon = config.icon;
  const hasMetadata = entry.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <div
      className={`activity-entry ${isNew ? 'activity-entry-new' : ''}`}
      style={{ '--category-color': config.color, '--category-bg': config.bg }}
    >
      <div className="activity-entry-main" onClick={() => hasMetadata && setExpanded(!expanded)}>
        <div className="activity-icon" style={{ color: config.color, background: config.bg }}>
          <Icon size={16} />
        </div>

        <div className="activity-content">
          <div className="activity-header">
            <span className="activity-category" style={{ color: config.color }}>
              {config.label}
            </span>
            <span className="activity-time" title={formatAbsoluteTime(entry.timestamp)}>
              {formatTimestamp(entry.timestamp)}
            </span>
          </div>
          <div className="activity-message">{entry.message}</div>
          {entry.actor && (
            <div className="activity-actor">
              by {entry.actor.type === 'agent' ? '🤖' : '👤'} {entry.actor.id}
            </div>
          )}
        </div>

        {hasMetadata && (
          <button className="activity-expand-btn">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        )}
      </div>

      {expanded && hasMetadata && (
        <div className="activity-metadata">
          {/* Generated Code Display */}
          {entry.metadata.generated_code && (
            <div className="metadata-section">
              <div className="metadata-label">Generated Code</div>
              <pre className="metadata-code-block">
                <code>{entry.metadata.generated_code}</code>
              </pre>
            </div>
          )}

          {/* Verification Results Display */}
          {(entry.metadata.status || entry.metadata.decision) && (
            <div className="metadata-section">
              <div className="metadata-label">Verification Result</div>
              <div className={`verification-badge ${(entry.metadata.status === 'success' || entry.metadata.decision === 'approve')
                  ? 'verification-success'
                  : 'verification-failure'
                }`}>
                {entry.metadata.status || entry.metadata.decision}
              </div>
            </div>
          )}

          {/* Verification Feedback/Reasons */}
          {entry.metadata.feedback_for_agent && (
            <div className="metadata-section">
              <div className="metadata-label">Rejection Reasons</div>
              <ul className="feedback-list">
                {Array.isArray(entry.metadata.feedback_for_agent)
                  ? entry.metadata.feedback_for_agent.map((item, i) => (
                    <li key={i}>{typeof item === 'object' ? item.message || JSON.stringify(item) : item}</li>
                  ))
                  : <li>{JSON.stringify(entry.metadata.feedback_for_agent)}</li>
                }
              </ul>
            </div>
          )}

          {/* Default Metadata Rendering (excluding handled keys) */}
          {Object.entries(entry.metadata)
            .filter(([key]) => !['generated_code', 'status', 'decision', 'feedback_for_agent'].includes(key))
            .map(([key, value]) => (
              <div key={key} className="metadata-item">
                <span className="metadata-key">{key}:</span>
                <span className="metadata-value">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * ActivityTimeline Component
 * 
 * @param {Object} props
 * @param {Array} props.activity - Array of activity entries
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 * @param {boolean} props.isConnected - WebSocket connection state
 * @param {Function} props.onRefresh - Refresh callback
 * @param {React.Ref} props.activityEndRef - Ref for auto-scroll target
 * @param {string} props.title - Optional custom title
 */
export default function ActivityTimeline({
  activity = [],
  loading = false,
  error = null,
  isConnected = false,
  onRefresh,
  activityEndRef,
  title = 'Agent Activity'
}) {
  const [newEntryIds, setNewEntryIds] = useState(new Set());
  const prevActivityLengthRef = useRef(activity.length);

  // Track new entries for animation
  useEffect(() => {
    if (activity.length > prevActivityLengthRef.current) {
      const newEntries = activity.slice(prevActivityLengthRef.current);
      const newIds = new Set(newEntries.map(e => `${e.timestamp}-${e.category}`));
      setNewEntryIds(newIds);

      // Clear "new" status after animation
      setTimeout(() => setNewEntryIds(new Set()), 2000);
    }
    prevActivityLengthRef.current = activity.length;
  }, [activity]);

  return (
    <div className="activity-timeline">
      <div className="activity-timeline-header">
        <h3>{title}</h3>
        <div className="activity-timeline-controls">
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isConnected ? 'Live' : 'Offline'}
          </span>
          {onRefresh && (
            <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            </button>
          )}
        </div>
      </div>

      <div className="activity-timeline-content">
        {error && (
          <div className="activity-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading && activity.length === 0 && (
          <div className="activity-loading">
            <div className="activity-spinner" />
            <span>Loading activity...</span>
          </div>
        )}

        {!loading && activity.length === 0 && !error && (
          <div className="activity-empty">
            <Clock size={32} />
            <span>No activity yet</span>
            <p>Activity will appear here as the agent works on this ticket</p>
          </div>
        )}

        {activity.map((entry, index) => (
          <ActivityEntry
            key={`${entry.timestamp}-${entry.category}-${index}`}
            entry={entry}
            isNew={newEntryIds.has(`${entry.timestamp}-${entry.category}`)}
          />
        ))}

        {/* Auto-scroll anchor */}
        <div ref={activityEndRef} />
      </div>
    </div>
  );
}
