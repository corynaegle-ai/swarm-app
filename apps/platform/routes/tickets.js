const express = require('express');
const db = require('../../../lib/database');
const { authenticateUser } = require('../../../middleware/auth');
const broadcast = require('../../../lib/broadcast');

const router = express.Router();

// Get all tickets
router.get('/', authenticateUser, async (req, res) => {
  try {
    const tickets = await db.query('SELECT * FROM tickets WHERE tenant_id = ?', [req.user.tenant_id]);
    res.json(tickets);
  } catch (error) {
    console.error('GET /tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific ticket
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(ticket[0]);
  } catch (error) {
    console.error('GET /tickets/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new ticket
router.post('/', authenticateUser, async (req, res) => {
  const { title, description, priority, assigned_to } = req.body;
  
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  try {
    const result = await db.query(
      'INSERT INTO tickets (title, description, priority, assigned_to, created_by, tenant_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, description, priority || 'medium', assigned_to, req.user.id, req.user.tenant_id, 'open']
    );
    
    const newTicket = {
      id: result.insertId,
      title,
      description,
      priority: priority || 'medium',
      assigned_to,
      created_by: req.user.id,
      tenant_id: req.user.tenant_id,
      status: 'open',
      created_at: new Date()
    };
    
    res.status(201).json(newTicket);
  } catch (error) {
    console.error('POST /tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ticket
router.put('/:id', authenticateUser, async (req, res) => {
  const { title, description, priority, assigned_to, status } = req.body;
  
  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await db.query(
      'UPDATE tickets SET title = ?, description = ?, priority = ?, assigned_to = ?, status = ? WHERE id = ? AND tenant_id = ?',
      [title, description, priority, assigned_to, status, req.params.id, req.user.tenant_id]
    );
    
    const updatedTicket = {
      ...ticket[0],
      title,
      description,
      priority,
      assigned_to,
      status
    };
    
    res.json(updatedTicket);
  } catch (error) {
    console.error('PUT /tickets/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete ticket
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await db.query('DELETE FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    res.status(204).send();
  } catch (error) {
    console.error('DELETE /tickets/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket activity
router.get('/:id/activity', authenticateUser, async (req, res) => {
  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const activity = await db.query(
      'SELECT * FROM ticket_activity WHERE ticket_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(activity);
  } catch (error) {
    console.error('GET /tickets/:id/activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add activity to ticket
router.post('/:id/activity', authenticateUser, async (req, res) => {
  const { type, description } = req.body;
  
  if (!type || !description) {
    return res.status(400).json({ error: 'Type and description are required' });
  }

  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const result = await db.query(
      'INSERT INTO ticket_activity (ticket_id, type, description, created_by) VALUES (?, ?, ?, ?)',
      [req.params.id, type, description, req.user.id]
    );
    
    const newActivity = {
      id: result.insertId,
      ticket_id: parseInt(req.params.id),
      type,
      description,
      created_by: req.user.id,
      created_at: new Date()
    };
    
    // Broadcast activity update via WebSocket
    broadcast.toTenant(req.user.tenant_id, 'ticket:activity:added', {
      ticketId: parseInt(req.params.id),
      activity: newActivity
    });
    
    res.status(201).json(newActivity);
  } catch (error) {
    console.error('POST /tickets/:id/activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket comments
router.get('/:id/comments', authenticateUser, async (req, res) => {
  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const comments = await db.query(
      'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(comments);
  } catch (error) {
    console.error('GET /tickets/:id/comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment to ticket
router.post('/:id/comments', authenticateUser, async (req, res) => {
  const { comment } = req.body;
  
  if (!comment) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const result = await db.query(
      'INSERT INTO ticket_comments (ticket_id, comment, created_by) VALUES (?, ?, ?)',
      [req.params.id, comment, req.user.id]
    );
    
    const newComment = {
      id: result.insertId,
      ticket_id: parseInt(req.params.id),
      comment,
      created_by: req.user.id,
      created_at: new Date()
    };
    
    // Broadcast comment update via WebSocket
    broadcast.toTenant(req.user.tenant_id, 'ticket:comment:added', {
      ticketId: parseInt(req.params.id),
      comment: newComment
    });
    
    res.status(201).json(newComment);
  } catch (error) {
    console.error('POST /tickets/:id/comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update comment
router.put('/:id/comments/:commentId', authenticateUser, async (req, res) => {
  const { comment } = req.body;
  
  if (!comment) {
    return res.status(400).json({ error: 'Comment is required' });
  }

  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const existingComment = await db.query(
      'SELECT * FROM ticket_comments WHERE id = ? AND ticket_id = ?',
      [req.params.commentId, req.params.id]
    );
    if (existingComment.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await db.query(
      'UPDATE ticket_comments SET comment = ? WHERE id = ? AND ticket_id = ?',
      [comment, req.params.commentId, req.params.id]
    );
    
    const updatedComment = {
      ...existingComment[0],
      comment
    };
    
    res.json(updatedComment);
  } catch (error) {
    console.error('PUT /tickets/:id/comments/:commentId error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete comment
router.delete('/:id/comments/:commentId', authenticateUser, async (req, res) => {
  try {
    const ticket = await db.query('SELECT * FROM tickets WHERE id = ? AND tenant_id = ?', [req.params.id, req.user.tenant_id]);
    if (ticket.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const existingComment = await db.query(
      'SELECT * FROM ticket_comments WHERE id = ? AND ticket_id = ?',
      [req.params.commentId, req.params.id]
    );
    if (existingComment.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    await db.query(
      'DELETE FROM ticket_comments WHERE id = ? AND ticket_id = ?',
      [req.params.commentId, req.params.id]
    );
    
    res.status(204).send();
  } catch (error) {
    console.error('DELETE /tickets/:id/comments/:commentId error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;