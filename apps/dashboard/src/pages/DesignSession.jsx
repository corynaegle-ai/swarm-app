/**
 * DesignSession - Interactive chat interface for HITL clarification flow
 * Allows continuous conversation and spec revision
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatMessage from '../components/ChatMessage';
import TypingIndicator from '../components/TypingIndicator';
import SpecModal from '../components/SpecModal';
import useHITL from '../hooks/useHITL';
import { useSessionWebSocket } from '../hooks';
import RepoSetupModal from '../components/RepoSetupModal';
import RepoAnalysisPanel from '../components/RepoAnalysisPanel';
import {
  Send, FileText, CheckCircle2, Edit3, Ticket, Eye,
  Loader2, MessageSquare, Target, Workflow
} from 'lucide-react';
import '../layout.css';
import './DesignSession.css';

const STATE_CONFIG = {
  input: { label: 'Input', color: '#6b7280' },
  clarifying: { label: 'Clarifying', color: '#00d4ff' },
  ready_for_docs: { label: 'Ready for Spec', color: '#f59e0b' },
  reviewing: { label: 'Review Spec', color: '#a855f7' },
  approved: { label: 'Approved', color: '#22c55e' },
  building: { label: 'Building', color: '#8b5cf6' },
  completed: { label: 'Complete', color: '#10b981' },
  failed: { label: 'Failed', color: '#ef4444' }
};

export default function DesignSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { getSession, respond, generateSpec, approveSpec, requestRevision, startClarification, loading, error } = useHITL();
  
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [localError, setLocalError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showRepoModal, setShowRepoModal] = useState(false);
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Build Feature - repo analysis state
  const [repoAnalysis, setRepoAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Define fetchSession first (needed by WebSocket callback)
  const fetchSession = useCallback(async () => {
    try {
      const data = await getSession(sessionId);
      setSession(data.session);
      setMessages(data.messages || []);
    } catch (err) {
      setLocalError(err.message);
    }
  }, [sessionId, getSession]);

  // Stable WebSocket callbacks to prevent re-renders and focus loss
  const handleWsSessionUpdate = useCallback((data) => {
    setSession(prev => prev ? { ...prev, state: data.state, progress_percent: data.progress } : prev);
  }, []);

  const handleWsNewMessage = useCallback((data) => {
    const msg = data.message || data;
    if (msg?.content) {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      setIsTyping(false);
    }
  }, []);

  const handleWsSpecGenerated = useCallback((data) => {
    const spec = data.spec || data;
    if (spec) {
      setSession(prev => prev ? { ...prev, spec_card: JSON.stringify(spec), state: 'reviewing' } : prev);
      setShowSpecModal(true);
    }
    setIsGenerating(false);
  }, []);

  const handleWsApprovalResolved = useCallback(() => {
    fetchSession();
  }, [fetchSession]);

  const { isConnected } = useSessionWebSocket(sessionId, {
    onSessionUpdate: handleWsSessionUpdate,
    onNewMessage: handleWsNewMessage,
    onSpecGenerated: handleWsSpecGenerated,
    onApprovalResolved: handleWsApprovalResolved
  });

  const clarificationContext = (() => {
    try {
      if (!session?.clarification_context) return null;
      return typeof session.clarification_context === 'string' 
        ? JSON.parse(session.clarification_context) : session.clarification_context;
    } catch { return null; }
  })();

  const progress = session?.progress_percent || clarificationContext?.overallProgress || 0;
  
  const parsedSpec = (() => {
    try { return session?.spec_card ? JSON.parse(session.spec_card) : null; }
    catch { return null; }
  })();

  useEffect(() => { fetchSession(); }, [fetchSession]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  // Build Feature - trigger repo analysis
  const triggerRepoAnalysis = useCallback(async () => {
    if (!session?.id) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/hitl/${session.id}/analyze-repo`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (data.success) {
        setRepoAnalysis(data.analysis);
      }
    } catch (err) {
      console.error("Repo analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [session?.id]);

  // Auto-trigger repo analysis for build_feature sessions
  useEffect(() => {
    if (session?.project_type === "build_feature") {
      if (session.repo_analysis) {
        // Use cached analysis
        try {
          setRepoAnalysis(JSON.parse(session.repo_analysis));
        } catch (e) {
          console.error("Failed to parse cached repo_analysis");
        }
      } else if (!repoAnalysis && !isAnalyzing) {
        // Trigger new analysis
        triggerRepoAnalysis();
      }
    }
  }, [session?.project_type, session?.repo_analysis, repoAnalysis, isAnalyzing, triggerRepoAnalysis]);

  // Auto-trigger clarification when landing on a new session in "input" state
  const clarificationTriggered = useRef(false);
  useEffect(() => {
    if (session?.state === "input" && !clarificationTriggered.current) {
      clarificationTriggered.current = true;
      // Show user description as first message if not already present
      if (messages.length === 0 && session.description) {
        setMessages([{
          id: "initial-description",
          role: "user",
          content: session.description,
          messageType: "initial"
        }]);
      }
      // Show typing indicator
      setIsTyping(true);
      // Trigger clarification agent
      startClarification(session.id)
        .then(apiResponse => {
          const result = apiResponse.result || apiResponse;
          if (result.message && typeof result.message === "string") {
            setMessages(prev => [...prev, {
              id: "ai-" + Date.now(),
              role: "assistant",
              content: result.message,
              created_at: new Date().toISOString()
            }]);
          }
          if (result.progress !== undefined) {
            setSession(prev => prev ? { ...prev, progress_percent: result.progress } : prev);
          }
        })
        .catch(err => {
          console.error("Failed to start clarification:", err);
        })
        .finally(() => {
          setIsTyping(false);
        });
    }
  }, [session, messages.length, startClarification]);
  // Focus input only on initial session load, not on every state change
  // This prevents stealing focus while user is typing
  const initialFocusDone = useRef(false);
  useEffect(() => {
    if (session && !initialFocusDone.current) {
      initialFocusDone.current = true;
      // Small delay to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [session]);


  // Determine what chat actions are allowed
  // Users can ALWAYS continue chatting - even in ready_for_docs or reviewing states
  // This allows them to ask questions or request changes naturally
  // canShowChat only checks if chat UI should be shown (based on state)
  // Loading/typing states are handled separately to avoid unmounting the input
  const canShowChat = ['input', 'clarifying', 'ready_for_docs', 'reviewing'].includes(session?.state);
  const canSubmit = canShowChat && !loading && !isTyping;
  const canGenerateSpec = ['clarifying', 'ready_for_docs'].includes(session?.state) && !isGenerating;

  // Send message - handles both clarifying chat AND revision requests
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !canSubmit) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setLocalError(null);

    const tempId = 'temp-' + Date.now();
    setMessages(prev => [...prev, {
      id: tempId, role: 'user', content: messageText, created_at: new Date().toISOString()
    }]);
    setIsTyping(true);

    try {
      // If we're in reviewing state, this becomes a revision request
      if (session?.state === 'reviewing') {
        const apiResponse = await requestRevision(sessionId, messageText);
        const result = apiResponse.result || apiResponse;
        
        // Backend should return suggestions or transition state
        // Update state back to clarifying so user can continue chatting
        setSession(prev => prev ? { ...prev, state: 'clarifying' } : prev);
        
        if (result.message && typeof result.message === 'string') {
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempId);
            return [...filtered, 
              { id: 'user-' + Date.now(), role: 'user', content: messageText, created_at: new Date().toISOString() },
              { id: 'ai-' + Date.now(), role: 'assistant', content: result.message, created_at: new Date().toISOString() }
            ];
          });
        }
      } else {
        // Normal clarification flow
        const apiResponse = await respond(sessionId, messageText);
        const result = apiResponse.result || apiResponse;
        
        if (result.progress !== undefined) {
          setSession(prev => prev ? { ...prev, progress_percent: result.progress } : prev);
        }
        if (result.readyForSpec) {
          setSession(prev => prev ? { ...prev, state: 'ready_for_docs' } : prev);
        }
        
        if (result.message && typeof result.message === 'string') {
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempId);
            return [...filtered, 
              { id: 'user-' + Date.now(), role: 'user', content: messageText, created_at: new Date().toISOString() },
              { id: 'ai-' + Date.now(), role: 'assistant', content: result.message, created_at: new Date().toISOString() }
            ];
          });
        }
      }
    } catch (err) {
      setLocalError(err.message);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setIsTyping(false);
    }
  };

  // Generate spec
  const handleGenerateSpec = async () => {
    setLocalError(null);
    setIsGenerating(true);
    setIsTyping(true);
    try {
      const apiResponse = await generateSpec(sessionId);
      const result = apiResponse.result || apiResponse;
      
      if (result.spec) {
        setSession(prev => prev ? { ...prev, spec_card: JSON.stringify(result.spec), state: 'reviewing' } : prev);
        setShowSpecModal(true);
      } else {
        await fetchSession();
      }
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setIsGenerating(false);
      setIsTyping(false);
    }
  };

  // Approve spec
  const handleApprove = async () => {
    setLocalError(null);
    setShowSpecModal(false);
    try {
      await approveSpec(sessionId);
      
      // If session already has a repo_url, skip repo setup and go directly to build
      if (session?.repo_url) {
        // Trigger start-build directly since we have a repo
        const res = await fetch(`/api/hitl/${sessionId}/start-build`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('swarm_token')}`
          },
          body: JSON.stringify({ confirmed: true })
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to start build');
        }
        
        // Navigate to build page
        navigate(`/build/${sessionId}`);
      } else {
        // No repo_url - show modal for repo setup
        setShowRepoModal(true);
        await fetchSession();
      }
    } catch (err) {
      setLocalError(err.message);
    }
  };

  // Request revision from modal - close modal, go back to chat
  const handleRequestRevisionFromModal = () => {
    setShowSpecModal(false);
    // Set state back to clarifying so user can continue chatting
    setSession(prev => prev ? { ...prev, state: 'clarifying' } : prev);
    // Focus chat input and give helpful hint
    inputRef.current?.focus();
    // No error - just a helpful message in placeholder
  };

  const stateConfig = STATE_CONFIG[session?.state] || STATE_CONFIG.input;
  const gathered = clarificationContext?.gathered || {};


  if (!session) {
    return (
      <div className="page-container">
        <Sidebar />
        <main className="page-main ds-loading">
          <Loader2 size={32} className="spin" />
        </main>
      </div>
    );
  }

  // Get placeholder text based on state
  const getPlaceholder = () => {
    switch (session.state) {
      case 'input': return 'Describe your project...';
      case 'reviewing': return 'Describe what changes you want...';
      case 'ready_for_docs': return 'Ask a question or continue chatting...';
      default: return 'Reply to continue...';
    }
  };

  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        {/* Header */}
        <header className="page-header">
          <div>
            <h1>{session.project_name || 'Design Session'}</h1>
            <p className="page-subtitle">
              {session.state === 'building' ? (
                <span 
                  className="ds-state-badge ds-state-clickable" 
                  data-state={session.state} 
                  style={{ '--state-color': stateConfig.color, cursor: 'pointer' }}
                  onClick={() => navigate(`/build/${sessionId}`)}
                  title="Click to view build progress"
                >
                  {stateConfig.label} →
                </span>
              ) : (
                <span className="ds-state-badge" data-state={session.state} style={{ '--state-color': stateConfig.color }}>
                  {stateConfig.label}
                </span>
              )}
              {isConnected && <span className="ds-connected">● Connected</span>}
            </p>
          </div>
        </header>

        {/* Progress */}
        <div className="ds-progress-wrap">
          <div className="ds-progress-header">
            <span>Progress</span>
            <span className="ds-progress-value">{Math.round(progress)}%</span>
          </div>
          <div className="ds-progress-bar">
            <div className="ds-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Error */}
        {(localError || error) && (
          <div className="ds-error">{localError || error}</div>
        )}

        {/* Main Grid */}
        <div className="ds-grid">
          {/* Chat Panel */}
          <div className="card ds-chat-panel">
            <div className="card-header">
              <h2 className="card-title"><MessageSquare size={18} /> Design Chat</h2>
            </div>

            {/* Build Feature - Repo Analysis */}
            {session.project_type === "build_feature" && (
              <RepoAnalysisPanel analysis={repoAnalysis} isLoading={isAnalyzing} />
            )}
            
            <div className="ds-messages">
              {messages.length === 0 ? (
                <div className="ds-empty">
                  <MessageSquare size={48} />
                  <p>Describe your project to get started</p>
                </div>
              ) : (
                messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
              )}
              {isTyping && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input - always visible when canChat is true */}
            {canShowChat && (
              <form onSubmit={handleSendMessage} className="ds-input-form">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={getPlaceholder()}
                  className="form-input"
                  rows={4}
                />
                <button type="submit" className="btn-primary" disabled={!inputValue.trim() || !canSubmit}>
                  <Send size={18} />
                </button>
              </form>
            )}
          </div>


          {/* Sidebar */}
          <div className="ds-sidebar">
            {/* Gathered Info */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><Target size={16} /> Gathered Info</h3>
              </div>
              <div className="ds-gathered-list">
                {['overview', 'users', 'features', 'technical', 'constraints'].map(key => (
                  <div key={key} className="ds-gathered-item">
                    <span>{key}</span>
                    <div className="ds-mini-progress">
                      <div 
                        className="ds-mini-fill" 
                        style={{ 
                          width: `${gathered[key]?.score || 0}%`,
                          background: (gathered[key]?.score || 0) >= 80 ? '#22c55e' : 
                                      (gathered[key]?.score || 0) >= 50 ? '#f59e0b' : '#00d4ff'
                        }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title"><Workflow size={16} /> Actions</h3>
              </div>
              <div className="ds-actions">
                {/* Generate Spec */}
                {canGenerateSpec && (
                  <button onClick={handleGenerateSpec} disabled={isGenerating} className="btn-primary ds-action-btn">
                    {isGenerating ? <><Loader2 size={16} className="spin" /> Generating...</> : <><FileText size={16} /> Generate Spec</>}
                  </button>
                )}

                {/* View Spec - shown when spec exists */}
                {parsedSpec && (
                  <button onClick={() => setShowSpecModal(true)} className="btn-secondary ds-action-btn">
                    <Eye size={16} /> View Spec
                  </button>
                )}

                {/* Review state actions */}
                {session.state === 'reviewing' && (
                  <button onClick={handleApprove} className="btn-success ds-action-btn">
                    <CheckCircle2 size={16} /> Approve Spec
                  </button>
                )}

                {/* Approved - start build */}
                {session.state === 'approved' && (
                  <button onClick={() => navigate(`/build/${sessionId}`)} className="btn-primary ds-action-btn">
                    <Ticket size={16} /> Start Build
                  </button>
                )}
              </div>
            </div>

            {/* Spec Preview Card */}
            {parsedSpec && (
              <div className="card ds-spec-card" onClick={() => setShowSpecModal(true)}>
                <div className="card-header">
                  <h3 className="card-title"><FileText size={16} /> Spec Ready</h3>
                </div>
                <div className="ds-spec-preview">
                  <strong>{parsedSpec.title}</strong>
                  <p>{parsedSpec.summary?.slice(0, 100)}...</p>
                  <span className="ds-spec-click-hint">Click to view full spec →</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Spec Modal */}
      {showSpecModal && parsedSpec && (
        <SpecModal
          spec={parsedSpec}
          state={session.state}
          onClose={() => setShowSpecModal(false)}
          onApprove={handleApprove}
          onRequestRevision={handleRequestRevisionFromModal}
        />
      )}

      {/* Repo Setup Modal */}
      {showRepoModal && (
        <RepoSetupModal
          sessionId={sessionId}
          projectName={session?.project_name}
          onCancel={() => setShowRepoModal(false)}
          onSuccess={() => { setShowRepoModal(false); navigate(`/build/${sessionId}`); }}
        />
      )}
    </div>
  );
}
