/**
 * Pattern Detector
 * Analyzes execution history to identify optimization opportunities
 * 
 * Location: /opt/swarm-platform/lib/pattern-detector.js
 */

const Database = require('better-sqlite3');
const DB_PATH = process.env.SWARM_DB_PATH || '/opt/swarm-platform/data/swarm.db';

class PatternDetector {
  constructor() {
    this.db = new Database(DB_PATH, { readonly: true });
  }

  /**
   * Find error patterns that repeat across executions
   */
  detectErrorPatterns(minOccurrences = 2, tenantId = null) {
    const params = { minOccurrences };
    let tenantFilter = tenantId ? 'AND ae.tenant_id = @tenantId' : '';
    if (tenantId) params.tenantId = tenantId;

    return this.db.prepare(`
      SELECT 
        ee.category,
        ee.subcategory,
        ee.error_message,
        COUNT(*) as occurrences,
        COUNT(DISTINCT ae.agent_id) as affected_agents,
        MIN(ee.created_at) as first_seen,
        MAX(ee.created_at) as last_seen
      FROM execution_errors ee
      JOIN agent_executions ae ON ee.execution_id = ae.id
      WHERE 1=1 ${tenantFilter}
      GROUP BY ee.category, ee.subcategory, ee.error_message
      HAVING occurrences >= @minOccurrences
      ORDER BY occurrences DESC
    `).all(params);
  }

  /**
   * Identify task types with consistently low success rates
   */
  detectProblematicTaskTypes(maxSuccessRate = 50, tenantId = null) {
    const params = { maxSuccessRate: maxSuccessRate / 100 };
    let tenantFilter = tenantId ? 'AND ae.tenant_id = @tenantId' : '';
    if (tenantId) params.tenantId = tenantId;

    return this.db.prepare(`
      SELECT 
        SUBSTR(task_id, 1, INSTR(task_id || '-', '-') - 1) as task_prefix,
        COUNT(*) as total_executions,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        ROUND(CAST(SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*), 2) as success_rate,
        AVG(duration_ms) as avg_duration_ms,
        AVG(input_tokens + output_tokens) as avg_tokens
      FROM agent_executions ae
      WHERE 1=1 ${tenantFilter}
      GROUP BY task_prefix
      HAVING success_rate <= @maxSuccessRate
      ORDER BY success_rate ASC, total_executions DESC
    `).all(params);
  }

  /**
   * Find time-of-day patterns (API rate limits, etc.)
   */
  detectTemporalPatterns(tenantId = null) {
    let tenantFilter = tenantId ? 'WHERE tenant_id = @tenantId' : '';
    const params = tenantId ? { tenantId } : {};

    return this.db.prepare(`
      SELECT 
        CAST(strftime('%H', started_at) AS INTEGER) as hour_utc,
        COUNT(*) as total_executions,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
        ROUND(CAST(SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as failure_rate_pct
      FROM agent_executions
      ${tenantFilter}
      GROUP BY hour_utc
      ORDER BY failure_rate_pct DESC
    `).all(params);
  }

  /**
   * Identify model/agent combinations that perform well
   */
  detectSuccessfulCombos(minExecutions = 3, minSuccessRate = 70) {
    return this.db.prepare(`
      SELECT 
        model,
        agent_id,
        COUNT(*) as total_executions,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        ROUND(CAST(SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as success_rate_pct,
        AVG(duration_ms) as avg_duration_ms,
        AVG(input_tokens) as avg_input_tokens,
        AVG(output_tokens) as avg_output_tokens
      FROM agent_executions
      GROUP BY model, agent_id
      HAVING total_executions >= @minExecutions 
        AND success_rate_pct >= @minSuccessRate
      ORDER BY success_rate_pct DESC, total_executions DESC
    `).all({ minExecutions, minSuccessRate });
  }

  /**
   * Get overall execution summary for dashboard
   */
  getSummary(tenantId = null, days = 7) {
    let tenantFilter = tenantId ? 'AND tenant_id = @tenantId' : '';
    const params = { days };
    if (tenantId) params.tenantId = tenantId;

    const summary = this.db.prepare(`
      SELECT 
        COUNT(*) as total_executions,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
        ROUND(CAST(SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100, 1) as success_rate_pct,
        AVG(duration_ms) as avg_duration_ms,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        COUNT(DISTINCT agent_id) as unique_agents,
        COUNT(DISTINCT task_id) as unique_tasks
      FROM agent_executions
      WHERE started_at >= datetime('now', '-' || @days || ' days')
      ${tenantFilter}
    `).get(params);

    return summary || {
      total_executions: 0, successes: 0, failures: 0, success_rate_pct: 0,
      avg_duration_ms: 0, total_input_tokens: 0, total_output_tokens: 0,
      unique_agents: 0, unique_tasks: 0
    };
  }

  /**
   * Get all detected patterns for rule generation
   */
  getAllPatterns(tenantId = null) {
    return {
      errorPatterns: this.detectErrorPatterns(2, tenantId),
      problematicTasks: this.detectProblematicTaskTypes(50, tenantId),
      temporalPatterns: this.detectTemporalPatterns(tenantId),
      successfulCombos: this.detectSuccessfulCombos(3, 70)
    };
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }
}

module.exports = PatternDetector;
