/**
 * Agent Learning Analytics API Routes
 */

const express = require('express');
const router = express.Router();
const learningQueries = require('../lib/learning-queries.js');
const PatternDetector = require('../lib/pattern-detector.js');
const { RuleGenerator } = require('../lib/rule-generator.js');
const { requireAuth } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/learning/stats
 */
router.get('/stats', (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const endDate = end || new Date().toISOString();
    const tenantId = req.user?.tenant_id || null;
    const stats = learningQueries.getExecutionStats(startDate, endDate, tenantId);
    res.json(stats || { total_executions: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/errors
 */
router.get('/errors', (req, res) => {
  try {
    const { limit, category } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const errors = learningQueries.getCommonErrors(parseInt(limit) || 10, category || null, tenantId);
    res.json(errors || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/patterns - Basic patterns (model/agent combos)
 */
router.get('/patterns', (req, res) => {
  try {
    const { minRate } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const patterns = learningQueries.getSuccessPatterns(parseFloat(minRate) || 80, tenantId);
    res.json(patterns || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/tokens
 */
router.get('/tokens', (req, res) => {
  try {
    const { days } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const trend = learningQueries.getTokenUsageTrend(parseInt(days) || 7, tenantId);
    res.json(trend || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/distribution
 */
router.get('/distribution', (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || null;
    const distribution = learningQueries.getErrorDistribution(tenantId);
    res.json(distribution || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/learning/executions
 */
router.get('/executions', (req, res) => {
  try {
    const { limit } = req.query;
    const tenantId = req.user?.tenant_id || null;
    const executions = learningQueries.getRecentExecutions(parseInt(limit) || 20, tenantId);
    res.json(executions || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== PHASE 2: Pattern Detection & Rules ==========

/**
 * GET /api/learning/detect
 * Run pattern detection and return all findings
 */
router.get('/detect', (req, res) => {
  const detector = new PatternDetector();
  try {
    const tenantId = req.user?.tenant_id || null;
    const summary = detector.getSummary(tenantId);
    const patterns = detector.getAllPatterns(tenantId);
    res.json({ summary, patterns });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { detector.close(); }
});

/**
 * GET /api/learning/rules
 * Get active learning rules
 */
router.get('/rules', (req, res) => {
  const generator = new RuleGenerator();
  try {
    const tenantId = req.user?.tenant_id || null;
    const { type } = req.query;
    const rules = generator.getRules(tenantId, type || null);
    res.json(rules);
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { generator.close(); }
});

/**
 * POST /api/learning/rules/generate
 * Generate new rules from patterns and save
 */
router.post('/rules/generate', (req, res) => {
  const detector = new PatternDetector();
  const generator = new RuleGenerator();
  try {
    const tenantId = req.user?.tenant_id || null;
    const patterns = detector.getAllPatterns(tenantId);
    const rules = generator.generateAllRules(patterns, tenantId);
    const results = generator.saveRules(rules);
    res.json({ generated: rules.length, saved: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { detector.close(); generator.close(); }
});

module.exports = router;
