/**
 * useTicketActivity - Hook for real-time ticket activity updates
 * Combines initial API fetch with WebSocket live updates
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket, WS_STATE } from './useWebSocket';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Fetch ticket activity from API
 */
async function fetchTicketActivity(ticketId) {
  const token = localStorage.getItem('swarm_token');
  const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/activity`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  });
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch activity' }));
    throw new Error(error.error || 'Failed to fetch activity');
  }
  
  return res.json();
}

/**
 * useTicketActivity Hook
 * 
 * @param {string} ticketId - Ticket ID to watch
 * @param {Object} options
 * @param {boolean} options.enabled - Whether to fetch/subscribe (default: true)
 * @param {boolean} options.autoScroll - Auto-scroll to new entries (default: true)
 * 
 * @returns {Object} { activity, loading, error, isConnected, refresh }
 */
export function useTicketActivity(ticketId, { enabled = true, autoScroll = true } = {}) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const activityEndRef = useRef(null);

  // WebSocket handlers for real-time updates
  const handleActivityUpdate = useCallback((data) => {
    if (data.ticket_id === ticketId && data.entry) {
      setActivity(prev => {
        // Avoid duplicates by checking timestamp + category
        const isDuplicate = prev.some(
          e => e.timestamp === data.entry.timestamp && e.category === data.entry.category
        );
        if (isDuplicate) return prev;
        return [...prev, data.entry];
      });
      
      // Auto-scroll to new entry
      if (autoScroll && activityEndRef.current) {
        setTimeout(() => {
          activityEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [ticketId, autoScroll]);

  // WebSocket connection
  const { isConnected, state: wsState } = useWebSocket({
    room: ticketId ? `ticket:${ticketId}` : null,
    enabled: enabled && !!ticketId,
    handlers: {
      'ticket:activity': handleActivityUpdate,
      onConnect: () => console.log('[ActivityHook] WebSocket connected'),
      onDisconnect: () => console.log('[ActivityHook] WebSocket disconnected')
    }
  });

  // Initial fetch
  const fetchActivity = useCallback(async () => {
    if (!ticketId || !enabled) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await fetchTicketActivity(ticketId);
      setActivity(data.activity || []);
    } catch (err) {
      console.error('[ActivityHook] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticketId, enabled]);

  // Fetch on mount and when ticketId changes
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Refresh function for manual refresh
  const refresh = useCallback(() => {
    fetchActivity();
  }, [fetchActivity]);

  return {
    activity,
    loading,
    error,
    isConnected,
    wsState,
    refresh,
    scrollRef,
    activityEndRef
  };
}

export default useTicketActivity;
