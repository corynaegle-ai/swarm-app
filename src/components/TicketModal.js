import React, { useState, useEffect } from 'react';
import { formatRelativeTime } from '../utils/dateUtils';
import CommentsSection from './CommentsSection';

const TicketModal = ({ ticket, isOpen, onClose, onSave }) => {
  const [editedTicket, setEditedTicket] = useState(ticket);
  const [comments, setComments] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (ticket) {
      setEditedTicket(ticket);
      // Load comments for this ticket
      loadComments(ticket.id);
    }
  }, [ticket]);

  const loadComments = async (ticketId) => {
    try {
      // In a real app, this would be an API call
      const storedComments = localStorage.getItem(`comments_${ticketId}`);
      if (storedComments) {
        setComments(JSON.parse(storedComments));
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  const handleSaveComment = (commentText) => {
    const newComment = {
      id: Date.now().toString(),
      text: commentText,
      author: 'Current User', // In a real app, this would come from auth context
      timestamp: new Date().toISOString(),
      ticketId: ticket.id
    };

    const updatedComments = [newComment, ...comments];
    setComments(updatedComments);

    // Save to localStorage (in a real app, this would be an API call)
    localStorage.setItem(`comments_${ticket.id}`, JSON.stringify(updatedComments));
  };

  const handleInputChange = (field, value) => {
    setEditedTicket(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(editedTicket);
    setIsEditing(false);
  };

  if (!isOpen || !ticket) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{ticket.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="ticket-details">
            <div className="field-group">
              <label>Status:</label>
              <select 
                value={editedTicket.status} 
                onChange={(e) => handleInputChange('status', e.target.value)}
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            
            <div className="field-group">
              <label>Priority:</label>
              <select 
                value={editedTicket.priority} 
                onChange={(e) => handleInputChange('priority', e.target.value)}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            
            <div className="field-group">
              <label>Description:</label>
              {isEditing ? (
                <textarea 
                  className="edit-description-textarea"
                  value={editedTicket.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={4}
                />
              ) : (
                <div className="description-display" onClick={() => setIsEditing(true)}>
                  {editedTicket.description || 'Click to add description...'}
                </div>
              )}
              {isEditing && (
                <div className="edit-actions">
                  <button className="save-btn" onClick={handleSave}>
                    Save
                  </button>
                  <button className="cancel-btn" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
          
          <div className="activity-timeline">
            <h3>Activity Timeline</h3>
            <div className="timeline-item">
              <div className="timeline-content">
                <strong>Ticket created</strong>
                <div className="timestamp">{formatRelativeTime(ticket.created)}</div>
              </div>
            </div>
            {ticket.updated && ticket.updated !== ticket.created && (
              <div className="timeline-item">
                <div className="timeline-content">
                  <strong>Ticket updated</strong>
                  <div className="timestamp">{formatRelativeTime(ticket.updated)}</div>
                </div>
              </div>
            )}
          </div>

          <CommentsSection 
            comments={comments}
            onSaveComment={handleSaveComment}
          />
        </div>
      </div>
    </div>
  );
};

export default TicketModal;