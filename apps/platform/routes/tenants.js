const express = require('express');
const router = express.Router();
const db = require('../database/connection'); // Assuming database connection module

// GET all tenants
router.get('/', async (req, res) => {
  try {
    const tenants = await db.query('SELECT * FROM tenants ORDER BY id DESC');
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// GET tenant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenant = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
    
    if (!tenant || tenant.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json(tenant[0]);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

// POST create new tenant
router.post('/', async (req, res) => {
  try {
    const { name, description, email, phone } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Auto-generate tenant ID
    const nextId = await generateNextTenantId();
    
    // Insert new tenant
    const result = await db.query(
      'INSERT INTO tenants (id, name, description, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
      [nextId, name, description || null, email, phone || null]
    );
    
    // Fetch the created tenant
    const newTenant = await db.query('SELECT * FROM tenants WHERE id = ?', [nextId]);
    
    res.status(201).json({
      message: 'Tenant created successfully',
      tenant: newTenant[0]
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    
    // Handle duplicate email error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A tenant with this email already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// PUT update tenant
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, email, phone } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Check if tenant exists
    const existingTenant = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
    if (!existingTenant || existingTenant.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Update tenant
    await db.query(
      'UPDATE tenants SET name = ?, description = ?, email = ?, phone = ?, updated_at = NOW() WHERE id = ?',
      [name, description || null, email, phone || null, id]
    );
    
    // Fetch updated tenant
    const updatedTenant = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
    
    res.json({
      message: 'Tenant updated successfully',
      tenant: updatedTenant[0]
    });
  } catch (error) {
    console.error('Error updating tenant:', error);
    
    // Handle duplicate email error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A tenant with this email already exists' });
    }
    
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// DELETE tenant
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if tenant exists
    const existingTenant = await db.query('SELECT * FROM tenants WHERE id = ?', [id]);
    if (!existingTenant || existingTenant.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Delete tenant
    await db.query('DELETE FROM tenants WHERE id = ?', [id]);
    
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

/**
 * Generate the next tenant ID by querying the maximum existing ID
 * and incrementing it. Start at 5001 if no tenants exist.
 */
async function generateNextTenantId() {
  try {
    // Query for the maximum tenant ID
    const result = await db.query('SELECT MAX(id) as max_id FROM tenants');
    
    const maxId = result[0]?.max_id;
    
    // If no tenants exist, start at 5001
    if (maxId === null || maxId === undefined) {
      return 5001;
    }
    
    // Ensure the next ID is at least 5001
    const nextId = Math.max(maxId + 1, 5001);
    
    return nextId;
  } catch (error) {
    console.error('Error generating next tenant ID:', error);
    throw new Error('Failed to generate tenant ID');
  }
}

module.exports = router;