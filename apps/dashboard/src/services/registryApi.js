/**
 * Agent Registry API Client
 * Calls platform API for agent catalog, personas, and workflows
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Fetch agents with optional filters
 * @param {Object} filters - { name, tag, runtime }
 * @returns {Promise<Array>} List of agents
 */
export async function getAgents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.name) params.append('name', filters.name);
  if (filters.tag) params.append('tag', filters.tag);
  if (filters.runtime) params.append('runtime', filters.runtime);
  
  const url = `${API_BASE}/api/registry/agents${params.toString() ? '?' + params : ''}`;
  const response = await fetch(url, { credentials: 'include' });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch agents');
  }
  return response.json();
}

/**
 * Get single agent details with execution stats
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Agent details
 */
export async function getAgentById(agentId) {
  const response = await fetch(`${API_BASE}/api/registry/agents/${agentId}`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch agent details');
  }
  return response.json();
}

/**
 * Get agent execution history
 * @param {string} agentId - Agent ID
 * @param {number} limit - Max results (default 20)
 * @returns {Promise<Array>} Execution records
 */
export async function getAgentExecutions(agentId, limit = 20) {
  const response = await fetch(
    `${API_BASE}/api/registry/agents/${agentId}/executions?limit=${limit}`,
    { credentials: 'include' }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch executions');
  }
  return response.json();
}

/**
 * List available persona files
 * @returns {Promise<Array>} Persona list
 */
export async function getPersonas() {
  const response = await fetch(`${API_BASE}/api/registry/personas`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch personas');
  }
  return response.json();
}

/**
 * Get persona content
 * @param {string} name - Persona filename (without .md)
 * @returns {Promise<Object>} Persona content
 */
export async function getPersonaContent(name) {
  const response = await fetch(`${API_BASE}/api/registry/personas/${name}`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch persona');
  }
  return response.json();
}
