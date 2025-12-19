/**
 * BuildConfirmModal - Gate 5 confirmation before starting ticket generation
 */
import { useState } from 'react';

export default function BuildConfirmModal({ 
  session, 
  onConfirm, 
  onCancel, 
  isProcessing 
}) {
  const [confirmed, setConfirmed] = useState(false);

  const spec = (() => {
    try {
      if (!session?.spec_card) return null;
      return typeof session.spec_card === 'string' 
        ? JSON.parse(session.spec_card) 
        : session.spec_card;
    } catch { return null; }
  })();

  const estimatedTickets = spec?.features?.length * 3 || 10;
  const estimatedVMs = Math.min(estimatedTickets, 10);

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-card build-confirm-modal">
        <h2>🚀 Start Build</h2>
        <p className="modal-subtitle">
          Ready to generate tickets from your approved specification?
        </p>

        <div className="estimate-grid">
          <div className="estimate-item">
            <span className="estimate-value">{estimatedTickets}</span>
            <span className="estimate-label">Estimated Tickets</span>
          </div>
          <div className="estimate-item">
            <span className="estimate-value">{estimatedVMs}</span>
            <span className="estimate-label">VMs to Spawn</span>
          </div>
          <div className="estimate-item">
            <span className="estimate-value">~{estimatedTickets * 2}min</span>
            <span className="estimate-label">Est. Duration</span>
          </div>
        </div>

        <div className="warning-box">
          <span className="warning-icon">⚠️</span>
          <p>
            This will create tickets and spawn AI agents to implement your project.
            This action cannot be undone.
          </p>
        </div>

        <label className="confirm-checkbox">
          <input 
            type="checkbox" 
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>I understand and want to proceed with ticket generation</span>
        </label>

        <div className="modal-actions">
          <button 
            onClick={onCancel}
            className="action-btn cancel"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="action-btn success"
            disabled={!confirmed || isProcessing}
          >
            {isProcessing ? '⏳ Starting...' : '🚀 Start Build'}
          </button>
        </div>
      </div>
    </div>
  );
}
