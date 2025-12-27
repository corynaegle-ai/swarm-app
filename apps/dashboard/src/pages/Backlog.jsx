import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search } from 'lucide-react';
import { useTickets } from '../hooks/useTickets';
import { useToast } from '../contexts/ToastContext';
import TicketCard from '../components/TicketCard';
import CreateTicketModal from '../components/CreateTicketModal';

const Backlog = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { tickets, loading, error, fetchTickets, createTicket, updateTicket, deleteTicket } = useTickets();
  const { showToast } = useToast();

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || ticket.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleCreateTicket = async (ticketData) => {
    try {
      await createTicket(ticketData);
      setShowCreateModal(false);
      showToast('Ticket created successfully', 'success');
    } catch (err) {
      showToast('Failed to create ticket', 'error');
    }
  };

  const handleUpdateTicket = async (id, updates) => {
    try {
      await updateTicket(id, updates);
      showToast('Ticket updated successfully', 'success');
    } catch (err) {
      showToast('Failed to update ticket', 'error');
    }
  };

  const handleDeleteTicket = async (id) => {
    try {
      await deleteTicket(id);
      showToast('Ticket deleted successfully', 'success');
    } catch (err) {
      showToast('Failed to delete ticket', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Backlog</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="enhanced-new-idea-btn"
          style={{
            background: 'linear-gradient(135deg, #ff4444 0%, #cc2200 100%)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 15px rgba(255, 68, 68, 0.4)',
            transition: 'all 0.3s ease',
            transform: 'translateY(0)',
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 8px 25px rgba(255, 68, 68, 0.6)';
            e.target.style.background = 'linear-gradient(135deg, #ff6666 0%, #dd3300 100%)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 15px rgba(255, 68, 68, 0.4)';
            e.target.style.background = 'linear-gradient(135deg, #ff4444 0%, #cc2200 100%)';
          }}
        >
          <Plus size={18} />
          New Idea
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search tickets..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-gray-400" />
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredTickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onUpdate={handleUpdateTicket}
            onDelete={handleDeleteTicket}
          />
        ))}
      </div>

      {filteredTickets.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg mb-4">
            {searchTerm || filterStatus !== 'all' ? 'No tickets match your filters' : 'No tickets yet'}
          </div>
          {!searchTerm && filterStatus === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              <Plus size={18} />
              Create your first ticket
            </button>
          )}
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <CreateTicketModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTicket}
        />
      )}
    </div>
  );
};

export default Backlog;