const express = require('express');
const router = express.Router();
const db = require('../database/connection');

// GET /api/tickets - List all tickets with priority included
router.get('/', async (req, res) => {
  try {
    // Updated query to explicitly include priority field
    const query = `
      SELECT 
        id,
        title,
        description,
        status,
        priority,
        created_at,
        updated_at,
        assigned_to,
        created_by
      FROM tickets 
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query);
    const tickets = result.rows;
    
    // Return tickets with priority field included
    res.json({
      success: true,
      data: tickets,
      count: tickets.length
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch tickets'
    });
  }
});

// GET /api/tickets/:id - Get single ticket
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        id,
        title,
        description,
        status,
        priority,
        created_at,
        updated_at,
        assigned_to,
        created_by
      FROM tickets 
      WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch ticket'
    });
  }
});

// POST /api/tickets - Create new ticket
router.post('/', async (req, res) => {
  try {
    const { title, description, status = 'open', priority = 'medium', assigned_to, created_by } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }
    
    const query = `
      INSERT INTO tickets (title, description, status, priority, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        title,
        description,
        status,
        priority,
        created_at,
        updated_at,
        assigned_to,
        created_by
    `;
    
    const result = await db.query(query, [title, description, status, priority, assigned_to, created_by]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to create ticket'
    });
  }
});

// PUT /api/tickets/:id - Update ticket
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigned_to } = req.body;
    
    const query = `
      UPDATE tickets 
      SET 
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        status = COALESCE($4, status),
        priority = COALESCE($5, priority),
        assigned_to = COALESCE($6, assigned_to),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id,
        title,
        description,
        status,
        priority,
        created_at,
        updated_at,
        assigned_to,
        created_by
    `;
    
    const result = await db.query(query, [id, title, description, status, priority, assigned_to]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to update ticket'
    });
  }
});

// DELETE /api/tickets/:id - Delete ticket
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = 'DELETE FROM tickets WHERE id = $1 RETURNING id';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to delete ticket'
    });
  }
});

module.exports = router;