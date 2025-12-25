/**
 * Agent Learning Query Layer
 * Provides analytics and reporting for execution telemetry
 * Uses PostgreSQL via db.js
 */

const db = require('../db');

/**
 * Get execution statistics for a date range
 */
async function getExecutionStats(startDate, endDate, tenantId = null) {
  const params = [startDate || '2020-01-01', endDate || '2099-12-31'];
  let tenantFilter = '';
  if (tenantId) {
    tenantFilter = 'AND tenant_id = $3';
    params.push(tenantId);
  }
  
  const result = await db.get(`
    SELECT 
      COUNT(*)::int as total_executions,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END)::int as successes,
      SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END)::int as failures,
      SUM(CASE WHEN outcome = 'timeout' THEN 1 ELSE 0 END)::int as timeouts,
      SUM(CASE WHEN outcome = 'blocked' THEN 1 ELSE 0 END)::int as blocked,
      ROUND(AVG(duration_ms))::int as avg_duration_ms,
      COALESCE(SUM(input_tokens), 0)::int as total_input_tokens,
      COALESCE(SUM(output_tokens), 0)::int as total_output_tokens,
      COALESCE(SUM(total_tokens), 0)::int as total_tokens,
      ROUND(100.0 * SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as success_rate
    FROM agent_executions
    WHERE created_at >= $1 AND created_at <= $2
    ${tenantFilter}
  `, params);
  
  return result || {
    total_executions: 0, successes: 0, failures: 0, timeouts: 0, blocked: 0,
    avg_duration_ms: 0, total_input_tokens: 0, total_output_tokens: 0, total_tokens: 0, success_rate: 0
  };
}

/**
 * Get most common errors with frequency
 */
async function getCommonErrors(limit = 10, category = null, tenantId = null) {
  // Since execution_errors table may not exist in PG, query from agent_executions directly
  const params = [limit];
  let filters = ["error_message IS NOT NULL"];
  
  if (category) {
    params.push(category);
    filters.push(`error_category = $${params.length}`);
  }
  if (tenantId) {
    params.push(tenantId);
    filters.push(`tenant_id = $${params.length}`);
  }
  
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  
  return db.all(`
    SELECT 
      error_category as category,
      error_message,
      COUNT(*)::int as occurrence_count,
      MAX(created_at) as last_seen
    FROM agent_executions
    ${whereClause}
    GROUP BY error_category, error_message
    ORDER BY occurrence_count DESC
    LIMIT $1
  `, params);
}

/**
 * Get success patterns (models/agents with high success rates)
 */
async function getSuccessPatterns(minSuccessRate = 80, tenantId = null) {
  const params = [minSuccessRate];
  let tenantFilter = '';
  if (tenantId) {
    params.push(tenantId);
    tenantFilter = `AND tenant_id = $${params.length}`;
  }
  
  return db.all(`
    SELECT 
      model,
      agent_id,
      COUNT(*)::int as total_executions,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END)::int as successes,
      ROUND(100.0 * SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate,
      ROUND(AVG(duration_ms))::int as avg_duration_ms,
      ROUND(AVG(total_tokens))::int as avg_tokens
    FROM agent_executions
    WHERE model IS NOT NULL ${tenantFilter}
    GROUP BY model, agent_id
    HAVING ROUND(100.0 * SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) >= $1
       AND COUNT(*) >= 3
    ORDER BY success_rate DESC, total_executions DESC
  `, params);
}

/**
 * Get token usage trend over time
 */
async function getTokenUsageTrend(days = 7, tenantId = null) {
  const params = [days];
  let tenantFilter = '';
  if (tenantId) {
    params.push(tenantId);
    tenantFilter = `AND tenant_id = $${params.length}`;
  }
  
  return db.all(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*)::int as executions,
      COALESCE(SUM(input_tokens), 0)::int as input_tokens,
      COALESCE(SUM(output_tokens), 0)::int as output_tokens,
      COALESCE(SUM(total_tokens), 0)::int as total_tokens,
      ROUND(AVG(total_tokens))::int as avg_tokens_per_execution
    FROM agent_executions
    WHERE created_at >= NOW() - ($1 || ' days')::interval
    ${tenantFilter}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `, params);
}

/**
 * Get error distribution by category
 */
async function getErrorDistribution(tenantId = null) {
  const params = [];
  let tenantFilter = '';
  if (tenantId) {
    params.push(tenantId);
    tenantFilter = `AND tenant_id = $${params.length}`;
  }
  
  return db.all(`
    SELECT 
      COALESCE(error_category, 'unknown') as category,
      COUNT(*)::int as count,
      ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM agent_executions WHERE error_message IS NOT NULL), 0), 1) as percentage
    FROM agent_executions
    WHERE error_message IS NOT NULL ${tenantFilter}
    GROUP BY error_category
    ORDER BY count DESC
  `, params);
}

/**
 * Get recent executions with details
 */
async function getRecentExecutions(limit = 20, tenantId = null) {
  const params = [limit];
  let tenantFilter = '';
  if (tenantId) {
    params.push(tenantId);
    tenantFilter = `AND tenant_id = $${params.length}`;
  }
  
  return db.all(`
    SELECT 
      id, task_id, agent_id, model,
      input_tokens, output_tokens, total_tokens,
      duration_ms, outcome, error_message, error_category,
      pr_url, created_at
    FROM agent_executions
    WHERE 1=1 ${tenantFilter}
    ORDER BY created_at DESC
    LIMIT $1
  `, params);
}

module.exports = {
  getExecutionStats,
  getCommonErrors,
  getSuccessPatterns,
  getTokenUsageTrend,
  getErrorDistribution,
  getRecentExecutions
};
