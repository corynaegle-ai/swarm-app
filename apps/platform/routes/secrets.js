/**
 * Secrets management routes
 * Requires manage_secrets permission
 * 
 * MIGRATED TO POSTGRESQL: 2025-12-17
 */

const express = require('express');
const router = express.Router();
const { queryAll, queryOne, execute } = require('../db');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { execSync } = require('child_process');

// All secrets routes require auth + manage_secrets permission
router.use(requireAuth, requirePermission('manage_secrets'));

// GET /api/secrets - List secrets (names only, no values)
router.get('/', async (req, res) => {
  try {
    const secrets = await queryAll('SELECT type, description, created_at, updated_at FROM secrets');
    res.json({ secrets });
  } catch (err) {
    console.error('GET /secrets error:', err);
    res.status(500).json({ error: 'Failed to fetch secrets' });
  }
});

// PUT /api/secrets/:type - Update/create secret
router.put('/:type', async (req, res) => {
  try {
    const { value, description } = req.body;
    if (!value) return res.status(400).json({ error: 'Value required' });

    const id = randomUUID();
    
    // PostgreSQL upsert syntax
    await execute(`
      INSERT INTO secrets (id, type, value, description, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(type) DO UPDATE SET value = $3, description = $4, updated_at = CURRENT_TIMESTAMP
    `, [id, req.params.type, value, description]);
    
    res.json({ success: true, type: req.params.type });
  } catch (err) {
    console.error('PUT /secrets/:type error:', err);
    res.status(500).json({ error: 'Failed to update secret' });
  }
});

// POST /api/secrets/:type/validate - Validate a secret
router.post('/:type/validate', async (req, res) => {
  try {
    const secret = await queryOne('SELECT value FROM secrets WHERE type = $1', [req.params.type]);
    if (!secret) return res.status(404).json({ error: 'Secret not found' });
    
    const isValid = secret.value && secret.value.length > 0;
    res.json({ valid: isValid, type: req.params.type });
  } catch (err) {
    console.error('POST /secrets/:type/validate error:', err);
    res.status(500).json({ error: 'Failed to validate secret' });
  }
});

// POST /api/secrets/snapshot - Create VM snapshot with current secrets
router.post('/snapshot', (req, res) => {
  try {
    const result = execSync('/opt/swarm/create-snapshot.sh 2>&1 || echo "Snapshot script not found"').toString();
    res.json({ success: true, message: result.trim() });
  } catch (e) {
    res.status(500).json({ error: 'Snapshot failed', details: e.message });
  }
});

// GET /api/secrets/snapshot/status
router.get('/snapshot/status', (req, res) => {
  try {
    const result = execSync('ls -la /opt/swarm/snapshots/ 2>/dev/null | tail -5').toString();
    res.json({ snapshots: result.trim().split('\n') });
  } catch (e) {
    res.json({ snapshots: [], error: e.message });
  }
});

// POST /api/secrets/generate-key - Generate new API key
router.post('/generate-key', (req, res) => {
  const crypto = require('crypto');
  const key = crypto.randomBytes(32).toString('hex');
  res.json({ key, message: 'Store this key securely - it cannot be retrieved again' });
});

module.exports = router;
