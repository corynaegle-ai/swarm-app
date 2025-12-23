import React, { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

const STATE_CONFIG = {
  pending: {
    color: '#F59E0B',
    backgroundColor: '#FEF3C7',
    label: 'Pending'
  },
  'in-progress': {
    color: '#3B82F6',
    backgroundColor: '#DBEAFE',
    label: 'In Progress'
  },
  completed: {
    color: '#10B981',
    backgroundColor: '#D1FAE5',
    label: 'Completed'
  },
  cancelled: {
    color: '#EF4444',
    backgroundColor: '#FEE2E2',
    label: 'Cancelled'
  }
};

const PRIORITY_CONFIG = {
  high: {
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    label: 'High'
  },
  medium: {
    color: '#EA580C',
    backgroundColor: '#FED7AA',
    label: 'Medium'
  },
  low: {
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
    label: 'Low'
  }
};

const Tickets = () => {
  const [tickets, setTickets] = useState([
    {
      id: 'TKT-001',
      title: 'Update user authentication system',
      description: 'Migrate from JWT to OAuth 2.0 for better security',
      state: 'in-progress',
      priority: 'high',
      scope: 'Backend',
      assignee: 'John Doe',
      created: '2024-01-15',
      updated: '2024-01-18'
    },
    {
      id: 'TKT-002',
      title: 'Fix responsive layout issues',
      description: 'Mobile view breaking on tablet devices',
      state: 'pending',
      priority: 'medium',
      scope: 'Frontend',
      assignee: 'Jane Smith',
      created: '2024-01-16',
      updated: '2024-01-16'
    },
    {
      id: 'TKT-003',
      title: 'Database optimization',
      description: 'Improve query performance for user dashboard',
      state: 'completed',
      priority: 'low',
      scope: 'Database',
      assignee: 'Mike Johnson',
      created: '2024-01-10',
      updated: '2024-01-17'
    },
    {
      id: 'TKT-004',
      title: 'API documentation update',
      description: 'Update API docs for new endpoints',
      state: 'cancelled',
      priority: 'medium',
      scope: 'Documentation',
      assignee: 'Sarah Wilson',
      created: '2024-01-12',
      updated: '2024-01-15'
    }
  ]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    state: 'pending',
    priority: 'medium',
    scope: '',
    assignee: ''
  });

  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.assignee.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openTicketDetails = (ticket) => {
    setSelectedTicket(ticket);
    setEditForm({
      title: ticket.title,
      description: ticket.description,
      state: ticket.state,
      priority: ticket.priority,
      scope: ticket.scope,
      assignee: ticket.assignee
    });
    setIsEditMode(false);
    setIsCreating(false);
    setIsModalOpen(true);
  };

  const openCreateTicket = () => {
    setSelectedTicket(null);
    setEditForm({
      title: '',
      description: '',
      state: 'pending',
      priority: 'medium',
      scope: '',
      assignee: ''
    });
    setIsEditMode(true);
    setIsCreating(true);
    setIsModalOpen(true);
  };

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleSave = () => {
    if (isCreating) {
      const newTicket = {
        ...editForm,
        id: `TKT-${String(tickets.length + 1).padStart(3, '0')}`,
        created: new Date().toISOString().split('T')[0],
        updated: new Date().toISOString().split('T')[0]
      };
      setTickets([newTicket, ...tickets]);
    } else {
      setTickets(tickets.map(ticket => 
        ticket.id === selectedTicket.id 
          ? { ...ticket, ...editForm, updated: new Date().toISOString().split('T')[0] }
          : ticket
      ));
      setSelectedTicket({ ...selectedTicket, ...editForm });
    }
    setIsEditMode(false);
    setIsCreating(false);
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsModalOpen(false);
    } else {
      setEditForm({
        title: selectedTicket.title,
        description: selectedTicket.description,
        state: selectedTicket.state,
        priority: selectedTicket.priority,
        scope: selectedTicket.scope,
        assignee: selectedTicket.assignee
      });
    }
    setIsEditMode(false);
    setIsCreating(false);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
    setIsCreating(false);
    setSelectedTicket(null);
  };

  const renderStateBadge = (state) => {
    const config = STATE_CONFIG[state];
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium state-badge"
        style={{
          color: config.color,
          backgroundColor: config.backgroundColor
        }}
      >
        {config.label}
      </span>
    );
  };

  const renderPriorityBadge = (priority) => {
    const config = PRIORITY_CONFIG[priority];
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium state-badge"
        style={{
          color: config.color,
          backgroundColor: config.backgroundColor
        }}
      >
        {config.label}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <button
            onClick={openCreateTicket}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            New Ticket
          </button>
        </div>
        
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Search tickets... (Ctrl+K)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticket ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scope
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verify
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assignee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => openTicketDetails(ticket)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                    {ticket.id}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="max-w-xs truncate">{ticket.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {renderStateBadge(ticket.state)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ticket.scope}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {renderPriorityBadge(ticket.priority)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {/* Verify column placeholder */}
                    -
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {ticket.assignee}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {ticket.updated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket Details Modal */}
      <Transition appear show={isModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 mb-4"
                  >
                    {isCreating ? 'Create New Ticket' : `Ticket ${selectedTicket?.id}`}
                  </Dialog.Title>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Title
                      </label>
                      {isEditMode ? (
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        />
                      ) : (
                        <p className="text-gray-900">{selectedTicket?.title}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      {isEditMode ? (
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          rows={4}
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        />
                      ) : (
                        <p className="text-gray-700">{selectedTicket?.description}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State
                        </label>
                        {isEditMode ? (
                          <div className="relative">
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none pr-8"
                              value={editForm.state}
                              onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                            >
                              {Object.entries(STATE_CONFIG).map(([key, config]) => (
                                <option key={key} value={key}>{config.label}</option>
                              ))}
                            </select>
                            <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                          </div>
                        ) : (
                          renderStateBadge(selectedTicket?.state)
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Priority
                        </label>
                        {isEditMode ? (
                          <div className="relative">
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none pr-8"
                              value={editForm.priority}
                              onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                            >
                              {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                                <option key={key} value={key}>{config.label}</option>
                              ))}
                            </select>
                            <ChevronDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                          </div>
                        ) : (
                          renderPriorityBadge(selectedTicket?.priority)
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Scope
                        </label>
                        {isEditMode ? (
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            value={editForm.scope}
                            onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })}
                          />
                        ) : (
                          <p className="text-gray-900">{selectedTicket?.scope}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Assignee
                        </label>
                        {isEditMode ? (
                          <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            value={editForm.assignee}
                            onChange={(e) => setEditForm({ ...editForm, assignee: e.target.value })}
                          />
                        ) : (
                          <p className="text-gray-900">{selectedTicket?.assignee}</p>
                        )}
                      </div>
                    </div>

                    {!isCreating && (
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
                        <div>
                          <span className="font-medium">Created:</span> {selectedTicket?.created}
                        </div>
                        <div>
                          <span className="font-medium">Updated:</span> {selectedTicket?.updated}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end space-x-3">
                    {isEditMode ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          onClick={handleCancel}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          onClick={handleSave}
                        >
                          {isCreating ? 'Create' : 'Save'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="inline-flex justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          onClick={closeModal}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          onClick={handleEdit}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default Tickets;