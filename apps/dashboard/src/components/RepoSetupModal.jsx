/**
 * RepoSetupModal - Choose repo strategy after spec approval
 * Options: Create managed repo OR link existing repo
 * 
 * FIXED: Now calls both /api/repo/provision AND /api/hitl/:id/start-build
 */
import { useState } from 'react';

export default function RepoSetupModal({ 
  sessionId, 
  projectName, 
  onSuccess, 
  onCancel 
}) {
  const [mode, setMode] = useState('managed'); // 'managed' or 'linked'
  const [repoUrl, setRepoUrl] = useState('');
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(''); // Status message during multi-step process
  const [error, setError] = useState(null);
  const [existingRepo, setExistingRepo] = useState(null); // For "repo exists" confirmation

  const sanitizedName = projectName
    ?.toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'project';

  // Helper to get auth token from localStorage
  const getAuthHeaders = () => {
    const token = localStorage.getItem('swarm_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Step 2: Generate tickets via start-build endpoint
  const triggerTicketGeneration = async () => {
    setStatus('Generating tickets from spec...');
    
    const res = await fetch(`/api/hitl/${sessionId}/start-build`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ confirmed: true })
    });

    const data = await res.json();
    
    if (!res.ok) {
      // If already in building state, that's ok - tickets may already exist
      if (data.currentState === 'building') {
        console.log('Session already in building state');
        return { success: true, alreadyBuilding: true };
      }
      throw new Error(data.error || 'Failed to generate tickets');
    }

    return data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setStatus('Creating repository...');

    try {
      // Step 1: Provision or link repo
      const endpoint = mode === 'managed' 
        ? '/api/repo/provision' 
        : '/api/repo/link';
      
      const body = mode === 'managed'
        ? { hitl_session_id: sessionId }
        : { hitl_session_id: sessionId, repo_url: repoUrl, pat };

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });

      const data = await res.json();
      
      if (!res.ok) {
        // Handle "repo already exists" - show confirmation instead of error
        if (res.status === 409 && data.repo_url) {
          setExistingRepo(data.repo_url);
          setLoading(false);
          setStatus('');
          return;
        }
        throw new Error(data.error || 'Failed to setup repository');
      }

      // Step 2: Generate tickets
      const ticketResult = await triggerTicketGeneration();
      
      setStatus('');
      onSuccess({ 
        ...data, 
        ticketCount: ticketResult.ticket_count,
        ticketsGenerated: !ticketResult.alreadyBuilding
      });
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  // Use existing repo - call the use-existing endpoint then generate tickets
  const handleUseExisting = async () => {
    setLoading(true);
    setError(null);
    setStatus('Connecting to existing repository...');
    
    try {
      const res = await fetch('/api/repo/use-existing', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          hitl_session_id: sessionId,
          repo_url: existingRepo
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to use existing repository');
      }

      // Step 2: Generate tickets
      const ticketResult = await triggerTicketGeneration();
      
      setStatus('');
      onSuccess({ 
        ...data, 
        ticketCount: ticketResult.ticket_count,
        ticketsGenerated: !ticketResult.alreadyBuilding
      });
    } catch (err) {
      setError(err.message);
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  // Show confirmation dialog for existing repo
  if (existingRepo) {
    const repoName = existingRepo.split('/').slice(-2).join('/');
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <h2 style={styles.title}>⚠️ Repository Already Exists</h2>
          <p style={styles.subtitle}>
            <code style={styles.repoName}>{repoName}</code> already exists.
          </p>
          <p style={styles.existingHint}>
            This may have been created in a previous session. Would you like to continue using this repository?
          </p>

          {error && <p style={styles.error}>{error}</p>}
          {status && <p style={styles.status}>{status}</p>}

          <div style={styles.buttons}>
            <button 
              type="button" 
              onClick={() => setExistingRepo(null)}
              style={styles.cancelBtn}
              disabled={loading}
            >
              Go Back
            </button>
            <button 
              type="button"
              onClick={handleUseExisting}
              style={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Connecting...' : 'Use Existing Repo'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>🚀 Ready to Build!</h2>
        <p style={styles.subtitle}>Where should we put your code?</p>

        <form onSubmit={handleSubmit}>
          {/* Managed repo option */}
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="repoMode"
              value="managed"
              checked={mode === 'managed'}
              onChange={() => setMode('managed')}
              style={styles.radio}
            />
            <div style={styles.radioContent}>
              <span style={styles.radioTitle}>Create new repo (we'll handle it)</span>
              <span style={styles.radioHint}>
                → corynaegle-ai/swarm-managed-{sanitizedName}
              </span>
            </div>
          </label>

          {/* Linked repo option */}
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="repoMode"
              value="linked"
              checked={mode === 'linked'}
              onChange={() => setMode('linked')}
              style={styles.radio}
            />
            <div style={styles.radioContent}>
              <span style={styles.radioTitle}>Use my existing repo</span>
            </div>
          </label>

          {/* Linked repo fields */}
          {mode === 'linked' && (
            <div style={styles.linkedFields}>
              <input
                type="text"
                placeholder="github.com/user/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                style={styles.input}
                required={mode === 'linked'}
              />
              <input
                type="password"
                placeholder="GitHub PAT (needs repo scope)"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                style={styles.input}
                required={mode === 'linked'}
              />
              <p style={styles.patHint}>
                🔒 Your PAT is encrypted and only used to push code
              </p>
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}
          {status && <p style={styles.status}>{status}</p>}

          <div style={styles.buttons}>
            <button 
              type="button" 
              onClick={onCancel}
              style={styles.cancelBtn}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit"
              style={styles.submitBtn}
              disabled={loading}
            >
              {loading ? (status || 'Setting up...') : 'Start Building'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    color: '#fff',
  },
  subtitle: {
    margin: '0 0 24px 0',
    color: '#888',
    fontSize: '16px',
  },
  repoName: {
    background: '#0d0d1a',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#00d4ff',
  },
  existingHint: {
    color: '#aaa',
    fontSize: '14px',
    marginBottom: '24px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '16px',
    marginBottom: '12px',
    background: '#0d0d1a',
    border: '1px solid #333',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  radio: {
    marginTop: '4px',
    accentColor: '#00d4ff',
  },
  radioContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  radioTitle: {
    color: '#fff',
    fontSize: '15px',
    fontWeight: '500',
  },
  radioHint: {
    color: '#00d4ff',
    fontSize: '13px',
    fontFamily: 'monospace',
  },
  linkedFields: {
    marginLeft: '28px',
    marginBottom: '16px',
  },
  input: {
    width: '100%',
    padding: '12px',
    marginBottom: '12px',
    background: '#0d0d1a',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  patHint: {
    margin: '0',
    fontSize: '12px',
    color: '#666',
  },
  error: {
    color: '#ff4444',
    background: 'rgba(255, 68, 68, 0.1)',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  status: {
    color: '#00d4ff',
    background: 'rgba(0, 212, 255, 0.1)',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
    textAlign: 'center',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  cancelBtn: {
    padding: '12px 24px',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#888',
    fontSize: '14px',
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #00d4ff 0%, #00ff88 100%)',
    border: 'none',
    borderRadius: '6px',
    color: '#000',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
