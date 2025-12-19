/**
 * Internal API Routes - Engine-to-Platform communication
 * 
 * These endpoints are called by the Swarm Engine to broadcast
 * ticket state changes to WebSocket clients.
 * 
 * Security: Uses internal Bearer token (not user JWT)
 */

const express = require('express');
const router = express.Router();
const { broadcast } = require('../websocket');

// Internal API key for Engine authentication
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'swarm-internal-dev-key-2024';

/**
 * Middleware: Verify internal API key
 */
function verifyInternalKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const token = authHeader.substring(7);
  if (token !== INTERNAL_API_KEY) {
    return res.status(403).json({ error: 'Invalid internal API key' });
  }
  
  next();
}

// Apply to all routes
router.use(verifyInternalKey);

/**
 * POST /api/internal/ticket-event
 * Broadcast ticket state change to WebSocket clients
 */
router.post('/ticket-event', (req, res) => {
  try {
    const { ticketId, event, state, projectId, sessionId, ...extra } = req.body;
    
    if (!ticketId || !event) {
      return res.status(400).json({ error: 'ticketId and event are required' });
    }
    
    switch (event) {
      case 'state_change':
        broadcast.ticketUpdate(ticketId, state, { projectId, sessionId, ...extra });
        break;
        
      case 'progress':
        broadcast.ticketProgress(ticketId, extra.phase, extra.message, { projectId, ...extra });
        break;
        
      case 'pr_created':
        broadcast.prCreated(ticketId, extra.prUrl, { projectId, sessionId, ...extra });
        break;
        
      default:
        // Generic broadcast
        broadcast.toRoom(`ticket:${ticketId}`, `ticket:${event}`, {
          ticketId,
          state,
          projectId,
          sessionId,
          ...extra
        });
    }
    
    res.json({ success: true, event, ticketId });
    
  } catch (err) {
    console.error('[Internal API] ticket-event error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/internal/build-event  
 * Broadcast build progress to WebSocket clients
 */
router.post('/build-event', (req, res) => {
  try {
    const { sessionId, event, percent, message, ...extra } = req.body;
    
    if (!sessionId || !event) {
      return res.status(400).json({ error: 'sessionId and event are required' });
    }
    
    switch (event) {
      case 'progress':
        broadcast.buildProgress(sessionId, percent || 0, message || '', extra);
        break;
        
      case 'complete':
        broadcast.sessionUpdate(sessionId, 'complete', 100, extra);
        break;
        
      case 'failed':
        broadcast.sessionUpdate(sessionId, 'failed', percent || 0, { error: message, ...extra });
        break;
        
      default:
        broadcast.toSession(sessionId, `build:${event}`, { percent, message, ...extra });
    }
    
    res.json({ success: true, event, sessionId });
    
  } catch (err) {
    console.error('[Internal API] build-event error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/internal/ws-stats
 * Get WebSocket connection statistics
 */
router.get('/ws-stats', (req, res) => {
  const { getStats } = require('../websocket');
  res.json(getStats());
});

module.exports = router;
