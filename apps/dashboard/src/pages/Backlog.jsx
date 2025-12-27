import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [filteredIdeas, setFilteredIdeas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Enhanced styling for the New Idea button
  const newIdeaButtonStyles = {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'translateY(0)',
    position: 'relative',
    overflow: 'hidden'
  };

  const newIdeaButtonHoverStyles = {
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 25px rgba(102, 126, 234, 0.4)',
    background: 'linear-gradient(135deg, #764ba2 0%, #667eea 100%)'
  };

  useEffect(() => {
    // Mock data for demonstration
    const mockIdeas = [
      {
        id: 1,
        title: 'Implement user authentication',
        description: 'Add login/logout functionality with JWT tokens',
        status: 'pending',
        priority: 'high',
        createdAt: '2024-01-15',
        votes: 12
      },
      {
        id: 2,
        title: 'Add dark mode toggle',
        description: 'Implement theme switching capability',
        status: 'in-progress',
        priority: 'medium',
        createdAt: '2024-01-14',
        votes: 8
      },
      {
        id: 3,
        title: 'Optimize database queries',
        description: 'Improve performance of data retrieval operations',
        status: 'completed',
        priority: 'high',
        createdAt: '2024-01-13',
        votes: 15
      }
    ];
    setIdeas(mockIdeas);
    setFilteredIdeas(mockIdeas);
  }, []);

  useEffect(() => {
    let filtered = ideas;
    
    if (searchTerm) {
      filtered = filtered.filter(idea => 
        idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        idea.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(idea => idea.status === filterStatus);
    }
    
    setFilteredIdeas(filtered);
  }, [ideas, searchTerm, filterStatus]);

  const handleNewIdea = () => {
    // Existing functionality - opens new idea modal/form
    console.log('Opening new idea form...');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-orange-100 text-orange-800';
      case 'low':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Backlog</h1>
        <Button 
          className="btn-primary enhanced-new-idea-btn"
          onClick={handleNewIdea}
          style={newIdeaButtonStyles}
          onMouseEnter={(e) => {
            Object.assign(e.target.style, newIdeaButtonHoverStyles);
          }}
          onMouseLeave={(e) => {
            Object.assign(e.target.style, newIdeaButtonStyles);
          }}
        >
          <Plus size={18} /> New Idea
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <Input
              placeholder="Search ideas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterStatus === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('all')}
            className="btn-filter"
          >
            All
          </Button>
          <Button
            variant={filterStatus === 'pending' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('pending')}
            className="btn-filter"
          >
            Pending
          </Button>
          <Button
            variant={filterStatus === 'in-progress' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('in-progress')}
            className="btn-filter"
          >
            In Progress
          </Button>
          <Button
            variant={filterStatus === 'completed' ? 'default' : 'outline'}
            onClick={() => setFilterStatus('completed')}
            className="btn-filter"
          >
            Completed
          </Button>
        </div>
      </div>

      {/* Ideas Grid */}
      <div className="grid gap-4">
        {filteredIdeas.map((idea) => (
          <Card key={idea.id} className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg font-semibold">{idea.title}</CardTitle>
                <div className="flex gap-2">
                  <Badge className={getStatusColor(idea.status)}>
                    {idea.status.replace('-', ' ')}
                  </Badge>
                  <Badge className={getPriorityColor(idea.priority)}>
                    {idea.priority}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">{idea.description}</p>
              <div className="flex justify-between items-center text-sm text-gray-500">
                <span>Created: {idea.createdAt}</span>
                <span className="flex items-center gap-1">
                  <span className="font-semibold">{idea.votes}</span>
                  <span>votes</span>
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredIdeas.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No ideas found matching your criteria.</p>
        </div>
      )}
    </div>
  );
};

export default Backlog;