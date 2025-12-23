import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, MessageSquare, Clock, User, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { getTickets, createTicket, updateTicket, createComment } from '../api/tickets';
import TicketForm from '../components/TicketForm';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const Tickets = () => {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [commentText, setCommentText] = useState('');
  const [isCommentSaving, setIsCommentSaving] = useState(false);
  const [commentError, setCommentError] = useState(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await getTickets();
      setTickets(response.data || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      setError('Failed to load tickets. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTicket = async (ticketData) => {
    try {
      setError(null);
      const response = await createTicket(ticketData);
      if (response.success) {
        await fetchTickets();
        setShowCreateForm(false);
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to create ticket' };
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
      return { success: false, error: 'Failed to create ticket. Please try again.' };
    }
  };

  const handleSaveEdit = async (ticketData) => {
    try {
      setError(null);
      const response = await updateTicket(editingTicket.id, ticketData);
      if (response.success) {
        await fetchTickets();
        // Update selected ticket if it's the one being edited
        if (selectedTicket && selectedTicket.id === editingTicket.id) {
          setSelectedTicket(response.data);
        }
        setIsEditing(false);
        setEditingTicket(null);
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Failed to update ticket' };
      }
    } catch (err) {
      console.error('Error updating ticket:', err);
      return { success: false, error: 'Failed to update ticket. Please try again.' };
    }
  };

  const handleSaveComment = async () => {
    if (!commentText.trim() || !selectedTicket) return;

    try {
      setIsCommentSaving(true);
      setCommentError(null);
      
      const response = await createComment(selectedTicket.id, {
        content: commentText.trim()
      });
      
      if (response.success) {
        // Update selectedTicket with new comment
        const updatedTicket = {
          ...selectedTicket,
          comments: [...(selectedTicket.comments || []), response.data]
        };
        setSelectedTicket(updatedTicket);
        
        // Reset form
        setCommentText('');
        
        // Update tickets list if needed
        setTickets(prevTickets => 
          prevTickets.map(ticket => 
            ticket.id === selectedTicket.id 
              ? { ...ticket, comments: updatedTicket.comments }
              : ticket
          )
        );
      } else {
        setCommentError(response.error || 'Failed to save comment');
      }
    } catch (err) {
      console.error('Error saving comment:', err);
      setCommentError('Failed to save comment. Please try again.');
    } finally {
      setIsCommentSaving(false);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || ticket.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'in-progress':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'resolved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-600 mt-2">Manage and track customer support requests</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Ticket
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <ErrorMessage message={error} onDismiss={() => setError(null)} />
      )}

      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="relative">
          <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets List */}
        <div className="space-y-4">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No tickets found</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <div
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedTicket?.id === ticket.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(ticket.status)}
                    <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </div>
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">{ticket.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{ticket.customer_name}</span>
                  </div>
                  <span>{formatDate(ticket.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Ticket Detail */}
        <div className="border border-gray-200 rounded-lg">
          {selectedTicket ? (
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(selectedTicket.status)}
                    <h2 className="text-xl font-semibold text-gray-900">{selectedTicket.title}</h2>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>{selectedTicket.customer_name}</span>
                    </div>
                    <span>{formatDate(selectedTicket.created_at)}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(selectedTicket.priority)}`}>
                      {selectedTicket.priority} priority
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditingTicket(selectedTicket);
                    setIsEditing(true);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Edit
                </button>
              </div>

              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                <p className="text-gray-700">{selectedTicket.description}</p>
              </div>

              {/* Comments Section */}
              <div className="border-t pt-6">
                <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Comments ({selectedTicket.comments?.length || 0})
                </h3>
                
                {/* Comments List */}
                <div className="space-y-4 mb-6">
                  {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                    selectedTicket.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-sm">{comment.author_name || 'Support Agent'}</span>
                          </div>
                          <span className="text-xs text-gray-500">{formatDate(comment.created_at)}</span>
                        </div>
                        <p className="text-gray-700 text-sm">{comment.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No comments yet</p>
                  )}
                </div>

                {/* Comment Form */}
                <div className="space-y-3">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={isCommentSaving}
                  />
                  
                  {commentError && (
                    <ErrorMessage message={commentError} onDismiss={() => setCommentError(null)} />
                  )}
                  
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveComment}
                      disabled={!commentText.trim() || isCommentSaving}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCommentSaving && <LoadingSpinner size="small" />}
                      {isCommentSaving ? 'Saving...' : 'Add Comment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p>Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Ticket Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create New Ticket</h2>
            <TicketForm
              onSubmit={handleCreateTicket}
              onCancel={() => setShowCreateForm(false)}
              submitLabel="Create Ticket"
            />
          </div>
        </div>
      )}

      {/* Edit Ticket Modal */}
      {isEditing && editingTicket && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Edit Ticket</h2>
            <TicketForm
              initialData={editingTicket}
              onSubmit={handleSaveEdit}
              onCancel={() => {
                setIsEditing(false);
                setEditingTicket(null);
              }}
              submitLabel="Save Changes"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Tickets;