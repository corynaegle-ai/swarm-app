/**
 * SpecReview - Full-screen spec card review with split editor/preview
 * Phase 6 of HITL implementation
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import MarkdownEditor from '../components/MarkdownEditor';
import MarkdownPreview from '../components/MarkdownPreview';
import useHITL from '../hooks/useHITL';
import toast from 'react-hot-toast';
import BuildConfirmModal from '../components/BuildConfirmModal';

export default function SpecReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    getSession, approveSpec, requestRevision, updateSpec, startBuild,
    loading, error, clearError 
  } = useHITL();
  
  // State
  const [session, setSession] = useState(null);
  const [specContent, setSpecContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);

  // Fetch session data
  const fetchSession = useCallback(async () => {
    try {
      const data = await getSession(sessionId);
      setSession(data.session);
      
      // Parse spec card content
      const spec = data.session?.spec_card;
      if (spec) {
        const specObj = typeof spec === 'string' ? JSON.parse(spec) : spec;
        const markdown = specToMarkdown(specObj);
        setSpecContent(markdown);
        setOriginalContent(markdown);
      }
    } catch (err) {
      toast.error(err.message);
    }
  }, [sessionId, getSession]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(specContent !== originalContent);
  }, [specContent, originalContent]);

  // Convert spec object to markdown
  function specToMarkdown(spec) {
    if (!spec) return '';
    
    let md = `# ${spec.title || 'Project Specification'}\n\n`;
    
    if (spec.summary) {
      md += `## Summary\n${spec.summary}\n\n`;
    }
    
    if (spec.goals?.length) {
      md += `## Goals\n`;
      spec.goals.forEach(g => md += `- ${g}\n`);
      md += '\n';
    }
    
    if (spec.features?.length) {
      md += `## Features\n`;
      spec.features.forEach(f => {
        md += `### ${f.name}\n${f.description || ''}\n`;
        if (f.acceptance_criteria?.length) {
          md += `**Acceptance Criteria:**\n`;
          f.acceptance_criteria.forEach(ac => md += `- ${ac}\n`);
        }
        md += '\n';
      });
    }

    if (spec.technical_requirements) {
      md += `## Technical Requirements\n`;
      if (spec.technical_requirements.stack) {
        md += `**Tech Stack:** ${spec.technical_requirements.stack.join(', ')}\n`;
      }
      if (spec.technical_requirements.constraints?.length) {
        md += `**Constraints:**\n`;
        spec.technical_requirements.constraints.forEach(c => md += `- ${c}\n`);
      }
      md += '\n';
    }
    
    if (spec.milestones?.length) {
      md += `## Milestones\n`;
      spec.milestones.forEach((m, i) => {
        md += `${i + 1}. **${m.name}** - ${m.description || ''}\n`;
      });
      md += '\n';
    }
    
    return md;
  }

  // Handle approve
  const handleApprove = async () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Save before approving?'
      );
      if (confirmed) {
        await handleSaveChanges();
      }
    }
    
    setIsProcessing(true);
    try {
      await approveSpec(sessionId);
      toast.success('Specification approved!');
      await fetchSession();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle start build (Gate 5)
  const handleStartBuild = async () => {
    setIsProcessing(true);
    try {
      await startBuild(sessionId, true);
      toast.success('Build started! Generating tickets...');
      setShowBuildModal(false);
      navigate(`/build/${sessionId}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle AI revision request
  const handleRequestRevision = async () => {
    if (!revisionPrompt.trim()) {
      toast.error('Please describe the changes you want');
      return;
    }
    
    setIsProcessing(true);
    try {
      await requestRevision(sessionId, revisionPrompt.trim());
      setRevisionPrompt('');
      setShowRevisionInput(false);
      toast.success('Revision requested - AI is updating the spec...');
      // Poll for updates
      setTimeout(fetchSession, 2000);
      setTimeout(fetchSession, 5000);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual save
  const handleSaveChanges = async () => {
    setIsProcessing(true);
    try {
      // Convert markdown back to spec object (simplified)
      await updateSpec(sessionId, specContent);
      setOriginalContent(specContent);
      setHasUnsavedChanges(false);
      toast.success('Changes saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // State checks
  const canEdit = session?.state === 'reviewing';
  const canApprove = session?.state === 'reviewing' && !hasUnsavedChanges;

  // Loading state
  if (!session && !error) {
    return (
      <div className="page-container">
        <div className="loading-spinner-large">
          <span className="spinner-icon">🔄</span>
          Loading specification...
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard spec-review-page">
      
      
      <Sidebar />

      <main className="spec-review-main">
        {/* Header bar */}
        <div className="spec-review-header glass-card">
          <div className="header-left">
            <button 
              onClick={() => navigate(`/design/${sessionId}`)}
              className="back-btn"
            >
              ← Back to Chat
            </button>
            <h2>{session?.project_name}</h2>
            <span className={`state-badge state-${session?.state}`}>
              {session?.state}
            </span>
          </div>

          <div className="header-actions">
            {hasUnsavedChanges && (
              <button 
                onClick={handleSaveChanges}
                className="action-btn secondary"
                disabled={isProcessing}
              >
                💾 Save Changes
              </button>
            )}
            <button 
              onClick={() => setShowRevisionInput(!showRevisionInput)}
              className="action-btn secondary"
              disabled={isProcessing || !canEdit}
            >
              <Bot size={16} /> Request AI Revision
            </button>
            <button 
              onClick={handleApprove}
              className="action-btn success"
              disabled={isProcessing || !canApprove}
            >
              ✅ Approve Specification
            </button>
            {session?.state === 'approved' && (
              <button 
                onClick={() => setShowBuildModal(true)}
                className="action-btn primary"
                disabled={isProcessing}
              >
                🚀 Start Build
              </button>
            )}
          </div>
        </div>

        {/* Revision input panel */}
        {showRevisionInput && (
          <div className="revision-panel glass-card">
            <h3><Bot size={16} /> Request AI Revision</h3>
            <p>Describe what changes you'd like the AI to make:</p>
            <textarea
              value={revisionPrompt}
              onChange={(e) => setRevisionPrompt(e.target.value)}
              placeholder="e.g., Add more detail to the authentication feature, include OAuth support..."
              rows={3}
              className="revision-textarea"
            />
            <div className="revision-actions">
              <button 
                onClick={handleRequestRevision}
                className="action-btn primary"
                disabled={isProcessing || !revisionPrompt.trim()}
              >
                {isProcessing ? '⏳ Processing...' : '📤 Submit Request'}
              </button>
              <button 
                onClick={() => { setShowRevisionInput(false); setRevisionPrompt(''); }}
                className="action-btn cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Split pane editor/preview */}
        <div className="spec-split-pane">
          <MarkdownEditor
            value={specContent}
            onChange={setSpecContent}
            disabled={!canEdit || isProcessing}
            placeholder="Specification content will appear here..."
            minHeight={500}
          />
          <MarkdownPreview
            content={specContent}
            minHeight={500}
          />
        </div>

        {/* Status bar */}
        <div className="spec-status-bar glass-card">
          <span className="status-item">
            📊 {specContent.split('\n').length} lines
          </span>
          <span className="status-item">
            📝 {specContent.length} characters
          </span>
          {hasUnsavedChanges && (
            <span className="status-item unsaved">
              ⚠️ Unsaved changes
            </span>
          )}
          <span className="status-item">
            🕐 Last updated: {session?.updated_at 
              ? new Date(session.updated_at).toLocaleString() 
              : 'N/A'}
          </span>
        </div>
        {showBuildModal && (
          <BuildConfirmModal
            session={session}
            onConfirm={handleStartBuild}
            onCancel={() => setShowBuildModal(false)}
            isProcessing={isProcessing}
          />
        )}
      </main>
    </div>
  );
}
