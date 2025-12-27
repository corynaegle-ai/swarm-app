import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAPI } from '../hooks/useAPI';
import Modal from '../components/Modal';
import IdeaForm from '../components/IdeaForm';
import IdeaCard from '../components/IdeaCard';
import './Backlog.css';

function Backlog() {
  const { user } = useAuth();
  const api = useAPI();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState(null);

  useEffect(() => {
    fetchIdeas();
  }, []);

  const fetchIdeas = async () => {
    try {
      setLoading(true);
      const response = await api.get('/ideas/backlog');
      setIdeas(response.data || []);
    } catch (err) {
      setError('Failed to fetch ideas');
      console.error('Error fetching ideas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIdea = async (ideaData) => {
    try {
      const response = await api.post('/ideas', ideaData);
      setIdeas(prev => [response.data, ...prev]);
      setShowNewIdeaModal(false);
    } catch (err) {
      console.error('Error creating idea:', err);
      throw err;
    }
  };

  const handleUpdateIdea = async (ideaData) => {
    try {
      const response = await api.put(`/ideas/${editingIdea.id}`, ideaData);
      setIdeas(prev => prev.map(idea => 
        idea.id === editingIdea.id ? response.data : idea
      ));
      setEditingIdea(null);
    } catch (err) {
      console.error('Error updating idea:', err);
      throw err;
    }
  };

  const handleDeleteIdea = async (ideaId) => {
    try {
      await api.delete(`/ideas/${ideaId}`);
      setIdeas(prev => prev.filter(idea => idea.id !== ideaId));
    } catch (err) {
      console.error('Error deleting idea:', err);
    }
  };

  const handleEditClick = (idea) => {
    setEditingIdea(idea);
  };

  if (loading) {
    return (
      <div className="backlog-page">
        <div className="loading-spinner">Loading ideas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="backlog-page">
        <div className="error-message">{error}</div>
        <button onClick={fetchIdeas} className="retry-btn">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="backlog-page">
      <div className="backlog-header">
        <h1>Idea Backlog</h1>
        <button
          className="new-idea-btn"
          onClick={() => setShowNewIdeaModal(true)}
          style={{
            background: 'linear-gradient(135deg, #ff4444 0%, #cc2200 100%)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 12px rgba(255, 68, 68, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
          }}
        >
          + New Idea
        </button>
      </div>

      <div className="ideas-grid">
        {ideas.length === 0 ? (
          <div className="empty-state">
            <h3>No ideas yet</h3>
            <p>Start by creating your first idea!</p>
          </div>
        ) : (
          ideas.map(idea => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              onEdit={() => handleEditClick(idea)}
              onDelete={() => handleDeleteIdea(idea.id)}
            />
          ))
        )}
      </div>

      {showNewIdeaModal && (
        <Modal 
          title="Create New Idea" 
          onClose={() => setShowNewIdeaModal(false)}
        >
          <IdeaForm 
            onSubmit={handleCreateIdea}
            onCancel={() => setShowNewIdeaModal(false)}
          />
        </Modal>
      )}

      {editingIdea && (
        <Modal 
          title="Edit Idea" 
          onClose={() => setEditingIdea(null)}
        >
          <IdeaForm 
            idea={editingIdea}
            onSubmit={handleUpdateIdea}
            onCancel={() => setEditingIdea(null)}
          />
        </Modal>
      )}
    </div>
  );
}

export default Backlog;