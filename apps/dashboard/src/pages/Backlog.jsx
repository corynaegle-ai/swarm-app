// File: Backlog.jsx - Backlog UI for quick idea capture and refinement
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiCall } from '../utils/api';
import Sidebar from '../components/Sidebar';
import {
  Lightbulb, Plus, MessageSquare, Sparkles, ArrowRight, Trash2,
  Edit3, X, Check, Send, Loader2, Filter, Clock, AlertCircle,
  ExternalLink, ChevronDown, MoreVertical
} from 'lucide-react';
import './Backlog.css';

const STATES = {
  draft: { label: 'Draft', color: '#71717a', bg: 'rgba(113, 113, 122, 0.15)' },
  chatting: { label: 'Chatting', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  refined: { label: 'Refined', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  promoted: { label: 'Promoted', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' }
};

export default function Backlog() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  // Form states
  const [quickTitle, setQuickTitle] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  
  // Chat states
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  
  // Modals
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [skipClarification, setSkipClarification] = useState(false);

  // Fetch backlog items
  const fetchItems = async () => {
    try {
      const url = filter === 'all' ? '/api/backlog' : `/api/backlog?state=${filter}`;
      const res = await apiCall(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        toast.error('Failed to load backlog items');
      }
    } catch (err) {
      toast.error('Network error loading backlog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, [filter]);


  // Create new item
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    
    setActionLoading('create');
    try {
      const res = await apiCall('/api/backlog', {
        method: 'POST',
        body: JSON.stringify({ title: quickTitle.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Idea added to backlog');
        setQuickTitle('');
        setShowQuickAdd(false);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to create item');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Update item
  const handleUpdate = async () => {
    if (!selectedItem) return;
    
    setActionLoading('update');
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          title: editTitle.trim(), 
          description: editDescription.trim() 
        })
      });
      if (res.ok) {
        toast.success('Item updated');
        setSelectedItem(null);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };


  // Delete item
  const handleDelete = async () => {
    if (!selectedItem) return;
    
    setActionLoading('delete');
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('Item deleted');
        setShowDeleteConfirm(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to delete');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Start chat refinement
  const handleStartChat = async (item) => {
    setActionLoading(`start-${item.id}`);
    try {
      const res = await apiCall(`/api/backlog/${item.id}/start-chat`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedItem(data.item);
        setChatHistory(data.item.chat_history || []);
        setChatMode(true);
        toast.success('Refinement chat started');
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to start chat');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };


  // Send chat message
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedItem) return;
    
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);
    
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: userMessage })
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.chat_history || []);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to send message');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setChatLoading(false);
    }
  };

  // End chat refinement
  const handleEndChat = async () => {
    if (!selectedItem) return;
    
    setActionLoading('end-chat');
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}/end-chat`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Refinement complete!');
        setChatMode(false);
        setSelectedItem(data.item);
        setEditTitle(data.item.title);
        setEditDescription(data.item.enriched_description || data.item.description || '');
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to end chat');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };


  // Abandon chat
  const handleAbandonChat = async () => {
    if (!selectedItem) return;
    
    setActionLoading('abandon');
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}/abandon-chat`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success('Chat abandoned, returned to draft');
        setChatMode(false);
        setSelectedItem(null);
        setChatHistory([]);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to abandon chat');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Promote to HITL session
  const handlePromote = async () => {
    if (!selectedItem) return;
    
    setActionLoading('promote');
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}/promote`, {
        method: 'POST',
        body: JSON.stringify({ skip_clarification: skipClarification })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Promoted to HITL session!');
        setShowPromoteModal(false);
        setSelectedItem(null);
        setSkipClarification(false);
        fetchItems();
        // Navigate to the new session
        if (data.session?.id) {
          navigate(`/design/${data.session.id}`);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to promote');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setActionLoading(null);
    }
  };


  // Open item for editing or viewing
  const openItem = (item) => {
    setSelectedItem(item);
    setEditTitle(item.title);
    setEditDescription(item.enriched_description || item.description || '');
    if (item.state === 'chatting') {
      setChatHistory(item.chat_history || []);
      setChatMode(true);
    } else {
      setChatMode(false);
    }
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Filter counts
  const getCounts = () => {
    const all = items.length;
    const draft = items.filter(i => i.state === 'draft').length;
    const chatting = items.filter(i => i.state === 'chatting').length;
    const refined = items.filter(i => i.state === 'refined').length;
    const promoted = items.filter(i => i.state === 'promoted').length;
    return { all, draft, chatting, refined, promoted };
  };

  const counts = getCounts();
  const filteredItems = filter === 'all' 
    ? items 
    : items.filter(i => i.state === filter);

  // Render
  return (
    <div className="page-container">
      <Sidebar />
      <main className="page-content">
        {/* Header */}
        <header className="page-header">
          <div className="header-title">
            <Lightbulb className="header-icon" />
            <h1>Backlog</h1>
            <span className="item-count">{items.length} ideas</span>
          </div>
          <button className="btn-primary" onClick={() => setShowQuickAdd(true)}>
            <Plus size={18} />
            New Idea
          </button>
        </header>


        {/* Filter Tabs */}
        <div className="filter-tabs">
          <button 
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="count">{counts.all}</span>
          </button>
          <button 
            className={`filter-tab ${filter === 'draft' ? 'active' : ''}`}
            onClick={() => setFilter('draft')}
          >
            Draft <span className="count">{counts.draft}</span>
          </button>
          <button 
            className={`filter-tab ${filter === 'chatting' ? 'active' : ''}`}
            onClick={() => setFilter('chatting')}
          >
            Chatting <span className="count">{counts.chatting}</span>
          </button>
          <button 
            className={`filter-tab ${filter === 'refined' ? 'active' : ''}`}
            onClick={() => setFilter('refined')}
          >
            Refined <span className="count">{counts.refined}</span>
          </button>
          <button 
            className={`filter-tab ${filter === 'promoted' ? 'active' : ''}`}
            onClick={() => setFilter('promoted')}
          >
            Promoted <span className="count">{counts.promoted}</span>
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="loading-state">
            <Loader2 className="spin" size={32} />
            <p>Loading backlog...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            <Lightbulb size={48} />
            <h3>No ideas yet</h3>
            <p>Start capturing ideas by clicking "New Idea" above</p>
          </div>
        ) : (
          <div className="backlog-grid">
            {filteredItems.map(item => (
              <div 
                key={item.id} 
                className="backlog-card"
                onClick={() => openItem(item)}
              >
                <div className="card-header">
                  <span 
                    className="state-badge"
                    style={{ 
                      color: STATES[item.state]?.color,
                      background: STATES[item.state]?.bg
                    }}
                  >
                    {STATES[item.state]?.label}
                  </span>
                  <span className="card-date">
                    <Clock size={12} />
                    {formatDate(item.created_at)}
                  </span>
                </div>
                <h3 className="card-title">{item.title}</h3>
                {item.description && (
                  <p className="card-desc">{item.description.slice(0, 100)}...</p>
                )}

                <div className="card-actions">
                  {item.state === 'draft' && (
                    <>
                      <button 
                        className="btn-action"
                        onClick={(e) => { e.stopPropagation(); handleStartChat(item); }}
                        disabled={actionLoading === `start-${item.id}`}
                      >
                        {actionLoading === `start-${item.id}` ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <MessageSquare size={14} />
                        )}
                        Refine
                      </button>
                      <button 
                        className="btn-action promote"
                        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowPromoteModal(true); }}
                      >
                        <ArrowRight size={14} />
                        Promote
                      </button>
                    </>
                  )}
                  {item.state === 'chatting' && (
                    <button className="btn-action chatting">
                      <MessageSquare size={14} />
                      Continue Chat
                    </button>
                  )}
                  {item.state === 'refined' && (
                    <button 
                      className="btn-action promote"
                      onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowPromoteModal(true); }}
                    >
                      <ArrowRight size={14} />
                      Promote
                    </button>
                  )}
                  {item.state === 'promoted' && item.hitl_session_id && (
                    <button 
                      className="btn-action linked"
                      onClick={(e) => { e.stopPropagation(); navigate(`/design/${item.hitl_session_id}`); }}
                    >
                      <ExternalLink size={14} />
                      View Session
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}


        {/* Quick Add Modal */}
        {showQuickAdd && (
          <div className="modal-overlay" onClick={() => setShowQuickAdd(false)}>
            <div className="modal quick-add-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3><Plus size={20} /> Quick Add Idea</h3>
                <button className="close-btn" onClick={() => setShowQuickAdd(false)}>
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleQuickAdd}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="What's your idea?"
                  value={quickTitle}
                  onChange={e => setQuickTitle(e.target.value)}
                  autoFocus
                />
                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => setShowQuickAdd(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    disabled={!quickTitle.trim() || actionLoading === 'create'}
                  >
                    {actionLoading === 'create' ? (
                      <><Loader2 size={16} className="spin" /> Adding...</>
                    ) : (
                      <>Add to Backlog</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}


        {/* Detail/Edit Modal */}
        {selectedItem && !chatMode && !showDeleteConfirm && !showPromoteModal && (
          <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
            <div className="modal detail-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="header-left">
                  <span 
                    className="state-badge"
                    style={{ 
                      color: STATES[selectedItem.state]?.color,
                      background: STATES[selectedItem.state]?.bg
                    }}
                  >
                    {STATES[selectedItem.state]?.label}
                  </span>
                  <span className="modal-date">{formatDate(selectedItem.created_at)}</span>
                </div>
                <button className="close-btn" onClick={() => setSelectedItem(null)}>
                  <X size={20} />
                </button>
              </div>
              
              {selectedItem.state !== 'promoted' ? (
                <div className="edit-form">
                  <input
                    type="text"
                    className="input-field title-input"
                    placeholder="Title"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                  />
                  <textarea
                    className="input-field desc-input"
                    placeholder="Description (optional)"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    rows={6}
                  />
                  {selectedItem.enriched_description && selectedItem.state === 'refined' && (
                    <div className="enriched-section">
                      <h4><Sparkles size={16} /> AI-Enriched Description</h4>
                      <div className="enriched-content">
                        {selectedItem.enriched_description}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="view-only">
                  <h2>{selectedItem.title}</h2>
                  <p>{selectedItem.enriched_description || selectedItem.description}</p>
                  {selectedItem.hitl_session_id && (
                    <button 
                      className="btn-primary"
                      onClick={() => navigate(`/design/${selectedItem.hitl_session_id}`)}
                    >
                      <ExternalLink size={16} />
                      Go to HITL Session
                    </button>
                  )}
                </div>
              )}

              
              {selectedItem.state !== 'promoted' && (
                <div className="modal-actions">
                  <button 
                    className="btn-danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                  <div className="action-group">
                    {selectedItem.state === 'draft' && (
                      <button 
                        className="btn-secondary"
                        onClick={() => handleStartChat(selectedItem)}
                        disabled={actionLoading}
                      >
                        <MessageSquare size={16} />
                        Start Refinement
                      </button>
                    )}
                    <button 
                      className="btn-primary"
                      onClick={handleUpdate}
                      disabled={actionLoading === 'update'}
                    >
                      {actionLoading === 'update' ? (
                        <><Loader2 size={16} className="spin" /> Saving...</>
                      ) : (
                        <><Check size={16} /> Save Changes</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        {/* Chat Refinement Modal */}
        {selectedItem && chatMode && (
          <div className="modal-overlay">
            <div className="modal chat-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="header-left">
                  <MessageSquare size={20} />
                  <h3>Refining: {selectedItem.title}</h3>
                </div>
                <button className="close-btn" onClick={() => { setChatMode(false); setSelectedItem(null); }}>
                  <X size={20} />
                </button>
              </div>
              
              <div className="chat-container">
                <div className="chat-history">
                  {chatHistory.length === 0 ? (
                    <div className="chat-empty">
                      <Sparkles size={32} />
                      <p>Start chatting to refine your idea. The AI will help you clarify and expand on it.</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div key={idx} className={`chat-message ${msg.role}`}>
                        <div className="message-content">{msg.content}</div>
                      </div>
                    ))
                  )}
                  {chatLoading && (
                    <div className="chat-message assistant loading">
                      <Loader2 className="spin" size={16} />
                      <span>AI is thinking...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                <div className="chat-input-area">
                  <input
                    type="text"
                    className="chat-input"
                    placeholder="Type your message..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    disabled={chatLoading}
                  />
                  <button 
                    className="send-btn"
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || chatLoading}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
              
              <div className="chat-actions">
                <button 
                  className="btn-danger"
                  onClick={handleAbandonChat}
                  disabled={actionLoading}
                >
                  <X size={16} />
                  Abandon
                </button>
                <button 
                  className="btn-success"
                  onClick={handleEndChat}
                  disabled={actionLoading || chatHistory.length < 2}
                >
                  {actionLoading === 'end-chat' ? (
                    <><Loader2 size={16} className="spin" /> Finishing...</>
                  ) : (
                    <><Check size={16} /> Complete Refinement</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && selectedItem && (
          <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-icon danger">
                <Trash2 size={32} />
              </div>
              <h3>Delete this idea?</h3>
              <p>This action cannot be undone. "{selectedItem.title}" will be permanently deleted.</p>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-danger"
                  onClick={handleDelete}
                  disabled={actionLoading === 'delete'}
                >
                  {actionLoading === 'delete' ? (
                    <><Loader2 size={16} className="spin" /> Deleting...</>
                  ) : (
                    <>Delete</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Promote Modal */}
        {showPromoteModal && selectedItem && (
          <div className="modal-overlay" onClick={() => setShowPromoteModal(false)}>
            <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-icon success">
                <ArrowRight size={32} />
              </div>
              <h3>Promote to HITL Session?</h3>
              <p>This will create a new Human-in-the-Loop design session from "{selectedItem.title}".</p>
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  checked={skipClarification}
                  onChange={e => setSkipClarification(e.target.checked)}
                />
                Skip clarification phase
              </label>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => { setShowPromoteModal(false); setSkipClarification(false); }}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary"
                  onClick={handlePromote}
                  disabled={actionLoading === 'promote'}
                >
                  {actionLoading === 'promote' ? (
                    <><Loader2 size={16} className="spin" /> Promoting...</>
                  ) : (
                    <><ArrowRight size={16} /> Promote</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
