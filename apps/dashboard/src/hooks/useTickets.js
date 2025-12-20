/**
 * Custom hook for Tickets API interactions
 * Uses centralized apiCall for proper Bearer token authentication
 */
import { useState, useCallback } from 'react';
import { apiCall } from '../utils/api';

export function useTickets() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const listTickets = useCallback(async ({ state, projectId, limit = 100, offset = 0 } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (state) params.append('state', state);
      if (projectId) params.append('project_id', projectId);
      params.append('limit', limit);
      params.append('offset', offset);
      
      const res = await apiCall(`/api/tickets?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tickets');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getTicket = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(`/api/tickets/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch ticket');
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
      const res = await apiCall('/api/tickets/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stats');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createTicket = useCallback(async (ticketData) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(ticketData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create ticket');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTicket = useCallback(async (id, updates) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(`/api/tickets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update ticket');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteTicket = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall(`/api/tickets/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete ticket');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getProjects = useCallback(async () => {
    try {
      const res = await apiCall('/api/projects');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch projects');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    listTickets,
    getTicket,
    getStats,
    createTicket,
    updateTicket,
    deleteTicket,
    getProjects,
    loading,
    error
  };
}

export default useTickets;
