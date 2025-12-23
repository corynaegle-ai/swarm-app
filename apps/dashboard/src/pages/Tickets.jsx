import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { Plus, MessageSquare, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const Tickets = () => {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    fetchTickets();
    initializeWebSocket();

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchComments(selectedTicket.id);
    }
  }, [selectedTicket]);

  const initializeWebSocket = () => {
    const ws = new WebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:3001');
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleTicketUpdate(data);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        initializeWebSocket();
      }, 3000);
    };
    
    setSocket(ws);
  };

  const handleTicketUpdate = (data) => {
    switch (data.type) {
      case 'ticket_updated':
        setTickets(prev => 
          prev.map(ticket => 
            ticket.id === data.ticket.id ? { ...ticket, ...data.ticket } : ticket
          )
        );
        
        // Update selected ticket if it's currently open
        if (selectedTicket && selectedTicket.id === data.ticket.id) {
          setSelectedTicket(prev => ({ ...prev, ...data.ticket }));
        }
        break;
        
      case 'comment_added':
        // Update comments list if the comment is for the currently selected ticket
        if (selectedTicket && selectedTicket.id === data.comment.ticketId) {
          setComments(prev => {
            // Check if comment already exists to prevent duplicates
            const exists = prev.some(comment => comment.id === data.comment.id);
            if (!exists) {
              return [...prev, data.comment].sort((a, b) => 
                new Date(a.createdAt) - new Date(b.createdAt)
              );
            }
            return prev;
          });
        }
        break;
        
      case 'comment_updated':
        if (selectedTicket && selectedTicket.id === data.comment.ticketId) {
          setComments(prev => 
            prev.map(comment => 
              comment.id === data.comment.id ? { ...comment, ...data.comment } : comment
            )
          );
        }
        break;
        
      default:
        break;
    }
  };

  const fetchTickets = async () => {
    try {
      const response = await fetch('/api/tickets');
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const fetchComments = async (ticketId) => {
    setLoadingComments(true);
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`);
      if (response.ok) {
        const data = await response.json();
        // Sort comments chronologically (oldest first)
        const sortedComments = data.sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        );
        setComments(sortedComments);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!newComment.trim() || !selectedTicket) return;
    
    setIsSubmittingComment(true);
    try {
      const response = await fetch(`/api/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newComment }),
      });
      
      if (response.ok) {
        const comment = await response.json();
        setComments(prev => [...prev, comment].sort((a, b) => 
          new Date(a.createdAt) - new Date(b.createdAt)
        ));
        setNewComment('');
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const openTicketModal = (ticket) => {
    setSelectedTicket(ticket);
    setComments([]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTicket(null);
    setComments([]);
    setNewComment('');
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return 'Unknown time';
    }
  };

  const getPriorityBadgeVariant = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'destructive';
      case 'in progress':
        return 'default';
      case 'resolved':
        return 'secondary';
      case 'closed':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Support Tickets</h1>
        <p className="text-gray-600">Manage and track customer support requests</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tickets.map((ticket) => (
          <Card 
            key={ticket.id} 
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openTicketModal(ticket)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg font-semibold line-clamp-2">
                  {ticket.title}
                </CardTitle>
                <Badge variant={getPriorityBadgeVariant(ticket.priority)}>
                  {ticket.priority}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-gray-600 line-clamp-3 text-sm">
                  {ticket.description}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant={getStatusBadgeVariant(ticket.status)}>
                    {ticket.status}
                  </Badge>
                  <div className="flex items-center text-xs text-gray-500">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatTimestamp(ticket.createdAt)}
                  </div>
                </div>
                {ticket.assignedTo && (
                  <div className="flex items-center text-xs text-gray-600">
                    <User className="w-3 h-3 mr-1" />
                    Assigned to: {ticket.assignedTo}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={closeModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {selectedTicket?.title}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                  {/* Ticket Details */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Badge variant={getStatusBadgeVariant(selectedTicket.status)}>
                          {selectedTicket.status}
                        </Badge>
                        <Badge variant={getPriorityBadgeVariant(selectedTicket.priority)}>
                          {selectedTicket.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <Clock className="w-4 h-4 mr-1" />
                        Created {formatTimestamp(selectedTicket.createdAt)}
                      </div>
                    </div>
                    
                    {selectedTicket.assignedTo && (
                      <div className="flex items-center text-sm text-gray-600">
                        <User className="w-4 h-4 mr-1" />
                        Assigned to: {selectedTicket.assignedTo}
                      </div>
                    )}
                    
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {selectedTicket.description}
                      </p>
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="w-5 h-5" />
                      <h4 className="font-medium">Comments ({comments.length})</h4>
                    </div>
                    
                    {loadingComments ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <span className="ml-2 text-gray-600">Loading comments...</span>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {comments.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>No comments yet. Be the first to comment!</p>
                          </div>
                        ) : (
                          <ScrollArea className="max-h-96">
                            <div className="space-y-4 pr-4">
                              {comments.map((comment) => (
                                <div key={comment.id} className="bg-white border rounded-lg p-4 shadow-sm">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                      <User className="w-4 h-4 text-gray-500" />
                                      <span className="font-medium text-sm">
                                        {comment.author || comment.userName || 'Anonymous'}
                                      </span>
                                    </div>
                                    <div className="flex items-center text-xs text-gray-500">
                                      <Clock className="w-3 h-3 mr-1" />
                                      {formatTimestamp(comment.createdAt)}
                                    </div>
                                  </div>
                                  <p className="text-gray-700 whitespace-pre-wrap text-sm">
                                    {comment.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Add Comment Form */}
              <div className="border-t pt-4 mt-4">
                <div className="space-y-3">
                  <label htmlFor="new-comment" className="block text-sm font-medium text-gray-700">
                    Add a comment
                  </label>
                  <Textarea
                    id="new-comment"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type your comment here..."
                    rows={3}
                    className="w-full"
                  />
                  <div className="flex justify-end">
                    <Button 
                      onClick={submitComment}
                      disabled={!newComment.trim() || isSubmittingComment}
                      className="flex items-center space-x-2"
                    >
                      {isSubmittingComment ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Posting...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Add Comment</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tickets;