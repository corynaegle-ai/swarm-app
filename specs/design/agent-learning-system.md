# Agent Learning System Design

**Status:** Draft  
**Author:** Neural + Claude  
**Date:** 2024-12-12  
**Version:** 1.0

## Overview

This document defines the architecture for enabling Claude-powered agents to improve through structured error correction and pattern learning. Since Claude doesn't retain memory between sessions, "training" happens through **architectural patterns** rather than model weight updates.

## Problem Statement

Autonomous agents make mistakes. Without a feedback mechanism, they repeat the same mistakes indefinitely. We need a system that:

1. Captures execution outcomes (success/failure) with structured error classification
2. Extracts learnings from failures as injectable rules
3. Stores successful completions as few-shot examples
4. Measures agent quality over time through evaluations
5. Enables A/B testing of system prompts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FEEDBACK LOOP                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌─────────────┐    ┌──────────────┐          │
│   │  Agent   │───▶│  Validate   │───▶│  Log to DB   │          │
│   │   Run    │    │   Output    │    │              │          │
│   └──────────┘    └─────────────┘    └──────────────┘          │
│        ▲                                    │                   │
│        │                                    ▼                   │
│   ┌────┴─────────────────────────────────────────┐             │
│   │           On Next Run:                        │             │
│   │  1. Query learned_rules → inject guidelines   │             │
│   │  2. Query successful_patterns → few-shot      │             │
│   │  3. Check common_errors → warn about pitfalls │             │
│   └──────────────────────────────────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model

### Core Tables

| Table | Purpose |
|-------|---------|
| `agent_executions` | Log every agent run (input, output, outcome, timing, tokens) |
| `execution_errors` | Classify and track errors with resolution methods |
| `successful_patterns` | Store exemplars for few-shot injection |
| `learned_rules` | Extracted guidelines from error patterns |
| `eval_cases` | Test cases for measuring agent quality |
| `eval_runs` / `eval_results` | Track quality over time |
| `prompt_versions` | System prompt versioning for A/B testing |

### Entity Relationships

```
┌──────────────────┐       ┌───────────────────┐
│ agent_executions │──────▶│ execution_errors  │
│                  │ 1:N   │                   │
└──────────────────┘       └───────────────────┘
         │
         │ source
         ▼
┌──────────────────┐       ┌───────────────────┐
│successful_patterns│      │  learned_rules    │
│                  │       │                   │
└──────────────────┘       └───────────────────┘
         │                          │
         │                          │
         ▼                          ▼
┌──────────────────────────────────────────────┐
│              PROMPT INJECTION                │
│  Rules + Patterns → Enhanced System Prompt   │
└──────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Logging (Week 1)
- Add `agent_executions` and `execution_errors` tables
- Instrument agent runner to log all executions
- Build error classifier

### Phase 2: Rule Injection (Week 2)
- Implement `learned_rules` table with seed rules
- Query and inject rules into system prompts
- Track injection count and effectiveness

### Phase 3: Pattern Learning (Week 3)
- Implement `successful_patterns` table
- Auto-save high-quality completions
- Build few-shot message injection

### Phase 4: Evaluation (Week 4+)
- Build eval suite with test cases
- Track agent quality over time
- A/B test prompt versions

---

## SQL Schema

```sql
-- ============================================================================
-- SWARM AGENT LEARNING SCHEMA
-- ============================================================================
-- Purpose: Enable Claude agents to improve through structured error correction
-- and pattern learning via context injection.
--
-- Integration: Extends existing /opt/swarm-tickets/data/swarm.db
-- ============================================================================

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Agent execution outcomes - the foundation of all learning
CREATE TABLE IF NOT EXISTS agent_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    
    -- Linkage to existing systems
    ticket_id TEXT,                          -- FK to tickets table
    vm_id TEXT,                              -- Which VM ran this
    agent_type TEXT NOT NULL,                -- 'coder', 'reviewer', 'designer', 'tester'
    
    -- Task details
    task_type TEXT NOT NULL,                 -- 'code_generation', 'bug_fix', 'test_write', 'refactor', 'documentation'
    task_hash TEXT,                          -- Hash of task for deduplication
    task_input TEXT NOT NULL,                -- The actual prompt/task given
    task_context TEXT,                       -- Additional context provided (file contents, etc.)
    
    -- Execution metadata
    model TEXT DEFAULT 'claude-sonnet-4-20250514',
    temperature REAL DEFAULT 0.0,
    max_tokens INTEGER,
    
    -- Outcome
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'partial', 'timeout', 'error')),
    agent_output TEXT,                       -- Raw output from agent
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    
    -- Token usage (for cost tracking)
    input_tokens INTEGER,
    output_tokens INTEGER,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_agent_executions_tenant ON agent_executions(tenant_id);
