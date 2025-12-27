import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import TicketCard from '../components/TicketCard';
import IdeaModal from '../components/IdeaModal';
import { getTickets } from '../services/api';

const Backlog = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showIdeaModal, setShowIdeaModal] = useState(false);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        const data = await getTickets();
        setTickets(data);
      } catch (err) {
        setError('Failed to fetch tickets');
        console.error('Error fetching tickets:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, []);

  const handleIdeaSubmit = (ideaData) => {
    // Handle new idea submission
    console.log('New idea submitted:', ideaData);
    setShowIdeaModal(false);
    // Refresh tickets or add new ticket to state
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600 text-xl">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Backlog</h1>
        <button
          onClick={() => setShowIdeaModal(true)}
          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30 transform hover:scale-105"
        >
          <Plus size={20} />
          New Idea
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>

      {tickets.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg mb-4">No tickets in backlog</div>
          <button
            onClick={() => setShowIdeaModal(true)}
            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 mx-auto transition-all duration-300 hover:shadow-lg hover:shadow-red-500/30 transform hover:scale-105"
          >
            <Plus size={20} />
            Create Your First Idea
          </button>
        </div>
      );

      {showIdeaModal && (
        <IdeaModal
          isOpen={showIdeaModal}
          onClose={() => setShowIdeaModal(false)}
          onSubmit={handleIdeaSubmit}
        />
      )}
    </div>
  );
};

export default Backlog;