import { useState } from 'react';
import { Check, X, Eye, EyeOff, ExternalLink, Loader2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export default function ProviderRow({ provider, existingKey, onSave, onDelete, isSaving }) {
  const [expanded, setExpanded] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  const handleSave = async () => {
    if (!apiKeyInput.trim()) return;
    
    const result = await onSave(provider.id, apiKeyInput);
    setSaveResult(result);
    
    if (result.success) {
      setApiKeyInput('');
      setTimeout(() => setSaveResult(null), 2000);
    }
  };

  const handleDelete = async () => {
    if (!existingKey) return;
    if (!window.confirm(`Remove API key for ${provider.name}?`)) return;
    await onDelete(existingKey.id);
  };

  const isConfigured = !!existingKey;

  return (
    <div className={`provider-row ${expanded ? 'expanded' : ''} ${isConfigured ? 'configured' : ''}`}>
      <button 
        className="provider-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="provider-info">
          <span className="provider-name">{provider.name}</span>
          <span className="provider-status">
            {isConfigured ? (
              <><Check size={14} className="status-icon success" /> Configured</>
            ) : (
              <span className="status-unconfigured">Not configured</span>
            )}
          </span>
        </div>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>


      {expanded && (
        <div className="provider-details">
          <p className="provider-description">{provider.description}</p>
          
          <a 
            href={provider.website} 
            target="_blank" 
            rel="noopener noreferrer"
            className="provider-link"
          >
            Get API key <ExternalLink size={14} />
          </a>

          {isConfigured && (
            <div className="existing-key">
              <span className="key-label">Current key:</span>
              <code className="key-masked">{existingKey.masked_key}</code>
              <button 
                className="btn-icon danger"
                onClick={handleDelete}
                title="Remove key"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          <div className="key-input-group">
            <div className="input-wrapper">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={provider.keyPlaceholder || 'Enter API key...'}
                className="key-input"
              />
              <button 
                className="btn-icon toggle-visibility"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            
            <button
              className="btn-primary save-key"
              onClick={handleSave}
              disabled={!apiKeyInput.trim() || isSaving}
            >
              {isSaving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              {isConfigured ? 'Update' : 'Save'}
            </button>
          </div>

          {saveResult && (
            <div className={`save-result ${saveResult.success ? 'success' : 'error'}`}>
              {saveResult.success ? 'Key saved successfully!' : saveResult.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
