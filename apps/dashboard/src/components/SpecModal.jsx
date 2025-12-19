/**
 * SpecModal - Full spec view with approve/revision actions
 * When user clicks "Request Changes", they return to chat to describe changes
 */
import { X, CheckCircle2, MessageSquare, FileText } from 'lucide-react';
import './SpecModal.css';

export default function SpecModal({ spec, onClose, onApprove, onRequestRevision, state }) {
  if (!spec) return null;

  return (
    <div className="spec-modal-overlay" onClick={onClose}>
      <div className="spec-modal" onClick={e => e.stopPropagation()}>
        <div className="spec-modal-header">
          <h2><FileText size={20} /> {spec.title || 'Project Specification'}</h2>
          <button className="spec-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        
        <div className="spec-modal-body">
          {spec.summary && (
            <section className="spec-section">
              <h3>Summary</h3>
              <p>{spec.summary}</p>
            </section>
          )}

          {spec.features && spec.features.length > 0 && (
            <section className="spec-section">
              <h3>Features ({spec.features.length})</h3>
              <ul className="spec-features">
                {spec.features.map((f, i) => (
                  <li key={i}>
                    <strong>{f.name || f.title}</strong>
                    {f.description && <p>{f.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {spec.technical && (
            <section className="spec-section">
              <h3>Technical Details</h3>
              <p>{typeof spec.technical === 'string' ? spec.technical : JSON.stringify(spec.technical, null, 2)}</p>
            </section>
          )}

          {spec.acceptance_criteria && (
            <section className="spec-section">
              <h3>Acceptance Criteria</h3>
              <ul>
                {(Array.isArray(spec.acceptance_criteria) ? spec.acceptance_criteria : [spec.acceptance_criteria]).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {state === 'reviewing' && (
          <div className="spec-modal-footer">
            <button className="btn-success" onClick={onApprove}>
              <CheckCircle2 size={16} /> Approve & Continue
            </button>
            <button className="btn-revision" onClick={onRequestRevision}>
              <MessageSquare size={16} /> Request Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
