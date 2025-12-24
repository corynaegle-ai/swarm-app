import { useState, useEffect } from 'react';
import { apiCall } from '../utils/api';
import { Server, CheckCircle, Loader2, AlertCircle, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * ProjectMCPSettings - Configure MCP servers for a project
 * Shows available servers from MCP Fabric and allows enabling/disabling
 */
export default function ProjectMCPSettings({ projectId, currentServers = [], onUpdate }) {
  const [availableServers, setAvailableServers] = useState([]);
  const [enabledServers, setEnabledServers] = useState(currentServers);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Fetch available MCP servers from Fabric
  useEffect(() => {
    async function fetchServers() {
      try {
        const response = await apiCall('/api/mcp/servers');
        if (!response.ok) throw new Error('Failed to fetch MCP servers');
        const data = await response.json();
        setAvailableServers(data.servers || []);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchServers();
  }, []);

  // Sync enabledServers when currentServers prop changes
  useEffect(() => {
    setEnabledServers(currentServers);
  }, [currentServers]);

  const toggleServer = (serverId) => {
    setEnabledServers(prev =>
      prev.includes(serverId)
        ? prev.filter(id => id !== serverId)
        : [...prev, serverId]
    );
  };

  const handleSave = async () => {
    if (!projectId) {
      toast.error('No project selected');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const response = await apiCall(`/api/projects/${projectId}/mcp-servers`, {
        method: 'PUT',
        body: JSON.stringify({ mcp_servers: enabledServers })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      toast.success('MCP servers updated');
      if (onUpdate) onUpdate(enabledServers);
    } catch (err) {
      setError(err.message);
      toast.error('Failed to save MCP servers');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(enabledServers.sort()) !== JSON.stringify(currentServers.sort());

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading MCP servers...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold">MCP Servers</h3>
      </div>
      
      <p className="text-sm text-gray-600">
        Configure external tools available to agents working on this project.
      </p>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {availableServers.length === 0 ? (
        <div className="p-4 bg-gray-50 rounded-lg text-gray-500 text-center">
          No MCP servers available. Check MCP Fabric connection.
        </div>
      ) : (
        <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
          {availableServers.map(server => (
            <label
              key={server.id}
              className="flex items-start p-3 hover:bg-gray-50 cursor-pointer gap-3"
            >
              <input
                type="checkbox"
                checked={enabledServers.includes(server.id)}
                onChange={() => toggleServer(server.id)}
                className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{server.id}</span>
                  {server.is_verified && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                </div>
                {server.description && (
                  <p className="text-sm text-gray-500 mt-1 truncate">
                    {server.description}
                  </p>
                )}
                <div className="text-xs text-gray-400 mt-1">
                  v{server.version || '0.0.0'}
                  {server.categories?.length > 0 && (
                    <span className="ml-2">• {server.categories.join(', ')}</span>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <span className="text-sm text-gray-500">
          {enabledServers.length} server{enabledServers.length !== 1 ? 's' : ''} enabled
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
