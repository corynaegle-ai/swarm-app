/**
 * SpecReviewPanel - Full spec card display with edit mode
 * Phase 6 of HITL Implementation
 */
import { useState, useEffect } from 'react';
import './SpecReviewPanel.css';

// Priority badge colors
const PRIORITY_COLORS = {
  high: '#ff4444',
  medium: '#ffa500',
  low: '#00d4ff'
};

export default function SpecReviewPanel({ 
  spec, 
  onSave, 
  onApprove, 
  onRequestRevision, 
  loading = false 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSpec, setEditedSpec] = useState(spec);
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Sync editedSpec when spec prop changes
  useEffect(() => {
    setEditedSpec(spec);
  }, [spec]);

  const handleSave = async () => {
    await onSave(editedSpec);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedSpec(spec);
    setIsEditing(false);
  };

  const handleRevisionSubmit = async () => {
    if (!revisionFeedback.trim()) return;
    await onRequestRevision(revisionFeedback.trim());
    setRevisionFeedback('');
    setShowRevisionInput(false);
  };

  // Update a simple field
  const updateField = (field, value) => {
    setEditedSpec(prev => ({ ...prev, [field]: value }));
  };

  // Update nested field
  const updateNested = (parent, field, value) => {
    setEditedSpec(prev => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value }
    }));
  };

  // Update array item
  const updateArrayItem = (arrayName, index, field, value) => {
    setEditedSpec(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].map((item, i) => 
        i === index ? (field ? { ...item, [field]: value } : value) : item
      )
    }));
  };

  // Add/remove array items
  const addArrayItem = (arrayName, template) => {
    setEditedSpec(prev => ({
      ...prev,
      [arrayName]: [...(prev[arrayName] || []), template]
    }));
  };

  const removeArrayItem = (arrayName, index) => {
    setEditedSpec(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].filter((_, i) => i !== index)
    }));
  };

  if (!spec) {
    return (
      <div className="spec-review-panel empty">
        <span className="empty-icon">📋</span>
        <p>No specification generated yet</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'features', label: 'Features', icon: '✨' },
    { id: 'technical', label: 'Technical', icon: '⚙️' },
    { id: 'constraints', label: 'Constraints', icon: '📏' }
  ];

  return (
    <div className="spec-review-panel glass-card">
      {/* Header */}
      <div className="spec-header">
        <div className="spec-title-row">
          <h2>{isEditing ? 'Edit Specification' : 'Review Specification'}</h2>
          <div className="header-actions">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="edit-btn"
                disabled={loading}
              >
                ✏️ Edit
              </button>
            ) : (
              <>
                <button onClick={handleCancel} className="cancel-btn">Cancel</button>
                <button onClick={handleSave} className="save-btn" disabled={loading}>
                  {loading ? '...' : '💾 Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="spec-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`spec-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="spec-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tab-content overview-tab">
            {/* Title */}
            <div className="spec-field">
              <label>Project Title</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSpec.title || ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="spec-input"
                />
              ) : (
                <h3 className="spec-title">{spec.title}</h3>
              )}
            </div>

            {/* Summary */}
            <div className="spec-field">
              <label>Summary</label>
              {isEditing ? (
                <textarea
                  value={editedSpec.summary || ''}
                  onChange={(e) => updateField('summary', e.target.value)}
                  className="spec-textarea"
                  rows={3}
                />
              ) : (
                <p className="spec-summary">{spec.summary}</p>
              )}
            </div>

            {/* Goals */}
            <div className="spec-field">
              <label>Goals</label>
              {isEditing ? (
                <div className="editable-list">
                  {(editedSpec.goals || []).map((goal, i) => (
                    <div key={i} className="list-item-edit">
                      <input
                        type="text"
                        value={goal}
                        onChange={(e) => updateArrayItem('goals', i, null, e.target.value)}
                        className="spec-input"
                      />
                      <button 
                        onClick={() => removeArrayItem('goals', i)}
                        className="remove-btn"
                      >×</button>
                    </div>
                  ))}
                  <button 
                    onClick={() => addArrayItem('goals', '')}
                    className="add-btn"
                  >+ Add Goal</button>
                </div>
              ) : (
                <ul className="spec-list">
                  {(spec.goals || []).map((goal, i) => (
                    <li key={i}>{goal}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Users */}
            <div className="spec-field">
              <label>Target Users</label>
              {isEditing ? (
                <div className="users-edit">
                  <div className="user-field">
                    <span>Primary:</span>
                    <input
                      type="text"
                      value={editedSpec.users?.primary || ''}
                      onChange={(e) => updateNested('users', 'primary', e.target.value)}
                      className="spec-input"
                    />
                  </div>
                  <div className="user-field">
                    <span>Secondary:</span>
                    <input
                      type="text"
                      value={editedSpec.users?.secondary || ''}
                      onChange={(e) => updateNested('users', 'secondary', e.target.value)}
                      className="spec-input"
                    />
                  </div>
                </div>
              ) : (
                <div className="users-display">
                  {spec.users?.primary && (
                    <div className="user-item">
                      <strong>Primary:</strong> {spec.users.primary}
                    </div>
                  )}
                  {spec.users?.secondary && (
                    <div className="user-item">
                      <strong>Secondary:</strong> {spec.users.secondary}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Features Tab */}
        {activeTab === 'features' && (
          <div className="tab-content features-tab">
            {isEditing ? (
              <div className="features-edit">
                {(editedSpec.features || []).map((feature, i) => (
                  <div key={i} className="feature-card-edit">
                    <div className="feature-header-edit">
                      <input
                        type="text"
                        value={feature.name || ''}
                        onChange={(e) => updateArrayItem('features', i, 'name', e.target.value)}
                        placeholder="Feature name"
                        className="spec-input feature-name"
                      />
                      <select
                        value={feature.priority || 'medium'}
                        onChange={(e) => updateArrayItem('features', i, 'priority', e.target.value)}
                        className="priority-select"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <button 
                        onClick={() => removeArrayItem('features', i)}
                        className="remove-btn"
                      >×</button>
                    </div>
                    <textarea
                      value={feature.description || ''}
                      onChange={(e) => updateArrayItem('features', i, 'description', e.target.value)}
                      placeholder="Description"
                      className="spec-textarea"
                      rows={2}
                    />
                    <div className="acceptance-edit">
                      <label>Acceptance Criteria:</label>
                      {(feature.acceptance || []).map((criterion, j) => (
                        <div key={j} className="acceptance-item">
                          <input
                            type="text"
                            value={criterion}
                            onChange={(e) => {
                              const newAcceptance = [...(feature.acceptance || [])];
                              newAcceptance[j] = e.target.value;
                              updateArrayItem('features', i, 'acceptance', newAcceptance);
                            }}
                            className="spec-input small"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button 
                  onClick={() => addArrayItem('features', { 
                    name: '', 
                    description: '', 
                    priority: 'medium', 
                    acceptance: [''] 
                  })}
                  className="add-btn"
                >+ Add Feature</button>
              </div>
            ) : (
              <div className="features-display">
                {(spec.features || []).map((feature, i) => (
                  <div key={i} className="feature-card">
                    <div className="feature-header">
                      <h4>{feature.name}</h4>
                      <span 
                        className="priority-badge"
                        style={{ backgroundColor: PRIORITY_COLORS[feature.priority] }}
                      >
                        {feature.priority}
                      </span>
                    </div>
                    <p className="feature-description">{feature.description}</p>
                    {feature.acceptance?.length > 0 && (
                      <div className="acceptance-criteria">
                        <h5>Acceptance Criteria:</h5>
                        <ul>
                          {feature.acceptance.map((criterion, j) => (
                            <li key={j}>{criterion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Technical Tab */}
        {activeTab === 'technical' && (
          <div className="tab-content technical-tab">
            {/* Tech Stack */}
            <div className="spec-field">
              <label>Tech Stack</label>
              {isEditing ? (
                <div className="tags-edit">
                  {(editedSpec.technical?.stack || []).map((tech, i) => (
                    <div key={i} className="tag-item">
                      <input
                        type="text"
                        value={tech}
                        onChange={(e) => {
                          const newStack = [...(editedSpec.technical?.stack || [])];
                          newStack[i] = e.target.value;
                          updateNested('technical', 'stack', newStack);
                        }}
                        className="spec-input small"
                      />
                      <button 
                        onClick={() => {
                          const newStack = (editedSpec.technical?.stack || []).filter((_, j) => j !== i);
                          updateNested('technical', 'stack', newStack);
                        }}
                        className="remove-btn small"
                      >×</button>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const newStack = [...(editedSpec.technical?.stack || []), ''];
                      updateNested('technical', 'stack', newStack);
                    }}
                    className="add-btn small"
                  >+ Add</button>
                </div>
              ) : (
                <div className="tech-tags">
                  {(spec.technical?.stack || []).map((tech, i) => (
                    <span key={i} className="tech-tag">{tech}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Integrations */}
            <div className="spec-field">
              <label>Integrations</label>
              {isEditing ? (
                <textarea
                  value={(editedSpec.technical?.integrations || []).join('\n')}
                  onChange={(e) => updateNested('technical', 'integrations', 
                    e.target.value.split('\n').filter(Boolean)
                  )}
                  className="spec-textarea"
                  rows={3}
                  placeholder="One integration per line"
                />
              ) : (
                <ul className="spec-list">
                  {(spec.technical?.integrations || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Data Model */}
            <div className="spec-field">
              <label>Data Model</label>
              {isEditing ? (
                <textarea
                  value={editedSpec.technical?.dataModel || ''}
                  onChange={(e) => updateNested('technical', 'dataModel', e.target.value)}
                  className="spec-textarea"
                  rows={4}
                />
              ) : (
                <p className="spec-text">{spec.technical?.dataModel}</p>
              )}
            </div>
          </div>
        )}

        {/* Constraints Tab */}
        {activeTab === 'constraints' && (
          <div className="tab-content constraints-tab">
            {/* Timeline */}
            <div className="spec-field">
              <label>Timeline</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSpec.constraints?.timeline || ''}
                  onChange={(e) => updateNested('constraints', 'timeline', e.target.value)}
                  className="spec-input"
                />
              ) : (
                <p className="spec-text">{spec.constraints?.timeline || 'Not specified'}</p>
              )}
            </div>

            {/* Budget */}
            <div className="spec-field">
              <label>Budget</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSpec.constraints?.budget || ''}
                  onChange={(e) => updateNested('constraints', 'budget', e.target.value)}
                  className="spec-input"
                />
              ) : (
                <p className="spec-text">{spec.constraints?.budget || 'Not specified'}</p>
              )}
            </div>

            {/* Performance */}
            <div className="spec-field">
              <label>Performance Requirements</label>
              {isEditing ? (
                <textarea
                  value={editedSpec.constraints?.performance || ''}
                  onChange={(e) => updateNested('constraints', 'performance', e.target.value)}
                  className="spec-textarea"
                  rows={2}
                />
              ) : (
                <p className="spec-text">{spec.constraints?.performance || 'Not specified'}</p>
              )}
            </div>

            {/* Out of Scope */}
            <div className="spec-field">
              <label>Out of Scope</label>
              {isEditing ? (
                <textarea
                  value={(editedSpec.outOfScope || []).join('\n')}
                  onChange={(e) => updateField('outOfScope', 
                    e.target.value.split('\n').filter(Boolean)
                  )}
                  className="spec-textarea"
                  rows={3}
                  placeholder="One item per line"
                />
              ) : (
                <ul className="spec-list warning">
                  {(spec.outOfScope || []).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Open Questions */}
            <div className="spec-field">
              <label>Open Questions</label>
              {isEditing ? (
                <textarea
                  value={(editedSpec.openQuestions || []).join('\n')}
                  onChange={(e) => updateField('openQuestions', 
                    e.target.value.split('\n').filter(Boolean)
                  )}
                  className="spec-textarea"
                  rows={3}
                  placeholder="One question per line"
                />
              ) : (
                <ul className="spec-list info">
                  {(spec.openQuestions || []).map((item, i) => (
                    <li key={i}>❓ {item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isEditing && (
        <div className="spec-actions">
          {!showRevisionInput ? (
            <>
              <button 
                onClick={onApprove}
                className="approve-btn"
                disabled={loading}
              >
                ✅ Approve & Build
              </button>
              <button 
                onClick={() => setShowRevisionInput(true)}
                className="revision-btn"
                disabled={loading}
              >
                🔄 Request Changes
              </button>
            </>
          ) : (
            <div className="revision-form">
              <textarea
                value={revisionFeedback}
                onChange={(e) => setRevisionFeedback(e.target.value)}
                placeholder="What would you like changed?"
                className="revision-textarea"
                rows={3}
                autoFocus
              />
              <div className="revision-actions">
                <button 
                  onClick={handleRevisionSubmit}
                  className="submit-btn"
                  disabled={loading || !revisionFeedback.trim()}
                >
                  {loading ? '...' : 'Submit Feedback'}
                </button>
                <button 
                  onClick={() => { setShowRevisionInput(false); setRevisionFeedback(''); }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
