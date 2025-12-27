import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Calendar, User, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Backlog = () => {
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState([]);
  const [filteredIdeas, setFilteredIdeas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created');
  const [sortOrder, setSortOrder] = useState('desc');

  // Mock data - replace with actual API call
  useEffect(() => {
    const mockIdeas = [
      {
        id: 1,
        title: "Implement dark mode",
        description: "Add dark mode support to improve user experience",
        status: "pending",
        priority: "high",
        author: "John Doe",
        created: "2024-01-15",
        votes: 15
      },
      {
        id: 2,
        title: "Mobile app optimization",
        description: "Optimize the mobile app for better performance",
        status: "in-progress",
        priority: "medium",
        author: "Jane Smith",
        created: "2024-01-10",
        votes: 8
      },
      {
        id: 3,
        title: "User analytics dashboard",
        description: "Create comprehensive analytics for user behavior",
        status: "completed",
        priority: "low",
        author: "Mike Johnson",
        created: "2024-01-08",
        votes: 23
      }
    ];
    setIdeas(mockIdeas);
    setFilteredIdeas(mockIdeas);
  }, []);

  // Filter and search logic
  useEffect(() => {
    let filtered = ideas.filter(idea => {
      const matchesSearch = idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          idea.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || idea.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || idea.priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });

    // Sort logic
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'votes':
          aVal = a.votes;
          bVal = b.votes;
          break;
        case 'priority':
          const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          aVal = priorityOrder[a.priority];
          bVal = priorityOrder[b.priority];
          break;
        case 'created':
        default:
          aVal = new Date(a.created);
          bVal = new Date(b.created);
          break;
      }
      
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    setFilteredIdeas(filtered);
  }, [ideas, searchTerm, statusFilter, priorityFilter, sortBy, sortOrder]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-blue-600 bg-blue-100';
      case 'in-progress': return 'text-orange-600 bg-orange-100';
      case 'completed': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const handleCreateIdea = () => {
    navigate('/ideas/new');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Backlog</h1>
        <button 
          onClick={handleCreateIdea}
          className="btn-primary new-idea-btn"
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
            boxShadow: '0 4px 15px 0 rgba(102, 126, 234, 0.4)',
            transition: 'all 0.3s ease',
            transform: 'translateY(0)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px) scale(1.02)';
            e.target.style.boxShadow = '0 8px 25px 0 rgba(102, 126, 234, 0.6)';
            e.target.style.background = 'linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0) scale(1)';
            e.target.style.boxShadow = '0 4px 15px 0 rgba(102, 126, 234, 0.4)';
            e.target.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          }}
        >
          <Plus size={18} /> New Idea
        </button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search ideas..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Status Filter */}
          <div className="min-w-32">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          
          {/* Priority Filter */}
          <div className="min-w-32">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          
          {/* Sort By */}
          <div className="min-w-32">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortBy(field);
                setSortOrder(order);
              }}
            >
              <option value="created-desc">Newest First</option>
              <option value="created-asc">Oldest First</option>
              <option value="votes-desc">Most Votes</option>
              <option value="votes-asc">Least Votes</option>
              <option value="priority-desc">High Priority</option>
              <option value="priority-asc">Low Priority</option>
            </select>
          </div>
        </div>
      </div>

      {/* Ideas List */}
      <div className="space-y-4">
        {filteredIdeas.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-400 mb-4">
              <Filter size={48} className="mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas found</h3>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </div>
        ) : (
          filteredIdeas.map((idea) => (
            <div key={idea.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{idea.title}</h3>
                  <p className="text-gray-600 mb-4">{idea.description}</p>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <User size={16} className="mr-1" />
                      {idea.author}
                    </div>
                    <div className="flex items-center">
                      <Calendar size={16} className="mr-1" />
                      {new Date(idea.created).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <span className="font-medium">{idea.votes} votes</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(idea.priority)}`}>
                    {idea.priority}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(idea.status)}`}>
                    {idea.status.replace('-', ' ')}
                  </span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <div className="flex space-x-2">
                  <button className="btn-secondary text-sm">View Details</button>
                  <button className="btn-secondary text-sm">Edit</button>
                </div>
                <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                  Vote Up ↑
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Backlog;