/**
 * Agent Learning Query Layer
 * Provides analytics and reporting for execution telemetry
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.SWARM_DB_PATH || '/opt/swarm-platform/data/swarm.db';

class LearningQueries {
  constructor() {
    this.db = new Database(DB_PATH, { readonly: true });
  }

  /**
   * Get execution statistics for a date range
   */
  getExecutionStats(startDate, endDate, tenantId = null) {
    const params = { startDate, endDate };
    let tenantFilter = '';
    if (tenantId) {
      tenantFilter = 'AND tenant_id = @tenantId';
      params.tenantId = tenantId;
    }
    
    return this.db.prepare(`
      SELECT 
        COUNT(*) as total_executions,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
        SUM(CASE WHEN outcome = 'timeout' THEN 1 ELSE 0 END) as timeouts,
        SUM(CASE WHEN outcome = 'blocked' THEN 1 ELSE 0 END) as blocked,
        ROUND(AVG(duration_ms), 0) as avg_duration_ms,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_tokens) as total_tokens,
        ROUND(100.0 * SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as success_rate
      FROM agent_executions
      WHERE created_at >= @startDate AND created_at <= @endDate
      ${tenantFilter}
    `).get(params);
  }

  /**
   * Get most common errors with frequency
   */
  getCommonErrors(limit = 10, category = null, tenantId = null) {
    const params = { limit };
    let filters = [];
    
    if (category) {
      filters.push('ee.category = @category');
      params.category = category;
    }
    if (tenantId) {
      filters.push('ae.tenant_id = @tenantId');
      params.tenantId = tenantId;
    }
    
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    
    return this.db.prepare(`
      SELECT 
        ee.category,
        ee.subcategory,
        ee.error_message,
        COUNT(*) as occurrence_count,
        MAX(ee.created_at) as last_seen
      FROM execution_errors ee
      JOIN agent_executions ae ON ee.execution_id = ae.id
      ${whereClause}
      GROUP BY ee.category, ee.subcategory, ee.error_message
      ORDER BY occurrence_count DESC
      LIMIT @limit
    `).all(params);
  }

  /**
   * Get success patterns (models/agents with high success rates)
   */
  getSuccessPatterns(minSuccessRate = 80, tenantId = null) {
    const params = { minSuccessRate };
    let tenantFilter = '';
    if (tenantId) {
      tenantFilter = 'AND tenant_id = @tenantId';
      params.tenantId = tenantId;
    }
    
    return this.db.prepare(`
      SELECT 
        model,
        agent_id,
        COUNT(*) as total_executions,
        SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
        ROUND(100.0 * SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate,
        ROUND(AVG(duration_ms), 0) as avg_duration_ms,
        ROUND(AVG(total_tokens), 0) as avg_tokens
      FROM agent_executions
      WHERE 1=1 ${tenantFilter}
      GROUP BY model, agent_id
      HAVING success_rate >= @minSuccessRate AND total_executions >= 5
      ORDER BY success_rate DESC, total_executions DESC
    `).all(params);
  }

  /**
   * Get token usage trend over time
   */
  getTokenUsageTrend(days = 7, tenantId = null) {
    const params = { days };
    let tenantFilter = '';
    if (tenantId) {
      tenantFilter = 'AND tenant_id = @tenantId';
      params.tenantId = tenantId;
    }
    
    return this.db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as executions,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(total_tokens) as total_tokens,
        ROUND(AVG(total_tokens), 0) as avg_tokens_per_execution
      FROM agent_executions
      WHERE created_at >= datetime('now', '-' || @days || ' days')
      ${tenantFilter}
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).all(params);
  }

  /**
   * Get error distribution by category
   */
  getErrorDistribution(tenantId = null) {
    let tenantFilter = '';
    const params = {};
    if (tenantId) {
      tenantFilter = 'WHERE ae.tenant_id = @tenantId';
      params.tenantId = tenantId;
    }
    
    return this.db.prepare(`
      SELECT 
        ee.category,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM execution_errors), 0), 1) as percentage
      FROM execution_errors ee
      JOIN agent_executions ae ON ee.execution_id = ae.id
      ${tenantFilter}
      GROUP BY ee.category
      ORDER BY count DESC
    `).all(params);
  }

  /**
   * Get recent executions with details
   */
  getRecentExecutions(limit = 20, tenantId = null) {
    const params = { limit };
    let tenantFilter = '';
    if (tenantId) {
      tenantFilter = 'AND tenant_id = @tenantId';
      params.tenantId = tenantId;
    }
    
    return this.db.prepare(`
      SELECT 
        id, task_id, agent_id, model,
        input_tokens, output_tokens, total_tokens,
        duration_ms, outcome, error_message, error_category,
        pr_url, created_at
      FROM agent_executions
      WHERE 1=1 ${tenantFilter}
      ORDER BY created_at DESC
      LIMIT @limit
    `).all(params);
  }

  close() {
    this.db.close();
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance() {
    if (!instance) instance = new LearningQueries();
    return instance;
  },
  
  // Convenience exports
  getExecutionStats: (...args) => module.exports.getInstance().getExecutionStats(...args),
  getCommonErrors: (...args) => module.exports.getInstance().getCommonErrors(...args),
  getSuccessPatterns: (...args) => module.exports.getInstance().getSuccessPatterns(...args),
  getTokenUsageTrend: (...args) => module.exports.getInstance().getTokenUsageTrend(...args),
  getErrorDistribution: (...args) => module.exports.getInstance().getErrorDistribution(...args),
  getRecentExecutions: (...args) => module.exports.getInstance().getRecentExecutions(...args),
  close: () => { if (instance) { instance.close(); instance = null; } }
};
