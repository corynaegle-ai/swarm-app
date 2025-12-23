import { useState, useCallback } from 'react';

const useTickets = () => {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(null);

  const listTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tickets', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }
      const data = await response.json();
      setTickets(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTicket = useCallback(async (ticketData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(ticketData),
      });
      if (!response.ok) {
        throw new Error('Failed to create ticket');
      }
      const newTicket = await response.json();
      setTickets(prev => [...prev, newTicket]);
      return newTicket;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getTicketWithDetails = useCallback(async (ticketId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch ticket details');
      }
      const ticketData = await response.json();
      
      // Automatically load comments when fetching ticket details
      try {
        const commentsResponse = await fetch(`/api/tickets/${ticketId}/comments`, {
          credentials: 'include',
        });
        if (commentsResponse.ok) {
          const commentsData = await commentsResponse.json();
          setComments(commentsData);
          ticketData.comments = commentsData;
        }
      } catch (commentsErr) {
        console.warn('Failed to load comments:', commentsErr.message);
        setComments([]);
        ticketData.comments = [];
      }
      
      setSelectedTicket(ticketData);
      return ticketData;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getComments = useCallback(async (ticketId) => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }
      const data = await response.json();
      setComments(data);
      return data;
    } catch (err) {
      setCommentsError(err.message);
      throw err;
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const createComment = useCallback(async (ticketId, commentData) => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(commentData),
      });
      if (!response.ok) {
        throw new Error('Failed to create comment');
      }
      const newComment = await response.json();
      
      // Update comments state with new comment
      setComments(prev => [...prev, newComment]);
      
      // Update selectedTicket if it matches the ticket ID
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(prev => ({
          ...prev,
          comments: [...(prev.comments || []), newComment]
        }));
      }
      
      return newComment;
    } catch (err) {
      setCommentsError(err.message);
      throw err;
    } finally {
      setCommentsLoading(false);
    }
  }, [selectedTicket]);

  return {
    tickets,
    selectedTicket,
    loading,
    error,
    comments,
    commentsLoading,
    commentsError,
    listTickets,
    createTicket,
    getTicketWithDetails,
    getComments,
    createComment,
    setSelectedTicket,
    setTickets,
  };
};

export default useTickets;