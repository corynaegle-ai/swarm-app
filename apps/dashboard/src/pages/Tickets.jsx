import React, { useState, useEffect } from 'react';
import { Search, Plus, Eye, Edit, Trash2, Filter } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

const STATE_CONFIG = {
  open: {
    color: '#10b981',
    backgroundColor: '#d1fae5',
    label: 'Open'
  },
  'in-progress': {
    color: '#f59e0b',
    backgroundColor: '#fef3c7',
    label: 'In Progress'
  },
  resolved: {
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    label: 'Resolved'
  },
  closed: {
    color: '#ef4444',
    backgroundColor: '#fee2e2',
    label: 'Closed'
  }
};

const PRIORITY_CONFIG = {
  high: {
    color: '#ef4444',
    backgroundColor: '#fee2e2',
    label: 'High'
  },
  medium: {
    color: '#f59e0b',
    backgroundColor: '#fef3c7',
    label: 'Medium'
  },
  low: {
    color: '#3b82f6',
    backgroundColor: '#dbeafe',
    label: 'Low'
  }
};

const MOCK_TICKETS = [
  {
    id: 'TKT-001',
    title: 'Login page not loading',
    description: 'Users are unable to access the login page due to a server error',
    state: 'open',
    priority: 'high',
    assignee: 'John Doe',
    scope: 'Frontend',
    verify: 'QA Team',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T14:22:00Z'
  },
  {
    id: 'TKT-002',
    title: 'Database connection timeout',
    description: 'Intermittent database connection timeouts affecting user queries',
    state: 'in-progress',
    priority: 'medium',
    assignee: 'Jane Smith',
    scope: 'Backend',
    verify: 'DevOps',
    createdAt: '2024-01-14T09:15:00Z',
    updatedAt: '2024-01-15T11:45:00Z'
  },
  {
    id: 'TKT-003',
    title: 'UI inconsistency in dashboard',
    description: 'Minor styling issues in the main dashboard layout',
    state: 'resolved',
    priority: 'low',
    assignee: 'Mike Johnson',
    scope: 'Design',
    verify: 'Product Team',
    createdAt: '2024-01-13T16:20:00Z',
    updatedAt: '2024-01-14T10:30:00Z'
  }
];

const Tickets = () => {
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    state: 'open',
    priority: 'medium',
    assignee: '',
    scope: '',
    verify: ''
  });

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterState === 'all' || ticket.state === filterState;
    return matchesSearch && matchesFilter;
  });

  const handleCreateTicket = () => {
    const ticket = {
      ...newTicket,
      id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setTickets([...tickets, ticket]);
    setNewTicket({
      title: '',
      description: '',
      state: 'open',
      priority: 'medium',
      assignee: '',
      scope: '',
      verify: ''
    });
    setIsCreateModalOpen(false);
  };

  const handleTicketUpdate = (updatedTicket) => {
    setTickets(tickets.map(ticket => 
      ticket.id === updatedTicket.id 
        ? { ...updatedTicket, updatedAt: new Date().toISOString() }
        : ticket
    ));
    setSelectedTicket({ ...updatedTicket, updatedAt: new Date().toISOString() });
  };

  const StateBadge = ({ state }) => {
    const config = STATE_CONFIG[state] || STATE_CONFIG.open;
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
        style={{
          color: config.color,
          backgroundColor: config.backgroundColor
        }}
      >
        {config.label}
      </span>
    );
  };

  const PriorityBadge = ({ priority }) => {
    const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
        style={{
          color: config.color,
          backgroundColor: config.backgroundColor
        }}
      >
        {config.label}
      </span>
    );
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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Tickets</h1>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Create New Ticket</DialogTitle>
              <DialogDescription>
                Fill in the details to create a new support ticket.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  placeholder="Enter ticket title"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  placeholder="Enter ticket description"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="state">State</Label>
                  <Select value={newTicket.state} onValueChange={(value) => setNewTicket({ ...newTicket, state: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={newTicket.priority} onValueChange={(value) => setNewTicket({ ...newTicket, priority: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="assignee">Assignee</Label>
                  <Input
                    id="assignee"
                    value={newTicket.assignee}
                    onChange={(e) => setNewTicket({ ...newTicket, assignee: e.target.value })}
                    placeholder="Assign to..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scope">Scope</Label>
                  <Input
                    id="scope"
                    value={newTicket.scope}
                    onChange={(e) => setNewTicket({ ...newTicket, scope: e.target.value })}
                    placeholder="Enter scope"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="verify">Verify</Label>
                <Input
                  id="verify"
                  value={newTicket.verify}
                  onChange={(e) => setNewTicket({ ...newTicket, verify: e.target.value })}
                  placeholder="Verification team"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTicket} disabled={!newTicket.title.trim()}>
                Create Ticket
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search tickets..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={filterState} onValueChange={setFilterState}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Ticket ID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Title</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">State</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Assignee</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Scope</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Priority</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Verify</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Updated</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm text-blue-600">{ticket.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{ticket.title}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">{ticket.description}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StateBadge state={ticket.state} />
                    </td>
                    <td className="py-3 px-4 text-gray-900">{ticket.assignee}</td>
                    <td className="py-3 px-4 text-gray-700">{ticket.scope}</td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="py-3 px-4 text-gray-700">{ticket.verify}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {formatDate(ticket.updatedAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setIsDetailModalOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredTickets.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              {searchTerm || filterState !== 'all' 
                ? 'No tickets found matching your search criteria.' 
                : 'No tickets available. Create your first ticket!'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Ticket Details</DialogTitle>
            <DialogDescription>
              View and edit ticket information.
            </DialogDescription>
          </DialogHeader>
          {selectedTicket && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="detail-id">Ticket ID</Label>
                <Input
                  id="detail-id"
                  value={selectedTicket.id}
                  disabled
                  className="bg-gray-50"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="detail-title">Title</Label>
                <Input
                  id="detail-title"
                  value={selectedTicket.title}
                  onChange={(e) => setSelectedTicket({ ...selectedTicket, title: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="detail-description">Description</Label>
                <Textarea
                  id="detail-description"
                  value={selectedTicket.description}
                  onChange={(e) => setSelectedTicket({ ...selectedTicket, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="detail-state">State</Label>
                  <Select 
                    value={selectedTicket.state} 
                    onValueChange={(value) => setSelectedTicket({ ...selectedTicket, state: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="detail-priority">Priority</Label>
                  <Select 
                    value={selectedTicket.priority} 
                    onValueChange={(value) => setSelectedTicket({ ...selectedTicket, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="detail-assignee">Assignee</Label>
                  <Input
                    id="detail-assignee"
                    value={selectedTicket.assignee}
                    onChange={(e) => setSelectedTicket({ ...selectedTicket, assignee: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="detail-scope">Scope</Label>
                  <Input
                    id="detail-scope"
                    value={selectedTicket.scope}
                    onChange={(e) => setSelectedTicket({ ...selectedTicket, scope: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="detail-verify">Verify</Label>
                <Input
                  id="detail-verify"
                  value={selectedTicket.verify}
                  onChange={(e) => setSelectedTicket({ ...selectedTicket, verify: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Created</Label>
                  <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    {formatDate(selectedTicket.createdAt)}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Last Updated</Label>
                  <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    {formatDate(selectedTicket.updatedAt)}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              handleTicketUpdate(selectedTicket);
              setIsDetailModalOpen(false);
            }}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tickets;