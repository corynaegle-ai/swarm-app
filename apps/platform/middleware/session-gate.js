/**
 * HITL Session Gate Middleware - PostgreSQL version
 * Enforces state machine transitions for design sessions
 */

const { queryOne } = require('../db');

// Valid state transitions
const VALID_TRANSITIONS = {
  'awaiting_user': ['user_responded', 'cancelled'],
  'awaiting_ai': ['ai_responded', 'cancelled'],
  'generating_spec': ['spec_generated', 'failed'],
  'pending_approval': ['approved', 'rejected', 'revision_requested'],
  'generating_tickets': ['tickets_generated', 'failed'],
  'completed': [],
  'cancelled': [],
  'failed': []
};

// State action mapping
const ACTION_STATES = {
  user_responded: { from: 'awaiting_user', to: 'awaiting_ai' },
  ai_responded: { from: 'awaiting_ai', to: 'awaiting_user' },
  generate_spec: { from: 'awaiting_user', to: 'generating_spec' },
  spec_generated: { from: 'generating_spec', to: 'pending_approval' },
  approved: { from: 'pending_approval', to: 'generating_tickets' },
  rejected: { from: 'pending_approval', to: 'cancelled' },
  revision_requested: { from: 'pending_approval', to: 'awaiting_ai' },
  tickets_generated: { from: 'generating_tickets', to: 'completed' },
  cancelled: { from: '*', to: 'cancelled' },
  failed: { from: '*', to: 'failed' }
};

// Validate state transition
function validateTransition(currentState, action) {
  const actionConfig = ACTION_STATES[action];
  if (!actionConfig) return { valid: false, error: `Unknown action: ${action}` };
  
  if (actionConfig.from !== '*' && actionConfig.from !== currentState) {
    return { 
      valid: false, 
      error: `Cannot ${action} from state ${currentState}. Required: ${actionConfig.from}` 
    };
  }
  
  return { valid: true, newState: actionConfig.to };
}

// Session gate middleware - validates state before action
function sessionGate(action) {
  return async (req, res, next) => {
    const { sessionId } = req.params;
    
    try {
      const session = await queryOne('SELECT state FROM hitl_sessions WHERE id = $1', [sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      
      const result = validateTransition(session.state, action);
      if (!result.valid) return res.status(400).json({ error: result.error });
      
      req.newState = result.newState;
      req.currentState = session.state;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { sessionGate, validateTransition, VALID_TRANSITIONS, ACTION_STATES };
