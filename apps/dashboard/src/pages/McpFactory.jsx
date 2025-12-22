import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import { 
  generateMcpServer, designMcpServer, getJobStatus, listJobs, listServers 
} from '../services/mcpApi';
import './McpFactory.css';
import toast from 'react-hot-toast';
import { 
  Wand2, Loader2, CheckCircle, XCircle, Clock, Play, 
  FileCode, Download, Ticket, RefreshCw, ChevronDown, ChevronRight
} from 'lucide-react';

export default function McpFactory() {
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState('generate');
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [servers, setServers] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [expandedJob, setExpandedJob] = useState(null);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await listJobs();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const data = await listServers();
      setServers(data.servers || []);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchServers();
  }, [fetchJobs, fetchServers]);

  // Poll for job status when there's a current job
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed') {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const status = await getJobStatus(currentJob.job_id);
        setCurrentJob(status);
        if (status.status === 'completed' || status.status === 'failed') {
          fetchJobs();
          fetchServers();
          if (status.status === 'completed') {
            toast.success('MCP server generated successfully!');
          } else {
            toast.error('Generation failed');
          }
        }
      } catch (err) {
        console.error('Failed to poll job status:', err);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [currentJob, fetchJobs, fetchServers]);

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    setLoading(true);
    try {
      const result = await generateMcpServer(description.trim());
      setCurrentJob(result);
      toast.success('Generation started!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDesign = async () => {
    if (!description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    setLoading(true);
    try {
      const result = await designMcpServer(description.trim());
      toast.success(`Created ${result.tickets_created || 0} tickets!`);
      setDescription('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="status-icon success" />;
      case 'failed': return <XCircle className="status-icon error" />;
      case 'processing': return <Loader2 className="status-icon spinning" />;
      default: return <Clock className="status-icon" />;
    }
  };

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        <div className="mcp-factory">
          <header className="page-header">
            <div className="header-title">
              <Wand2 size={28} />
              <h1>MCP Factory</h1>
            </div>
            <p className="header-subtitle">Generate MCP servers from natural language descriptions</p>
          </header>

          <div className="factory-tabs">
            <button 
              className={`tab ${activeTab === 'generate' ? 'active' : ''}`}
              onClick={() => setActiveTab('generate')}
            >
              <FileCode size={18} /> Generate Code
            </button>
            <button 
              className={`tab ${activeTab === 'design' ? 'active' : ''}`}
              onClick={() => setActiveTab('design')}
            >
              <Ticket size={18} /> Create Tickets
            </button>
          </div>

          <div className="factory-content">
            <div className="input-section">
              <label htmlFor="description">Describe your MCP server</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Example: A weather MCP server that can get current weather, forecasts, and weather alerts for any location using the OpenWeatherMap API..."
                rows={5}
              />
              <div className="action-buttons">
                {activeTab === 'generate' ? (
                  <button 
                    className="btn primary" 
                    onClick={handleGenerate}
                    disabled={loading || !description.trim()}
                  >
                    {loading ? <Loader2 className="spinning" /> : <Play size={18} />}
                    {loading ? 'Generating...' : 'Generate Code'}
                  </button>
                ) : (
                  <button 
                    className="btn secondary" 
                    onClick={handleDesign}
                    disabled={loading || !description.trim()}
                  >
                    {loading ? <Loader2 className="spinning" /> : <Ticket size={18} />}
                    {loading ? 'Creating...' : 'Create Swarm Tickets'}
                  </button>
                )}
              </div>
            </div>

            {currentJob && (
              <div className="current-job">
                <h3>Current Job</h3>
                <div className="job-card active">
                  <div className="job-header">
                    {getStatusIcon(currentJob.status)}
                    <span className="job-id">{currentJob.job_id}</span>
                    <span className={`status-badge ${currentJob.status}`}>{currentJob.status}</span>
                  </div>
                  {currentJob.status === 'completed' && currentJob.result && (
                    <div className="job-result">
                      <div className="result-header">
                        <strong>{currentJob.result.spec?.name || 'Generated Server'}</strong>
                        <span className="tool-count">{currentJob.result.spec?.tools?.length || 0} tools</span>
                      </div>
                      <pre className="result-spec">{JSON.stringify(currentJob.result.spec, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="jobs-section">
              <div className="section-header">
                <h3>Recent Jobs</h3>
                <button className="btn icon" onClick={fetchJobs}><RefreshCw size={16} /></button>
              </div>
              {jobs.length === 0 ? (
                <p className="empty-state">No jobs yet</p>
              ) : (
                <div className="jobs-list">
                  {jobs.slice(0, 10).map(job => (
                    <div key={job.job_id} className="job-card">
                      <div 
                        className="job-header clickable"
                        onClick={() => setExpandedJob(expandedJob === job.job_id ? null : job.job_id)}
                      >
                        {expandedJob === job.job_id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        {getStatusIcon(job.status)}
                        <span className="job-id">{job.job_id.slice(0, 8)}...</span>
                        <span className={`status-badge ${job.status}`}>{job.status}</span>
                      </div>
                      {expandedJob === job.job_id && job.result && (
                        <div className="job-result">
                          <pre className="result-spec">{JSON.stringify(job.result.spec, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="servers-section">
              <div className="section-header">
                <h3>Generated Servers</h3>
                <button className="btn icon" onClick={fetchServers}><RefreshCw size={16} /></button>
              </div>
              {servers.length === 0 ? (
                <p className="empty-state">No servers generated yet</p>
              ) : (
                <div className="servers-grid">
                  {servers.map(server => (
                    <div key={server.id || server.name} className="server-card">
                      <div className="server-header">
                        <FileCode size={20} />
                        <span className="server-name">{server.name}</span>
                      </div>
                      <p className="server-description">{server.description || 'No description'}</p>
                      <div className="server-meta">
                        <span className="tool-count">{server.tools?.length || 0} tools</span>
                        {server.created_at && (
                          <span className="created-at">
                            {new Date(server.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <button className="btn small">
                        <Download size={14} /> Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