CREATE INDEX idx_agent_executions_outcome ON agent_executions(outcome);
CREATE INDEX idx_agent_executions_task_type ON agent_executions(task_type);
CREATE INDEX idx_agent_executions_task_hash ON agent_executions(task_hash);


-- Error classifications - structured error tracking for pattern detection
CREATE TABLE IF NOT EXISTS execution_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER NOT NULL,
    
    -- Error classification (hierarchical)
    category TEXT NOT NULL,                  -- 'syntax', 'logic', 'runtime', 'api', 'context', 'timeout'
    subcategory TEXT,                        -- 'missing_import', 'type_mismatch', 'null_reference', etc.
    
    -- Error details
    error_message TEXT,                      -- Raw error message
    error_location TEXT,                     -- File:line if applicable
    stack_trace TEXT,                        -- Full stack trace if available
    
    -- Resolution tracking
    resolution_status TEXT DEFAULT 'unresolved' 
        CHECK (resolution_status IN ('unresolved', 'auto_fixed', 'manual_fixed', 'wont_fix', 'duplicate')),
    resolution_method TEXT,                  -- 'retry', 'prompt_adjustment', 'context_addition', 'human_intervention'
    resolution_details TEXT,                 -- What specifically fixed it
    resolved_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (execution_id) REFERENCES agent_executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_execution_errors_category ON execution_errors(category, subcategory);
CREATE INDEX idx_execution_errors_resolution ON execution_errors(resolution_status);


-- Successful patterns - exemplars for few-shot injection
CREATE TABLE IF NOT EXISTS successful_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    
    -- Pattern classification
    task_type TEXT NOT NULL,
    pattern_name TEXT,                       -- Human-readable name: "React component with hooks"
    tags TEXT,                               -- JSON array: ["react", "hooks", "typescript"]
    
    -- The exemplar
    task_input TEXT NOT NULL,                -- Sanitized/generalized input
    task_output TEXT NOT NULL,               -- Sanitized/generalized output
    
    -- Quality metrics
    quality_score REAL DEFAULT 1.0,          -- 0.0-1.0, based on validations passed
    usage_count INTEGER DEFAULT 0,           -- How often this pattern is injected
    success_rate REAL,                       -- Success rate when this pattern is used
    
    -- Source tracking
    source_execution_id INTEGER,             -- Original execution this came from
    
    -- Lifecycle
    is_active INTEGER DEFAULT 1,             -- Can be disabled without deletion
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (source_execution_id) REFERENCES agent_executions(id)
);

CREATE INDEX idx_successful_patterns_task_type ON successful_patterns(task_type);
CREATE INDEX idx_successful_patterns_quality ON successful_patterns(quality_score DESC);
CREATE INDEX idx_successful_patterns_active ON successful_patterns(is_active) WHERE is_active = 1;


-- Learned rules - extracted guidance from error patterns
CREATE TABLE IF NOT EXISTS learned_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    
    -- Rule classification
    task_type TEXT,                          -- NULL means applies to all tasks
    agent_type TEXT,                         -- NULL means applies to all agents
    error_category TEXT,                     -- Which error category this prevents
    
    -- The rule itself
    rule_text TEXT NOT NULL,                 -- Injected into prompts: "Always import useState before using hooks"
    rule_priority INTEGER DEFAULT 50,        -- 1-100, higher = more important = injected first
    
    -- Evidence
    evidence_count INTEGER DEFAULT 1,        -- How many errors led to this rule
    last_evidence_at TIMESTAMP,              -- When we last saw the error this prevents
    
    -- Effectiveness tracking
    injection_count INTEGER DEFAULT 0,       -- Times this rule was injected
    prevented_errors INTEGER DEFAULT 0,      -- Estimated errors prevented
    effectiveness_score REAL,                -- prevented_errors / injection_count
    
    -- Lifecycle
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_learned_rules_task ON learned_rules(task_type, agent_type);
CREATE INDEX idx_learned_rules_priority ON learned_rules(rule_priority DESC);
CREATE INDEX idx_learned_rules_active ON learned_rules(is_active) WHERE is_active = 1;


