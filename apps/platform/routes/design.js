/**
 * Design session routes (simple version from swarm-tickets)
 * For HITL state machine routes, see hitl.js
 * 
 * MIGRATED TO POSTGRESQL: 2025-12-17
 */

const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { queryAll, queryOne, execute } = require('../db');

// GET /api/design-sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await queryAll('SELECT * FROM design_sessions ORDER BY created_at DESC LIMIT 100');
    res.json({ sessions });
  } catch (err) {
    console.error('GET /design-sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch design sessions' });
  }
});

// GET /api/design-sessions/:id
router.get('/:id', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM design_sessions WHERE id = $1', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) {
    console.error('GET /design-sessions/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch design session' });
  }
});

// POST /api/design-sessions
router.post('/', async (req, res) => {
  try {
    const { title, description, project_id } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const id = uuidv4();
    
    await execute(`
      INSERT INTO design_sessions (id, title, description, project_id, status, created_at)
      VALUES ($1, $2, $3, $4, 'draft', CURRENT_TIMESTAMP)
    `, [id, title, description, project_id]);
    
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('POST /design-sessions error:', err);
    res.status(500).json({ error: 'Failed to create design session' });
  }
});

// POST /api/design-sessions/:id/respond - User responds
router.post('/:id/respond', async (req, res) => {
  try {
    const { message } = req.body;
    
    const session = await queryOne('SELECT * FROM design_sessions WHERE id = $1', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    // Append to conversation history
    const history = session.conversation_history ? 
      (typeof session.conversation_history === 'string' ? JSON.parse(session.conversation_history) : session.conversation_history) 
      : [];
    history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    
    await execute(
      'UPDATE design_sessions SET conversation_history = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(history), req.params.id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('POST /design-sessions/:id/respond error:', err);
    res.status(500).json({ error: 'Failed to save response' });
  }
});

// POST /api/design-sessions/:id/generate-spec
router.post('/:id/generate-spec', async (req, res) => {
  try {
    const session = await queryOne('SELECT * FROM design_sessions WHERE id = $1', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    await execute('UPDATE design_sessions SET status = $1 WHERE id = $2', ['generating', req.params.id]);
    
    // Spec generation would be triggered async
    res.json({ success: true, message: 'Spec generation started' });
  } catch (err) {
    console.error('POST /design-sessions/:id/generate-spec error:', err);
    res.status(500).json({ error: 'Failed to start spec generation' });
  }
});

// POST /api/design-sessions/:id/approve
router.post('/:id/approve', async (req, res) => {
  try {
    await execute(
      'UPDATE design_sessions SET status = $1, approved_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['approved', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /design-sessions/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve session' });
  }
});

module.exports = router;
