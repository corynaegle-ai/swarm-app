import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Plus, GripVertical, Trash2, Edit3, Clock, User, Calendar } from 'lucide-react';
import IdeaModal from '../components/IdeaModal';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchIdeas();
  }, []);

  const fetchIdeas = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ideas');
      if (!response.ok) throw new Error('Failed to fetch ideas');
      const data = await response.json();
      setIdeas(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(ideas);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setIdeas(items);

    try {
      await fetch('/api/ideas/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideas: items })
      });
    } catch (err) {
      setError('Failed to save new order');
      fetchIdeas(); // Revert on error
    }
  };

  const handleAddIdea = () => {
    setEditingIdea(null);
    setIsModalOpen(true);
  };

  const handleEditIdea = (idea) => {
    setEditingIdea(idea);
    setIsModalOpen(true);
  };

  const handleDeleteIdea = async (id) => {
    if (!confirm('Are you sure you want to delete this idea?')) return;

    try {
      const response = await fetch(`/api/ideas/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete idea');
      setIdeas(ideas.filter(idea => idea.id !== id));
    } catch (err) {
      setError('Failed to delete idea');
    }
  };

  const handleSaveIdea = async (ideaData) => {
    try {
      const url = editingIdea ? `/api/ideas/${editingIdea.id}` : '/api/ideas';
      const method = editingIdea ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ideaData)
      });
      
      if (!response.ok) throw new Error('Failed to save idea');
      
      setIsModalOpen(false);
      fetchIdeas();
    } catch (err) {
      setError('Failed to save idea');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'in-progress': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'blocked': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Backlog</h1>
          <p className="text-gray-600">Manage and prioritize your ideas</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
            <button 
              onClick={() => setError(null)}
              className="ml-2 text-red-900 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Add New Idea Button */}
        <div className="mb-6">
          <button
            onClick={handleAddIdea}
            className="inline-flex items-center px-6 py-3 text-white font-medium rounded-lg shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            style={{
              background: 'linear-gradient(135deg, #FF4444 0%, #CC1111 100%)',
              boxShadow: '0 4px 15px rgba(255, 68, 68, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.target.style.boxShadow = '0 6px 25px rgba(255, 68, 68, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.boxShadow = '0 4px 15px rgba(255, 68, 68, 0.2)';
            }}
          >
            <Plus className="w-5 h-5 mr-2" />
            New Idea
          </button>
        </div>

        {/* Ideas List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {ideas.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Plus className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No ideas yet</h3>
              <p className="text-gray-500 mb-4">Get started by adding your first idea to the backlog.</p>
              <button
                onClick={handleAddIdea}
                className="inline-flex items-center px-4 py-2 text-white font-medium rounded-md shadow transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #FF4444 0%, #CC1111 100%)'
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Idea
              </button>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="ideas">
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className={`transition-colors duration-200 ${
                      snapshot.isDraggingOver ? 'bg-blue-50' : ''
                    }`}
                  >
                    {ideas.map((idea, index) => (
                      <Draggable key={idea.id} draggableId={idea.id.toString()} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`border-b border-gray-200 last:border-b-0 transition-all duration-200 ${
                              snapshot.isDragging ? 'shadow-lg bg-white rotate-2 scale-105' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="p-6 flex items-center space-x-4">
                              {/* Drag Handle */}
                              <div
                                {...provided.dragHandleProps}
                                className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
                              >
                                <GripVertical className="w-5 h-5" />
                              </div>

                              {/* Idea Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between mb-2">
                                  <h3 className="text-lg font-semibold text-gray-900 truncate">
                                    {idea.title}
                                  </h3>
                                  <div className="flex items-center space-x-2 ml-4">
                                    {/* Priority Badge */}
                                    {idea.priority && (
                                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        getPriorityColor(idea.priority)
                                      }`}>
                                        {idea.priority}
                                      </span>
                                    )}
                                    {/* Status Badge */}
                                    {idea.status && (
                                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        getStatusColor(idea.status)
                                      }`}>
                                        {idea.status}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                {idea.description && (
                                  <p className="text-gray-600 mb-3 line-clamp-2">
                                    {idea.description}
                                  </p>
                                )}

                                {/* Meta Information */}
                                <div className="flex items-center space-x-4 text-sm text-gray-500">
                                  {idea.assignee && (
                                    <div className="flex items-center space-x-1">
                                      <User className="w-4 h-4" />
                                      <span>{idea.assignee}</span>
                                    </div>
                                  )}
                                  {idea.estimatedHours && (
                                    <div className="flex items-center space-x-1">
                                      <Clock className="w-4 h-4" />
                                      <span>{idea.estimatedHours}h</span>
                                    </div>
                                  )}
                                  {idea.createdAt && (
                                    <div className="flex items-center space-x-1">
                                      <Calendar className="w-4 h-4" />
                                      <span>{new Date(idea.createdAt).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleEditIdea(idea)}
                                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors duration-200"
                                  title="Edit idea"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteIdea(idea.id)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors duration-200"
                                  title="Delete idea"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* Idea Modal */}
      <IdeaModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveIdea}
        idea={editingIdea}
      />
    </div>
  );
};

export default Backlog;