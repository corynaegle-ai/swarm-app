import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search, Calendar, User, Tag } from 'lucide-react';
import './Backlog.css';

const Backlog = () => {
  const [ideas, setIdeas] = useState([]);
  const [filteredIdeas, setFilteredIdeas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [showNewIdeaModal, setShowNewIdeaModal] = useState(false);

  const [newIdea, setNewIdea] = useState({
    title: '',
    description: '',
    category: 'feature',
    priority: 'medium',
    tags: []
  });

  useEffect(() => {
    // Mock data - in real app would fetch from API
    const mockIdeas = [
      {
        id: 1,
        title: 'Dark Mode Support',
        description: 'Add dark mode theme option for better user experience',
        category: 'feature',
        priority: 'high',
        status: 'pending',
        author: 'John Doe',
        createdAt: '2024-01-15',
        tags: ['UI', 'UX', 'theme']
      },
      {
        id: 2,
        title: 'Mobile App Optimization',
        description: 'Improve mobile responsiveness and performance',
        category: 'enhancement',
        priority: 'medium',
        status: 'in-progress',
        author: 'Jane Smith',
        createdAt: '2024-01-10',
        tags: ['mobile', 'performance']
      },
      {
        id: 3,
        title: 'API Documentation',
        description: 'Create comprehensive API documentation with examples',
        category: 'documentation',
        priority: 'low',
        status: 'completed',
        author: 'Mike Johnson',
        createdAt: '2024-01-05',
        tags: ['docs', 'API']
      }
    ];
    setIdeas(mockIdeas);
    setFilteredIdeas(mockIdeas);
  }, []);

  useEffect(() => {
    let filtered = ideas.filter(idea => {
      const matchesSearch = idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           idea.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           idea.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = filterStatus === 'all' || idea.status === filterStatus;
      return matchesSearch && matchesFilter;
    });

    // Sort ideas
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'title':
          return a.title.localeCompare(b.title);
        case 'date':
        default:
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });

    setFilteredIdeas(filtered);
  }, [ideas, searchTerm, filterStatus, sortBy]);

  const handleNewIdea = (e) => {
    e.preventDefault();
    const idea = {
      id: Date.now(),
      ...newIdea,
      status: 'pending',
      author: 'Current User',
      createdAt: new Date().toISOString().split('T')[0],
      tags: newIdea.tags.filter(tag => tag.trim() !== '')
    };
    
    setIdeas(prev => [idea, ...prev]);
    setNewIdea({
      title: '',
      description: '',
      category: 'feature',
      priority: 'medium',
      tags: []
    });
    setShowNewIdeaModal(false);
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#6b7280';
      case 'in-progress': return '#3b82f6';
      case 'completed': return '#10b981';
      default: return '#6b7280';
    }
  };

  const styles = {
    container: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: '#f8fafc',
      minHeight: '100vh'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '30px',
      paddingBottom: '20px',
      borderBottom: '2px solid #e2e8f0'
    },
    title: {
      fontSize: '2.5rem',
      fontWeight: 'bold',
      color: '#1e293b',
      margin: 0
    },
    newIdeaButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #ff4444 0%, #cc2200 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 4px 12px rgba(255, 68, 68, 0.2)'
    },
    newIdeaButtonHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 20px rgba(255, 68, 68, 0.3)'
    },
    controls: {
      display: 'flex',
      gap: '20px',
      marginBottom: '30px',
      flexWrap: 'wrap',
      alignItems: 'center'
    },
    searchContainer: {
      position: 'relative',
      flex: '1',
      minWidth: '300px'
    },
    searchInput: {
      width: '100%',
      padding: '12px 16px 12px 44px',
      border: '2px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '16px',
      outline: 'none',
      transition: 'border-color 0.2s ease',
      backgroundColor: 'white'
    },
    searchIcon: {
      position: 'absolute',
      left: '14px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#6b7280',
      width: '20px',
      height: '20px'
    },
    filterSelect: {
      padding: '12px 16px',
      border: '2px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '16px',
      backgroundColor: 'white',
      cursor: 'pointer',
      outline: 'none'
    },
    sortSelect: {
      padding: '12px 16px',
      border: '2px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '16px',
      backgroundColor: 'white',
      cursor: 'pointer',
      outline: 'none'
    },
    ideasGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
      gap: '24px'
    },
    ideaCard: {
      backgroundColor: 'white',
      padding: '24px',
      borderRadius: '12px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
      border: '1px solid #e2e8f0',
      transition: 'all 0.2s ease',
      cursor: 'pointer'
    },
    ideaCardHover: {
      transform: 'translateY(-4px)',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1)'
    },
    ideaHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px'
    },
    ideaTitle: {
      fontSize: '1.25rem',
      fontWeight: '600',
      color: '#1e293b',
      margin: 0,
      lineHeight: '1.4'
    },
    priorityBadge: {
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      color: 'white',
      textTransform: 'uppercase'
    },
    ideaDescription: {
      color: '#64748b',
      marginBottom: '16px',
      lineHeight: '1.6'
    },
    ideaFooter: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: '16px',
      borderTop: '1px solid #f1f5f9'
    },
    ideaMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      fontSize: '14px',
      color: '#64748b'
    },
    statusBadge: {
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      color: 'white',
      textTransform: 'capitalize'
    },
    tags: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px',
      flexWrap: 'wrap'
    },
    tag: {
      padding: '4px 8px',
      backgroundColor: '#f1f5f9',
      color: '#475569',
      borderRadius: '4px',
      fontSize: '12px'
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modalContent: {
      backgroundColor: 'white',
      padding: '32px',
      borderRadius: '12px',
      width: '90%',
      maxWidth: '600px',
      maxHeight: '90vh',
      overflowY: 'auto'
    },
    modalHeader: {
      fontSize: '1.5rem',
      fontWeight: '600',
      marginBottom: '24px',
      color: '#1e293b'
    },
    formGroup: {
      marginBottom: '20px'
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151'
    },
    input: {
      width: '100%',
      padding: '12px',
      border: '2px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '16px',
      outline: 'none',
      transition: 'border-color 0.2s ease'
    },
    textarea: {
      width: '100%',
      padding: '12px',
      border: '2px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '16px',
      outline: 'none',
      transition: 'border-color 0.2s ease',
      minHeight: '120px',
      resize: 'vertical'
    },
    select: {
      width: '100%',
      padding: '12px',
      border: '2px solid #e2e8f0',
      borderRadius: '8px',
      fontSize: '16px',
      backgroundColor: 'white',
      cursor: 'pointer',
      outline: 'none'
    },
    modalButtons: {
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end',
      marginTop: '24px'
    },
    button: {
      padding: '12px 24px',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      border: 'none',
      transition: 'all 0.2s ease'
    },
    primaryButton: {
      backgroundColor: '#3b82f6',
      color: 'white'
    },
    secondaryButton: {
      backgroundColor: '#e2e8f0',
      color: '#64748b'
    },
    noResults: {
      textAlign: 'center',
      padding: '60px 20px',
      color: '#64748b'
    },
    noResultsTitle: {
      fontSize: '1.25rem',
      fontWeight: '600',
      marginBottom: '8px'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Ideas Backlog</h1>
        <button
          style={styles.newIdeaButton}
          onClick={() => setShowNewIdeaModal(true)}
          onMouseEnter={(e) => {
            Object.assign(e.target.style, styles.newIdeaButtonHover);
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 4px 12px rgba(255, 68, 68, 0.2)';
          }}
        >
          <Plus size={20} />
          New Idea
        </button>
      </div>

      <div style={styles.controls}>
        <div style={styles.searchContainer}>
          <Search style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search ideas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={styles.sortSelect}
        >
          <option value="date">Sort by Date</option>
          <option value="priority">Sort by Priority</option>
          <option value="title">Sort by Title</option>
        </select>
      </div>

      {filteredIdeas.length === 0 ? (
        <div style={styles.noResults}>
          <div style={styles.noResultsTitle}>No ideas found</div>
          <p>Try adjusting your search or filters, or create a new idea!</p>
        </div>
      ) : (
        <div style={styles.ideasGrid}>
          {filteredIdeas.map((idea) => (
            <div
              key={idea.id}
              style={styles.ideaCard}
              onMouseEnter={(e) => {
                Object.assign(e.currentTarget.style, styles.ideaCardHover);
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.05)';
              }}
            >
              <div style={styles.ideaHeader}>
                <h3 style={styles.ideaTitle}>{idea.title}</h3>
                <span
                  style={{
                    ...styles.priorityBadge,
                    backgroundColor: getPriorityColor(idea.priority)
                  }}
                >
                  {idea.priority}
                </span>
              </div>
              
              <p style={styles.ideaDescription}>{idea.description}</p>
              
              {idea.tags.length > 0 && (
                <div style={styles.tags}>
                  {idea.tags.map((tag, index) => (
                    <span key={index} style={styles.tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              
              <div style={styles.ideaFooter}>
                <div style={styles.ideaMeta}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={14} />
                    {idea.author}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={14} />
                    {idea.createdAt}
                  </span>
                </div>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(idea.status)
                  }}
                >
                  {idea.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewIdeaModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalHeader}>Create New Idea</h2>
            
            <form onSubmit={handleNewIdea}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Title *</label>
                <input
                  type="text"
                  value={newIdea.title}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, title: e.target.value }))}
                  required
                  style={styles.input}
                  placeholder="Enter idea title"
                />
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Description *</label>
                <textarea
                  value={newIdea.description}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, description: e.target.value }))}
                  required
                  style={styles.textarea}
                  placeholder="Describe your idea in detail"
                />
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Category</label>
                <select
                  value={newIdea.category}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, category: e.target.value }))}
                  style={styles.select}
                >
                  <option value="feature">Feature</option>
                  <option value="enhancement">Enhancement</option>
                  <option value="bug">Bug Fix</option>
                  <option value="documentation">Documentation</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Priority</label>
                <select
                  value={newIdea.priority}
                  onChange={(e) => setNewIdea(prev => ({ ...prev, priority: e.target.value }))}
                  style={styles.select}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={newIdea.tags.join(', ')}
                  onChange={(e) => setNewIdea(prev => ({ 
                    ...prev, 
                    tags: e.target.value.split(',').map(tag => tag.trim()) 
                  }))}
                  style={styles.input}
                  placeholder="UI, UX, performance, etc."
                />
              </div>
              
              <div style={styles.modalButtons}>
                <button
                  type="button"
                  onClick={() => setShowNewIdeaModal(false)}
                  style={{ ...styles.button, ...styles.secondaryButton }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...styles.button, ...styles.primaryButton }}
                >
                  Create Idea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backlog;