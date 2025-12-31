import { useState, useEffect } from 'react';
import { Check, X, Eye, EyeOff, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import ProviderRow from './ProviderRow';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function ApiKeysSection() {
  const [providers, setProviders] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [providersRes, keysRes] = await Promise.all([
        fetch(`${API_BASE}/api/settings/providers`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/settings/api-keys`, { credentials: 'include' }),
      ]);

      if (!providersRes.ok || !keysRes.ok) {
        throw new Error('Failed to fetch settings data');
      }

      const providersData = await providersRes.json();
      const keysData = await keysRes.json();

      setProviders(providersData.providers || []);
      setApiKeys(keysData.keys || []);
    } catch (err) {
      console.error('Settings fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const saveApiKey = async (providerId, apiKey) => {
    try {
      setSaving(providerId);
      const res = await fetch(`${API_BASE}/api/settings/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId, apiKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save API key');
      }

      await fetchData();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(null);
    }
  };

  const deleteApiKey = async (keyId) => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/api-keys/${keyId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to delete API key');
      }

      await fetchData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const getKeyForProvider = (providerId) => {
    return apiKeys.find(k => k.provider_id === providerId);
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <Loader2 className="spin" size={24} />
        <span>Loading providers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="settings-error">
        <p>Error: {error}</p>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }


  return (
    <div className="api-keys-section">
      <div className="section-header">
        <h3>AI Provider API Keys</h3>
        <p className="section-description">
          Configure API keys for different AI providers. Keys are encrypted at rest.
        </p>
      </div>

      <div className="providers-list">
        {providers.map(provider => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            existingKey={getKeyForProvider(provider.id)}
            onSave={saveApiKey}
            onDelete={deleteApiKey}
            isSaving={saving === provider.id}
          />
        ))}
      </div>
    </div>
  );
}
