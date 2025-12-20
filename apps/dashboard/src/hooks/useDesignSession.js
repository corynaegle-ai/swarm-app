/**
 * Custom hook for Design Session API interactions
 * Uses centralized apiCall for proper Bearer token authentication
 */
import { useState, useCallback } from 'react';
import { apiCall } from '../utils/api';

const API_BASE = '/api/design-sessions';

export function useDesignSession() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createSession = useCallback(async (projectName, description) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(API_BASE, {
        method: 'POST',
        body: JSON.stringify({ project_name: projectName, description })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create session');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSession = useCallback(async (sessionId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(`${API_BASE}/${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch session');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const listSessions = useCallback(async (state = null, limit = 50) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (state) params.append('state', state);
      params.append('limit', limit);
      const res = await apiCall(`${API_BASE}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list sessions');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const performAction = useCallback(async (sessionId, action, payload = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(`${API_BASE}/${sessionId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Action ${action} failed`);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const submitDescription = useCallback(async (sessionId, description) => {
    return performAction(sessionId, 'submit_description', { description });
  }, [performAction]);

  const respond = useCallback(async (sessionId, response) => {
    return performAction(sessionId, 'respond', { response });
  }, [performAction]);

  const confirmReady = useCallback(async (sessionId) => {
    return performAction(sessionId, 'confirm_ready');
  }, [performAction]);

  const generateSpec = useCallback(async (sessionId) => {
    return performAction(sessionId, 'generate_spec');
  }, [performAction]);

  const approveSpec = useCallback(async (sessionId) => {
    return performAction(sessionId, 'approve');
  }, [performAction]);

  const startBuild = useCallback(async (sessionId) => {
    return performAction(sessionId, 'start_build');
  }, [performAction]);

  return {
    loading,
    error,
    createSession,
    getSession,
    listSessions,
    performAction,
    submitDescription,
    respond,
    confirmReady,
    generateSpec,
    approveSpec,
    startBuild,
    clearError: () => setError(null)
  };
}

export default useDesignSession;
