import React, { useState, useEffect } from 'react';
import './Backlog.css';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [showNewIdeaForm, setShowNewIdeaForm] = useState(false);
  const [newIdea, setNewIdea] = useState({ title: '', description: '', priority: 'medium' });

  useEffect(() => {
    // Load ideas from localStorage or API
    const savedIdeas = localStorage.getItem('backlogIdeas');
    if (savedIdeas) {
      setIdeas(JSON.parse(savedIdeas));
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const idea = {
      id: Date.now(),
      ...newIdea,
      createdAt: new Date().toISOString(),
      status: 'backlog'
    };
    
    const updatedIdeas = [...ideas, idea];
    setIdeas(updatedIdeas);
    localStorage.setItem('backlogIdeas', JSON.stringify(updatedIdeas));
    
    setNewIdea({ title: '', description: '', priority: 'medium' });
    setShowNewIdeaForm(false);
  };

  const handleCancel = () => {
    setNewIdea({ title: '', description: '', priority: 'medium' });
    setShowNewIdeaForm(false);
  };

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  };

  return (
    <div className="backlog-container">
      <div className="backlog-header">
        <h1>Product Backlog</h1>
        <button 
          className="new-idea-btn"
          onClick={() => setShowNewIdeaForm(true)}
          style={{
            background: 'linear-gradient(135deg, #ff4444, #cc2222)',
            border: 'none',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)'
          }}
          onMouseEnter={(e) => {
            e.target.style.boxShadow = '0 8px 25px rgba(255, 68, 68, 0.3), 0 4px 15px rgba(0, 0, 0, 0.2)';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.target.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
            e.target.style.transform = 'translateY(0)';
          }}
        >
          + New Idea
        </button>
      </div>

      {showNewIdeaForm && (
        <div className="new-idea-form">
          <h2>Create New Idea</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="title">Title</label>
              <input
                type="text"
                id="title"
                value={newIdea.title}
                onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={newIdea.description}
                onChange={(e) => setNewIdea({ ...newIdea, description: e.target.value })}
                rows="4"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={newIdea.priority}
                onChange={(e) => setNewIdea({ ...newIdea, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            
            <div className="form-actions">
              <button type="button" onClick={handleCancel} className="btn-cancel">
                Cancel
              </button>
              <button type="submit" className="btn-submit">
                Create Idea
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="ideas-list">
        {ideas.length === 0 ? (
          <div className="empty-state">
            <p>No ideas in the backlog yet. Create your first idea!</p>
          </div>
        ) : (
          ideas.map((idea) => (
            <div key={idea.id} className="idea-card">
              <div className="idea-header">
                <h3>{idea.title}</h3>
                <span className={`priority-badge ${getPriorityClass(idea.priority)}`}>
                  {idea.priority}
                </span>
              </div>
              <p className="idea-description">{idea.description}</p>
              <div className="idea-meta">
                <span className="created-date">
                  Created: {new Date(idea.createdAt).toLocaleDateString()}
                </span>
                <span className="status-badge">{idea.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Backlog;