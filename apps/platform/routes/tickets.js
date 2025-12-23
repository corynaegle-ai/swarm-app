const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../db');
const auth = require('../middleware/auth');
const { broadcastToRoom } = require('../websocket');

const router = express.Router();

// GET /api/tickets - List all tickets
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tickets ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id - Get a specific ticket
router.get('/:id', auth, param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets - Create a new ticket
router.post('/', 
  auth,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
    body('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']).withMessage('Invalid status')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { title, description, priority = 'medium', status = 'open' } = req.body;
      const userId = req.user.id;

      const result = await pool.query(
        'INSERT INTO tickets (title, description, priority, status, created_by, assigned_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [title, description, priority, status, userId, userId]
      );

      const ticket = result.rows[0];
      
      // Log creation event
      await pool.query(
        'INSERT INTO ticket_events (ticket_id, user_id, event_type, event_data) VALUES ($1, $2, $3, $4)',
        [ticket.id, userId, 'created', { title, description, priority, status }]
      );

      // Broadcast to websocket room
      broadcastToRoom('tickets', 'ticket_created', ticket);

      res.status(201).json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PATCH /api/tickets/:id - Update a ticket
router.patch('/:id',
  auth,
  [
    param('id').isUUID(),
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    body('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']).withMessage('Invalid status'),
    body('assigned_to').optional().isUUID().withMessage('Invalid assigned_to user ID')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Define allowed fields for update
      const allowedFields = ['title', 'description', 'status', 'assigned_to'];
      const updateData = {};
      
      // Filter request body to only include allowed fields
      for (const field of allowedFields) {
        if (req.body.hasOwnProperty(field)) {
          updateData[field] = req.body[field];
        }
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      // Get current ticket data for comparison
      const currentTicket = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
      if (currentTicket.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const oldTicket = currentTicket.rows[0];
      
      // Build dynamic UPDATE query
      const setClause = Object.keys(updateData)
        .map((key, index) => `${key} = $${index + 2}`)
        .join(', ');
      
      const values = [id, ...Object.values(updateData)];
      
      const result = await pool.query(
        `UPDATE tickets SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        values
      );

      const updatedTicket = result.rows[0];
      
      // Track changes and log events
      const changes = {};
      for (const field of allowedFields) {
        if (updateData.hasOwnProperty(field) && oldTicket[field] !== updateData[field]) {
          changes[field] = {
            from: oldTicket[field],
            to: updateData[field]
          };
        }
      }
      
      if (Object.keys(changes).length > 0) {
        // Log update event with changes
        await pool.query(
          'INSERT INTO ticket_events (ticket_id, user_id, event_type, event_data) VALUES ($1, $2, $3, $4)',
          [id, userId, 'updated', { changes }]
        );
        
        // Broadcast changes to websocket room
        broadcastToRoom('tickets', 'ticket_updated', {
          ticket: updatedTicket,
          changes
        });
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /api/tickets/:id - Delete a ticket
router.delete('/:id', auth, param('id').isUUID(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const result = await pool.query('DELETE FROM tickets WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    const deletedTicket = result.rows[0];
    
    // Log deletion event
    await pool.query(
      'INSERT INTO ticket_events (ticket_id, user_id, event_type, event_data) VALUES ($1, $2, $3, $4)',
      [id, userId, 'deleted', { ticket: deletedTicket }]
    );
    
    // Broadcast deletion to websocket room
    broadcastToRoom('tickets', 'ticket_deleted', { id });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;