const express = require('express');
const { requireAuth, requireTenant } = require('../middleware/auth');
const db = require('../db');
const { body, param, validationResult } = require('express-validator');

const router = express.Router();

// GET /api/tenants - List tenants for current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const tenants = await db.query(
      'SELECT id, name, plan, created_at, updated_at FROM tenants WHERE id IN (SELECT tenant_id FROM user_tenants WHERE user_id = ?)',
      [req.user.id]
    );
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tenants/:id - Get specific tenant
router.get('/:id', requireAuth, requireTenant, async (req, res) => {
  try {
    const tenant = await db.query(
      'SELECT id, name, plan, created_at, updated_at FROM tenants WHERE id = ?',
      [req.params.id]
    );
    
    if (tenant.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json(tenant[0]);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tenants/:id - Update tenant
router.patch('/:id', 
  requireAuth,
  requireTenant,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid tenant ID'),
    body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters'),
    body('plan').optional().isIn(['free', 'pro', 'enterprise']).withMessage('Plan must be free, pro, or enterprise')
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      const tenantId = parseInt(req.params.id);
      const { name, plan } = req.body;

      // Check if at least one field is provided for update
      if (!name && !plan) {
        return res.status(400).json({ 
          error: 'At least one field (name or plan) must be provided for update' 
        });
      }

      // Verify tenant exists and user has access (requireTenant middleware handles this)
      const existingTenant = await db.query(
        'SELECT id FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (existingTenant.length === 0) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Build dynamic UPDATE query with parameter binding
      const updateFields = [];
      const updateValues = [];

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateValues.push(name);
      }

      if (plan !== undefined) {
        updateFields.push('plan = ?');
        updateValues.push(plan);
      }

      // Always update the updated_at timestamp
      updateFields.push('updated_at = NOW()');
      updateValues.push(tenantId);

      const updateQuery = `
        UPDATE tenants 
        SET ${updateFields.join(', ')} 
        WHERE id = ?
      `;

      await db.query(updateQuery, updateValues);

      // Fetch and return updated tenant data
      const updatedTenant = await db.query(
        'SELECT id, name, plan, created_at, updated_at FROM tenants WHERE id = ?',
        [tenantId]
      );

      res.json(updatedTenant[0]);

    } catch (error) {
      console.error('Error updating tenant:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;