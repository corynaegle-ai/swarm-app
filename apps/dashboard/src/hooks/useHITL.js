/**
 * useHITL - Custom hook for Human-in-the-Loop API interactions
 * Uses centralized apiCall for proper Bearer token authentication
 */
import { useState, useCallback } from 'react';
import { apiCall } from '../utils/api';

const API_PATH = '/api/hitl';

export function useHITL() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper for API calls with loading/error state management
  const makeRequest = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(url, options);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Request failed');
      }
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new HITL session
  const createSession = useCallback((projectName, description, projectType = 'application', extraParams = {}) => 
    makeRequest(API_PATH, {
      method: 'POST',
      body: JSON.stringify({ 
        project_name: projectName, 
        description, 
        project_type: projectType,
        ...extraParams
      })
    }), [makeRequest]);

  // Get session with messages
  const getSession = useCallback((sessionId) => 
    makeRequest(`${API_PATH}/${sessionId}`), [makeRequest]);

  // List sessions with optional state filter
  const listSessions = useCallback((state = null, limit = 50) => {
    const params = new URLSearchParams();
    if (state) params.append('state', state);
    if (limit) params.append('limit', limit);
    const queryStr = params.toString();
    return makeRequest(`${API_PATH}${queryStr ? '?' + queryStr : ''}`);
  }, [makeRequest]);

  // User responds to AI question (works in input or clarifying state)
  const respond = useCallback((sessionId, message) =>
    makeRequest(`${API_PATH}/${sessionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ message })
    }), [makeRequest]);

  // Explicitly start clarification phase
  const startClarification = useCallback((sessionId) =>
    makeRequest(`${API_PATH}/${sessionId}/start-clarification`, {
      method: 'POST'
    }), [makeRequest]);

  // Generate spec card (from clarifying or ready_for_docs)
  const generateSpec = useCallback((sessionId) =>
    makeRequest(`${API_PATH}/${sessionId}/generate-spec`, {
      method: 'POST'
    }), [makeRequest]);

  // Approve spec (from reviewing)
  const approveSpec = useCallback((sessionId) =>
    makeRequest(`${API_PATH}/${sessionId}/approve`, {
      method: 'POST'
    }), [makeRequest]);

  // Start build (Gate 5 - from approved state)
  const startBuild = useCallback((sessionId, confirmed = true) =>
    makeRequest(`${API_PATH}/${sessionId}/start-build`, {
      method: 'POST',
      body: JSON.stringify({ confirmed })
    }), [makeRequest]);

  // Request revision with feedback
  const requestRevision = useCallback((sessionId, feedback) =>
    makeRequest(`${API_PATH}/${sessionId}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ feedback })
    }), [makeRequest]);

  // Update spec content directly
  const updateSpec = useCallback((sessionId, content) =>
    makeRequest(`${API_PATH}/${sessionId}/update-spec`, {
      method: 'POST',
      body: JSON.stringify({ content })
    }), [makeRequest]);

  // Get message history
  const getMessages = useCallback((sessionId) =>
    makeRequest(`${API_PATH}/${sessionId}/messages`), [makeRequest]);

  // Delete session
  const deleteSession = useCallback((sessionId) =>
    makeRequest(`${API_PATH}/${sessionId}`, {
      method: 'DELETE'
    }), [makeRequest]);

  // Get state machine metadata
  const getStateMeta = useCallback(() =>
    makeRequest(`${API_PATH}/meta/states`), [makeRequest]);

  // Clear error
  const clearError = useCallback(() => setError(null), []);

  return {
    // State
    loading,
    error,
    clearError,
    
    // Session CRUD
    createSession,
    getSession,
    listSessions,
    deleteSession,
    
    // Chat actions
    respond,
    startClarification,
    
    // Spec actions
    generateSpec,
    approveSpec,
    startBuild,
    requestRevision,
    updateSpec,
    
    // Helpers
    getMessages,
    getStateMeta
  };
}

export default useHITL;
