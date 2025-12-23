import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { CalendarIcon, UserIcon, ClockIcon, MessageSquareIcon, ActivityIcon, PlusIcon } from 'lucide-react';

const Tickets = () => {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for demonstration
  useEffect(() => {
    const mockTickets = [
      {
        id: 'TKT-001',
        title: 'Login page not loading properly',
        description: 'Users are experiencing issues when trying to access the login page. The page appears blank after clicking the login button.',
        status: 'open',
        priority: 'high',
        assignee: {
          name: 'John Smith',
          avatar: null,
          initials: 'JS'
        },
        reporter: {
          name: 'Jane Doe',
          avatar: null,
          initials: 'JD'
        },
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-16T14:20:00Z',
        activity: [
          {
            id: 1,
            type: 'created',
            user: { name: 'Jane Doe', initials: 'JD' },
            timestamp: '2024-01-15T10:30:00Z',
            description: 'Ticket created'
          },
          {
            id: 2,
            type: 'assigned',
            user: { name: 'Admin User', initials: 'AU' },
            timestamp: '2024-01-15T11:15:00Z',
            description: 'Assigned to John Smith'
          },
          {
            id: 3,
            type: 'status_change',
            user: { name: 'John Smith', initials: 'JS' },
            timestamp: '2024-01-16T14:20:00Z',
            description: 'Status changed to In Progress'
          }
        ],
        comments: [
          {
            id: 1,
            user: { name: 'Jane Doe', initials: 'JD' },
            content: 'This issue is blocking several users from accessing their accounts.',
            timestamp: '2024-01-15T10:35:00Z'
          },
          {
            id: 2,
            user: { name: 'John Smith', initials: 'JS' },
            content: 'I\'ve started investigating this issue. Initial analysis suggests it might be related to the authentication service.',
            timestamp: '2024-01-16T09:30:00Z'
          }
        ]
      },
      {
        id: 'TKT-002',
        title: 'Database connection timeout',
        description: 'Application is experiencing intermittent database connection timeouts during peak hours.',
        status: 'in-progress',
        priority: 'medium',
        assignee: {
          name: 'Alice Johnson',
          avatar: null,
          initials: 'AJ'
        },
        reporter: {
          name: 'Bob Wilson',
          avatar: null,
          initials: 'BW'
        },
        createdAt: '2024-01-14T09:15:00Z',
        updatedAt: '2024-01-16T16:45:00Z',
        activity: [
          {
            id: 1,
            type: 'created',
            user: { name: 'Bob Wilson', initials: 'BW' },
            timestamp: '2024-01-14T09:15:00Z',
            description: 'Ticket created'
          }
        ],
        comments: [
          {
            id: 1,
            user: { name: 'Alice Johnson', initials: 'AJ' },
            content: 'I\'ve identified the root cause and working on a fix.',
            timestamp: '2024-01-16T16:45:00Z'
          }
        ]
      }
    ];
    setTickets(mockTickets);
  }, []);

  const openTicketModal = (ticket) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };

  const closeTicketModal = () => {
    setIsModalOpen(false);
    setSelectedTicket(null);
    setNewComment('');
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    // In a real application, this would make an API call
    const comment = {
      id: Date.now(),
      user: { name: 'Current User', initials: 'CU' },
      content: newComment,
      timestamp: new Date().toISOString()
    };

    setSelectedTicket(prev => ({
      ...prev,
      comments: [...(prev.comments || []), comment]
    }));

    setNewComment('');
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getPriorityBadgeVariant = (priority) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'open': return 'destructive';
      case 'in-progress': return 'default';
      case 'resolved': return 'secondary';
      case 'closed': return 'outline';
      default: return 'outline';
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesFilter = filter === 'all' || ticket.status === filter;
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
          <p className="text-gray-600">Manage and track customer support tickets</p>
        </div>
        <Button className="btn-primary">
          <PlusIcon className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Grid */}
      <div className="grid gap-4">
        {filteredTickets.map((ticket) => (
          <Card key={ticket.id} className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => openTicketModal(ticket)}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-500">{ticket.id}</span>
                    <Badge variant={getStatusBadgeVariant(ticket.status)}>
                      {ticket.status.replace('-', ' ')}
                    </Badge>
                    <Badge variant={getPriorityBadgeVariant(ticket.priority)}>
                      {ticket.priority}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{ticket.title}</h3>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-gray-600 line-clamp-2">{ticket.description}</p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <UserIcon className="w-4 h-4" />
                      <span>{ticket.assignee?.name || 'Unassigned'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CalendarIcon className="w-4 h-4" />
                      <span>{formatTimestamp(ticket.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquareIcon className="w-4 h-4" />
                    <span>{ticket.comments?.length || 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTickets.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No tickets found matching your criteria.</p>
        </div>
      )}

      {/* Ticket Detail Modal */}
      <Dialog open={isModalOpen} onOpenChange={closeTicketModal}>
        <DialogContent className="modal-content max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader className="modal-header border-b pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-gray-500">{selectedTicket?.id}</span>
                  <Badge variant={getStatusBadgeVariant(selectedTicket?.status)}>
                    {selectedTicket?.status?.replace('-', ' ')}
                  </Badge>
                  <Badge variant={getPriorityBadgeVariant(selectedTicket?.priority)}>
                    {selectedTicket?.priority}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-semibold text-gray-900">
                  {selectedTicket?.title}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>
          
          <div className="modal-body overflow-y-auto flex-1 space-y-6 py-4">
            {/* Description Section */}
            <div className="ticket-description">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
              <p className="text-gray-700 leading-relaxed">{selectedTicket?.description}</p>
            </div>

            {/* Ticket Details */}
            <div className="ticket-details grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="detail-item">
                <label className="text-sm font-medium text-gray-500">Assignee</label>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={selectedTicket?.assignee?.avatar} />
                    <AvatarFallback className="text-xs">{selectedTicket?.assignee?.initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-gray-900">{selectedTicket?.assignee?.name || 'Unassigned'}</span>
                </div>
              </div>
              <div className="detail-item">
                <label className="text-sm font-medium text-gray-500">Reporter</label>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={selectedTicket?.reporter?.avatar} />
                    <AvatarFallback className="text-xs">{selectedTicket?.reporter?.initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-gray-900">{selectedTicket?.reporter?.name}</span>
                </div>
              </div>
              <div className="detail-item">
                <label className="text-sm font-medium text-gray-500">Created</label>
                <div className="flex items-center gap-1 mt-1">
                  <CalendarIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900">{formatTimestamp(selectedTicket?.createdAt)}</span>
                </div>
              </div>
              <div className="detail-item">
                <label className="text-sm font-medium text-gray-500">Last Updated</label>
                <div className="flex items-center gap-1 mt-1">
                  <ClockIcon className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900">{formatTimestamp(selectedTicket?.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Activity Timeline */}
            <div className="activity-timeline">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ActivityIcon className="w-5 h-5" />
                Activity Timeline
              </h3>
              <div className="activity-list space-y-4">
                {selectedTicket?.activity?.map((activity) => (
                  <div key={activity.id} className="activity-item flex gap-3">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarImage src={activity.user.avatar} />
                      <AvatarFallback className="text-xs">{activity.user.initials}</AvatarFallback>
                    </Avatar>
                    <div className="activity-content flex-1">
                      <div className="activity-header flex items-center gap-2">
                        <span className="font-medium text-gray-900">{activity.user.name}</span>
                        <span className="text-sm text-gray-500">{formatTimestamp(activity.timestamp)}</span>
                      </div>
                      <p className="text-gray-700 mt-1">{activity.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comments Section */}
            <div className="comments-section">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquareIcon className="w-5 h-5" />
                Comments
              </h3>
              
              {/* Comments List Container */}
              <div className="comments-list space-y-4 mb-6">
                {selectedTicket?.comments?.length > 0 ? (
                  selectedTicket.comments.map((comment) => (
                    <div key={comment.id} className="comment-item flex gap-3 p-4 bg-gray-50 rounded-lg">
                      <Avatar className="w-8 h-8 flex-shrink-0">
                        <AvatarImage src={comment.user.avatar} />
                        <AvatarFallback className="text-xs">{comment.user.initials}</AvatarFallback>
                      </Avatar>
                      <div className="comment-content flex-1">
                        <div className="comment-header flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">{comment.user.name}</span>
                          <span className="text-sm text-gray-500">{formatTimestamp(comment.timestamp)}</span>
                        </div>
                        <p className="text-gray-700 leading-relaxed">{comment.content}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-comments text-center py-8 text-gray-500">
                    <MessageSquareIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No comments yet. Be the first to add a comment!</p>
                  </div>
                )}
              </div>

              {/* New Comment Form */}
              <form onSubmit={handleCommentSubmit} className="new-comment-form space-y-4">
                <div className="form-group">
                  <label htmlFor="comment-textarea" className="block text-sm font-medium text-gray-700 mb-2">
                    Add a comment
                  </label>
                  <Textarea
                    id="comment-textarea"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type your comment here..."
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>
                <div className="form-actions flex justify-end">
                  <Button type="submit" disabled={!newComment.trim()} className="btn-primary">
                    Save Comment
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tickets;