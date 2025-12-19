/**
 * AI Dispatcher Routes
 * API endpoints for dispatching AI actions through HITL system
 * 
 * MIGRATED TO POSTGRESQL: 2025-12-17
 */

const express = require('express');
const router = express.Router();
const { dispatcher, AI_PERMISSIONS, APPROVAL_REQUIRED_ACTIONS } = require('../services/ai-dispatcher');
const { requireAuth } = require('../middleware/auth');
const { queryAll, queryOne, execute } = require('../db');
const { randomUUID: uuidv4 } = require('crypto');

// GET /api/ai/permissions - Get AI permission matrix
router.get('/permissions', (req, res) => {
  res.json({
    permissions: AI_PERMISSIONS,
    approvalRequired: APPROVAL_REQUIRED_ACTIONS
  });
});

// POST /api/ai/dispatch - Dispatch an AI action
router.post('/dispatch', requireAuth, async (req, res) => {
  const { sessionId, action, context } = req.body;
  
  if (!sessionId || !action) {
    return res.status(400).json({ error: 'sessionId and action required' });
  }

  const result = await dispatcher.dispatch(sessionId, action, context || {});
  
  if (result.status === 'error' && result.code === 'SESSION_NOT_FOUND') {
    return res.status(404).json(result);
  }
  if (result.status === 'blocked') {
    return res.status(403).json(result);
  }
  if (result.status === 'pending_approval') {
    return res.status(202).json(result);
  }
  
  res.json(result);
});

// GET /api/ai/approvals/pending - List pending approvals
router.get('/approvals/pending', requireAuth, async (req, res) => {
  try {
    const approvals = await queryAll(`
      SELECT a.*, s.title as session_title, s.state as session_state
      FROM hitl_approvals a
      JOIN hitl_sessions s ON a.session_id = s.id
      WHERE a.status = 'pending'
      ORDER BY a.created_at DESC
    `);
    res.json({ approvals });
  } catch (err) {
    console.error('GET /approvals/pending error:', err);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// POST /api/ai/approvals/:id/approve - Approve a pending action
router.post('/approvals/:id/approve', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const approval = await queryOne('SELECT * FROM hitl_approvals WHERE id = $1', [id]);
    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `Approval already ${approval.status}` });
    }
    
    await execute(`
      UPDATE hitl_approvals 
      SET status = 'approved', approved_by = $1, ip_address = $2
      WHERE id = $3
    `, [req.user?.id || 'unknown', req.ip, id]);
    
    await execute(`
      INSERT INTO hitl_events (id, session_id, event_type, payload, created_at)
      VALUES ($1, $2, 'approval_granted', $3, CURRENT_TIMESTAMP)
    `, [uuidv4(), approval.session_id, JSON.stringify({ approvalId: id, approvedBy: req.user?.id })]);
    
    res.json({ success: true, message: 'Action approved' });
  } catch (err) {
    console.error('POST /approvals/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve action' });
  }
});

// POST /api/ai/approvals/:id/reject - Reject a pending action
router.post('/approvals/:id/reject', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const approval = await queryOne('SELECT * FROM hitl_approvals WHERE id = $1', [id]);
    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `Approval already ${approval.status}` });
    }
    
    await execute('UPDATE hitl_approvals SET status = $1 WHERE id = $2', ['rejected', id]);
    
    await execute(`
      INSERT INTO hitl_events (id, session_id, event_type, payload, created_at)
      VALUES ($1, $2, 'approval_rejected', $3, CURRENT_TIMESTAMP)
    `, [uuidv4(), approval.session_id, JSON.stringify({ approvalId: id, reason })]);
    
    res.json({ success: true, message: 'Action rejected' });
  } catch (err) {
    console.error('POST /approvals/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject action' });
  }
});

module.exports = router;
