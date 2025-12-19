/**
 * Rule Generator
 * Auto-creates optimization rules from detected patterns
 * 
 * Location: /opt/swarm-platform/lib/rule-generator.js
 */

const Database = require('better-sqlite3');
const DB_PATH = process.env.SWARM_DB_PATH || '/opt/swarm-platform/data/swarm.db';

// Rule types
const RULE_TYPES = {
  RETRY_STRATEGY: 'retry_strategy',
  MODEL_SELECTION: 'model_selection',
  TIME_AVOIDANCE: 'time_avoidance',
  CONTEXT_LIMIT: 'context_limit',
  TASK_ROUTING: 'task_routing'
};

class RuleGenerator {
  constructor() {
    this.db = new Database(DB_PATH);
    this.ensureTable();
  }

  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        rule_type TEXT NOT NULL,
        pattern TEXT NOT NULL,
        action TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        enabled INTEGER DEFAULT 1,
        hits INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_rules_tenant ON learning_rules(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_rules_type ON learning_rules(rule_type);
    `);
  }

  /**
   * Generate rules from error patterns
   */
  generateRetryRules(errorPatterns, tenantId = null) {
    const rules = [];
    for (const pattern of errorPatterns) {
      if (pattern.category === 'api') {
        const delayMs = pattern.subcategory === 'rate_limit' ? 60000 : 5000;
        rules.push({
          tenant_id: tenantId,
          rule_type: RULE_TYPES.RETRY_STRATEGY,
          pattern: JSON.stringify({ category: pattern.category, subcategory: pattern.subcategory }),
          action: JSON.stringify({ delay_ms: delayMs, max_retries: 3, backoff: 'exponential' }),
          confidence: Math.min(pattern.occurrences / 5, 1.0)
        });
      }
      if (pattern.category === 'timeout') {
        rules.push({
          tenant_id: tenantId,
          rule_type: RULE_TYPES.RETRY_STRATEGY,
          pattern: JSON.stringify({ category: 'timeout' }),
          action: JSON.stringify({ delay_ms: 10000, max_retries: 2, increase_timeout: true }),
          confidence: Math.min(pattern.occurrences / 3, 1.0)
        });
      }
    }
    return rules;
  }

  /**
   * Generate time avoidance rules from temporal patterns
   */
  generateTimeRules(temporalPatterns, tenantId = null) {
    const rules = [];
    const highFailureHours = temporalPatterns
      .filter(p => p.failure_rate_pct > 30 && p.total_executions >= 5);

    if (highFailureHours.length > 0) {
      const avoidHours = highFailureHours.map(p => p.hour_utc);
      rules.push({
        tenant_id: tenantId,
        rule_type: RULE_TYPES.TIME_AVOIDANCE,
        pattern: JSON.stringify({ high_failure_hours: avoidHours }),
        action: JSON.stringify({ prefer_hours: avoidHours.map(h => (h + 12) % 24), reason: 'historical_failures' }),
        confidence: Math.min(highFailureHours[0].failure_rate_pct / 100, 0.9)
      });
    }
    return rules;
  }

  /**
   * Generate model selection rules from success combos
   */
  generateModelRules(successCombos, tenantId = null) {
    const rules = [];
    const modelPerf = {};

    for (const combo of successCombos) {
      if (!modelPerf[combo.model]) {
        modelPerf[combo.model] = { total: 0, successes: 0, avgTokens: 0 };
      }
      modelPerf[combo.model].total += combo.total_executions;
      modelPerf[combo.model].successes += combo.successes;
      modelPerf[combo.model].avgTokens = combo.avg_input_tokens + combo.avg_output_tokens;
    }

    const bestModel = Object.entries(modelPerf)
      .filter(([_, stats]) => stats.total >= 5)
      .sort((a, b) => (b[1].successes / b[1].total) - (a[1].successes / a[1].total))[0];

    if (bestModel) {
      rules.push({
        tenant_id: tenantId,
        rule_type: RULE_TYPES.MODEL_SELECTION,
        pattern: JSON.stringify({ default: true }),
        action: JSON.stringify({ preferred_model: bestModel[0], fallback: 'claude-sonnet-4-20250514' }),
        confidence: bestModel[1].successes / bestModel[1].total
      });
    }
    return rules;
  }

  /**
   * Save rules to database (upsert)
   */
  saveRules(rules) {
    const stmt = this.db.prepare(`
      INSERT INTO learning_rules (tenant_id, rule_type, pattern, action, confidence)
      VALUES (@tenant_id, @rule_type, @pattern, @action, @confidence)
    `);
    const results = [];
    for (const rule of rules) {
      const existing = this.db.prepare(`
        SELECT id FROM learning_rules WHERE rule_type = ? AND pattern = ? AND (tenant_id = ? OR tenant_id IS NULL)
      `).get(rule.rule_type, rule.pattern, rule.tenant_id);

      if (existing) {
        this.db.prepare(`UPDATE learning_rules SET confidence = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(rule.confidence, existing.id);
        results.push({ id: existing.id, action: 'updated' });
      } else {
        const result = stmt.run(rule);
        results.push({ id: result.lastInsertRowid, action: 'created' });
      }
    }
    return results;
  }

  /**
   * Get active rules for a tenant
   */
  getRules(tenantId = null, ruleType = null) {
    let query = 'SELECT * FROM learning_rules WHERE enabled = 1';
    const params = [];
    if (tenantId) { query += ' AND (tenant_id = ? OR tenant_id IS NULL)'; params.push(tenantId); }
    if (ruleType) { query += ' AND rule_type = ?'; params.push(ruleType); }
    query += ' ORDER BY confidence DESC';
    return this.db.prepare(query).all(...params);
  }

  /**
   * Generate all rules from patterns object
   */
  generateAllRules(patterns, tenantId = null) {
    const allRules = [
      ...this.generateRetryRules(patterns.errorPatterns || [], tenantId),
      ...this.generateTimeRules(patterns.temporalPatterns || [], tenantId),
      ...this.generateModelRules(patterns.successfulCombos || [], tenantId)
    ];
    return allRules;
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }
}

module.exports = { RuleGenerator, RULE_TYPES };
