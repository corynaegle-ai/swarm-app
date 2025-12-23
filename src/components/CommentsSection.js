import React, { useState } from 'react';
import { formatRelativeTime } from '../utils/dateUtils';

const CommentsSection = ({ comments, onSaveComment }) => {
  const [commentText, setCommentText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!commentText.trim()) return;
    
    setIsSaving(true);
    try {
      await onSaveComment(commentText.trim());
      setCommentText('');
    } catch (error) {
      console.error('Error saving comment:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
    }
  };

  const sortedComments = [...comments].sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <div className="comments-section">
      <h3>Comments</h3>
      
      <div className="comment-input">
        <textarea
          className="edit-description-textarea"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment... (Ctrl+Enter to save)"
          rows={3}
        />
        <div className="comment-actions">
          <button 
            className="save-btn"
            onClick={handleSave}
            disabled={!commentText.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Comment'}
          </button>
        </div>
      </div>

      <div className="comments-list">
        {sortedComments.length === 0 ? (
          <div className="no-comments">
            No comments yet. Be the first to add one!
          </div>
        ) : (
          sortedComments.map(comment => (
            <div key={comment.id} className="comment-item">
              <div className="comment-header">
                <span className="comment-author">{comment.author}</span>
                <span className="comment-timestamp">
                  {formatRelativeTime(comment.timestamp)}
                </span>
              </div>
              <div className="comment-text">
                {comment.text}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CommentsSection;