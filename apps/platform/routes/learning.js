/**
 * Agent Learning Analytics API Routes
 */

const express = require('express');
const router = express.Router();
const learningQueries = require('../lib/learning-queries.js');
const { requireAuth } = require('../middleware/auth');
const agentLearning = require('../lib/agent-learning.js');

// Pattern detection modules - lazy load to avoid startup errors if not available
let PatternDetector, RuleGenerator;
try {
  PatternDetector = require('../lib/pattern-detector.js');
  RuleGenerator = require('../lib/rule-generator.js').RuleGenerator;
} catch (err) {
  console.warn('Pattern detection modules not available:', err.message);
}

/**
 * POST /api/learning/log - No auth (called by agents in VMs)
 */
router.post('/log', async (req, res) => {
  try {
    const result = await agentLearning.logExecution(req.body);
    res.json({ success: true, executionId: result.executionId });
  } catch (err) {
    console.error('Learning log error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.use(requireAuth);

/**
 * GET /api/learning/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const endDate = end || new Date().toISOString();
    const tenantId = req.user?.tenant_id || null;
    const stats = await learningQueries.getExecutionStats(startDate, endDate, tenantId);
    res.json(stats || { total_executions: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/errors
 */
router.get('/errors', async (req, res) => {
  try {
    const { limit, category } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const errors = await learningQueries.getCommonErrors(parseInt(limit) || 10, category || null, tenantId);
    res.json(errors || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/patterns - Basic patterns (model/agent combos)
 */
router.get('/patterns', async (req, res) => {
  try {
    const { minRate } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const patterns = await learningQueries.getSuccessPatterns(parseFloat(minRate) || 80, tenantId);
    res.json(patterns || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/tokens
 */
router.get('/tokens', async (req, res) => {
  try {
    const { days } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const trend = await learningQueries.getTokenUsageTrend(parseInt(days) || 7, tenantId);
    res.json(trend || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/distribution
 */
router.get('/distribution', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || null;
    const distribution = await learningQueries.getErrorDistribution(tenantId);
    res.json(distribution || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/executions
 */
router.get('/executions', async (req, res) => {
  try {
    const { limit } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const executions = await learningQueries.getRecentExecutions(parseInt(limit) || 20, tenantId);
    res.json(executions || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== PHASE 2: Pattern Detection & Rules ==========

/**
 * GET /api/learning/detect
 * Run pattern detection and return summary + patterns
 */
router.get('/detect', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || null;
    // Get stats and patterns from PostgreSQL queries
    const [stats, patterns, executions] = await Promise.all([
      learningQueries.getExecutionStats(null, null, tenantId),
      learningQueries.getSuccessPatterns(0, tenantId),
      learningQueries.getRecentExecutions(50, tenantId)
    ]);
    
    res.json({
      summary: {
        total_executions: stats?.total_executions || 0,
        success_rate: stats?.success_rate || 0,
        total_tokens: stats?.total_tokens || 0,
        avg_duration_ms: stats?.avg_duration_ms || 0
      },
      patterns: {
        modelPerformance: patterns || [],
        recentExecutions: executions || []
      }
    });
  } catch (err) { 
    console.error('Learning detect error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

/**
 * GET /api/learning/rules
 * Get active learning rules (placeholder for now)
 */
router.get('/rules', async (req, res) => {
  try {
    // Rules not yet implemented in PostgreSQL
    res.json([]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/learning/rules/generate
 * Generate new rules from patterns (placeholder)
 */
router.post('/rules/generate', async (req, res) => {
  try {
    res.json({ generated: 0, saved: 0, message: 'Rule generation not yet implemented' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = router;
