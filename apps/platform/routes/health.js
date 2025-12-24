/**
 * Health and Metrics Routes
 * P2-2: Observability - Prometheus metrics and health checks
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const metrics = require('../lib/metrics');

// Database pool for health checks
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://swarm:swarm@localhost:5432/swarmdb'
});

/**
 * GET /health
 * Kubernetes-style health check endpoint
 * Returns 200 if healthy, 503 if unhealthy
 */
router.get('/health', async (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  let isHealthy = true;
  
  // Check database connectivity
  try {
    const result = await pool.query('SELECT 1 as ok');
    checks.checks.database = { status: 'healthy', latency_ms: 0 };
  } catch (err) {
    checks.checks.database = { status: 'unhealthy', error: err.message };
    isHealthy = false;
  }
  
  // Check memory usage (warn if >90%)
  const memUsage = process.memoryUsage();
  const heapUsedPct = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  checks.checks.memory = {
    status: heapUsedPct > 90 ? 'degraded' : 'healthy',
    heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
    heap_used_pct: Math.round(heapUsedPct)
  };
  
  // Check event loop lag (warn if >100ms)
  const start = process.hrtime.bigint();
  await new Promise(resolve => setImmediate(resolve));
  const lagMs = Number(process.hrtime.bigint() - start) / 1e6;
  checks.checks.event_loop = {
    status: lagMs > 100 ? 'degraded' : 'healthy',
    lag_ms: Math.round(lagMs * 100) / 100
  };
  
  // Overall status
  if (!isHealthy) {
    checks.status = 'unhealthy';
    res.status(503);
  } else if (heapUsedPct > 90 || lagMs > 100) {
    checks.status = 'degraded';
  }
  
  res.json(checks);
});

/**
 * GET /health/live
 * Liveness probe - is the process running?
 */
router.get('/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

/**
 * GET /health/ready
 * Readiness probe - can the service handle requests?
 */
router.get('/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  try {
    // Update ticket counts before serving metrics
    await updateTicketMetrics();
    
    res.set('Content-Type', metrics.getContentType());
    res.send(await metrics.getMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update ticket metrics from database
 */
async function updateTicketMetrics() {
  try {
    const result = await pool.query(`
      SELECT state, COUNT(*) as count 
      FROM tickets 
      GROUP BY state
    `);
    
    const stateCounts = {};
    result.rows.forEach(row => {
      stateCounts[row.state] = parseInt(row.count);
    });
    
    metrics.setTicketsByState(stateCounts);
  } catch (err) {
    console.error('Failed to update ticket metrics:', err.message);
  }
}

module.exports = router;
