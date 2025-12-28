/**
 * DesignSession - Interactive chat interface for HITL clarification flow
 * Supports state-aware actions through the full design pipeline
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserMenu from '../components/UserMenu';
import ChatMessage from '../components/ChatMessage';
import useHITL from '../hooks/useHITL';

// State configuration with colors and labels
const STATE_CONFIG = {
  input: { label: 'Input', color: '#666', icon: '📝' },
  clarifying: { label: 'Clarifying', color: '#00d4ff', icon: '💬' },
  ready_for_docs: { label: 'Ready for Spec', color: '#ffa500', icon: '✨' },
  reviewing: { label: 'Review', color: '#ff69b4', icon: '📋' },
  approved: { label: 'Approved', color: '#00ff88', icon: '✅' },
  building: { label: 'Building', color: '#9370db', icon: '🔨' },
  completed: { label: 'Complete', color: '#32cd32', icon: '🎉' },
  cancelled: { label: 'Cancelled', color: '#ff4444', icon: '❌' },
  failed: { label: 'Failed', color: '#ff4444', icon: '⚠️' }
};

// Progress mapping by state
const STATE_PROGRESS = {
  input: 5,
  clarifying: 25,
  ready_for_docs: 50,
  reviewing: 70,
  approved: 85,
  building: 90,
  completed: 100,
  cancelled: 0,
  failed: 0
};

export default function DesignSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    getSession, respond, generateSpec, approveSpec, 
    requestRevision, loading, error, clearError 
  } = useHITL();
  
  // State
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [localError, setLocalError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  
  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Parse clarification context safely
  const clarificationContext = (() => {
    try {
      if (!session?.clarification_context) return null;
      const ctx = typeof session.clarification_context === 'string' 
        ? JSON.parse(session.clarification_context) 
        : session.clarification_context;
      return ctx;
    } catch {
      return null;
    }
  })();

  // Calculate progress from context or state
  const progress = session?.progress_percent || 
    clarificationContext?.overallProgress || 
    STATE_PROGRESS[session?.state] || 0;

  // Fetch session data
  const fetchSession = useCallback(async () => {
    try {
      const data = await getSession(sessionId);
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      setLocalError(err.message);
    }
  }, [sessionId, getSession]);

  // Initial fetch
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Polling for updates in active states
  useEffect(() => {
    const activeStates = ['clarifying', 'building', 'reviewing'];
    if (session && activeStates.includes(session.state)) {
      pollIntervalRef.current = setInterval(fetchSession, 3000);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [session?.state, fetchSession]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when state allows typing
  useEffect(() => {
    if (['input', 'clarifying'].includes(session?.state)) {
      inputRef.current?.focus();
    }
  }, [session?.state]);

  // Send message handler
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || loading || isTyping) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setLocalError(null);

    // Optimistically add user message
    const tempId = 'temp-' + Date.now();
    const tempMessage = {
      id: tempId,
      role: 'user',
      content: messageText,
      message_type: 'answer',
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMessage]);
    setIsTyping(true);

    try {
      const result = await respond(sessionId, messageText);
      setSession(result.session);
      // Fetch full message list to get AI response
      await fetchSession();
    } catch (err) {
      setLocalError(err.message);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setIsTyping(false);
    }
  };

  // Generate spec handler
  const handleGenerateSpec = async () => {
    setLocalError(null);
    setIsTyping(true);
    try {
      await generateSpec(sessionId);
      await fetchSession();
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setIsTyping(false);
    }
  };

  // Approve spec handler
  const handleApprove = async () => {
    setLocalError(null);
    try {
      await approveSpec(sessionId);
      await fetchSession();
    } catch (err) {
      setLocalError(err.message);
    }
  };

  // Request revision handler
  const handleRequestRevision = async () => {
    if (!revisionFeedback.trim()) {
      setLocalError('Please provide feedback for the revision');
      return;
    }
    setLocalError(null);
    setIsTyping(true);
    try {
      await requestRevision(sessionId, revisionFeedback.trim());
      setRevisionFeedback('');
      setShowRevisionInput(false);
      await fetchSession();
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setIsTyping(false);
    }
  };

  // Check if input is enabled
  const canSendMessage = ['input', 'clarifying'].includes(session?.state) && !loading && !isTyping;

  // Get state config
  const stateConfig = STATE_CONFIG[session?.state] || STATE_CONFIG.input;

  // Parse spec card if available
  const specCard = (() => {
    try {
      if (!session?.spec_card) return null;
      return typeof session.spec_card === 'string' 
        ? JSON.parse(session.spec_card) 
        : session.spec_card;
    } catch {
      return null;
    }
  })();

  // Helper to get gathered info items
  const gatheredInfo = clarificationContext?.gathered || {};
  const gatheredKeys = Object.keys(gatheredInfo).filter(k => 
    gatheredInfo[k]?.score > 0
  );

  if (!session && !localError) {
    return (
      <div className="dashboard loading-screen">
        <div className="loading-spinner-large">
          <span className="spinner-icon">🔄</span>
          Loading session...
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard design-session-page">
      <header className="dashboard-header">
        <h1>🐝 Swarm Dashboard</h1>
        <UserMenu />
      </header>
      
      <nav className="dashboard-nav">
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/tickets">Tickets</Link>
        <Link to="/projects/new">New Project</Link>
        <Link to="/vms">VMs</Link>
        {user?.role === 'admin' && (
          <>
            <Link to="/admin/users">Users</Link>
            <Link to="/secrets">Secrets</Link>
          </>
        )}
      </nav>

      <main className="design-session-main">
        {/* Header bar with project info and progress */}
        <div className="session-header glass-card">
          <div className="session-title-row">
            <h2>{session?.project_name || 'Design Session'}</h2>
            <span 
              className="state-badge-large"
              style={{ 
                backgroundColor: stateConfig.color,
                boxShadow: `0 0 15px ${stateConfig.color}40`
              }}
            >
              <span className="state-icon">{stateConfig.icon}</span>
              {stateConfig.label}
            </span>
          </div>
          
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="progress-text">{progress}% Complete</span>
          </div>
        </div>

        {/* Error display */}
        {(error || localError) && (
          <div className="error-toast">
            <span>⚠️</span>
            {error || localError}
            <button onClick={() => { setLocalError(null); clearError(); }}>×</button>
          </div>
        )}

        <div className="session-content-grid">
          {/* Main chat area */}
          <div className="chat-container glass-card">
            <div className="messages-area">
              {messages.length === 0 ? (
                <div className="empty-messages">
                  <span className="empty-icon">💬</span>
                  <p>Start by describing your project idea...</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))
              )}
              
              {isTyping && (
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input area - state aware */}
            <div className="chat-input-area">
              {canSendMessage ? (
                <form onSubmit={handleSendMessage} className="chat-form">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={
                      session?.state === 'input' 
                        ? "Describe your project..." 
                        : "Answer the question..."
                    }
                    className="chat-input"
                    disabled={!canSendMessage}
                  />
                  <button 
                    type="submit" 
                    className="send-button"
                    disabled={!inputValue.trim() || loading}
                  >
                    {loading ? '...' : '➤'}
                  </button>
                </form>
              ) : (
                <div className="input-disabled-message">
                  {session?.state === 'building' && "🔨 Building tickets..."}
                  {session?.state === 'completed' && "✅ Session complete"}
                  {session?.state === 'cancelled' && "❌ Session cancelled"}
                  {session?.state === 'failed' && "⚠️ Session failed"}
                  {['ready_for_docs', 'reviewing', 'approved'].includes(session?.state) && 
                    "Use the actions below"}
                </div>
              )}
            </div>

            {/* Action buttons based on state */}
            <div className="action-buttons">
              {session?.state === 'clarifying' && (
                <button 
                  onClick={handleGenerateSpec}
                  className="action-btn secondary"
                  disabled={loading || isTyping}
                >
                  ⏭️ Skip to Spec Generation
                </button>
              )}
              
              {session?.state === 'ready_for_docs' && (
                <button 
                  onClick={handleGenerateSpec}
                  className="action-btn primary"
                  disabled={loading || isTyping}
                >
                  {isTyping ? '⏳ Generating...' : '📋 Generate Specification'}
                </button>
              )}
              
              {session?.state === 'reviewing' && (
                <>
                  <button 
                    onClick={handleApprove}
                    className="action-btn success"
                    disabled={loading}
                  >
                    ✅ Approve Specification
                  </button>
                  <button 
                    onClick={() => setShowRevisionInput(!showRevisionInput)}
                    className="action-btn secondary"
                    disabled={loading}
                  >
                    ✏️ Request Changes
                  </button>
                </>
              )}
              
              {session?.state === 'approved' && (
                <button 
                  onClick={() => navigate('/tickets')}
                  className="action-btn primary"
                >
                  📝 View Generated Tickets
                </button>
              )}
              
              {session?.state === 'completed' && (
                <button 
                  onClick={() => navigate('/tickets')}
                  className="action-btn success"
                >
                  🎉 View All Tickets
                </button>
              )}
            </div>

            {/* Revision feedback input */}
            {showRevisionInput && (
              <div className="revision-input-area">
                <textarea
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  placeholder="What would you like changed in the specification?"
                  rows={3}
                  className="revision-textarea"
                />
                <div className="revision-actions">
                  <button 
                    onClick={handleRequestRevision}
                    className="action-btn primary"
                    disabled={loading || !revisionFeedback.trim()}
                  >
                    Submit Feedback
                  </button>
                  <button 
                    onClick={() => { setShowRevisionInput(false); setRevisionFeedback(''); }}
                    className="action-btn cancel"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar with context and spec preview */}
          <aside className="session-sidebar">
            {/* Gathered Information Card */}
            {gatheredKeys.length > 0 && (
              <div className="sidebar-card glass-card">
                <h3>📊 Gathered Information</h3>
                <ul className="gathered-list">
                  {gatheredKeys.map((key) => (
                    <li key={key} className="gathered-item">
                      <div className="gathered-header">
                        <span className="gathered-key">{key}</span>
                        <span 
                          className="gathered-score"
                          style={{ 
                            color: gatheredInfo[key].score > 70 ? '#00ff88' : 
                                   gatheredInfo[key].score > 40 ? '#ffa500' : '#ff4444'
                          }}
                        >
                          {gatheredInfo[key].score}%
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Spec Card Preview */}
            {specCard && (
              <div className="sidebar-card glass-card spec-preview">
                <h3>📋 Specification Preview</h3>
                <div className="spec-content">
                  <h4>{specCard.title}</h4>
                  <p className="spec-summary">{specCard.summary}</p>
                  
                  {specCard.goals && (
                    <div className="spec-section">
                      <h5>Goals</h5>
                      <ul>
                        {specCard.goals.slice(0, 3).map((goal, i) => (
                          <li key={i}>{goal}</li>
                        ))}
                        {specCard.goals.length > 3 && (
                          <li className="more-items">+{specCard.goals.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  {specCard.features && (
                    <div className="spec-section">
                      <h5>Features</h5>
                      <ul>
                        {specCard.features.slice(0, 3).map((f, i) => (
                          <li key={i}>{f.name}</li>
                        ))}
                        {specCard.features.length > 3 && (
                          <li className="more-items">+{specCard.features.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="sidebar-card glass-card stats-card">
              <h3>📈 Session Stats</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">{messages.length}</span>
                  <span className="stat-label">Messages</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{gatheredKeys.length}</span>
                  <span className="stat-label">Topics Covered</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{progress}%</span>
                  <span className="stat-label">Progress</span>
                </div>
              </div>
            </div>

            {/* Flow indicator */}
            <div className="sidebar-card glass-card flow-indicator">
              <h3>📍 Design Flow</h3>
              <ol className="flow-steps vertical">
                {Object.entries(STATE_CONFIG).slice(0, 7).map(([state, config]) => (
                  <li 
                    key={state}
                    className={`flow-step ${session?.state === state ? 'current' : ''} 
                               ${STATE_PROGRESS[state] < STATE_PROGRESS[session?.state] ? 'completed' : ''}`}
                  >
                    <span className="step-icon">{config.icon}</span>
                    <span className="step-label">{config.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
