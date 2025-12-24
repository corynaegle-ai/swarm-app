const express = require('express');
const Joi = require('joi');
const { Tenant } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const updateTenantSchema = Joi.object({
  name: Joi.string().min(1).max(255).trim(),
  plan: Joi.string().valid('free', 'basic', 'premium', 'enterprise')
}).min(1); // At least one field must be provided

// GET /api/tenants - Get all tenants
router.get('/', asyncHandler(async (req, res) => {
  const tenants = await Tenant.findAll({
    attributes: ['id', 'name', 'plan'],
    order: [['name', 'ASC']]
  });
  
  res.json(tenants);
}));

// PUT /api/tenants/:id - Update tenant
router.put('/:id', 
  validateRequest({ body: updateTenantSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, plan } = req.body;
    
    // Validate tenant ID is a valid integer
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        error: 'Invalid tenant ID',
        message: 'Tenant ID must be a valid number'
      });
    }
    
    // Find the tenant
    const tenant = await Tenant.findByPk(id);
    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        message: `Tenant with ID ${id} does not exist`
      });
    }
    
    // Update tenant with provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (plan !== undefined) updateData.plan = plan;
    
    await tenant.update(updateData);
    
    // Return updated tenant with only required fields
    const updatedTenant = await Tenant.findByPk(id, {
      attributes: ['id', 'name', 'plan']
    });
    
    res.json(updatedTenant);
  })
);

module.exports = router;
