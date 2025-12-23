import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getTicket, updateTicket } from '../services/ticketService';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const Tickets = () => {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState('');
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        setLoading(true);
        const ticketData = await getTicket(id);
        setTicket(ticketData);
        setDescription(ticketData.description || '');
      } catch (err) {
        setError('Failed to load ticket');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchTicket();
    }
  }, [id]);

  const handleDescriptionSave = async () => {
    try {
      const updatedTicket = await updateTicket(id, { description });
      setTicket(updatedTicket);
      setEditingDescription(false);
    } catch (err) {
      setError('Failed to update description');
    }
  };

  const handleCommentSave = async () => {
    if (!newComment.trim()) return;
    
    try {
      const comment = {
        text: newComment.trim(),
        timestamp: new Date().toISOString(),
        author: 'Current User' // This should be replaced with actual user data
      };
      
      const updatedComments = [...(ticket.comments || []), comment];
      const updatedTicket = await updateTicket(id, { comments: updatedComments });
      setTicket(updatedTicket);
      setNewComment('');
    } catch (err) {
      setError('Failed to add comment');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!ticket) return <ErrorMessage message="Ticket not found" />;

  return (
    <div className="ticket-details">
      <div className="ticket-header">
        <h1>Ticket #{ticket.id}</h1>
        <div className="ticket-status">
          <span className={`status-badge status-${ticket.status?.toLowerCase()}`}>
            {ticket.status}
          </span>
        </div>
      </div>

      <div className="ticket-info">
        <div className="info-row">
          <label>Title:</label>
          <span>{ticket.title}</span>
        </div>
        <div className="info-row">
          <label>Priority:</label>
          <span className={`priority priority-${ticket.priority?.toLowerCase()}`}>
            {ticket.priority}
          </span>
        </div>
        <div className="info-row">
          <label>Assignee:</label>
          <span>{ticket.assignee || 'Unassigned'}</span>
        </div>
        <div className="info-row">
          <label>Created:</label>
          <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="ticket-description">
        <div className="section-header">
          <h3>Description</h3>
          {!editingDescription && (
            <button 
              className="edit-btn" 
              onClick={() => setEditingDescription(true)}
            >
              Edit
            </button>
          )}
        </div>
        
        {editingDescription ? (
          <div className="edit-section">
            <textarea
              className="edit-description-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter ticket description..."
            />
            <div className="edit-actions">
              <button 
                className="save-btn"
                onClick={handleDescriptionSave}
                disabled={!description.trim()}
              >
                Save
              </button>
              <button 
                className="cancel-btn"
                onClick={() => {
                  setDescription(ticket.description || '');
                  setEditingDescription(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="description-content">
            {ticket.description || 'No description provided'}
          </div>
        )}
      </div>

      <div className="ticket-comments">
        <h3>Comments</h3>
        
        <div className="comments-list">
          {ticket.comments?.map((comment, index) => (
            <div key={index} className="comment-item">
              <div className="comment-header">
                <span className="comment-author">{comment.author}</span>
                <span className="comment-timestamp">
                  {new Date(comment.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="comment-text">{comment.text}</div>
            </div>
          ))}
          
          {(!ticket.comments || ticket.comments.length === 0) && (
            <div className="no-comments">No comments yet</div>
          )}
        </div>

        <div className="add-comment-section">
          <h4>Add Comment</h4>
          <textarea
            className="edit-description-textarea"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Enter your comment..."
          />
          <div className="edit-actions">
            <button 
              className="save-btn"
              onClick={handleCommentSave}
              disabled={!newComment.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tickets;