// File: Backlog.jsx - Backlog UI for quick idea capture and refinement
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiCall } from '../utils/api';
import Sidebar from '../components/Sidebar';
import {
  Lightbulb, Plus, MessageSquare, Sparkles, ArrowRight, Trash2,
  Edit3, X, Check, Send, Loader2, Filter, Clock, AlertCircle, Database,
  ExternalLink, ChevronDown, MoreVertical, Paperclip, Upload, Link2, FileText, Image, GitBranch
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
  const [repos, setRepos] = useState([]);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState('');
  const [chatMode, setChatMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [counts, setCounts] = useState({ all: 0, draft: 0, chatting: 0, refined: 0, promoted: 0 });

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
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [showUnpromoteConfirm, setShowUnpromoteConfirm] = useState(false);
  const [skipClarification, setSkipClarification] = useState(false);

  // Attachment states
  const [attachments, setAttachments] = useState([]);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [attachmentTab, setAttachmentTab] = useState("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  // Fetch backlog items
  const fetchItems = async () => {
    try {
      const url = `/api/backlog?state=${filter}`; // Always pass state, including 'all'
      const res = await apiCall(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        if (data.stateCounts) setCounts(data.stateCounts);
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

  // Fetch available repos for selection
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await apiCall('/api/backlog/repos');
        if (res.ok) {
          const data = await res.json();
          setRepos(data.repos || []);
        }
      } catch (err) {
        console.error('Failed to fetch repos:', err);
      }
    };
    fetchRepos();
  }, []);


  // Create new item
  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    
    setActionLoading('create');
    try {
      const res = await apiCall('/api/backlog', {
        method: 'POST',
        body: JSON.stringify({ title: quickTitle.trim(), repo_url: selectedRepoUrl || null })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Idea added to backlog');
        setQuickTitle('');
        setSelectedRepoUrl('');
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
        method: 'PATCH',
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
    if (!chatInput.trim() || !selectedItem || chatLoading) return;
    
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

  // Unpromote - abandon HITL session and return to draft
  const handleUnpromote = async () => {
    if (!selectedItem) return;
    
    setActionLoading('unpromote');
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}/unpromote`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success('HITL session abandoned, returned to draft');
        setShowUnpromoteConfirm(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to unpromote');
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

  const filteredItems = items; // Server already filters based on state

  // Render

  // ============================================================================
  // ATTACHMENT HANDLERS
  // ============================================================================

  // Fetch attachments when item selected
  useEffect(() => {
    if (selectedItem) {
      fetchAttachments(selectedItem.id);
    } else {
      setAttachments([]);
    }
  }, [selectedItem?.id]);

  const fetchAttachments = async (itemId) => {
    try {
      const res = await apiCall(`/api/backlog/${itemId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.attachments || []);
      }
    } catch (err) {
      console.error('Failed to fetch attachments:', err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem) return;
    
    // Check file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 10MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setUploadProgress(10);
      
      const res = await apiCall(`/api/backlog/${selectedItem.id}/attachments/file`, {
        method: 'POST',
        body: formData  // apiCall now handles FormData correctly
      });
      
      setUploadProgress(90);
      
      if (res.ok) {
        const data = await res.json();
        setAttachments(prev => [data.attachment, ...prev]);
        toast.success('File uploaded');
        setShowAttachmentModal(false);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Upload failed');
      }
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim() || !selectedItem) return;
    
    try {
      const res = await apiCall(`/api/backlog/${selectedItem.id}/attachments/link`, {
        method: 'POST',
        body: JSON.stringify({ url: linkUrl, name: linkName })
      });
      
      if (res.ok) {
        const data = await res.json();
        setAttachments(prev => [data.attachment, ...prev]);
        toast.success('Link added');
        setLinkUrl('');
        setLinkName('');
        setShowAttachmentModal(false);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to add link');
      }
    } catch (err) {
      toast.error('Failed to add link');
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!selectedItem) return;
    
    try {
      const res = await apiCall(
        `/api/backlog/${selectedItem.id}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      );
      
      if (res.ok) {
        setAttachments(prev => prev.filter(a => a.id !== attachmentId));
        toast.success('Attachment removed');
      }
    } catch (err) {
      toast.error('Failed to remove attachment');
    }
  };

  const getAttachmentIcon = (attachment) => {
    switch (attachment.attachment_type) {
      case 'git_link': return <GitBranch size={16} />;
      case 'external_link': return <ExternalLink size={16} />;
      case 'file':
        if (attachment.mime_type?.startsWith('image/')) return <Image size={16} />;
        return <FileText size={16} />;
      default: return <Paperclip size={16} />;
    }
  };

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
                <div className="repo-selector">
                  <label className="repo-label">
                    <Database size={14} />
                    Repository (optional)
                  </label>
                  <select
                    className="input-field"
                    value={selectedRepoUrl}
                    onChange={e => setSelectedRepoUrl(e.target.value)}
                  >
                    <option value="">No repository</option>
                    {repos.map(repo => (
                      <option key={repo.id} value={repo.url}>
                        {repo.name} ({repo.chunk_count} chunks)
                      </option>
                    ))}
                  </select>
                  <span className="repo-hint">Select a repo to enable RAG context during refinement</span>
                </div>
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
                    <div className="hitl-actions">
                      <button 
                        className="btn-primary"
                        onClick={() => navigate(`/design/${selectedItem.hitl_session_id}`)}
                      >
                        <ExternalLink size={16} />
                        Go to HITL Session
                      </button>
                      <button 
                        className="btn-danger"
                        onClick={() => setShowUnpromoteConfirm(true)}
                      >
                        <X size={16} />
                        Abandon
                      </button>
                    </div>
                  )}
                </div>
              )}

              

              {/* Attachments Section */}
              <div className="backlog-attachments">
                <div className="attachments-header">
                  <h4><Paperclip size={14} /> Attachments ({attachments.length})</h4>
                  <button 
                    className="btn-icon"
                    onClick={() => setShowAttachmentModal(true)}
                    title="Add attachment"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                
                {attachments.length === 0 ? (
                  <p className="no-attachments">No attachments yet</p>
                ) : (
                  <ul className="attachment-list">
                    {attachments.map(att => (
                      <li key={att.id} className={`attachment-item type-${att.attachment_type}`}>
                        <span className="attachment-icon">{getAttachmentIcon(att)}</span>
                        <a 
                          href={att.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="attachment-name"
                        >
                          {att.name}
                        </a>
                        {att.file_size && (
                          <span className="attachment-size">
                            {(att.file_size / 1024).toFixed(1)}KB
                          </span>
                        )}
                        {att.git_metadata && (
                          <span className="git-badge">{att.git_metadata.type}</span>
                        )}
                        <button 
                          className="btn-icon delete"
                          onClick={() => handleDeleteAttachment(att.id)}
                          title="Remove"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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
                        {actionLoading === `start-${selectedItem.id}` ? (
                          <><Loader2 size={16} className="spin" /> Gathering context...</>
                        ) : (
                          <><MessageSquare size={16} /> Start Refinement</>
                        )}
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
                  onClick={() => setShowAbandonConfirm(true)}
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

        {/* Abandon Chat Confirmation Modal */}
        {showAbandonConfirm && selectedItem && (
          <div className="modal-overlay" onClick={() => setShowAbandonConfirm(false)}>
            <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-icon danger">
                <X size={32} />
              </div>
              <h3>Abandon this chat session?</h3>
              <p>The item will return to draft state and chat history will be cleared.</p>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowAbandonConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-danger"
                  onClick={() => {
                    setShowAbandonConfirm(false);
                    handleAbandonChat();
                  }}
                  disabled={actionLoading === 'abandon'}
                >
                  {actionLoading === 'abandon' ? (
                    <><Loader2 size={16} className="spin" /> Abandoning...</>
                  ) : (
                    <>Abandon Session</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Unpromote Confirmation Modal */}
        {showUnpromoteConfirm && selectedItem && (
          <div className="modal-overlay" onClick={() => setShowUnpromoteConfirm(false)}>
            <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="confirm-icon danger">
                <X size={32} />
              </div>
              <h3>Abandon this HITL session?</h3>
              <p>The HITL session will be deleted and "{selectedItem.title}" will return to draft state.</p>
              <div className="modal-actions">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowUnpromoteConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-danger"
                  onClick={handleUnpromote}
                  disabled={actionLoading === 'unpromote'}
                >
                  {actionLoading === 'unpromote' ? (
                    <><Loader2 size={16} className="spin" /> Abandoning...</>
                  ) : (
                    <>Abandon Session</>
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


      {/* Attachment Modal */}
      {showAttachmentModal && selectedItem && (
        <div className="modal-overlay" onClick={() => setShowAttachmentModal(false)}>
          <div className="modal attachment-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Attachment</h3>
              <button className="btn-icon" onClick={() => setShowAttachmentModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="attachment-tabs">
              <button 
                className={attachmentTab === 'upload' ? 'active' : ''}
                onClick={() => setAttachmentTab('upload')}
              >
                <Upload size={16} /> Upload File
              </button>
              <button 
                className={attachmentTab === 'link' ? 'active' : ''}
                onClick={() => setAttachmentTab('link')}
              >
                <Link2 size={16} /> Add Link
              </button>
            </div>
            
            <div className="attachment-content">
              {attachmentTab === 'upload' ? (
                <div className="upload-zone">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp"
                    style={{ display: 'none' }}
                  />
                  <button 
                    className="upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={24} />
                    <span>Choose file or drag & drop</span>
                    <small>PDF, DOC, TXT, MD, PNG, JPG, GIF (max 10MB)</small>
                  </button>
                  {uploadProgress > 0 && (
                    <div className="upload-progress">
                      <div style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="link-form">
                  <div className="form-group">
                    <label>URL *</label>
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={e => setLinkUrl(e.target.value)}
                      placeholder="https://github.com/org/repo or any URL"
                    />
                    <small>GitHub, GitLab, Bitbucket links will be auto-detected</small>
                  </div>
                  <div className="form-group">
                    <label>Display Name (optional)</label>
                    <input
                      type="text"
                      value={linkName}
                      onChange={e => setLinkName(e.target.value)}
                      placeholder="My Reference Repo"
                    />
                  </div>
                  <button 
                    className="btn-primary"
                    onClick={handleAddLink}
                    disabled={!linkUrl.trim()}
                  >
                    Add Link
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}
