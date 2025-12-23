const express = require('express');
const router = express.Router();
const db = require('../db/connection');

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
        reporter_id
      FROM tickets 
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets'
    });
  }
});

// GET /api/tickets/:id - Get single ticket by ID
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
        reporter_id
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
      error: 'Failed to fetch ticket'
    });
  }
});

// POST /api/tickets - Create new ticket
router.post('/', async (req, res) => {
  try {
    const { title, description, priority = 'medium', assigned_to, reporter_id } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Title and description are required'
      });
    }
    
    const query = `
      INSERT INTO tickets (title, description, priority, assigned_to, reporter_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'open', NOW(), NOW())
      RETURNING id, title, description, status, priority, created_at, updated_at, assigned_to, reporter_id
    `;
    
    const result = await db.query(query, [title, description, priority, assigned_to, reporter_id]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create ticket'
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
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assigned_to = COALESCE($5, assigned_to),
        updated_at = NOW()
      WHERE id = $6
      RETURNING id, title, description, status, priority, created_at, updated_at, assigned_to, reporter_id
    `;
    
    const result = await db.query(query, [title, description, status, priority, assigned_to, id]);
    
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
      error: 'Failed to update ticket'
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
      error: 'Failed to delete ticket'
    });
  }
});

module.exports = router;