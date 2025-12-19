import { Bot, Clock, CheckCircle, XCircle, Zap } from 'lucide-react';
import './AgentCard.css';

/**
 * AgentCard - Displays agent summary in catalog grid
 */
export default function AgentCard({ agent, onClick }) {
  const {
    name,
    version = '1.0.0',
    description,
    runtime = 'node',
    memory_mb = 128,
    tags = [],
    author,
    created_at,
    stats = {}
  } = agent;

  const { total_runs = 0, success_rate = 0, avg_duration_ms = 0 } = stats;
  const avgDurationSec = Math.round(avg_duration_ms / 1000);
  const successPercent = Math.round(success_rate * 100);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  return (
    <div className="agent-card" onClick={() => onClick?.(agent)}>
      <div className="agent-card-header">
        <div className="agent-card-title">
          <Bot size={20} className="agent-icon" />
          <span className="agent-name">{name}</span>
          <span className="agent-version">v{version}</span>
        </div>
        <div className="agent-badges">
          <span className="badge badge-runtime">{runtime}</span>
          <span className="badge badge-memory">{memory_mb}MB</span>
        </div>
      </div>

      <p className="agent-description">{description || 'No description'}</p>

      {tags.length > 0 && (
        <div className="agent-tags">
          {tags.slice(0, 4).map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
          {tags.length > 4 && <span className="tag tag-more">+{tags.length - 4}</span>}
        </div>
      )}

      <div className="agent-meta">
        <span className="meta-author">{author || 'Unknown'}</span>
        <span className="meta-date">{formatDate(created_at)}</span>
      </div>

      {total_runs > 0 && (
        <div className="agent-stats">
          <div className="stat">
            <Zap size={14} />
            <span>{total_runs} runs</span>
          </div>
          <div className="stat">
            <CheckCircle size={14} className={successPercent >= 80 ? 'text-green' : 'text-yellow'} />
            <span>{successPercent}%</span>
          </div>
          <div className="stat">
            <Clock size={14} />
            <span>{avgDurationSec}s avg</span>
          </div>
        </div>
      )}
    </div>
  );
}
