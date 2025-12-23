const express = require('express');
const router = express.Router({ mergeParams: true });
const { requireAuth, requireTenant, requirePermission } = require('../middleware/auth');
const Comment = require('../models/Comment');
const Ticket = require('../models/Ticket');
const { body, validationResult } = require('express-validator');

// Validation middleware for comment creation
const validateComment = [
  body('text')
    .notEmpty()
    .withMessage('Comment text is required')
    .isLength({ min: 1, max: 5000 })
    .withMessage('Comment text must be between 1 and 5000 characters')
    .trim()
];

// POST /api/tickets/:ticketId/comments - Create new comment
router.post('/',
  requireAuth,
  requireTenant,
  requirePermission('comments:create'),
  validateComment,
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { ticketId } = req.params;
      const { text } = req.body;
      const userId = req.user.id;
      const tenantId = req.tenant.id;

      // Verify ticket exists and belongs to tenant
      const ticket = await Ticket.findOne({
        where: {
          id: ticketId,
          tenantId: tenantId
        }
      });

      if (!ticket) {
        return res.status(404).json({
          error: 'Ticket not found'
        });
      }

      // Create comment
      const comment = await Comment.create({
        text,
        ticketId,
        userId,
        tenantId
      });

      // Fetch comment with user info for response
      const commentWithUser = await Comment.findByPk(comment.id, {
        include: [
          {
            model: require('../models/User'),
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      res.status(201).json({
        success: true,
        data: commentWithUser
      });

    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create comment'
      });
    }
  }
);

// GET /api/tickets/:ticketId/comments - Retrieve comments
router.get('/',
  requireAuth,
  requireTenant,
  requirePermission('comments:read'),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const tenantId = req.tenant.id;

      // Verify ticket exists and belongs to tenant
      const ticket = await Ticket.findOne({
        where: {
          id: ticketId,
          tenantId: tenantId
        }
      });

      if (!ticket) {
        return res.status(404).json({
          error: 'Ticket not found'
        });
      }

      // Fetch comments sorted by created_at DESC
      const comments = await Comment.findAll({
        where: {
          ticketId: ticketId,
          tenantId: tenantId
        },
        include: [
          {
            model: require('../models/User'),
            as: 'user',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: comments,
        count: comments.length
      });

    } catch (error) {
      console.error('Error retrieving comments:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve comments'
      });
    }
  }
);

module.exports = router;