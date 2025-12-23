const express = require('express');
const { Ticket, TicketEvent, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { broadcastTicketUpdate } = require('../services/notifications');
const router = express.Router();

// GET /api/tickets
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tickets = await Ticket.findAll({
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tickets/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id, {
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] }
      ]
    });
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tickets
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, priority, assignee_id } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    
    const ticket = await Ticket.create({
      title,
      description,
      priority: priority || 'medium',
      status: 'open',
      reporter_id: req.user.id,
      assignee_id
    });
    
    // Log creation event
    await TicketEvent.create({
      ticket_id: ticket.id,
      user_id: req.user.id,
      event_type: 'created',
      details: { title, description, priority: ticket.priority }
    });
    
    // Broadcast notification
    await broadcastTicketUpdate(ticket, 'created', req.user);
    
    const createdTicket = await Ticket.findByPk(ticket.id, {
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] }
      ]
    });
    
    res.status(201).json(createdTicket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tickets/:id
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Define allowed fields for updates
    const allowedFields = ['title', 'description', 'status', 'priority', 'assignee_id'];
    const updates = {};
    const changes = {};
    
    // Filter and track changes
    for (const field of allowedFields) {
      if (req.body.hasOwnProperty(field)) {
        const oldValue = ticket[field];
        const newValue = req.body[field];
        
        if (oldValue !== newValue) {
          updates[field] = newValue;
          changes[field] = {
            from: oldValue,
            to: newValue
          };
        }
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }
    
    // Update the ticket
    await ticket.update(updates);
    
    // Log each field change as separate events
    for (const [field, change] of Object.entries(changes)) {
      await TicketEvent.create({
        ticket_id: ticket.id,
        user_id: req.user.id,
        event_type: 'updated',
        field_name: field,
        old_value: change.from,
        new_value: change.to,
        details: { field, ...change }
      });
    }
    
    // Broadcast notification for the update
    await broadcastTicketUpdate(ticket, 'updated', req.user, changes);
    
    // Return updated ticket with relations
    const updatedTicket = await Ticket.findByPk(ticket.id, {
      include: [
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] }
      ]
    });
    
    res.json(updatedTicket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tickets/:id
router.delete('/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const ticket = await Ticket.findByPk(req.params.id);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    // Log deletion event
    await TicketEvent.create({
      ticket_id: ticket.id,
      user_id: req.user.id,
      event_type: 'deleted',
      details: { title: ticket.title }
    });
    
    await ticket.destroy();
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;