const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// GET /api/tickets - List all tickets
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets - Create a new ticket
router.post('/', async (req, res) => {
  try {
    const { title, description, status, priority } = req.body;
    
    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    
    // Insert new ticket
    const result = await pool.query(
      'INSERT INTO tickets (title, description, status, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *',
      [title, description, status || 'open']
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id - Get a specific ticket
router.get('/:id', async (req, res) => {
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

// PUT /api/tickets/:id - Update a ticket
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority } = req.body;
    
    const result = await pool.query(
      'UPDATE tickets SET title = $1, description = $2, status = $3, priority = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [title, description, status, priority, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tickets/:id - Delete a ticket
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tickets WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;