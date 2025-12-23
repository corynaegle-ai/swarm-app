import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, MoreVertical } from 'lucide-react';
import { TICKET_SCOPES, TICKET_STATUSES, PRIORITY_OPTIONS } from '../../../project.js';

const Tickets = () => {
  const [tickets, setTickets] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    scope: 'frontend',
    priority: 'medium',
    status: 'open'
  });

  // Mock data for demonstration
  useEffect(() => {
    setTickets([
      {
        id: 'TKT-001',
        title: 'Fix login button styling',
        description: 'The login button appears misaligned on mobile devices',
        scope: 'frontend',
        priority: 'high',
        status: 'open',
        createdAt: '2024-01-15'
      },
      {
        id: 'TKT-002',
        title: 'Optimize database queries',
        description: 'Improve performance of user data retrieval',
        scope: 'backend',
        priority: 'medium',
        status: 'in-progress',
        createdAt: '2024-01-14'
      },
      {
        id: 'TKT-003',
        title: 'Update documentation',
        description: 'Add API endpoint documentation for new features',
        scope: 'documentation',
        priority: 'low',
        status: 'closed',
        createdAt: '2024-01-13'
      }
    ]);
  }, []);

  const handleCreateTicket = () => {
    if (newTicket.title.trim() && newTicket.description.trim()) {
      const ticket = {
        ...newTicket,
        id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
        createdAt: new Date().toISOString().split('T')[0]
      };
      setTickets([ticket, ...tickets]);
      setNewTicket({
        title: '',
        description: '',
        scope: 'frontend',
        priority: 'medium',
        status: 'open'
      });
      setShowCreateForm(false);
    }
  };

  const getScopeColor = (scope) => {
    const colors = {
      frontend: 'bg-blue-100 text-blue-800',
      backend: 'bg-green-100 text-green-800',
      fullstack: 'bg-purple-100 text-purple-800',
      documentation: 'bg-yellow-100 text-yellow-800',
      testing: 'bg-red-100 text-red-800'
    };
    return colors[scope] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority) => {
    const priorityOption = PRIORITY_OPTIONS.find(p => p.value === priority);
    return priorityOption ? priorityOption.color : 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status) => {
    const colors = {
      open: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-yellow-100 text-yellow-800',
      closed: 'bg-green-100 text-green-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || ticket.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tickets</h1>
        <p className="text-gray-600">Manage and track project tickets</p>
      </div>

      {/* Header Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search tickets..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            {TICKET_STATUSES.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {/* Create Ticket Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Ticket</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <input
                  type="text"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({...newTicket, title: e.target.value})}
                  placeholder="Enter ticket title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="3"
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({...newTicket, description: e.target.value})}
                  placeholder="Enter ticket description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Scope</label>
                <div className="flex flex-wrap gap-2">
                  {TICKET_SCOPES.map(scope => (
                    <button
                      key={scope.value}
                      onClick={() => setNewTicket({...newTicket, scope: scope.value})}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        newTicket.scope === scope.value 
                          ? getScopeColor(scope.value)
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <div className="flex flex-wrap gap-2">
                  {PRIORITY_OPTIONS.map(priority => (
                    <button
                      key={priority.value}
                      onClick={() => setNewTicket({...newTicket, priority: priority.value})}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        newTicket.priority === priority.value 
                          ? priority.color
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {priority.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTicket}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tickets List */}
      <div className="space-y-4">
        {filteredTickets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No tickets found</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              Create your first ticket
            </button>
          </div>
        ) : (
          filteredTickets.map(ticket => (
            <div key={ticket.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{ticket.title}</h3>
                    <span className="text-sm text-gray-500">{ticket.id}</span>
                  </div>
                  <p className="text-gray-600 mb-3">{ticket.description}</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScopeColor(ticket.scope)}`}>
                      {TICKET_SCOPES.find(s => s.value === ticket.scope)?.label}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                      {PRIORITY_OPTIONS.find(p => p.value === ticket.priority)?.label}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                      {TICKET_STATUSES.find(s => s.value === ticket.status)?.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{ticket.createdAt}</span>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Tickets;