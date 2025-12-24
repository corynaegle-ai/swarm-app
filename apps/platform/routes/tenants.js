const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { requireTenant } = require('../middleware/auth');

const router = express.Router();

// Validation middleware for tenant creation
const validateTenantCreation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be between 1 and 255 characters')
    .trim(),
  body('plan')
    .notEmpty()
    .withMessage('Plan is required')
    .isIn(['basic', 'premium', 'enterprise'])
    .withMessage('Plan must be one of: basic, premium, enterprise')
];

// Helper function to get next tenant ID
async function getNextTenantId() {
  try {
    const result = await db.query(
      'SELECT MAX(id) as maxId FROM tenants WHERE id >= 5001'
    );
    const maxId = result.rows[0]?.maxId;
    return maxId ? maxId + 1 : 5001;
  } catch (error) {
    throw new Error('Failed to generate tenant ID');
  }
}

// POST /api/tenants - Create new tenant
router.post('/', validateTenantCreation, async (req, res) => {
  try {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, plan } = req.body;

    // Check for duplicate tenant names
    const existingTenant = await db.query(
      'SELECT id FROM tenants WHERE LOWER(name) = LOWER($1)',
      [name]
    );

    if (existingTenant.rows.length > 0) {
      return res.status(409).json({
        error: 'Tenant with this name already exists'
      });
    }

    // Generate next tenant ID
    const tenantId = await getNextTenantId();

    // Create tenant record
    const result = await db.query(
      `INSERT INTO tenants (id, name, plan, created_at, updated_at) 
       VALUES ($1, $2, $3, NOW(), NOW()) 
       RETURNING id, name, plan, created_at, updated_at`,
      [tenantId, name, plan]
    );

    const newTenant = result.rows[0];

    res.status(201).json({
      success: true,
      tenant: {
        id: newTenant.id,
        name: newTenant.name,
        plan: newTenant.plan,
        createdAt: newTenant.created_at,
        updatedAt: newTenant.updated_at
      }
    });

  } catch (error) {
    console.error('Error creating tenant:', error);
    
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      return res.status(409).json({
        error: 'Tenant with this name already exists'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to create tenant'
    });
  }
});

// GET /api/tenants - List tenants (with requireTenant middleware)
router.get('/', requireTenant, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, plan, created_at, updated_at FROM tenants ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      tenants: result.rows.map(tenant => ({
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Failed to fetch tenants'
    });
  }
});

module.exports = router;