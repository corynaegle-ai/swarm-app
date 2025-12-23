import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Plus, Edit2, Save, X } from 'lucide-react';

const Tickets = () => {
  const [tickets, setTickets] = useState([
    {
      id: 1,
      title: 'Login Issue',
      description: 'Users unable to log in',
      status: 'Open',
      priority: 'High',
      assignee: 'John Doe',
      created: '2024-01-15',
      comments: [
        { id: 1, author: 'Jane Smith', text: 'Investigating the issue', timestamp: '2024-01-15 10:30' },
        { id: 2, author: 'John Doe', text: 'Found the root cause', timestamp: '2024-01-15 14:20' }
      ]
    },
    {
      id: 2,
      title: 'Feature Request',
      description: 'Add dark mode support',
      status: 'In Progress',
      priority: 'Medium',
      assignee: 'Jane Smith',
      created: '2024-01-14',
      comments: [
        { id: 1, author: 'Alice Brown', text: 'This would be a great addition', timestamp: '2024-01-14 09:15' }
      ]
    },
    {
      id: 3,
      title: 'Performance Issue',
      description: 'Page loading slowly',
      status: 'Closed',
      priority: 'Low',
      assignee: 'Bob Wilson',
      created: '2024-01-13',
      comments: []
    }
  ]);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [editForm, setEditForm] = useState({ isEditing: false, data: {}, errors: {} });
  const [newTicket, setNewTicket] = useState({ isCreating: false, data: { title: '', description: '', priority: 'Medium' }, errors: {} });
  const [commentForm, setCommentForm] = useState({ text: '', isSubmitting: false, errors: {} });

  const statusColors = {
    Open: 'bg-red-100 text-red-800',
    'In Progress': 'bg-yellow-100 text-yellow-800',
    Closed: 'bg-green-100 text-green-800'
  };

  const priorityColors = {
    High: 'bg-red-100 text-red-800',
    Medium: 'bg-yellow-100 text-yellow-800',
    Low: 'bg-green-100 text-green-800'
  };

  const handleTicketClick = (ticket) => {
    setSelectedTicket(ticket);
    // Reset comment form when opening a new ticket
    setCommentForm({ text: '', isSubmitting: false, errors: {} });
  };

  const handleStartEdit = (ticket) => {
    setEditForm({
      isEditing: true,
      data: { ...ticket },
      errors: {}
    });
  };

  const handleSaveEdit = () => {
    const { data } = editForm;
    const errors = {};

    // Validation
    if (!data.title?.trim()) errors.title = 'Title is required';
    if (!data.description?.trim()) errors.description = 'Description is required';

    if (Object.keys(errors).length > 0) {
      setEditForm(prev => ({ ...prev, errors }));
      return;
    }

    // Update ticket
    setTickets(prev => prev.map(ticket => 
      ticket.id === data.id ? data : ticket
    ));
    setSelectedTicket(data);
    setEditForm({ isEditing: false, data: {}, errors: {} });
  };

  const handleCancelEdit = () => {
    setEditForm({ isEditing: false, data: {}, errors: {} });
  };

  const handleCreateTicket = () => {
    setNewTicket(prev => ({ ...prev, isCreating: true }));
  };

  const handleSaveNewTicket = () => {
    const { data } = newTicket;
    const errors = {};

    // Validation
    if (!data.title?.trim()) errors.title = 'Title is required';
    if (!data.description?.trim()) errors.description = 'Description is required';

    if (Object.keys(errors).length > 0) {
      setNewTicket(prev => ({ ...prev, errors }));
      return;
    }

    // Create new ticket
    const newId = Math.max(...tickets.map(t => t.id)) + 1;
    const newTicketData = {
      ...data,
      id: newId,
      status: 'Open',
      assignee: 'Unassigned',
      created: new Date().toISOString().split('T')[0],
      comments: []
    };

    setTickets(prev => [newTicketData, ...prev]);
    setNewTicket({ isCreating: false, data: { title: '', description: '', priority: 'Medium' }, errors: {} });
  };

  const handleCancelNewTicket = () => {
    setNewTicket({ isCreating: false, data: { title: '', description: '', priority: 'Medium' }, errors: {} });
  };

  const handleCommentTextChange = (value) => {
    setCommentForm(prev => ({
      ...prev,
      text: value,
      errors: {} // Clear errors when user starts typing
    }));
  };

  const handleAddComment = () => {
    const trimmedText = commentForm.text.trim();
    const errors = {};

    // Validation
    if (!trimmedText) {
      errors.text = 'Comment cannot be empty';
      setCommentForm(prev => ({ ...prev, errors }));
      return;
    }

    setCommentForm(prev => ({ ...prev, isSubmitting: true }));

    // Simulate API call delay
    setTimeout(() => {
      const newComment = {
        id: Math.max(...(selectedTicket.comments.map(c => c.id) || [0])) + 1,
        author: 'Current User', // In real app, this would come from auth context
        text: trimmedText,
        timestamp: new Date().toLocaleString()
      };

      // Update the ticket with new comment
      const updatedTicket = {
        ...selectedTicket,
        comments: [...selectedTicket.comments, newComment]
      };

      // Update tickets state
      setTickets(prev => prev.map(ticket => 
        ticket.id === selectedTicket.id ? updatedTicket : ticket
      ));

      // Update selected ticket
      setSelectedTicket(updatedTicket);

      // Reset comment form
      setCommentForm({ text: '', isSubmitting: false, errors: {} });
    }, 500);
  };

  const isCommentSaveDisabled = !commentForm.text.trim() || commentForm.isSubmitting;

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Tickets</h1>
        <Dialog open={newTicket.isCreating} onOpenChange={(open) => !open && handleCancelNewTicket()}>
          <DialogTrigger asChild>
            <Button onClick={handleCreateTicket} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <Input
                  value={newTicket.data.title}
                  onChange={(e) => setNewTicket(prev => ({
                    ...prev,
                    data: { ...prev.data, title: e.target.value },
                    errors: { ...prev.errors, title: '' }
                  }))}
                  className={newTicket.errors.title ? 'border-red-500' : ''}
                  placeholder="Enter ticket title"
                />
                {newTicket.errors.title && (
                  <p className="text-red-500 text-sm mt-1">{newTicket.errors.title}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Textarea
                  value={newTicket.data.description}
                  onChange={(e) => setNewTicket(prev => ({
                    ...prev,
                    data: { ...prev.data, description: e.target.value },
                    errors: { ...prev.errors, description: '' }
                  }))}
                  className={newTicket.errors.description ? 'border-red-500' : ''}
                  placeholder="Enter ticket description"
                  rows={4}
                />
                {newTicket.errors.description && (
                  <p className="text-red-500 text-sm mt-1">{newTicket.errors.description}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={newTicket.data.priority}
                  onChange={(e) => setNewTicket(prev => ({
                    ...prev,
                    data: { ...prev.data, priority: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <Button variant="outline" onClick={handleCancelNewTicket}>
                  Cancel
                </Button>
                <Button onClick={handleSaveNewTicket}>
                  Create Ticket
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {tickets.map((ticket) => (
          <Card key={ticket.id} className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleTicketClick(ticket)}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{ticket.title}</CardTitle>
                  <p className="text-gray-600 mt-1">{ticket.description}</p>
                </div>
                <div className="flex gap-2">
                  <Badge className={statusColors[ticket.status]}>
                    {ticket.status}
                  </Badge>
                  <Badge className={priorityColors[ticket.priority]}>
                    {ticket.priority}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Assigned to: {ticket.assignee}</span>
                <span>Created: {ticket.created}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ticket Detail Modal */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center">
              <span>{selectedTicket?.title}</span>
              {!editForm.isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleStartEdit(selectedTicket)}
                  className="flex items-center gap-2"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {editForm.isEditing ? (
              // Edit Form
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <Input
                    value={editForm.data.title || ''}
                    onChange={(e) => setEditForm(prev => ({
                      ...prev,
                      data: { ...prev.data, title: e.target.value },
                      errors: { ...prev.errors, title: '' }
                    }))}
                    className={editForm.errors.title ? 'border-red-500' : ''}
                  />
                  {editForm.errors.title && (
                    <p className="text-red-500 text-sm mt-1">{editForm.errors.title}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <Textarea
                    value={editForm.data.description || ''}
                    onChange={(e) => setEditForm(prev => ({
                      ...prev,
                      data: { ...prev.data, description: e.target.value },
                      errors: { ...prev.errors, description: '' }
                    }))}
                    className={editForm.errors.description ? 'border-red-500' : ''}
                    rows={4}
                  />
                  {editForm.errors.description && (
                    <p className="text-red-500 text-sm mt-1">{editForm.errors.description}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={editForm.data.status || ''}
                      onChange={(e) => setEditForm(prev => ({
                        ...prev,
                        data: { ...prev.data, status: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={editForm.data.priority || ''}
                      onChange={(e) => setEditForm(prev => ({
                        ...prev,
                        data: { ...prev.data, priority: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
                  <Input
                    value={editForm.data.assignee || ''}
                    onChange={(e) => setEditForm(prev => ({
                      ...prev,
                      data: { ...prev.data, assignee: e.target.value }
                    }))}
                  />
                </div>
                <div className="flex gap-2 justify-end pt-4">
                  <Button variant="outline" onClick={handleCancelEdit}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">Description</h3>
                  <p className="mt-1 text-gray-900">{selectedTicket?.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">Status</h3>
                    <Badge className={statusColors[selectedTicket?.status] + ' mt-1'}>
                      {selectedTicket?.status}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">Priority</h3>
                    <Badge className={priorityColors[selectedTicket?.priority] + ' mt-1'}>
                      {selectedTicket?.priority}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">Assignee</h3>
                    <p className="mt-1 text-gray-900">{selectedTicket?.assignee}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">Created</h3>
                    <p className="mt-1 text-gray-900">{selectedTicket?.created}</p>
                  </div>
                </div>
                
                {/* Comments Section */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Comments</h3>
                  
                  {/* Existing Comments */}
                  <div className="space-y-3 mb-4">
                    {selectedTicket?.comments?.length > 0 ? (
                      selectedTicket.comments.map((comment) => (
                        <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-sm text-gray-900">{comment.author}</span>
                            <span className="text-xs text-gray-500">{comment.timestamp}</span>
                          </div>
                          <p className="text-gray-700">{comment.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 italic">No comments yet.</p>
                    )}
                  </div>
                  
                  {/* Add Comment Form */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Add Comment</label>
                      <Textarea
                        value={commentForm.text}
                        onChange={(e) => handleCommentTextChange(e.target.value)}
                        className={commentForm.errors.text ? 'border-red-500' : ''}
                        placeholder="Enter your comment..."
                        rows={3}
                        disabled={commentForm.isSubmitting}
                      />
                      {commentForm.errors.text && (
                        <p className="text-red-500 text-sm mt-1">{commentForm.errors.text}</p>
                      )}
                    </div>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleAddComment}
                        disabled={isCommentSaveDisabled}
                        className="flex items-center gap-2"
                      >
                        {commentForm.isSubmitting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Adding...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Add Comment
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tickets;