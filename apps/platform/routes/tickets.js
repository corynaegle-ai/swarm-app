const express = require('express');
const { randomUUID } = require('crypto');
const { requireAuth, requireTenant, requirePermission } = require('../middleware/auth');
const { db } = require('../config/database');
const { validateInput } = require('../utils/validation');

const router = express.Router();

// Validation schemas
const createTicketSchema = {
  title: { required: true, type: 'string', minLength: 1 },
  description: { required: false, type: 'string' },
  priority: { required: false, type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
  status: { required: false, type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
  assigned_to: { required: false, type: 'string' },
  project_id: { required: false, type: 'string' }
};

const updateTicketSchema = {
  title: { required: false, type: 'string', minLength: 1 },
  description: { required: false, type: 'string' },
  priority: { required: false, type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
  status: { required: false, type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
  assigned_to: { required: false, type: 'string' },
  project_id: { required: false, type: 'string' }
};

const createCommentSchema = {
  text: { required: true, type: 'string', minLength: 1 }
};

// GET /api/tickets - List tickets
router.get('/', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, priority, assigned_to, project_id } = req.query;
    const tenantId = req.tenant.id;

    let query = `
      SELECT t.*, p.name as project_name, u.name as assigned_to_name
      FROM tickets t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.tenant_id = ?
    `;
    const params = [tenantId];

    // Add filters
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND t.priority = ?';
      params.push(priority);
    }
    if (assigned_to) {
      query += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }
    if (project_id) {
      query += ' AND t.project_id = ?';
      params.push(project_id);
    }

    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const tickets = await db.all(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM tickets WHERE tenant_id = ?';
    const countParams = [tenantId];
    
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (priority) {
      countQuery += ' AND priority = ?';
      countParams.push(priority);
    }
    if (assigned_to) {
      countQuery += ' AND assigned_to = ?';
      countParams.push(assigned_to);
    }
    if (project_id) {
      countQuery += ' AND project_id = ?';
      countParams.push(project_id);
    }

    const countResult = await db.get(countQuery, countParams);

    res.json({
      tickets,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + tickets.length < countResult.total
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets - Create ticket
router.post('/', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const validation = validateInput(req.body, createTicketSchema);
    if (!validation.isValid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { title, description, priority = 'medium', status = 'open', assigned_to, project_id } = req.body;
    const tenantId = req.tenant.id;
    const createdBy = req.user.id;

    // Verify project belongs to tenant if project_id is provided
    if (project_id) {
      const project = await db.get('SELECT id FROM projects WHERE id = ? AND tenant_id = ?', [project_id, tenantId]);
      if (!project) {
        return res.status(400).json({ error: 'Invalid project_id' });
      }
    }

    // Verify assigned user belongs to tenant if assigned_to is provided
    if (assigned_to) {
      const user = await db.get('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [assigned_to, tenantId]);
      if (!user) {
        return res.status(400).json({ error: 'Invalid assigned_to user' });
      }
    }

    const ticketId = randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO tickets (id, title, description, priority, status, assigned_to, project_id, tenant_id, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, title, description, priority, status, assigned_to, project_id, tenantId, createdBy, now, now]
    );

    // Fetch the created ticket with joined data
    const ticket = await db.get(
      `SELECT t.*, p.name as project_name, u.name as assigned_to_name, c.name as created_by_name
       FROM tickets t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users c ON t.created_by = c.id
       WHERE t.id = ?`,
      [ticketId]
    );

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PARAMETERIZED ROUTES

// GET /api/tickets/:id - Get specific ticket
router.get('/:id', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant.id;

    const ticket = await db.get(
      `SELECT t.*, p.name as project_name, u.name as assigned_to_name, c.name as created_by_name
       FROM tickets t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users c ON t.created_by = c.id
       WHERE t.id = ? AND t.tenant_id = ?`,
      [id, tenantId]
    );

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tickets/:id - Update ticket
router.put('/:id', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant.id;

    // Verify ticket exists and belongs to tenant
    const existingTicket = await db.get('SELECT id FROM tickets WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!existingTicket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const validation = validateInput(req.body, updateTicketSchema);
    if (!validation.isValid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { title, description, priority, status, assigned_to, project_id } = req.body;

    // Verify project belongs to tenant if project_id is provided
    if (project_id) {
      const project = await db.get('SELECT id FROM projects WHERE id = ? AND tenant_id = ?', [project_id, tenantId]);
      if (!project) {
        return res.status(400).json({ error: 'Invalid project_id' });
      }
    }

    // Verify assigned user belongs to tenant if assigned_to is provided
    if (assigned_to) {
      const user = await db.get('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [assigned_to, tenantId]);
      if (!user) {
        return res.status(400).json({ error: 'Invalid assigned_to user' });
      }
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      params.push(assigned_to);
    }
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      params.push(project_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);
    params.push(tenantId);

    await db.run(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );

    // Fetch the updated ticket
    const ticket = await db.get(
      `SELECT t.*, p.name as project_name, u.name as assigned_to_name, c.name as created_by_name
       FROM tickets t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN users c ON t.created_by = c.id
       WHERE t.id = ?`,
      [id]
    );

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tickets/:id - Delete ticket
router.delete('/:id', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenant.id;

    // Verify ticket exists and belongs to tenant
    const existingTicket = await db.get('SELECT id FROM tickets WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!existingTicket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    await db.run('DELETE FROM tickets WHERE id = ? AND tenant_id = ?', [id, tenantId]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id/activity - Get ticket activity
router.get('/:id/activity', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const tenantId = req.tenant.id;

    // Verify ticket exists and belongs to tenant
    const ticket = await db.get('SELECT id FROM tickets WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const activities = await db.all(
      `SELECT a.*, u.name as user_name
       FROM ticket_activity a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.ticket_id = ?
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [id, parseInt(limit), parseInt(offset)]
    );

    // Get total count for pagination
    const countResult = await db.get(
      'SELECT COUNT(*) as total FROM ticket_activity WHERE ticket_id = ?',
      [id]
    );

    res.json({
      activities,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + activities.length < countResult.total
      }
    });
  } catch (error) {
    console.error('Error fetching ticket activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets/:ticketId/comments - Create comment
router.post('/:ticketId/comments', requireAuth, requireTenant, requirePermission('manage_tickets'), async (req, res) => {
  try {
    const { ticketId } = req.params;
    const tenantId = req.tenant.id;
    const userId = req.user.id;

    // Validate input
    const validation = validateInput(req.body, createCommentSchema);
    if (!validation.isValid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    // Verify ticket exists and belongs to tenant
    const ticket = await db.get('SELECT id FROM tickets WHERE id = ? AND tenant_id = ?', [ticketId, tenantId]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { text } = req.body;
    const commentId = randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO ticket_comments (id, ticket_id, user_id, text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [commentId, ticketId, userId, text, now, now]
    );

    // Fetch the created comment with user information
    const comment = await db.get(
      `SELECT c.*, u.name as user_name
       FROM ticket_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
      [commentId]
    );

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:ticketId/comments - Get ticket comments
router.get('/:ticketId/comments', requireAuth, requireTenant, requirePermission('view_projects'), async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const tenantId = req.tenant.id;

    // Verify ticket exists and belongs to tenant
    const ticket = await db.get('SELECT id FROM tickets WHERE id = ? AND tenant_id = ?', [ticketId, tenantId]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const comments = await db.all(
      `SELECT c.*, u.name as user_name
       FROM ticket_comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.ticket_id = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [ticketId, parseInt(limit), parseInt(offset)]
    );

    // Get total count for pagination
    const countResult = await db.get(
      'SELECT COUNT(*) as total FROM ticket_comments WHERE ticket_id = ?',
      [ticketId]
    );

    res.json({
      comments,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + comments.length < countResult.total
      }
    });
  } catch (error) {
    console.error('Error fetching ticket comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;