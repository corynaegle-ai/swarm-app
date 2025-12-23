const express = require('express');
const { requireAuth, requireTenant } = require('../middleware/auth');
const { execute } = require('../db/connection');
const { body, param, validationResult } = require('express-validator');

const router = express.Router();

// Existing ticket routes...

// GET /api/tickets/:ticketId/comments - Get comments for a ticket
router.get('/:ticketId/comments', 
  requireAuth,
  requireTenant,
  param('ticketId').isInt({ min: 1 }).withMessage('Ticket ID must be a positive integer'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { ticketId } = req.params;
      const { tenant_id } = req.user;

      // First verify the ticket exists and belongs to the tenant
      const ticketQuery = `
        SELECT id FROM tickets 
        WHERE id = $1 AND tenant_id = $2
      `;
      const ticketResult = await execute(ticketQuery, [ticketId, tenant_id]);
      
      if (ticketResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Get comments for the ticket ordered by created_at DESC
      const commentsQuery = `
        SELECT 
          tc.id,
          tc.content,
          tc.created_at,
          tc.updated_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.email
        FROM ticket_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.ticket_id = $1 AND tc.tenant_id = $2
        ORDER BY tc.created_at DESC
      `;
      
      const result = await execute(commentsQuery, [ticketId, tenant_id]);
      
      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Error fetching ticket comments:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

// POST /api/tickets/:ticketId/comments - Create a new comment for a ticket
router.post('/:ticketId/comments',
  requireAuth,
  requireTenant,
  param('ticketId').isInt({ min: 1 }).withMessage('Ticket ID must be a positive integer'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ max: 5000 })
    .withMessage('Content must not exceed 5000 characters'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { ticketId } = req.params;
      const { content } = req.body;
      const { user_id, tenant_id } = req.user;

      // First verify the ticket exists and belongs to the tenant
      const ticketQuery = `
        SELECT id FROM tickets 
        WHERE id = $1 AND tenant_id = $2
      `;
      const ticketResult = await execute(ticketQuery, [ticketId, tenant_id]);
      
      if (ticketResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Create the new comment
      const insertQuery = `
        INSERT INTO ticket_comments (ticket_id, user_id, tenant_id, content, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING 
          id,
          content,
          created_at,
          updated_at
      `;
      
      const result = await execute(insertQuery, [ticketId, user_id, tenant_id, content]);
      const newComment = result.rows[0];

      // Get user details for the response
      const userQuery = `
        SELECT first_name, last_name, email
        FROM users
        WHERE id = $1
      `;
      const userResult = await execute(userQuery, [user_id]);
      const userDetails = userResult.rows[0];

      res.status(201).json({
        success: true,
        data: {
          ...newComment,
          user_id,
          first_name: userDetails.first_name,
          last_name: userDetails.last_name,
          email: userDetails.email
        }
      });
    } catch (error) {
      console.error('Error creating ticket comment:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

module.exports = router;