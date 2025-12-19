/**
 * useHITL - Custom hook for Human-in-the-Loop API interactions
 * Replaces useDesignSession.js with new /api/hitl endpoints
 */
import { useState, useCallback } from 'react';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/hitl';

export function useHITL() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper for API calls with error handling
  const apiCall = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json', 
          ...options.headers 
        }
      });
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
    apiCall(API_BASE, {
      method: 'POST',
      body: JSON.stringify({ 
        project_name: projectName, 
        description, 
        project_type: projectType,
        ...extraParams
      })
    }), [apiCall]);

  // Get session with messages
  const getSession = useCallback((sessionId) => 
    apiCall(`${API_BASE}/${sessionId}`), [apiCall]);

  // List sessions with optional state filter
  const listSessions = useCallback((state = null, limit = 50) => {
    const params = new URLSearchParams();
    if (state) params.append('state', state);
    if (limit) params.append('limit', limit);
    const queryStr = params.toString();
    return apiCall(`${API_BASE}${queryStr ? '?' + queryStr : ''}`);
  }, [apiCall]);

  // User responds to AI question (works in input or clarifying state)
  const respond = useCallback((sessionId, message) =>
    apiCall(`${API_BASE}/${sessionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ message })
    }), [apiCall]);

  // Explicitly start clarification phase
  const startClarification = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}/start-clarification`, {
      method: 'POST'
    }), [apiCall]);

  // Generate spec card (from clarifying or ready_for_docs)
  const generateSpec = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}/generate-spec`, {
      method: 'POST'
    }), [apiCall]);

  // Approve spec (from reviewing)
  const approveSpec = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}/approve`, {
      method: 'POST'
    }), [apiCall]);

  // Start build (Gate 5 - from approved state)
  const startBuild = useCallback((sessionId, confirmed = true) =>
    apiCall(`${API_BASE}/${sessionId}/start-build`, {
      method: 'POST',
      body: JSON.stringify({ confirmed })
    }), [apiCall]);

  // Request revision with feedback
  const requestRevision = useCallback((sessionId, feedback) =>
    apiCall(`${API_BASE}/${sessionId}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ feedback })
    }), [apiCall]);

  // Update spec content directly
  const updateSpec = useCallback((sessionId, content) =>
    apiCall(`${API_BASE}/${sessionId}/update-spec`, {
      method: 'POST',
      body: JSON.stringify({ content })
    }), [apiCall]);

  // Get message history
  const getMessages = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}/messages`), [apiCall]);

  // Delete session
  const deleteSession = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}`, {
      method: 'DELETE'
    }), [apiCall]);

  // Get state machine metadata
  const getStateMeta = useCallback(() =>
    apiCall(`${API_BASE}/meta/states`), [apiCall]);

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
