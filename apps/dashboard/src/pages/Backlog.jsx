import React, { useState, useEffect } from 'react';
import { PlusIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import TicketModal from '../components/TicketModal';
import TicketCard from '../components/TicketCard';

const priorityColors = {
  'High': 'text-red-400 bg-red-400/10 border-red-400/20',
  'Medium': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Low': 'text-green-400 bg-green-400/10 border-green-400/20'
};

const statusColors = {
  'Open': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  'In Progress': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  'Done': 'text-green-400 bg-green-400/10 border-green-400/20',
  'Closed': 'text-gray-400 bg-gray-400/10 border-gray-400/20'
};

export default function Backlog() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, sortBy, sortOrder]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('tickets')
        .select(`
          *,
          profiles:assigned_to(username),
          creator:profiles!tickets_created_by_fkey(username)
        `)
        .eq('project_id', user.project_id);

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      const { data, error } = await query;

      if (error) throw error;
      setTickets(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTicketCreated = () => {
    fetchTickets();
    setShowModal(false);
  };

  const handleTicketUpdated = () => {
    fetchTickets();
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (filterStatus !== 'all' && ticket.status !== filterStatus) {
      return false;
    }
    if (filterPriority !== 'all' && ticket.priority !== filterPriority) {
      return false;
    }
    return true;
  });

  const getSortIcon = (field) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? 
      <ChevronUpIcon className="h-4 w-4" /> : 
      <ChevronDownIcon className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 text-center p-4">
        Error loading tickets: {error}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Backlog</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 hover:from-red-600 hover:to-red-700 hover:shadow-[0_0_20px_rgba(255,68,68,0.3)] hover:scale-105"
        >
          <PlusIcon className="h-5 w-5" />
          New Idea
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-700 text-white rounded px-3 py-1 text-sm border border-gray-600 focus:border-cyan-400 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Priority:</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-gray-700 text-white rounded px-3 py-1 text-sm border border-gray-600 focus:border-cyan-400 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="text-left p-4 text-gray-300 font-medium">
                  <button
                    onClick={() => toggleSort('id')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    ID {getSortIcon('id')}
                  </button>
                </th>
                <th className="text-left p-4 text-gray-300 font-medium">
                  <button
                    onClick={() => toggleSort('title')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Title {getSortIcon('title')}
                  </button>
                </th>
                <th className="text-left p-4 text-gray-300 font-medium">
                  <button
                    onClick={() => toggleSort('status')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Status {getSortIcon('status')}
                  </button>
                </th>
                <th className="text-left p-4 text-gray-300 font-medium">
                  <button
                    onClick={() => toggleSort('priority')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Priority {getSortIcon('priority')}
                  </button>
                </th>
                <th className="text-left p-4 text-gray-300 font-medium">
                  <button
                    onClick={() => toggleSort('assigned_to')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Assignee {getSortIcon('assigned_to')}
                  </button>
                </th>
                <th className="text-left p-4 text-gray-300 font-medium">
                  <button
                    onClick={() => toggleSort('created_at')}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    Created {getSortIcon('created_at')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onUpdate={handleTicketUpdated}
                  priorityColors={priorityColors}
                  statusColors={statusColors}
                />
              ))}
            </tbody>
          </table>
        </div>

        {filteredTickets.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>No tickets found.</p>
            <p className="text-sm mt-2">Create your first ticket to get started!</p>
          </div>
        )}
      </div>

      {showModal && (
        <TicketModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onTicketCreated={handleTicketCreated}
        />
      )}
    </div>
  );
}