import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);

  // Mock data for demonstration
  useEffect(() => {
    setIdeas([
      {
        id: 1,
        title: 'Implement Dark Mode',
        description: 'Add dark mode toggle to improve user experience',
        status: 'pending',
        priority: 'high',
        createdAt: '2024-01-15',
        votes: 12
      },
      {
        id: 2,
        title: 'Mobile App Optimization',
        description: 'Optimize mobile app performance and loading times',
        status: 'in-progress',
        priority: 'medium',
        createdAt: '2024-01-14',
        votes: 8
      },
      {
        id: 3,
        title: 'Advanced Analytics Dashboard',
        description: 'Create comprehensive analytics with charts and metrics',
        status: 'completed',
        priority: 'low',
        createdAt: '2024-01-13',
        votes: 15
      }
    ]);
  }, []);

  const filteredIdeas = ideas.filter(idea => {
    const matchesSearch = idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         idea.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || idea.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleNewIdea = () => {
    setShowNewIdeaModal(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Idea Backlog</h1>
          <p className="text-gray-600">Manage and track your product ideas and feature requests</p>
        </div>

        {/* Action Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search ideas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
                />
              </div>

              {/* Filter */}
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              </div>
            </div>

            {/* New Idea Button */}
            <button
              onClick={handleNewIdea}
              style={{
                background: 'linear-gradient(135deg, #ff4444 0%, #cc2200 100%)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                fontWeight: '600',
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(204, 34, 0, 0.1)'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(255, 68, 68, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 2px 4px rgba(204, 34, 0, 0.1)';
              }}
            >
              <Plus className="w-4 h-4" />
              New Idea
            </button>
          </div>
        </div>

        {/* Ideas Grid */}
        <div className="grid gap-4">
          <AnimatePresence>
            {filteredIdeas.map((idea) => (
              <motion.div
                key={idea.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{idea.title}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(idea.status)}`}>
                        {idea.status.replace('-', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-3">{idea.description}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Created: {idea.createdAt}</span>
                      <span className={`font-medium ${getPriorityColor(idea.priority)}`}>
                        {idea.priority.toUpperCase()} Priority
                      </span>
                      <span className="flex items-center gap-1">
                        <span>👍</span>
                        {idea.votes}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredIdeas.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">No ideas found</div>
            <p className="text-gray-500">Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>

      {/* New Idea Modal Placeholder */}
      {showNewIdeaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">New Idea</h2>
            <p className="text-gray-600 mb-4">Modal content would go here...</p>
            <button
              onClick={() => setShowNewIdeaModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backlog;