/**
 * CreateProject - Project Specification Input Form
 * Entry point for the HITL Design Flow
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserMenu from '../components/UserMenu';
import useHITL from '../hooks/useHITL';

export default function CreateProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createSession, listSessions, loading, error, clearError } = useHITL();
  
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [specFile, setSpecFile] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const fileInputRef = useRef(null);

  // Fetch recent sessions for the sidebar
  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const data = await listSessions(null, 5);
        setRecentSessions(data.sessions || []);
      } catch (err) {
        // Silently fail - this is optional UI
      }
    };
    fetchRecent();
  }, [listSessions]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        setSpecFile(file);
        setLocalError(null);
        const reader = new FileReader();
        reader.onload = (ev) => setDescription(ev.target.result);
        reader.readAsText(file);
      } else {
        setLocalError('Please upload a .md or .txt file');
        setSpecFile(null);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!projectName.trim()) {
      setLocalError('Project name is required');
      return;
    }
    if (!description.trim()) {
      setLocalError('Please provide a project description');
      return;
    }

    try {
      const result = await createSession(projectName.trim(), description.trim());
      navigate(`/design/${result.id}`);
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const getStateColor = (state) => {
    const colors = {
      input: '#888',
      clarifying: '#00d4ff',
      ready_for_docs: '#00ff88',
      reviewing: '#aa88ff',
      approved: '#00ff88',
      building: '#ff8800',
      completed: '#32cd32',
      cancelled: '#ff4444',
      failed: '#ff4444'
    };
    return colors[state] || '#888';
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🐝 Swarm Dashboard</h1>
        <UserMenu />
      </header>
      
      <nav className="dashboard-nav">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/tickets">Tickets</Link>
        <Link to="/projects/new" className="active">New Project</Link>
        <Link to="/vms">VMs</Link>
        {user?.role === 'admin' && (
          <>
            <Link to="/admin/users">Users</Link>
            <Link to="/secrets">Secrets</Link>
          </>
        )}
      </nav>
      
      <main className="dashboard-main create-project-layout">
        {/* Main form area */}
        <div className="create-project-container glass-card">
          <div className="create-project-header">
            <h2>🚀 Start New Design Session</h2>
            <p className="subtitle">
              Describe your project idea. Our AI Design Agent will ask clarifying questions,
              then generate a detailed specification for your approval.
            </p>
          </div>

          {(error || localError) && (
            <div className="error-toast">
              <span>⚠️</span>
              {error || localError}
              <button onClick={() => { setLocalError(null); clearError(); }}>×</button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="create-project-form">
            <div className="form-group">
              <label htmlFor="projectName">
                Project Name <span className="required">*</span>
              </label>
              <input
                id="projectName"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Task Management App"
                className="input-field"
                maxLength={100}
              />
              <span className="char-count">{projectName.length}/100</span>
            </div>

            <div className="form-group">
              <label htmlFor="description">
                Project Description <span className="required">*</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you want to build. Include features, users, goals, and any technical requirements you know about..."
                className="input-field textarea-large"
                rows={8}
              />
              <div className="textarea-footer">
                <span className="hint">💡 The more detail you provide, the fewer questions we'll need to ask</span>
                <span className="char-count">{description.length} chars</span>
              </div>
            </div>

            <div className="form-group file-upload-group">
              <label>Or Upload a Spec File</label>
              <div 
                className="file-upload-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileChange({ target: { files: [file] } });
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt"
                  onChange={handleFileChange}
                  hidden
                />
                {specFile ? (
                  <div className="file-selected">
                    <span>📄 {specFile.name}</span>
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); setSpecFile(null); }}
                      className="remove-file"
                    >×</button>
                  </div>
                ) : (
                  <div className="file-placeholder">
                    <span className="upload-icon">📁</span>
                    <span>Drop .md or .txt file here, or click to browse</span>
                  </div>
                )}
              </div>
            </div>

            <button 
              type="submit" 
              className="submit-button"
              disabled={loading || !projectName.trim() || !description.trim()}
            >
              {loading ? (
                <span className="loading-spinner">⏳ Creating...</span>
              ) : (
                <span>🎯 Start Design Session</span>
              )}
            </button>
          </form>
        </div>

        {/* Sidebar with recent sessions */}
        <aside className="recent-sessions-sidebar glass-card">
          <h3>📋 Recent Sessions</h3>
          {recentSessions.length > 0 ? (
            <ul className="session-list">
              {recentSessions.map((session) => (
                <li key={session.id} className="session-item">
                  <Link to={`/design/${session.id}`}>
                    <div className="session-name">{session.project_name}</div>
                    <div className="session-meta">
                      <span 
                        className="state-badge"
                        style={{ backgroundColor: getStateColor(session.state) }}
                      >
                        {session.state}
                      </span>
                      <span className="session-date">
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-sessions">No recent sessions</p>
          )}
          
          <div className="flow-preview">
            <h4>Design Flow</h4>
            <ol className="flow-steps">
              <li className="current">Describe Project</li>
              <li>AI Clarification</li>
              <li>Review Spec</li>
              <li>Approve & Generate</li>
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
