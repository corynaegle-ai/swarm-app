import { useState, useEffect } from 'react';
import '../layout.css';
import './LearningDashboard.css';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import {
  Brain, TrendingUp, AlertTriangle, Zap, Clock, CheckCircle2,
  XCircle, BarChart2, Cpu, Layers, RefreshCw, Activity, Sparkles,
  Timer, Database
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function LearningDashboard() {
  const { } = useAuth();
  const [summary, setSummary] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [errors, setErrors] = useState([]);
  const [tokenTrend, setTokenTrend] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const opts = { credentials: 'include' };
      const [detectRes, errRes, tokenRes, execRes] = await Promise.all([
        fetch(`${API_BASE}/api/learning/detect`, opts),
        fetch(`${API_BASE}/api/learning/errors?limit=5`, opts),
        fetch(`${API_BASE}/api/learning/tokens?days=7`, opts),
        fetch(`${API_BASE}/api/learning/executions?limit=10`, opts)
      ]);
      if (detectRes.ok) {
        const data = await detectRes.json();
        setSummary(data.summary);
        setPatterns(data.patterns);
      }
      if (errRes.ok) setErrors(await errRes.json());
      if (tokenRes.ok) setTokenTrend(await tokenRes.json());
      if (execRes.ok) setExecutions(await execRes.json());
    } catch (err) { console.error('Fetch error:', err); }
    finally { setLoading(false); }
  };

  const generateRules = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/learning/rules/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Generated ${data.generated} rules`);
        fetchData();
      }
    } catch (err) { console.error('Generate error:', err); }
    finally { setGenerating(false); }
  };

  if (loading) return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <span className="loading-text">Loading analytics...</span>
        </div>
      </main>
    </div>
  );

  const successRate = summary?.success_rate_pct || 0;
  const totalTokens = (summary?.total_input_tokens || 0) + (summary?.total_output_tokens || 0);
  const getSuccessColor = (rate) => rate >= 80 ? 'green' : rate >= 60 ? 'yellow' : 'red';

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        {/* Header */}
        <header className="learning-header">
          <div className="learning-title-row">
            <div className="learning-title-group">
              <h1>
                <Brain className="learning-title-icon" />
                Agent Learning Analytics
              </h1>
              <p className="learning-subtitle">Pattern detection & optimization insights</p>
            </div>
            <div className="learning-actions">
              <button onClick={fetchData} className="btn-refresh">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button onClick={generateRules} disabled={generating} className="btn-generate">
                <Sparkles className="w-4 h-4" />
                {generating ? 'Generating...' : 'Generate Rules'}
              </button>
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-label">Success Rate</span>
              <TrendingUp className={`stat-card-icon ${getSuccessColor(successRate)}`} />
            </div>
            <div className="stat-card-value">{successRate || 0}%</div>
            <div className="stat-card-subtitle">
              {summary?.successes || 0} passed · {summary?.failures || 0} failed
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-label">Total Executions</span>
              <Layers className="stat-card-icon purple" />
            </div>
            <div className="stat-card-value">{summary?.total_executions || 0}</div>
            <div className="stat-card-subtitle">
              {summary?.unique_agents || 0} agents · {summary?.unique_tasks || 0} tasks
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-label">Avg Duration</span>
              <Timer className="stat-card-icon cyan" />
            </div>
            <div className="stat-card-value">
              {((summary?.avg_duration_ms || 0) / 1000).toFixed(1)}s
            </div>
            <div className="stat-card-subtitle">Per execution average</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-label">Total Tokens</span>
              <Database className="stat-card-icon blue" />
            </div>
            <div className="stat-card-value">{totalTokens.toLocaleString()}</div>
            <div className="stat-card-subtitle">
              ↓{(summary?.total_input_tokens || 0).toLocaleString()} · ↑{(summary?.total_output_tokens || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="content-grid">
          {/* Recent Executions */}
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">
                <Activity className="panel-title-icon blue" />
                Recent Executions
              </h2>
              <span className="panel-badge">{executions.length} latest</span>
            </div>
            <div className="panel-content">
              {executions.length === 0 ? (
                <div className="empty-state">
                  <Activity className="empty-icon" />
                  <div className="empty-title">No executions yet</div>
                  <div className="empty-description">
                    Agent executions will appear here as they run
                  </div>
                </div>
              ) : (
                executions.map((exec, i) => (
                  <div key={i} className="exec-row">
                    <div className="exec-left">
                      <div className={`exec-status ${exec.outcome === 'success' ? 'success' : 'failure'}`}>
                        {exec.outcome === 'success' ? <CheckCircle2 /> : <XCircle />}
                      </div>
                      <div className="exec-info">
                        <div className="exec-task">{exec.task_id || 'Unknown task'}</div>
                        <div className="exec-meta">
                          <span className="exec-meta-item">
                            <Clock className="w-3 h-3" />
                            {new Date(exec.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="exec-right">
                      <span className="exec-model">
                        {exec.model?.split('-').slice(1, 2).join('-') || 'claude'}
                      </span>
                      <span className="exec-duration">
                        {((exec.duration_ms || 0) / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Error Distribution */}
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">
                <AlertTriangle className="panel-title-icon yellow" />
                Common Errors
              </h2>
              <span className="panel-badge">{errors.length} patterns</span>
            </div>
            <div className="panel-content">
              {errors.length === 0 ? (
                <div className="empty-state">
                  <CheckCircle2 className="empty-icon" />
                  <div className="empty-title">No errors recorded</div>
                  <div className="empty-description">
                    Your agents are running smoothly
                  </div>
                </div>
              ) : (
                errors.map((err, i) => (
                  <div key={i} className="error-row">
                    <div className="error-info">
                      <div className="error-category">{err.category}</div>
                      <div className="error-subcategory">{err.subcategory}</div>
                    </div>
                    <span className="error-count">{err.count}×</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Temporal Patterns */}
        {patterns?.temporalPatterns?.length > 0 && (
          <div className="temporal-panel">
            <div className="temporal-header">
              <h2 className="temporal-title">
                <Clock /> Hourly Activity (UTC)
              </h2>
              <div className="temporal-legend">
                <div className="legend-item">
                  <span className="legend-dot success"></span>
                  Low failures
                </div>
                <div className="legend-item">
                  <span className="legend-dot warning"></span>
                  Medium
                </div>
                <div className="legend-item">
                  <span className="legend-dot danger"></span>
                  High failures
                </div>
              </div>
            </div>
            <div className="temporal-grid">
              {Array.from({ length: 24 }, (_, h) => {
                const hourData = patterns.temporalPatterns.find(p => p.hour_utc === h);
                const rate = hourData?.failure_rate_pct || 0;
                const level = rate > 50 ? 3 : rate > 20 ? 2 : rate > 0 ? 1 : 0;
                return (
                  <div key={h} className="hour-cell">
                    <div
                      className={`hour-bar level-${level}`}
                      title={`${h}:00 UTC - ${rate}% failure rate`}
                    />
                    <span className="hour-label">{h.toString().padStart(2, '0')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
