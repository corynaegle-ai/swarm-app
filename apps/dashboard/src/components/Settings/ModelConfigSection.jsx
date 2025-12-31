import { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function ModelConfigSection() {
  const [providers, setProviders] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [providersRes, keysRes, configRes] = await Promise.all([
        fetch(`${API_BASE}/api/settings/providers`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/settings/api-keys`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/settings/model-config`, { credentials: 'include' }),
      ]);

      const providersData = await providersRes.json();
      const keysData = await keysRes.json();
      const configData = await configRes.json();

      setProviders(providersData.providers || []);
      setApiKeys(keysData.keys || []);
      setConfig(configData.config);
    } catch (err) {
      console.error('Model config fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const configuredProviders = providers.filter(p => 
    apiKeys.some(k => k.provider_id === p.id)
  );

  const currentProvider = providers.find(p => p.id === config?.provider_id);


  const handleProviderChange = (e) => {
    const providerId = e.target.value;
    const provider = providers.find(p => p.id === providerId);
    const defaultModel = provider?.models?.find(m => m.default) || provider?.models?.[0];
    
    setConfig(prev => ({
      ...prev,
      provider_id: providerId,
      model_id: defaultModel?.id || '',
    }));
  };

  const handleModelChange = (e) => {
    setConfig(prev => ({
      ...prev,
      model_id: e.target.value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/api/settings/model-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerId: config.provider_id,
          modelId: config.model_id,
          temperature: config.temperature,
          maxTokens: config.max_tokens,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');
      
      setSaveResult({ success: true });
      setTimeout(() => setSaveResult(null), 2000);
    } catch (err) {
      setSaveResult({ success: false, error: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader2 className="spin" size={24} />
        <span>Loading model configuration...</span>
      </div>
    );
  }


  return (
    <div className="model-config-section">
      <div className="section-header">
        <h3>Default Model Configuration</h3>
        <p className="section-description">
          Select which AI model to use for agent tasks.
        </p>
      </div>

      {configuredProviders.length === 0 ? (
        <div className="no-providers-warning">
          <p>No API keys configured. Add at least one provider key in the API Keys tab.</p>
        </div>
      ) : (
        <>
          <div className="config-form">
            <div className="form-group">
              <label>Provider</label>
              <select 
                value={config?.provider_id || ''} 
                onChange={handleProviderChange}
                className="form-select"
              >
                {configuredProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Model</label>
              <select 
                value={config?.model_id || ''} 
                onChange={handleModelChange}
                className="form-select"
              >
                {currentProvider?.models?.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({(m.contextWindow / 1000).toFixed(0)}K context)
                  </option>
                ))}
              </select>
            </div>

            <button 
              className="btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              Save Configuration
            </button>

            {saveResult && (
              <div className={`save-result ${saveResult.success ? 'success' : 'error'}`}>
                {saveResult.success ? 'Configuration saved!' : saveResult.error}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
