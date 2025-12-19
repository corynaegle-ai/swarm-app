/**
 * CreateProject - Project Type Selection & Specification Input
 * Entry point for the HITL Design Flow with multiple project types
 * Updated: Repository selector for Build Feature with main + supporting repos
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import useHITL from '../hooks/useHITL';
import { designMcpServer } from '../services/mcpApi';
import { AppWindow, Plug2, Workflow, Cog, ArrowLeft, GitBranch, Check, ChevronDown, Loader2, AlertCircle, Search } from 'lucide-react';
import './CreateProject.css';

// Project type configurations with Lucide icons
const PROJECT_TYPES = {
  application: {
    id: 'application',
    Icon: AppWindow,
    colorClass: 'blue',
    title: 'New Application',
    description: 'Build a full-stack application with UI, API, and database',
    available: true,
    flowSteps: ['Describe Project', 'AI Clarification', 'Review Spec', 'Approve & Generate']
  },
  build_feature: {
    id: 'build_feature',
    Icon: Cog,
    colorClass: 'orange',
    title: 'Build Feature',
    description: 'Add a new feature to an existing application or codebase',
    available: true,
    flowSteps: ['Select Repos', 'Describe Feature', 'AI Analysis', 'Review & Generate']
  },
  mcp_server: {
    id: 'mcp_server',
    Icon: Plug2,
    colorClass: 'green',
    title: 'New MCP Server',
    description: 'Create a Model Context Protocol server for AI tool integration',
    available: true,
    flowSteps: ['Define Tools', 'Configure Resources', 'Review Schema', 'Generate Server']
  },
  workflow: {
    id: 'workflow',
    Icon: Workflow,
    colorClass: 'purple',
    title: 'New Workflow',
    description: 'Design an automated workflow with triggers and actions',
    available: false,
    flowSteps: ['Define Triggers', 'Add Actions', 'Set Conditions', 'Deploy Workflow']
  }
};

export default function CreateProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createSession, listSessions, startClarification, loading, error, clearError } = useHITL();
  const [selectedType, setSelectedType] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [specFile, setSpecFile] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const fileInputRef = useRef(null);
  const [mcpServerName, setMcpServerName] = useState('');
  const [mcpDescription, setMcpDescription] = useState('');
  const [mcpTools, setMcpTools] = useState('');
  const [isDesigning, setIsDesigning] = useState(false);
  
  // Build Feature state
  const [featureName, setFeatureName] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  
  // Repository selection state
  const [repositories, setRepositories] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState(null);
  const [mainRepo, setMainRepo] = useState(null);
  const [supportingRepos, setSupportingRepos] = useState([]);
  const [mainRepoDropdownOpen, setMainRepoDropdownOpen] = useState(false);
  const [repoSearchTerm, setRepoSearchTerm] = useState('');
  const mainRepoRef = useRef(null);

  // Fetch recent sessions
  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const data = await listSessions(null, 5);
        setRecentSessions(data.sessions || []);
      } catch (err) {}
    };
    fetchRecent();
  }, [listSessions]);

  // Fetch repositories when Build Feature is selected
  useEffect(() => {
    if (selectedType === 'build_feature') {
      fetchRepositories();
    }
  }, [selectedType]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (mainRepoRef.current && !mainRepoRef.current.contains(e.target)) {
        setMainRepoDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRepositories = async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      // Fetch from backend API (uses authenticated GitHub API for private repos)
      const token = localStorage.getItem('token');
      const response = await fetch('/api/repo/list', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch repositories');
      }
      const data = await response.json();
      setRepositories(data.repos || []);
    } catch (err) {
      console.error('Error fetching repos:', err);
      setReposError(err.message);
    } finally {
      setReposLoading(false);
    }
  };

  const handleMainRepoSelect = (repo) => {
    setMainRepo(repo);
    setMainRepoDropdownOpen(false);
    // Remove from supporting repos if it was selected there
    setSupportingRepos(prev => prev.filter(r => r.id !== repo.id));
  };

  const handleSupportingRepoToggle = (repo) => {
    // Can't select main repo as supporting
    if (mainRepo && mainRepo.id === repo.id) return;
    
    setSupportingRepos(prev => {
      const exists = prev.find(r => r.id === repo.id);
      if (exists) {
        return prev.filter(r => r.id !== repo.id);
      } else {
        return [...prev, repo];
      }
    });
  };

  const filteredRepos = repositories.filter(repo => 
    repo.name.toLowerCase().includes(repoSearchTerm.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(repoSearchTerm.toLowerCase()))
  );


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

  const handleApplicationSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    if (!projectName.trim()) { setLocalError('Project name is required'); return; }
    if (!description.trim()) { setLocalError('Please provide a project description'); return; }
    try {
      const result = await createSession(projectName.trim(), description.trim());
      navigate(`/design/${result.id}`);
    } catch (err) { setLocalError(err.message); }
  };

  const handleMcpSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    if (!mcpServerName.trim()) { setLocalError("Server name is required"); return; }
    if (!mcpDescription.trim()) { setLocalError("Please describe what your MCP server will do"); return; }
    
    const fullDescription = `MCP Server: ${mcpServerName}\n\n${mcpDescription}\n\n${mcpTools ? `Desired Tools:\n${mcpTools}` : ""}`.trim();
    
    setIsDesigning(true);
    try {
      const result = await designMcpServer(fullDescription);
      navigate(`/projects/${result.project.id}`);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setIsDesigning(false);
    }
  };

  const handleBuildFeatureSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    if (!featureName.trim()) { setLocalError('Feature name is required'); return; }
    if (!mainRepo) { setLocalError('Please select a main repository'); return; }
    if (!featureDescription.trim()) { setLocalError('Please describe the feature you want to build'); return; }
    try {
      // Build the spec with main repo and supporting repos
      let featureSpec = `# Feature: ${featureName}\n\n`;
      featureSpec += `## Main Repository\n- **Name:** ${mainRepo.name}\n- **URL:** ${mainRepo.url}\n- **Branch:** ${mainRepo.default_branch}\n`;
      if (mainRepo.description) {
        featureSpec += `- **Description:** ${mainRepo.description}\n`;
      }
      featureSpec += '\n';
      
      if (supportingRepos.length > 0) {
        featureSpec += `## Supporting Repositories\nThese repositories contain reference code or materials the agents may need:\n\n`;
        supportingRepos.forEach(repo => {
          featureSpec += `### ${repo.name}\n- **URL:** ${repo.url}\n`;
          if (repo.description) {
            featureSpec += `- **Description:** ${repo.description}\n`;
          }
          featureSpec += '\n';
        });
      }
      
      featureSpec += `## Feature Description\n${featureDescription}`;
      
      // Pass repo_url and supporting_repos directly to backend
      const result = await createSession(featureName.trim(), featureDescription.trim(), 'build_feature', {
        repo_url: mainRepo.url,
        supporting_repos: supportingRepos.map(r => ({
          name: r.name,
          url: r.url,
          description: r.description,
          language: r.language,
          default_branch: r.default_branch
        }))
      });
      navigate(`/design/${result.id}`);
    } catch (err) { setLocalError(err.message); }
  };

  const handleBack = () => { 
    setSelectedType(null); 
    setLocalError(null); 
    clearError();
    // Reset build feature state
    setMainRepo(null);
    setSupportingRepos([]);
    setFeatureName('');
    setFeatureDescription('');
    setRepoSearchTerm('');
  };

  const getStateColor = (state) => ({ 
    input: '#888', 
    clarifying: '#00d4ff', 
    ready_for_docs: '#00ff88', 
    reviewing: '#aa88ff', 
    approved: '#00ff88', 
    building: '#ff8800', 
    completed: '#32cd32', 
    cancelled: '#ff4444', 
    failed: '#ff4444' 
  }[state] || '#888');

  const currentFlow = selectedType ? PROJECT_TYPES[selectedType] : null;


  const projectTypeSelector = (
    <div className="project-type-selector">
      <div className="selector-header">
        <h2>What would you like to create?</h2>
        <p className="subtitle">Choose a project type to get started</p>
      </div>
      <div className="project-type-grid">
        {Object.values(PROJECT_TYPES).map((type) => {
          const IconComponent = type.Icon;
          return (
            <button key={type.id} className={`project-type-card ${type.colorClass} ${!type.available ? 'disabled' : ''}`}
              onClick={() => type.available && setSelectedType(type.id)} disabled={!type.available}>
              <div className={`type-icon-wrapper ${type.colorClass}`}>
                <IconComponent size={24} strokeWidth={2} />
              </div>
              <h3>{type.title}</h3>
              <p>{type.description}</p>
              {!type.available && <span className="coming-soon-badge">Coming Soon</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const applicationForm = (
    <div className="create-project-container glass-card">
      <div className="create-project-header">
        <button className="back-button" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
        <div className="form-header-title">
          <div className="type-icon-wrapper blue small"><AppWindow size={20} strokeWidth={2} /></div>
          <h2>New Application</h2>
        </div>
        <p className="subtitle">Describe your application idea. Our AI Design Agent will ask clarifying questions, then generate a detailed specification for your approval.</p>
      </div>
      {(error || localError) && (
        <div className="error-toast"><span>⚠️</span>{error || localError}<button onClick={() => { setLocalError(null); clearError(); }}>×</button></div>
      )}
      <form onSubmit={handleApplicationSubmit} className="create-project-form">
        <div className="form-group">
          <label htmlFor="projectName">Project Name <span className="required">*</span></label>
          <input id="projectName" type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g., Task Management App" className="input-field" maxLength={100} />
          <span className="char-count">{projectName.length}/100</span>
        </div>
        <div className="form-group">
          <label htmlFor="description">Project Description <span className="required">*</span></label>
          <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you want to build..." className="input-field textarea-large" rows={8} />
          <div className="textarea-footer">
            <span className="hint">💡 The more detail you provide, the fewer questions we'll need to ask</span>
            <span className="char-count">{description.length} chars</span>
          </div>
        </div>
        <div className="form-group file-upload-group">
          <label>Or Upload a Spec File</label>
          <div className="file-upload-zone" onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleFileChange({ target: { files: [file] } }); }}>
            <input ref={fileInputRef} type="file" accept=".md,.txt" onChange={handleFileChange} hidden />
            {specFile ? (<div className="file-selected"><span>📄 {specFile.name}</span><button type="button" onClick={(e) => { e.stopPropagation(); setSpecFile(null); }} className="remove-file">×</button></div>)
              : (<div className="file-placeholder"><span className="upload-icon">📁</span><span>Drop .md or .txt file here, or click to browse</span></div>)}
          </div>
        </div>
        <button type="submit" className="submit-button" disabled={loading || !projectName.trim() || !description.trim()}>
          {loading ? <span className="btn-loading">⏳ Creating...</span> : <><AppWindow size={18} /><span>Start Design Session</span></>}
        </button>
      </form>
    </div>
  );


  const buildFeatureForm = (
    <div className="create-project-container glass-card">
      <div className="create-project-header">
        <button className="back-button" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
        <div className="form-header-title">
          <div className="type-icon-wrapper orange small"><Cog size={20} strokeWidth={2} /></div>
          <h2>Build Feature</h2>
        </div>
        <p className="subtitle">Add a new feature to an existing codebase. Select the main repository and any supporting repos that contain reference code.</p>
      </div>
      {(error || localError) && (
        <div className="error-toast"><span>⚠️</span>{error || localError}<button onClick={() => { setLocalError(null); clearError(); }}>×</button></div>
      )}
      <form onSubmit={handleBuildFeatureSubmit} className="create-project-form">
        <div className="form-group">
          <label htmlFor="featureName">Feature Name <span className="required">*</span></label>
          <input id="featureName" type="text" value={featureName} onChange={(e) => setFeatureName(e.target.value)} placeholder="e.g., User Authentication, Dark Mode, Export to PDF" className="input-field" maxLength={100} />
          <span className="char-count">{featureName.length}/100</span>
        </div>

        {/* Main Repository Selector */}
        <div className="form-group">
          <label>Main Repository <span className="required">*</span></label>
          <p className="field-hint">The primary repository where the feature will be built</p>
          
          {reposLoading ? (
            <div className="repo-loading">
              <Loader2 className="spin" size={20} />
              <span>Loading repositories...</span>
            </div>
          ) : reposError ? (
            <div className="repo-error">
              <AlertCircle size={16} />
              <span>{reposError}</span>
              <button type="button" onClick={fetchRepositories} className="retry-btn">Retry</button>
            </div>
          ) : (
            <div className="repo-selector" ref={mainRepoRef}>
              <button 
                type="button" 
                className={`repo-dropdown-trigger ${mainRepoDropdownOpen ? 'open' : ''}`}
                onClick={() => setMainRepoDropdownOpen(!mainRepoDropdownOpen)}
              >
                {mainRepo ? (
                  <div className="selected-repo">
                    <GitBranch size={16} />
                    <span className="repo-name">{mainRepo.name}</span>
                    {mainRepo.language && <span className="repo-lang">{mainRepo.language}</span>}
                  </div>
                ) : (
                  <span className="placeholder">Select main repository...</span>
                )}
                <ChevronDown size={16} className={`chevron ${mainRepoDropdownOpen ? 'rotated' : ''}`} />
              </button>
              
              {mainRepoDropdownOpen && (
                <div className="repo-dropdown">
                  <div className="repo-search">
                    <Search size={14} />
                    <input 
                      type="text" 
                      placeholder="Search repositories..." 
                      value={repoSearchTerm}
                      onChange={(e) => setRepoSearchTerm(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="repo-list">
                    {filteredRepos.length === 0 ? (
                      <div className="no-repos">No repositories found</div>
                    ) : (
                      filteredRepos.map(repo => (
                        <button
                          key={repo.id}
                          type="button"
                          className={`repo-option ${mainRepo?.id === repo.id ? 'selected' : ''}`}
                          onClick={() => handleMainRepoSelect(repo)}
                        >
                          <div className="repo-option-content">
                            <div className="repo-option-header">
                              <GitBranch size={14} />
                              <span className="repo-name">{repo.name}</span>
                              {repo.language && <span className="repo-lang">{repo.language}</span>}
                            </div>
                            {repo.description && (
                              <span className="repo-desc">{repo.description}</span>
                            )}
                          </div>
                          {mainRepo?.id === repo.id && <Check size={16} className="check-icon" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Supporting Repositories Selector */}
        <div className="form-group">
          <label>Supporting Repositories</label>
          <p className="field-hint">Optional: Select repositories that contain reference code or materials the agents might need</p>
          
          {!reposLoading && !reposError && repositories.length > 0 && (
            <div className="supporting-repos-container">
              <div className="supporting-repos-header">
                <span className="selected-count">
                  {supportingRepos.length} selected
                </span>
              </div>
              <div className="supporting-repos-list">
                {repositories
                  .filter(repo => !mainRepo || repo.id !== mainRepo.id)
                  .map(repo => {
                    const isSelected = supportingRepos.some(r => r.id === repo.id);
                    return (
                      <label 
                        key={repo.id} 
                        className={`supporting-repo-item ${isSelected ? 'selected' : ''}`}
                      >
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSupportingRepoToggle(repo)}
                        />
                        <div className="checkbox-custom">
                          {isSelected && <Check size={12} />}
                        </div>
                        <div className="repo-info">
                          <div className="repo-header">
                            <GitBranch size={14} />
                            <span className="repo-name">{repo.name}</span>
                            {repo.language && <span className="repo-lang">{repo.language}</span>}
                          </div>
                          {repo.description && (
                            <span className="repo-desc">{repo.description}</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="featureDescription">Feature Description <span className="required">*</span></label>
          <textarea id="featureDescription" value={featureDescription} onChange={(e) => setFeatureDescription(e.target.value)} placeholder="Describe the feature you want to add. Include user stories, acceptance criteria, or any specific requirements..." className="input-field textarea-large" rows={8} />
          <div className="textarea-footer">
            <span className="hint">💡 Include details about how the feature should work and integrate with existing code</span>
            <span className="char-count">{featureDescription.length} chars</span>
          </div>
        </div>
        
        <button type="submit" className="submit-button orange" disabled={loading || !featureName.trim() || !mainRepo || !featureDescription.trim()}>
          {loading ? <span className="btn-loading">⏳ Creating...</span> : <><Cog size={18} /><span>Start Feature Design</span></>}
        </button>
      </form>
    </div>
  );


  const mcpServerForm = (
    <div className="create-project-container glass-card">
      <div className="create-project-header">
        <button className="back-button" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
        <div className="form-header-title">
          <div className="type-icon-wrapper green small"><Plug2 size={20} strokeWidth={2} /></div>
          <h2>New MCP Server</h2>
        </div>
        <p className="subtitle">Define your Model Context Protocol server. Describe the tools and resources it will expose to AI assistants like Claude.</p>
      </div>
      {(error || localError) && (
        <div className="error-toast"><span>⚠️</span>{error || localError}<button onClick={() => { setLocalError(null); clearError(); }}>×</button></div>
      )}
      <form onSubmit={handleMcpSubmit} className="create-project-form">
        <div className="form-group">
          <label htmlFor="mcpServerName">Server Name <span className="required">*</span></label>
          <input id="mcpServerName" type="text" value={mcpServerName} onChange={(e) => setMcpServerName(e.target.value)} placeholder="e.g., GitHub MCP Server" className="input-field" maxLength={100} />
          <span className="char-count">{mcpServerName.length}/100</span>
        </div>
        <div className="form-group">
          <label htmlFor="mcpDescription">What should this MCP server do? <span className="required">*</span></label>
          <textarea id="mcpDescription" value={mcpDescription} onChange={(e) => setMcpDescription(e.target.value)} placeholder="Describe the purpose of this MCP server..." className="input-field textarea-large" rows={6} />
          <div className="textarea-footer">
            <span className="hint">💡 Example: "Connect to Jira to create, update, and query issues"</span>
            <span className="char-count">{mcpDescription.length} chars</span>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="mcpTools">Tools to expose (optional)</label>
          <textarea id="mcpTools" value={mcpTools} onChange={(e) => setMcpTools(e.target.value)} placeholder="List the tools/functions..." className="input-field textarea-medium" rows={5} />
          <div className="textarea-footer"><span className="hint">💡 Leave blank and we'll help you define tools during the design session</span></div>
        </div>
        <button type="submit" className="submit-button green" disabled={isDesigning || !mcpServerName.trim() || !mcpDescription.trim()}>
          {isDesigning ? <span className="btn-loading">⏳ Designing MCP Server...</span> : <><Plug2 size={18} /><span>Design MCP Server</span></>}
        </button>
      </form>
    </div>
  );

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main create-project-layout">
        {!selectedType && projectTypeSelector}
        {selectedType === 'application' && applicationForm}
        {selectedType === 'build_feature' && buildFeatureForm}
        {selectedType === 'mcp_server' && mcpServerForm}
        <aside className="recent-sessions-sidebar glass-card">
          <h3>Recent Sessions</h3>
          {recentSessions.length > 0 ? (
            <ul className="session-list">
              {recentSessions.map((session) => (
                <li key={session.id} className="session-item">
                  <Link to={`/design/${session.id}`}>
                    <div className="session-name">{session.project_name}</div>
                    <div className="session-meta">
                      <span className="state-badge" style={{ backgroundColor: getStateColor(session.state) }}>{session.state}</span>
                      <span className="session-date">{new Date(session.created_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (<p className="no-sessions">No recent sessions</p>)}
          {currentFlow && (
            <div className="flow-preview">
              <div className="flow-preview-header">
                <div className={`type-icon-wrapper ${currentFlow.colorClass} small`}><currentFlow.Icon size={16} /></div>
                <h4>{currentFlow.title} Flow</h4>
              </div>
              <ol className="flow-steps">{currentFlow.flowSteps.map((step, idx) => (<li key={idx} className={idx === 0 ? 'current' : ''}>{step}</li>))}</ol>
            </div>
          )}
          {!currentFlow && (
            <div className="flow-preview">
              <h4>Project Types</h4>
              <ul className="type-summary">
                <li><strong>Application:</strong> Full-stack apps</li>
                <li><strong>Build Feature:</strong> Enhance existing code</li>
                <li><strong>MCP Server:</strong> AI tool integration</li>
                <li><strong>Workflow:</strong> Automation (coming soon)</li>
              </ul>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
