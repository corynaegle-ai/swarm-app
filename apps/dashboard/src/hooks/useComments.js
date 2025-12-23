import { useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const useComments = () => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { socket } = useWebSocket();

  // Setup WebSocket listeners for real-time comment updates
  const setupCommentListeners = useCallback((ticketId) => {
    if (!socket) return;

    const handleCommentAdded = (data) => {
      if (data.ticketId === ticketId) {
        setComments(prev => [...prev, data.comment]);
      }
    };

    socket.on('ticket:comment:added', handleCommentAdded);

    // Return cleanup function
    return () => {
      socket.off('ticket:comment:added', handleCommentAdded);
    };
  }, [socket]);

  const fetchComments = useCallback(async (ticketId) => {
    if (!ticketId) {
      setError('Ticket ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`${API_BASE}/tickets/${ticketId}/comments`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch comments' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setComments(data.comments || []);

      // Setup WebSocket listeners for this ticket
      const cleanup = setupCommentListeners(ticketId);
      
      return { comments: data.comments || [], cleanup };
    } catch (err) {
      const errorMessage = err.message || 'Failed to fetch comments';
      setError(errorMessage);
      console.error('Error fetching comments:', err);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setupCommentListeners]);

  const createComment = useCallback(async (ticketId, commentText) => {
    if (!ticketId) {
      throw new Error('Ticket ID is required');
    }

    if (!commentText || !commentText.trim()) {
      throw new Error('Comment text is required');
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`${API_BASE}/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: commentText.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create comment' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Add the new comment to the local state immediately for optimistic updates
      if (data.comment) {
        setComments(prev => [...prev, data.comment]);
      }

      return data;
    } catch (err) {
      const errorMessage = err.message || 'Failed to create comment';
      setError(errorMessage);
      console.error('Error creating comment:', err);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    comments,
    loading,
    error,
    fetchComments,
    createComment,
    setComments
  };
};
