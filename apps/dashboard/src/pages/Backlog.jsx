import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search, Calendar, User, Tag } from 'lucide-react';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('created');

  // Mock data for development
  useEffect(() => {
    setIdeas([
      {
        id: 1,
        title: 'AI-Powered Code Review Assistant',
        description: 'Develop an AI tool that automatically reviews pull requests and provides intelligent feedback on code quality, security vulnerabilities, and best practices.',
        tags: ['AI', 'DevTools', 'Automation'],
        priority: 'high',
        status: 'backlog',
        createdAt: '2024-01-15',
        estimatedEffort: 'large',
        votes: 23
      },
      {
        id: 2,
        title: 'Real-time Collaboration Whiteboard',
        description: 'Create a collaborative whiteboard application with real-time synchronization, voice chat, and integration with popular project management tools.',
        tags: ['Collaboration', 'Real-time', 'UI/UX'],
        priority: 'medium',
        status: 'backlog',
        createdAt: '2024-01-12',
        estimatedEffort: 'medium',
        votes: 15
      },
      {
        id: 3,
        title: 'Smart Home Energy Optimizer',
        description: 'Build an IoT application that monitors and optimizes home energy consumption using machine learning algorithms and smart device integration.',
        tags: ['IoT', 'Machine Learning', 'Energy'],
        priority: 'low',
        status: 'backlog',
        createdAt: '2024-01-10',
        estimatedEffort: 'large',
        votes: 8
      }
    ]);
  }, []);

  const filteredIdeas = ideas.filter(idea => {
    const matchesSearch = idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         idea.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         idea.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterBy === 'all') return matchesSearch;
    return matchesSearch && idea.priority === filterBy;
  });

  const sortedIdeas = [...filteredIdeas].sort((a, b) => {
    switch (sortBy) {
      case 'votes':
        return b.votes - a.votes;
      case 'priority':
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      case 'created':
      default:
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getEffortIcon = (effort) => {
    switch (effort) {
      case 'small': return '🟢';
      case 'medium': return '🟡';
      case 'large': return '🔴';
      default: return '⚪';
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search ideas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filters and Sort */}
            <div className="flex gap-3">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Priorities</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="created">Sort by Date</option>
                <option value="votes">Sort by Votes</option>
                <option value="priority">Sort by Priority</option>
              </select>

              {/* New Idea Button with Updated Red Hover Shadow */}
              <button className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 transform hover:scale-105 hover:shadow-lg hover:shadow-red-500/30 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Idea
              </button>
            </div>
          </div>
        </div>

        {/* Ideas Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {sortedIdeas.map((idea) => (
            <div key={idea.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getPriorityColor(idea.priority)}`}>
                    {idea.priority}
                  </span>
                  <span className="text-lg" title={`${idea.estimatedEffort} effort`}>
                    {getEffortIcon(idea.estimatedEffort)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="text-sm font-medium">{idea.votes}</span>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                  </svg>
                </div>
              </div>

              {/* Content */}
              <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                {idea.title}
              </h3>
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                {idea.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {idea.tags.map((tag, index) => (
                  <span key={index} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(idea.createdAt).toLocaleDateString()}
                </div>
                <button className="text-blue-600 hover:text-blue-800 font-medium">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {sortedIdeas.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas found</h3>
            <p className="text-gray-500 mb-6">Try adjusting your search or filters</p>
            <button className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-6 py-2 rounded-lg font-medium transition-all duration-200 transform hover:scale-105 hover:shadow-lg hover:shadow-red-500/30 flex items-center gap-2 mx-auto">
              <Plus className="w-4 h-4" />
              Add Your First Idea
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Backlog;