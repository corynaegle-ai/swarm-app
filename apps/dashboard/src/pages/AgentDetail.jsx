import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, Bot, Play, Settings, Clock, CheckCircle, 
  XCircle, Activity, Loader2, AlertTriangle, RefreshCw 
} from 'lucide-react';
import { getAgentById, getAgentExecutions } from '../services/registryApi';
import './AgentDetail.css';

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchAgentData();
  }, [id]);

  async function fetchAgentData() {
    setLoading(true);
    setError(null);
    try {
      const [agentData, executionData] = await Promise.all([
        getAgentById(id),
        getAgentExecutions(id, 10).catch(() => [])
      ]);
      setAgent(agentData);
      setExecutions(executionData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }


  if (loading) {
    return (
      <div className="layout">
        <main className="main-content">
          <div className="loading-state">
            <Loader2 size={32} className="spin" />
            <p>Loading agent details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="layout">
        <main className="main-content">
          <div className="error-state">
            <AlertTriangle size={48} />
            <h3>Error Loading Agent</h3>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/agents/catalog')}>
              <ArrowLeft size={16} /> Back to Catalog
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!agent) return null;

  const { name, version, description, runtime, memory_mb, author, 
          tags = [], created_at, total_runs = 0, successful_runs = 0, avg_duration_ms = 0 } = agent;
  const successRate = total_runs > 0 ? Math.round((successful_runs / total_runs) * 100) : 0;

  return (
    <div className="layout">
      <main className="main-content">
        {/* Header */}
        <div className="detail-header">
          <Link to="/agents/catalog" className="back-link">
            <ArrowLeft size={20} /> Back to Catalog
          </Link>
          <div className="detail-title-row">
            <div className="detail-title">
              <Bot size={32} className="agent-icon" />
              <div>
                <h1>{name} <span className="version">v{version}</span></h1>
                <p className="author">by {author || 'Unknown'}</p>
              </div>
            </div>
            <div className="detail-actions">
              <button className="btn btn-secondary" onClick={fetchAgentData}>
                <RefreshCw size={16} /> Refresh
              </button>
              <button className="btn btn-primary">
                <Play size={16} /> Run Agent
              </button>
            </div>
          </div>
        </div>


        {/* Tabs */}
        <div className="detail-tabs">
          <button 
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`tab ${activeTab === 'executions' ? 'active' : ''}`}
            onClick={() => setActiveTab('executions')}
          >
            Executions
          </button>
          <button 
            className={`tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
        </div>

        {/* Tab Content */}
        <div className="detail-content">
          {activeTab === 'overview' && (
            <div className="overview-grid">
              <div className="card info-card">
                <h3>Description</h3>
                <p>{description || 'No description provided.'}</p>
                {tags.length > 0 && (
                  <div className="tags-section">
                    <h4>Tags</h4>
                    <div className="tags-list">
                      {tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
                    </div>
                  </div>
                )}
              </div>

              <div className="card stats-card">
                <h3>Statistics</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <Activity size={20} />
                    <div>
                      <span className="stat-value">{total_runs}</span>
                      <span className="stat-label">Total Runs</span>
                    </div>
                  </div>
                  <div className="stat-item">
                    <CheckCircle size={20} className="text-green" />
                    <div>
                      <span className="stat-value">{successRate}%</span>
                      <span className="stat-label">Success Rate</span>
                    </div>
                  </div>
                  <div className="stat-item">
                    <Clock size={20} />
                    <div>
                      <span className="stat-value">{Math.round(avg_duration_ms / 1000)}s</span>
                      <span className="stat-label">Avg Duration</span>
                    </div>
                  </div>
                </div>
              </div>


              <div className="card specs-card">
                <h3>Specifications</h3>
                <dl className="specs-list">
                  <div className="spec-row">
                    <dt>Runtime</dt>
                    <dd><span className="badge badge-runtime">{runtime}</span></dd>
                  </div>
                  <div className="spec-row">
                    <dt>Memory</dt>
                    <dd><span className="badge badge-memory">{memory_mb}MB</span></dd>
                  </div>
                  <div className="spec-row">
                    <dt>Created</dt>
                    <dd>{formatDate(created_at)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeTab === 'executions' && (
            <div className="executions-section">
              {executions.length === 0 ? (
                <div className="empty-state">
                  <Activity size={48} />
                  <h3>No Executions Yet</h3>
                  <p>This agent hasn't been run yet.</p>
                </div>
              ) : (
                <table className="executions-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map(exec => (
                      <tr key={exec.id}>
                        <td className="exec-id">{exec.id.slice(0, 8)}</td>
                        <td>
                          <span className={`status-badge status-${exec.status}`}>
                            {exec.status === 'success' && <CheckCircle size={14} />}
                            {exec.status === 'failed' && <XCircle size={14} />}
                            {exec.status}
                          </span>
                        </td>
                        <td>{exec.duration_ms ? `${(exec.duration_ms / 1000).toFixed(1)}s` : '-'}</td>
                        <td>{formatDate(exec.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="config-section">
              <div className="card">
                <h3><Settings size={20} /> Configuration</h3>
                <p className="config-note">Agent configuration editor coming soon.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

