import React, { useState, useEffect } from 'react';
import { Plus, Clock, Target, Lightbulb } from 'lucide-react';
import IdeaCard from '../components/IdeaCard';
import NewIdeaModal from '../components/NewIdeaModal';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // Mock data for demonstration
    const mockIdeas = [
      {
        id: 1,
        title: 'AI-Powered Customer Service Bot',
        description: 'Implement an intelligent chatbot to handle basic customer inquiries and reduce support ticket volume.',
        priority: 'high',
        status: 'backlog',
        tags: ['AI', 'Customer Service', 'Automation'],
        estimatedHours: 120,
        createdAt: new Date('2024-01-15')
      },
      {
        id: 2,
        title: 'Mobile App Dark Mode',
        description: 'Add dark mode support to improve user experience and reduce eye strain during night usage.',
        priority: 'medium',
        status: 'backlog',
        tags: ['UI/UX', 'Mobile', 'Accessibility'],
        estimatedHours: 40,
        createdAt: new Date('2024-01-10')
      },
      {
        id: 3,
        title: 'Data Analytics Dashboard',
        description: 'Create comprehensive analytics dashboard for business intelligence and reporting.',
        priority: 'high',
        status: 'in-progress',
        tags: ['Analytics', 'Dashboard', 'BI'],
        estimatedHours: 200,
        createdAt: new Date('2024-01-05')
      }
    ];
    setIdeas(mockIdeas);
  }, []);

  const handleAddIdea = (newIdea) => {
    const idea = {
      ...newIdea,
      id: Date.now(),
      status: 'backlog',
      createdAt: new Date()
    };
    setIdeas([...ideas, idea]);
    setShowModal(false);
  };

  const filteredIdeas = ideas.filter(idea => {
    if (filter === 'all') return true;
    return idea.status === filter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'backlog': return 'bg-gray-100 text-gray-700';
      case 'in-progress': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Idea Backlog</h1>
          <p className="text-gray-600">Manage and prioritize your product ideas</p>
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              All Ideas
            </button>
            <button
              onClick={() => setFilter('backlog')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'backlog' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Backlog
            </button>
            <button
              onClick={() => setFilter('in-progress')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'in-progress' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              In Progress
            </button>
          </div>
          
          <button
            onClick={() => setShowModal(true)}
            className="group relative px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-red-500/30 active:scale-95"
          >
            <div className="flex items-center space-x-2">
              <Plus className="w-5 h-5" />
              <span>New Idea</span>
            </div>
            {/* Subtle glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-600 rounded-lg opacity-0 group-hover:opacity-20 transition-opacity duration-200 blur-sm"></div>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Ideas</p>
                <p className="text-2xl font-bold text-gray-900">{ideas.length}</p>
              </div>
              <Lightbulb className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">In Backlog</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ideas.filter(idea => idea.status === 'backlog').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ideas.filter(idea => idea.status === 'in-progress').length}
                </p>
              </div>
              <Target className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">High Priority</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ideas.filter(idea => idea.priority === 'high').length}
                </p>
              </div>
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ideas Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIdeas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>

        {filteredIdeas.length === 0 && (
          <div className="text-center py-12">
            <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas found</h3>
            <p className="text-gray-600 mb-6">
              {filter === 'all' ? 'Start by adding your first idea!' : `No ideas in ${filter} status.`}
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg shadow-lg transform transition-all duration-200 hover:scale-105 hover:shadow-xl hover:shadow-red-500/30 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span>Add Your First Idea</span>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <NewIdeaModal
          onClose={() => setShowModal(false)}
          onSubmit={handleAddIdea}
        />
      )}
    </div>
  );
};

export default Backlog;