/**
 * Custom hook for Agents API interactions
 */
import { useState, useCallback } from 'react';
import { apiGet, apiPost } from '../utils/api';

export function useAgents() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const listAgents = useCallback(async ({ status, limit = 100, offset = 0 } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      params.append('limit', limit);
      params.append('offset', offset);

      const res = await apiGet(`/api/agents?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch agents');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getActiveAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet('/api/agents/active');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch active agents');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet('/api/agents/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch agent stats');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getAgent = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(`/api/agents/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch agent');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getAgentLogs = useCallback(async (id, { limit = 50 } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', limit);
      const res = await apiGet(`/api/agents/${id}/logs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch agent logs');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getHeartbeats = useCallback(async (id, { limit = 20 } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', limit);
      const res = await apiGet(`/api/agents/${id}/heartbeats?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch heartbeats');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getEvents = useCallback(async (id, { limit = 50 } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', limit);
      const res = await apiGet(`/api/agents/${id}/events?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch events');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const terminateAgent = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost(`/api/agents/${id}/terminate`, {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to terminate agent');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    listAgents,
    getActiveAgents,
    getStats,
    getAgent,
    getAgentLogs,
    getHeartbeats,
    getEvents,
    terminateAgent,
    loading,
    error
  };
}

export default useAgents;
