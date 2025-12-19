import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import { KeyRound, Github, Bot, Plus, Check, X, Loader2, RefreshCw, Key, Upload, AlertCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function Secrets() {
  const { user } = useAuth();
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSecret, setSelectedSecret] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [uploadValue, setUploadValue] = useState("");
  const [uploadPublicKey, setUploadPublicKey] = useState("");
  const [validationResult, setValidationResult] = useState(null);
  const [snapshotStatus, setSnapshotStatus] = useState(null);
  const [generatedKeys, setGeneratedKeys] = useState(null);

  useEffect(() => { fetchSecrets(); }, []);

  const fetchSecrets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/secrets`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch secrets");
      const data = await res.json();
      setSecrets(data.secrets);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };


  const validateSecret = async (type) => {
    setValidationResult({ type, status: "checking" });
    try {
      const res = await fetch(`${API_BASE}/api/secrets/${type}/validate`, { method: "POST", credentials: "include" });
      const data = await res.json();
      setValidationResult({ type, ...data });
    } catch (err) { setValidationResult({ type, valid: false, error: err.message }); }
  };

  const uploadSecret = async (type) => {
    try {
      const res = await fetch(`${API_BASE}/api/secrets/${type}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ value: uploadValue, publicKey: uploadPublicKey || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await fetchSecrets();
      setShowUploadModal(false);
      setUploadValue("");
      setUploadPublicKey("");
    } catch (err) { alert("Failed to upload: " + err.message); }
  };

  const generateSSHKeys = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/secrets/ssh/generate`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setGeneratedKeys(data);
    } catch (err) { alert("Failed to generate: " + err.message); }
  };

  const bakeSnapshot = async () => {
    setSnapshotStatus({ status: "baking" });
    try {
      const res = await fetch(`${API_BASE}/api/secrets/bake-snapshot`, { method: "POST", credentials: "include" });
      const data = await res.json();
      setSnapshotStatus({ status: "done", ...data });
    } catch (err) { setSnapshotStatus({ status: "error", error: err.message }); }
  };


  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-main">
        <header className="page-header">
          <div>
            <h1>Secrets Management</h1>
            <p className="page-subtitle">Manage API keys and SSH credentials for your agents</p>
          </div>
          <div className="header-actions">
            <button onClick={bakeSnapshot} disabled={snapshotStatus?.status === "baking"} className="btn-secondary">
              {snapshotStatus?.status === "baking" ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Bake Snapshot
            </button>
          </div>
        </header>

        {error && (
          <div className="alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {snapshotStatus && (
          <div className={`alert-${snapshotStatus.status === 'done' ? 'success' : snapshotStatus.status === 'error' ? 'error' : 'info'}`}>
            {snapshotStatus.status === 'baking' && <><Loader2 size={18} className="spin" /> Baking snapshot...</>}
            {snapshotStatus.status === 'done' && <><Check size={18} /> Snapshot baked successfully</>}
            {snapshotStatus.status === 'error' && <><X size={18} /> {snapshotStatus.error}</>}
          </div>
        )}

        <div className="secrets-grid">
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : secrets.map(secret => (
            <div key={secret.type} className="secret-card" onClick={() => setSelectedSecret(secret)}>
              <div className="secret-icon">
                {secret.type === "github" ? <Github size={24} /> : <Bot size={24} />}
              </div>
              <div className="secret-info">
                <h3>{secret.name}</h3>
                <span className={`secret-status ${secret.configured ? 'configured' : 'missing'}`}>
                  {secret.configured ? <><Check size={14} /> Configured</> : <><X size={14} /> Not Configured</>}
                </span>
              </div>
            </div>
          ))}
        </div>


        {selectedSecret && (
          <div className="modal-overlay" onClick={() => setSelectedSecret(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h4>{selectedSecret.type === 'github' ? <Github size={20} /> : <Bot size={20} />} {selectedSecret.name}</h4>
              <p className="modal-desc">{selectedSecret.description}</p>
              <div className="modal-actions">
                <button onClick={() => validateSecret(selectedSecret.type)} className="btn-secondary">
                  {validationResult?.type === selectedSecret.type && validationResult.status === 'checking' 
                    ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Validate
                </button>
                <button onClick={() => { setShowUploadModal(true); setSelectedSecret(null); }} className="btn-primary">
                  <Upload size={16} /> Upload
                </button>
                {selectedSecret.type === 'ssh' && (
                  <button onClick={() => { setShowGenerateModal(true); setSelectedSecret(null); }} className="btn-secondary">
                    <Key size={16} /> Generate
                  </button>
                )}
              </div>
              {validationResult?.type === selectedSecret.type && validationResult.status !== 'checking' && (
                <div className={`validation-result ${validationResult.valid ? 'valid' : 'invalid'}`}>
                  {validationResult.valid ? <Check size={16} /> : <X size={16} />}
                  {validationResult.valid ? 'Secret is valid' : validationResult.error || 'Validation failed'}
                </div>
              )}
            </div>
          </div>
        )}

        {showUploadModal && (
          <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h4><Upload size={20} /> Upload Secret</h4>
              <div className="form-group">
                <label className="form-label">Private Key / Value</label>
                <textarea className="form-textarea" value={uploadValue} onChange={e => setUploadValue(e.target.value)} placeholder="Paste your secret here..." />
              </div>
              <div className="form-group">
                <label className="form-label">Public Key (optional)</label>
                <textarea className="form-textarea" value={uploadPublicKey} onChange={e => setUploadPublicKey(e.target.value)} placeholder="Paste public key if applicable..." />
              </div>
              <div className="modal-actions">
                <button onClick={() => setShowUploadModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={() => uploadSecret(selectedSecret?.type || 'ssh')} className="btn-primary">Upload</button>
              </div>
            </div>
          </div>
        )}


        {showGenerateModal && (
          <div className="modal-overlay" onClick={() => { setShowGenerateModal(false); setGeneratedKeys(null); }}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h4><Key size={20} /> Generate SSH Keys</h4>
              {!generatedKeys ? (
                <>
                  <p>Generate a new SSH key pair for GitHub authentication.</p>
                  <div className="modal-actions">
                    <button onClick={() => setShowGenerateModal(false)} className="btn-secondary">Cancel</button>
                    <button onClick={generateSSHKeys} className="btn-primary">Generate Keys</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="generated-keys">
                    <div className="form-group">
                      <label className="form-label">Public Key (add to GitHub)</label>
                      <textarea className="form-textarea" readOnly value={generatedKeys.publicKey} />
                    </div>
                    <p className="key-note">Private key has been securely stored.</p>
                  </div>
                  <div className="modal-actions">
                    <button onClick={() => { setShowGenerateModal(false); setGeneratedKeys(null); fetchSecrets(); }} className="btn-primary">Done</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <style>{`
          .secrets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
          .secret-card { background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1.5rem; cursor: pointer; display: flex; align-items: flex-start; gap: 1rem; transition: all 0.2s; }
          .secret-card:hover { border-color: rgba(0,212,255,0.3); transform: translateY(-2px); }
          .secret-icon { width: 48px; height: 48px; border-radius: 10px; background: rgba(0,212,255,0.1); color: #00d4ff; display: flex; align-items: center; justify-content: center; }
          .secret-info h3 { font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 0.5rem; }
          .secret-status { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; }
          .secret-status.configured { color: #22c55e; }
          .secret-status.missing { color: #71717a; }
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 200; }
          .modal { background: #18181b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem; max-width: 480px; width: 90%; }
          .modal h4 { display: flex; align-items: center; gap: 0.5rem; color: #fff; margin-bottom: 0.75rem; }
          .modal-desc { color: #71717a; font-size: 0.875rem; margin-bottom: 1rem; }
          .modal-actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1rem; }
          .validation-result { margin-top: 1rem; padding: 0.75rem; border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; }
          .validation-result.valid { background: rgba(34,197,94,0.1); color: #22c55e; }
          .validation-result.invalid { background: rgba(239,68,68,0.1); color: #ef4444; }
          .key-note { font-size: 0.8rem; color: #71717a; margin-top: 0.5rem; }
          .alert-success { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; color: #22c55e; margin-bottom: 1.5rem; }
          .alert-error { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; color: #ef4444; margin-bottom: 1.5rem; }
          .alert-info { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3); border-radius: 8px; color: #00d4ff; margin-bottom: 1.5rem; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </main>
    </div>
  );
}