-- ============================================================================
-- EVALUATION SYSTEM
-- ============================================================================

-- Evaluation test cases - for measuring agent quality over time
CREATE TABLE IF NOT EXISTS eval_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    
    -- Test case definition
    name TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL,
    difficulty TEXT CHECK (difficulty IN ('trivial', 'easy', 'medium', 'hard', 'expert')),
    
    -- The test
    input_prompt TEXT NOT NULL,
    expected_behaviors TEXT,                 -- JSON array of things output should do/contain
    validation_script TEXT,                  -- Optional: script that validates output
    
    -- Ground truth (optional)
    reference_output TEXT,                   -- Known-good output for comparison
    
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);


-- Evaluation runs - track agent quality over time
CREATE TABLE IF NOT EXISTS eval_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    
    -- Run metadata
    run_name TEXT,                           -- "nightly-2024-01-15", "post-prompt-update-v3"
    agent_type TEXT NOT NULL,
    model TEXT NOT NULL,
    system_prompt_hash TEXT,                 -- Track which prompt version was used
    
    -- Aggregate results
    total_cases INTEGER NOT NULL,
    passed_cases INTEGER NOT NULL,
    failed_cases INTEGER NOT NULL,
    pass_rate REAL GENERATED ALWAYS AS (CAST(passed_cases AS REAL) / total_cases) STORED,
    
    -- Timing
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);


-- Individual eval results
CREATE TABLE IF NOT EXISTS eval_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    eval_run_id INTEGER NOT NULL,
    eval_case_id INTEGER NOT NULL,
    
    -- Result
    passed INTEGER NOT NULL,                 -- 0 or 1
    agent_output TEXT,
    validation_details TEXT,                 -- JSON: which checks passed/failed
    
    -- Execution info
    execution_id INTEGER,                    -- Link to agent_executions if logged
    duration_ms INTEGER,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (eval_run_id) REFERENCES eval_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (eval_case_id) REFERENCES eval_cases(id),
    FOREIGN KEY (execution_id) REFERENCES agent_executions(id)
);


-- ============================================================================
-- PROMPT VERSIONING
-- ============================================================================

-- Track system prompt versions for A/B testing and rollback
CREATE TABLE IF NOT EXISTS prompt_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    
    -- Identification
    agent_type TEXT NOT NULL,
    version TEXT NOT NULL,                   -- Semantic version: "1.2.3"
    version_hash TEXT NOT NULL,              -- SHA256 of prompt content
    
    -- Content
    system_prompt TEXT NOT NULL,
    
    -- Metadata
    description TEXT,                        -- What changed in this version
    parent_version_id INTEGER,               -- Previous version this derived from
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'testing', 'active', 'deprecated')),
    
    -- Performance tracking
    total_executions INTEGER DEFAULT 0,
    success_rate REAL,
    avg_quality_score REAL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    deprecated_at TIMESTAMP,
    
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (parent_version_id) REFERENCES prompt_versions(id),
    UNIQUE(tenant_id, agent_type, version)
);


-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Most common errors by task type (for rule generation)
CREATE VIEW IF NOT EXISTS v_common_errors AS
SELECT 
    ae.tenant_id,
    ae.task_type,
    ee.category,
    ee.subcategory,
    COUNT(*) as occurrence_count,
    COUNT(DISTINCT ae.ticket_id) as affected_tickets,
    GROUP_CONCAT(DISTINCT ee.resolution_method) as resolution_methods,
    MAX(ee.created_at) as last_seen
FROM agent_executions ae
JOIN execution_errors ee ON ae.id = ee.execution_id
WHERE ae.outcome IN ('failure', 'partial')
GROUP BY ae.tenant_id, ae.task_type, ee.category, ee.subcategory
ORDER BY occurrence_count DESC;


