import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Clock, User, Send } from 'lucide-react';
import { getRelativeTime } from '@/utils/time';

const CURRENT_USER = 'John Doe'; // Hardcoded current user name

// Mock tickets data with comments
const mockTickets = [
  {
    id: 1,
    title: 'Login page not loading',
    description: 'Users are reporting that the login page is not loading properly. This seems to affect Chrome users specifically.',
    status: 'open',
    priority: 'high',
    assignee: 'Sarah Johnson',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T14:22:00Z',
    comments: [
      {
        id: 1,
        user_name: 'Sarah Johnson',
        created_at: '2024-01-15T11:00:00Z',
        text: 'I\'ve reproduced the issue on Chrome 120. Looks like a CSS loading problem.'
      },
      {
        id: 2,
        user_name: 'Mike Chen',
        created_at: '2024-01-15T13:15:00Z',
        text: 'Confirmed on my end as well. Firefox works fine though.'
      },
      {
        id: 3,
        user_name: 'Sarah Johnson',
        created_at: '2024-01-15T14:22:00Z',
        text: 'Working on a fix. Should have it ready by end of day.'
      }
    ]
  },
  {
    id: 2,
    title: 'Database connection timeout',
    description: 'Application experiencing intermittent database connection timeouts during peak hours.',
    status: 'in_progress',
    priority: 'critical',
    assignee: 'Alex Rodriguez',
    created_at: '2024-01-14T09:15:00Z',
    updated_at: '2024-01-15T16:45:00Z',
    comments: [
      {
        id: 4,
        user_name: 'Alex Rodriguez',
        created_at: '2024-01-14T10:30:00Z',
        text: 'Investigating the connection pool settings. Initial analysis shows we might be hitting the max connection limit.'
      },
      {
        id: 5,
        user_name: 'Emily Davis',
        created_at: '2024-01-15T08:20:00Z',
        text: 'Database monitoring shows spikes in connection count around 2-4 PM daily.'
      },
      {
        id: 6,
        user_name: 'Alex Rodriguez',
        created_at: '2024-01-15T16:45:00Z',
        text: 'Increased connection pool size from 20 to 50. Monitoring for improvements.'
      }
    ]
  },
  {
    id: 3,
    title: 'Mobile app crashes on iOS 17',
    description: 'Users with iOS 17 are experiencing app crashes when trying to upload photos.',
    status: 'closed',
    priority: 'medium',
    assignee: 'Lisa Thompson',
    created_at: '2024-01-12T14:20:00Z',
    updated_at: '2024-01-13T11:30:00Z',
    comments: [
      {
        id: 7,
        user_name: 'Lisa Thompson',
        created_at: '2024-01-12T15:00:00Z',
        text: 'Reproduced on iPhone 15 Pro with iOS 17.2. Looks like a memory management issue.'
      },
      {
        id: 8,
        user_name: 'Tom Wilson',
        created_at: '2024-01-13T09:15:00Z',
        text: 'Fixed memory leak in image processing module. Testing the fix now.'
      },
      {
        id: 9,
        user_name: 'Lisa Thompson',
        created_at: '2024-01-13T11:30:00Z',
        text: 'Fix confirmed working. Deployed to App Store. Closing ticket.'
      }
    ]
  },
  {
    id: 4,
    title: 'Email notifications not sending',
    description: 'System email notifications have stopped working since the server migration.',
    status: 'open',
    priority: 'high',
    assignee: 'David Kim',
    created_at: '2024-01-16T08:00:00Z',
    updated_at: '2024-01-16T08:00:00Z',
    comments: [
      {
        id: 10,
        user_name: 'David Kim',
        created_at: '2024-01-16T08:30:00Z',
        text: 'Checking SMTP configuration on the new server. Initial tests show authentication issues.'
      }
    ]
  }
];

const getStatusColor = (status) => {
  const colors = {
    open: 'bg-red-100 text-red-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    closed: 'bg-green-100 text-green-800'
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

const getPriorityColor = (priority) => {
  const colors = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-orange-100 text-orange-800',
    high: 'bg-red-100 text-red-800',
    critical: 'bg-purple-100 text-purple-800'
  };
  return colors[priority] || 'bg-gray-100 text-gray-800';
};

const CommentSection = ({ ticket, onCommentSave }) => {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      await onCommentSave(ticket.id, newComment.trim());
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <MessageCircle className="h-4 w-4" />
        Comments ({ticket.comments?.length || 0})
      </div>
      
      {/* Existing Comments */}
      <div className="space-y-3">
        {ticket.comments?.map((comment) => (
          <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3 w-3 text-gray-400" />
                <span className="font-medium text-gray-700">{comment.user_name}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {getRelativeTime(comment.created_at)}
              </div>
            </div>
            <p className="text-sm text-gray-800">{comment.text}</p>
          </div>
        ))}
      </div>

      {/* Add New Comment */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="min-h-[80px] resize-none"
        />
        <div className="flex justify-end">
          <Button 
            type="submit" 
            disabled={!newComment.trim() || isSubmitting}
            size="sm"
          >
            <Send className="h-3 w-3 mr-1" />
            {isSubmitting ? 'Posting...' : 'Post Comment'}
          </Button>
        </div>
      </form>
    </div>
  );
};

const TicketCard = ({ ticket, onCommentSave }) => {
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-semibold">{ticket.title}</CardTitle>
          <div className="flex gap-2">
            <Badge className={getPriorityColor(ticket.priority)}>
              {ticket.priority}
            </Badge>
            <Badge className={getStatusColor(ticket.status)}>
              {ticket.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-gray-600 mb-4">{ticket.description}</p>
        <div className="space-y-2 text-sm text-gray-500">
          <div className="flex items-center justify-between">
            <span><strong>Assignee:</strong> {ticket.assignee}</span>
            <span><strong>ID:</strong> #{ticket.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span><strong>Created:</strong> {getRelativeTime(ticket.created_at)}</span>
            <span><strong>Updated:</strong> {getRelativeTime(ticket.updated_at)}</span>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        <CommentSection ticket={ticket} onCommentSave={onCommentSave} />
      </CardContent>
    </Card>
  );
};

export default function Tickets() {
  const [tickets, setTickets] = useState(mockTickets);
  const [nextCommentId, setNextCommentId] = useState(11); // Start after existing mock comments

  // Handle adding new comments
  const handleCommentSave = async (ticketId, commentText) => {
    const newComment = {
      id: nextCommentId,
      user_name: CURRENT_USER,
      created_at: new Date().toISOString(),
      text: commentText
    };

    setTickets(prevTickets => 
      prevTickets.map(ticket => 
        ticket.id === ticketId 
          ? {
              ...ticket,
              comments: [...(ticket.comments || []), newComment],
              updated_at: new Date().toISOString()
            }
          : ticket
      )
    );

    setNextCommentId(prev => prev + 1);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
        <p className="text-gray-600 mt-2">Manage and track customer support requests</p>
      </div>
      
      <div className="grid gap-6">
        {tickets.map((ticket) => (
          <TicketCard 
            key={ticket.id} 
            ticket={ticket} 
            onCommentSave={handleCommentSave}
          />
        ))
      </div>
    </div>
  );
}