import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, MoreHorizontal, Edit2, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Card } from '../components/ui/card';

const Backlog = () => {
  const [ideas, setIdeas] = useState([
    {
      id: 1,
      title: 'AI-powered code review assistant',
      description: 'Develop an intelligent system that can automatically review code commits and provide suggestions for improvements, security issues, and best practices.',
      priority: 'High',
      status: 'Active',
      votes: 23,
      comments: 5,
      createdAt: '2024-01-15',
      tags: ['AI', 'Development', 'Automation']
    },
    {
      id: 2,
      title: 'Mobile app dark mode',
      description: 'Implement a comprehensive dark mode theme for the mobile application to improve user experience during low-light conditions.',
      priority: 'Medium',
      status: 'Under Review',
      votes: 18,
      comments: 3,
      createdAt: '2024-01-14',
      tags: ['UI/UX', 'Mobile', 'Accessibility']
    },
    {
      id: 3,
      title: 'Real-time collaboration features',
      description: 'Add real-time collaborative editing capabilities similar to Google Docs, allowing multiple users to work on documents simultaneously.',
      priority: 'Low',
      status: 'Archived',
      votes: 12,
      comments: 8,
      createdAt: '2024-01-13',
      tags: ['Collaboration', 'Real-time', 'Productivity']
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  const priorities = ['All', 'High', 'Medium', 'Low'];
  const statuses = ['All', 'Active', 'Under Review', 'Archived'];

  const filteredIdeas = ideas.filter(idea => {
    const matchesSearch = idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         idea.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = filterPriority === 'All' || idea.priority === filterPriority;
    const matchesStatus = filterStatus === 'All' || idea.status === filterStatus;
    
    return matchesSearch && matchesPriority && matchesStatus;
  });

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return 'bg-red-100 text-red-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'bg-blue-100 text-blue-800';
      case 'Under Review': return 'bg-purple-100 text-purple-800';
      case 'Archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ideas Backlog</h1>
          <p className="text-gray-600 mt-1">Manage and prioritize your innovative ideas</p>
        </div>
        <button className="group relative overflow-hidden px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-300 hover:shadow-[0_10px_30px_rgba(255,68,68,0.3)] hover:scale-[1.02] hover:from-red-400 hover:to-red-500">
          <div className="relative flex items-center gap-2">
            <Plus className="w-5 h-5" />
            <span>New Idea</span>
          </div>
          <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search ideas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-[120px]">
                <Filter className="w-4 h-4 mr-2" />
                {filterPriority}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {priorities.map(priority => (
                <DropdownMenuItem
                  key={priority}
                  onClick={() => setFilterPriority(priority)}
                >
                  {priority}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-[120px]">
                <Filter className="w-4 h-4 mr-2" />
                {filterStatus}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {statuses.map(status => (
                <DropdownMenuItem
                  key={status}
                  onClick={() => setFilterStatus(status)}
                >
                  {status}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Ideas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredIdeas.map(idea => (
          <Card key={idea.id} className="p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{idea.title}</h3>
                <p className="text-gray-600 text-sm mb-3 line-clamp-3">{idea.description}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap gap-1 mb-4">
              {idea.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <Badge className={getPriorityColor(idea.priority)}>
                  {idea.priority}
                </Badge>
                <Badge className={getStatusColor(idea.status)}>
                  {idea.status}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-4">
                <span>{idea.votes} votes</span>
                <span>{idea.comments} comments</span>
              </div>
              <span>{idea.createdAt}</span>
            </div>
          </Card>
        ))}
      </div>

      {filteredIdeas.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No ideas found matching your criteria.</p>
          <p className="text-gray-400 text-sm mt-2">Try adjusting your search or filters.</p>
        </div>
      )}
    </div>
  );
};

export default Backlog;