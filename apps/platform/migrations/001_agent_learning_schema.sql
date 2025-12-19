-- Agent Learning System - Phase 1 Schema Extension
-- Migration: 001_agent_learning_schema.sql
-- Date: 2024-12-14

-- ============================================
-- Table 1: agent_executions
-- Tracks every agent execution attempt
-- ============================================
CREATE TABLE IF NOT EXISTS agent_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tenant_id TEXT,
  
  -- Execution context
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  
  -- Timing
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  
  -- Outcome
  outcome TEXT NOT NULL CHECK(outcome IN ('success', 'failure', 'timeout', 'blocked')),
  error_message TEXT,
  error_category TEXT,
  
  -- Results
  pr_url TEXT,
  files_changed TEXT,  -- JSON array
  criteria_status TEXT, -- JSON array of {id, status, evidence}
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (task_id) REFERENCES tickets(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================
-- Table 2: execution_errors
-- Structured error logs for analysis
-- ============================================
CREATE TABLE IF NOT EXISTS execution_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  tenant_id TEXT,
  
  -- Error classification
  category TEXT NOT NULL CHECK(category IN (
    'syntax', 'logic', 'runtime', 'api', 'context', 'timeout', 'manual_review'
  )),
  subcategory TEXT,
  
  -- Error details
  error_message TEXT NOT NULL,
  error_stack TEXT,
  error_context TEXT, -- JSON with additional context
  
  -- Source info
  source_file TEXT,
  source_line INTEGER,
  
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (execution_id) REFERENCES agent_executions(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================
-- Table 3: learned_rules (Phase 2 placeholder)
-- Will store validated patterns and rules
-- ============================================
CREATE TABLE IF NOT EXISTS learned_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  
  -- Rule definition
  rule_type TEXT NOT NULL CHECK(rule_type IN ('avoid', 'prefer', 'require')),
  category TEXT NOT NULL,
  pattern TEXT NOT NULL,
  description TEXT,
  
  -- Evidence
  source_execution_id INTEGER,
  confidence_score REAL DEFAULT 0.5,
  times_applied INTEGER DEFAULT 0,
  times_successful INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'candidate' CHECK(status IN ('candidate', 'active', 'deprecated')),
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  
  FOREIGN KEY (source_execution_id) REFERENCES agent_executions(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ============================================
-- Indexes for performance
-- ============================================

-- agent_executions indexes
CREATE INDEX IF NOT EXISTS idx_exec_outcome_created 
  ON agent_executions(outcome, created_at);
CREATE INDEX IF NOT EXISTS idx_exec_task 
  ON agent_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_exec_tenant 
  ON agent_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exec_agent 
  ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_exec_model 
  ON agent_executions(model);

-- execution_errors indexes
CREATE INDEX IF NOT EXISTS idx_errors_category 
  ON execution_errors(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_errors_execution 
  ON execution_errors(execution_id);
CREATE INDEX IF NOT EXISTS idx_errors_tenant 
  ON execution_errors(tenant_id);

-- learned_rules indexes
CREATE INDEX IF NOT EXISTS idx_rules_status 
  ON learned_rules(status, category);
CREATE INDEX IF NOT EXISTS idx_rules_tenant 
  ON learned_rules(tenant_id);

-- ============================================
-- Views for reporting
-- ============================================

-- Execution summary by outcome
CREATE VIEW IF NOT EXISTS v_execution_summary AS
SELECT 
  outcome,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms,
  AVG(total_tokens) as avg_tokens,
  DATE(created_at) as date
FROM agent_executions
GROUP BY outcome, DATE(created_at)
ORDER BY date DESC, outcome;

-- Error frequency by category
CREATE VIEW IF NOT EXISTS v_common_errors AS
SELECT 
  category,
  subcategory,
  COUNT(*) as occurrence_count,
  COUNT(DISTINCT execution_id) as affected_executions
FROM execution_errors
GROUP BY category, subcategory
ORDER BY occurrence_count DESC;

-- Success rate by task type (joins with tickets for context)
CREATE VIEW IF NOT EXISTS v_task_success_rates AS
SELECT 
  t.estimated_scope,
  COUNT(*) as total_executions,
  SUM(CASE WHEN ae.outcome = 'success' THEN 1 ELSE 0 END) as success_count,
  ROUND(100.0 * SUM(CASE WHEN ae.outcome = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM agent_executions ae
JOIN tickets t ON ae.task_id = t.id
GROUP BY t.estimated_scope;

-- Token usage trends (daily)
CREATE VIEW IF NOT EXISTS v_token_usage_trend AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as executions,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  AVG(total_tokens) as avg_tokens_per_execution
FROM agent_executions
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Model performance comparison
CREATE VIEW IF NOT EXISTS v_model_performance AS
SELECT 
  model,
  COUNT(*) as executions,
  SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
  ROUND(100.0 * SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
  AVG(duration_ms) as avg_duration_ms,
  AVG(total_tokens) as avg_tokens
FROM agent_executions
WHERE model IS NOT NULL
GROUP BY model;

-- Record schema version
INSERT OR REPLACE INTO schema_version (version, applied_at) 
VALUES (2, datetime('now'));