-- Agent performance over time (for dashboards)
CREATE VIEW IF NOT EXISTS v_agent_performance AS
SELECT 
    tenant_id,
    agent_type,
    task_type,
    DATE(created_at) as execution_date,
    COUNT(*) as total_executions,
    SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
    SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
    ROUND(AVG(CASE WHEN outcome = 'success' THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate,
    ROUND(AVG(duration_ms), 0) as avg_duration_ms,
    SUM(input_tokens + COALESCE(output_tokens, 0)) as total_tokens
FROM agent_executions
GROUP BY tenant_id, agent_type, task_type, DATE(created_at);


-- Best patterns for injection (quality-weighted, recently successful)
CREATE VIEW IF NOT EXISTS v_injectable_patterns AS
SELECT 
    sp.*,
    (sp.quality_score * 0.4 + 
     COALESCE(sp.success_rate, 0.5) * 0.4 + 
     (1.0 / (1 + (julianday('now') - julianday(sp.last_used_at)))) * 0.2
    ) as injection_score
FROM successful_patterns sp
WHERE sp.is_active = 1
ORDER BY injection_score DESC;


-- Active rules for prompt injection
CREATE VIEW IF NOT EXISTS v_active_rules AS
SELECT 
    lr.*,
    (lr.rule_priority / 100.0 * 0.5 +
     COALESCE(lr.effectiveness_score, 0.5) * 0.3 +
     (lr.evidence_count / (lr.evidence_count + 10.0)) * 0.2
    ) as injection_priority
FROM learned_rules lr
WHERE lr.is_active = 1
ORDER BY injection_priority DESC;


-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update learned_rules when new errors match existing rules
CREATE TRIGGER IF NOT EXISTS trg_update_rule_evidence
AFTER INSERT ON execution_errors
BEGIN
    UPDATE learned_rules 
    SET 
        evidence_count = evidence_count + 1,
        last_evidence_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE error_category = NEW.category
      AND is_active = 1;
END;


-- Track pattern usage
CREATE TRIGGER IF NOT EXISTS trg_pattern_used
AFTER UPDATE OF usage_count ON successful_patterns
BEGIN
    UPDATE successful_patterns 
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;


-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Common rules that apply across most coding tasks
INSERT OR IGNORE INTO learned_rules (tenant_id, task_type, agent_type, error_category, rule_text, rule_priority) VALUES
('default', NULL, 'coder', 'syntax', 'Always include all necessary imports at the top of the file. Never assume imports exist.', 90),
('default', NULL, 'coder', 'runtime', 'Handle null/undefined cases explicitly. Check if variables exist before accessing properties.', 85),
('default', NULL, 'coder', 'api', 'When using external APIs, always wrap calls in try/catch and handle errors gracefully.', 80),
('default', NULL, 'coder', 'context', 'If the task references existing code or files, wait for that context before generating code.', 95),
('default', 'code_generation', 'coder', 'logic', 'Include edge case handling: empty arrays, zero values, null inputs, boundary conditions.', 75),
('default', 'test_write', 'coder', 'logic', 'Write tests that cover: happy path, error cases, edge cases, and boundary conditions.', 85),
('default', 'bug_fix', 'coder', 'context', 'Before fixing, clearly state your understanding of: 1) Current behavior, 2) Expected behavior, 3) Root cause.', 90),
('default', NULL, 'coder', 'syntax', 'Use consistent code style matching the existing codebase. Follow established patterns.', 70);
```

---

## TypeScript Module

```typescript
/**
 * SWARM AGENT LEARNING MODULE
 * 
 * Queries the agent learning database and builds enhanced prompts
 * with error prevention rules and successful patterns.
 * 
 * Usage:
 *   const learner = new AgentLearner(db, tenantId);
 *   const enhancedPrompt = await learner.buildPrompt('coder', 'code_generation', basePrompt);
 */

import Database from 'better-sqlite3';

// ============================================================================
// TYPES
// ============================================================================

interface LearnedRule {
  id: number;
  rule_text: string;
  error_category: string;
  effectiveness_score: number | null;
  injection_priority: number;
}

interface SuccessfulPattern {
  id: number;
  pattern_name: string;
  task_input: string;
  task_output: string;
  quality_score: number;
  injection_score: number;
}

interface ExecutionOutcome {
  execution_id: number;
  outcome: 'success' | 'failure' | 'partial' | 'timeout' | 'error';
  errors?: ErrorClassification[];
}

interface ErrorClassification {
  category: string;
  subcategory?: string;
  error_message: string;
  resolution_method?: string;
  resolution_details?: string;
}

interface AgentExecutionLog {
  tenant_id: string;
  ticket_id?: string;
  vm_id?: string;
  agent_type: string;
  task_type: string;
  task_input: string;
  task_context?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  started_at: Date;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class AgentLearner {
  private db: Database.Database;
  private tenantId: string;
  
  constructor(db: Database.Database, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * Build an enhanced system prompt with learned rules and patterns
   */
  async buildPrompt(
    agentType: string,
    taskType: string,
    basePrompt: string,
    options: {
      maxRules?: number;
      maxPatterns?: number;
      includePatterns?: boolean;
    } = {}
  ): Promise<string> {
    const { 
      maxRules = 5, 
      maxPatterns = 2, 
      includePatterns = true 
    } = options;

    const rules = this.getActiveRules(agentType, taskType, maxRules);
    const patterns = includePatterns 
      ? this.getSuccessfulPatterns(taskType, maxPatterns)
      : [];

    let enhancedPrompt = basePrompt;

    // Inject learned rules
    if (rules.length > 0) {
      const rulesSection = `
## Learned Guidelines

Based on past experience, follow these guidelines to avoid common mistakes:

${rules.map((r, i) => `${i + 1}. ${r.rule_text}`).join('\n')}
`;
      enhancedPrompt = this.insertSection(enhancedPrompt, rulesSection, 'after_intro');
    }

    // Inject few-shot examples
    if (patterns.length > 0) {
      const patternsSection = `
## Example Completions

${patterns.map(p => `### ${p.pattern_name || 'Example'}
**Input:** ${this.truncate(p.task_input, 200)}
**Output:** ${this.truncate(p.task_output, 500)}
`).join('\n')}
`;
      enhancedPrompt = this.insertSection(enhancedPrompt, patternsSection, 'before_task');
    }

    this.recordRuleInjections(rules.map(r => r.id));
    return enhancedPrompt;
  }

  /**
   * Build few-shot messages array for chat completion
   */
  buildFewShotMessages(
    taskType: string,
    maxExamples: number = 3
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const patterns = this.getSuccessfulPatterns(taskType, maxExamples);
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    for (const pattern of patterns) {
      messages.push({ role: 'user', content: pattern.task_input });
      messages.push({ role: 'assistant', content: pattern.task_output });
      this.incrementPatternUsage(pattern.id);
    }
    
    return messages;
  }

  /**
   * Get active rules relevant to this agent/task type
   */
  getActiveRules(agentType: string, taskType: string, limit: number = 10): LearnedRule[] {
    const sql = `
      SELECT 
        id, rule_text, error_category, effectiveness_score,
        (rule_priority / 100.0 * 0.5 +
         COALESCE(effectiveness_score, 0.5) * 0.3 +
         (evidence_count / (evidence_count + 10.0)) * 0.2
        ) as injection_priority
      FROM learned_rules
      WHERE is_active = 1
        AND (tenant_id = ? OR tenant_id = 'default')
        AND (agent_type IS NULL OR agent_type = ?)
        AND (task_type IS NULL OR task_type = ?)
      ORDER BY injection_priority DESC
      LIMIT ?
    `;
    return this.db.prepare(sql).all(this.tenantId, agentType, taskType, limit) as LearnedRule[];
  }

  /**
   * Get successful patterns for few-shot injection
   */
  getSuccessfulPatterns(taskType: string, limit: number = 3): SuccessfulPattern[] {
    const sql = `
      SELECT 
        id, pattern_name, task_input, task_output, quality_score,
        (quality_score * 0.4 + 
         COALESCE(success_rate, 0.5) * 0.4 + 
         (1.0 / (1 + (julianday('now') - julianday(COALESCE(last_used_at, created_at))))) * 0.2
        ) as injection_score
      FROM successful_patterns
      WHERE is_active = 1
        AND (tenant_id = ? OR tenant_id = 'default')
        AND task_type = ?
      ORDER BY injection_score DESC
      LIMIT ?
    `;
    return this.db.prepare(sql).all(this.tenantId, taskType, limit) as SuccessfulPattern[];
  }

  /**
   * Start logging an agent execution
   */
  startExecution(log: AgentExecutionLog): number {
    const sql = `
      INSERT INTO agent_executions (
        tenant_id, ticket_id, vm_id, agent_type, task_type,
        task_input, task_context, model, temperature, max_tokens, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = this.db.prepare(sql).run(
      log.tenant_id, log.ticket_id || null, log.vm_id || null,
      log.agent_type, log.task_type, log.task_input,
      log.task_context || null, log.model || 'claude-sonnet-4-20250514',
      log.temperature ?? 0.0, log.max_tokens || null,
      log.started_at.toISOString()
    );
    return result.lastInsertRowid as number;
  }

  /**
   * Complete an execution log
   */
  completeExecution(
    executionId: number,
    outcome: ExecutionOutcome['outcome'],
    agentOutput: string,
    tokenUsage?: { input: number; output: number }
  ): void {
    const completedAt = new Date();
    const execution = this.db.prepare(
      'SELECT started_at FROM agent_executions WHERE id = ?'
    ).get(executionId) as { started_at: string } | undefined;
    
    const durationMs = execution
      ? completedAt.getTime() - new Date(execution.started_at).getTime()
      : null;

    this.db.prepare(`
      UPDATE agent_executions SET
        outcome = ?, agent_output = ?, completed_at = ?,
        duration_ms = ?, input_tokens = ?, output_tokens = ?
      WHERE id = ?
    `).run(outcome, agentOutput, completedAt.toISOString(),
           durationMs, tokenUsage?.input || null, tokenUsage?.output || null, executionId);
  }

  /**
   * Log errors from a failed execution
   */
  logErrors(executionId: number, errors: ErrorClassification[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO execution_errors (
        execution_id, category, subcategory, error_message,
        resolution_method, resolution_details
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const error of errors) {
      stmt.run(executionId, error.category, error.subcategory || null,
               error.error_message, error.resolution_method || null,
               error.resolution_details || null);
    }
  }

  /**
   * Save a successful pattern for future few-shot injection
   */
  saveSuccessfulPattern(
    taskType: string,
    taskInput: string,
    taskOutput: string,
    options: { patternName?: string; tags?: string[]; qualityScore?: number; sourceExecutionId?: number } = {}
  ): number {
    const result = this.db.prepare(`
      INSERT INTO successful_patterns (
        tenant_id, task_type, pattern_name, tags,
        task_input, task_output, quality_score, source_execution_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(this.tenantId, taskType, options.patternName || null,
           options.tags ? JSON.stringify(options.tags) : null,
           taskInput, taskOutput, options.qualityScore ?? 1.0,
           options.sourceExecutionId || null);
    return result.lastInsertRowid as number;
  }

  /**
   * Create or update a learned rule based on error patterns
   */
  upsertLearnedRule(
    errorCategory: string,
    ruleText: string,
    options: { taskType?: string; agentType?: string; priority?: number } = {}
  ): void {
    const existing = this.db.prepare(`
      SELECT id FROM learned_rules
      WHERE tenant_id = ? AND error_category = ? AND rule_text = ?
    `).get(this.tenantId, errorCategory, ruleText);

    if (existing) {
      this.db.prepare(`
        UPDATE learned_rules SET
          evidence_count = evidence_count + 1,
          last_evidence_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run((existing as any).id);
    } else {
      this.db.prepare(`
        INSERT INTO learned_rules (
          tenant_id, task_type, agent_type, error_category, rule_text, rule_priority
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(this.tenantId, options.taskType || null, options.agentType || null,
             errorCategory, ruleText, options.priority ?? 50);
    }
  }

  // Private helpers
  private recordRuleInjections(ruleIds: number[]): void {
    if (ruleIds.length === 0) return;
    this.db.prepare(`
      UPDATE learned_rules SET injection_count = injection_count + 1
      WHERE id IN (${ruleIds.map(() => '?').join(',')})
    `).run(...ruleIds);
  }

  private incrementPatternUsage(patternId: number): void {
    this.db.prepare(`
      UPDATE successful_patterns 
      SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(patternId);
  }

  private truncate(text: string, maxLength: number): string {
    return text.length <= maxLength ? text : text.substring(0, maxLength - 3) + '...';
  }

  private insertSection(prompt: string, section: string, position: 'after_intro' | 'before_task'): string {
    if (position === 'after_intro') {
      const firstBreak = prompt.indexOf('\n\n');
      if (firstBreak > 0) {
        return prompt.slice(0, firstBreak) + '\n' + section + prompt.slice(firstBreak);
      }
    }
    return prompt + '\n' + section;
  }
}


// ============================================================================
// ERROR CLASSIFIER
// ============================================================================

export class ErrorClassifier {
  static classify(error: Error | string, context?: string): ErrorClassification {
    const errorStr = typeof error === 'string' ? error : error.message;
    
    if (/SyntaxError|Unexpected token|Parse error/i.test(errorStr)) {
      return { category: 'syntax', subcategory: this.detectSyntaxSubcategory(errorStr), error_message: errorStr };
    }
    if (/TypeError|is not a function|undefined is not/i.test(errorStr)) {
      return { category: 'runtime', subcategory: 'type_error', error_message: errorStr };
    }
    if (/ReferenceError|is not defined|Cannot find module/i.test(errorStr)) {
      return { category: 'runtime', subcategory: 'missing_reference', error_message: errorStr,
               resolution_method: 'prompt_adjustment', resolution_details: 'Ensure all imports and declarations included' };
    }
    if (/ECONNREFUSED|ETIMEDOUT|fetch failed|API error|rate limit/i.test(errorStr)) {
      return { category: 'api', subcategory: this.detectApiSubcategory(errorStr), error_message: errorStr };
    }
    if (/timeout|timed out/i.test(errorStr)) {
      return { category: 'timeout', error_message: errorStr };
    }
    return { category: 'logic', error_message: errorStr };
  }
  
  private static detectSyntaxSubcategory(error: string): string {
    if (/unexpected token/i.test(error)) return 'unexpected_token';
    if (/missing|expected/i.test(error)) return 'missing_syntax';
    if (/unterminated/i.test(error)) return 'unterminated';
    return 'general';
  }
  
  private static detectApiSubcategory(error: string): string {
    if (/rate limit/i.test(error)) return 'rate_limit';
    if (/auth|unauthorized|forbidden/i.test(error)) return 'auth_error';
    if (/not found|404/i.test(error)) return 'not_found';
    return 'connection_error';
  }
}
```

---

## Usage Example

```typescript
import Database from 'better-sqlite3';
import { AgentLearner, ErrorClassifier } from './agent-learning';

const db = new Database('/opt/swarm-tickets/data/swarm.db');
const learner = new AgentLearner(db, 'tenant-123');

// Before calling Claude - enhance prompt with learnings
const basePrompt = "You are a coding assistant...";
const enhancedPrompt = await learner.buildPrompt('coder', 'code_generation', basePrompt);
const fewShotMessages = learner.buildFewShotMessages('code_generation', 2);

// Start logging execution
const executionId = learner.startExecution({
  tenant_id: 'tenant-123',
  ticket_id: 'TICKET-456',
  agent_type: 'coder',
  task_type: 'code_generation',
  task_input: userRequest,
  started_at: new Date()
});

// Call Claude
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: enhancedPrompt,
  messages: [...fewShotMessages, { role: 'user', content: userRequest }]
});

// Validate and log outcome
const validation = await validateCode(response.content);

if (validation.success) {
  learner.completeExecution(executionId, 'success', response.content);
  
  // Save high-quality completions as patterns
  if (validation.highQuality) {
    learner.saveSuccessfulPattern('code_generation', userRequest, response.content, {
      patternName: 'Good code example',
      qualityScore: validation.score,
      sourceExecutionId: executionId
    });
  }
} else {
  learner.completeExecution(executionId, 'failure', response.content);
  
  // Classify and log errors
  const errors = validation.errors.map(e => ErrorClassifier.classify(e));
  learner.logErrors(executionId, errors);
}
```

---

## Deployment

### Apply Schema

```bash
# Backup first
cp /opt/swarm-tickets/data/swarm.db /opt/swarm-tickets/data/swarm.db.backup

# Apply migrations (extract SQL from this doc or use standalone file)
sqlite3 /opt/swarm-tickets/data/swarm.db < agent-learning-schema.sql

# Verify
sqlite3 /opt/swarm-tickets/data/swarm.db ".tables"
```

### Integration Points

1. **Agent Runner** - Add `startExecution()` before Claude call, `completeExecution()` after
2. **Validation Layer** - Use `ErrorClassifier` to categorize failures
3. **Prompt Builder** - Use `buildPrompt()` instead of raw system prompts
4. **Dashboard** - Query `v_agent_performance` and `v_common_errors` views

---

## Key Insights

- **Claude improves through better context, not training** — our job is surfacing the right context at the right time
- **Rule effectiveness tracking** enables automatic deprecation of unhelpful rules
- **Pattern quality scoring** ensures only the best examples are injected
- **Multi-tenant isolation** preserves per-customer learnings

---

## References

- Swarm Ticket System: `/opt/swarm-tickets/`
- Existing Schema: `swarm-specs/design/swarm-data-model-v2.md`
- Agent Prompts: `swarm-specs/design/swarm-agent-prompts.md`
