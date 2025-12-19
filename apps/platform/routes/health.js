/**
 * Health check routes - PostgreSQL version
 */

const express = require('express');
const router = express.Router();
const { queryOne } = require('../db');

router.get('/', async (req, res) => {
  try {
    await queryOne('SELECT 1 AS ok');
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), db: 'postgresql' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

module.exports = router;
