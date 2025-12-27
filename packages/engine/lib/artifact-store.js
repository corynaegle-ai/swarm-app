/**
 * Artifact Store
 * Persists execution artifacts (stdout, stderr, files, PR URLs)
 * Uses SQLite for storage with optional file-based large artifact support
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Artifact types
export const ARTIFACT_TYPE = {
  STDOUT: 'stdout',
  STDERR: 'stderr',
  FILE: 'file',
  PR_URL: 'pr_url',
  LOG: 'log',
  METRICS: 'metrics',
  CHECKPOINT: 'checkpoint'
};

export class ArtifactStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || '/opt/swarm-engine/artifacts.db';
    this.artifactDir = options.artifactDir || '/opt/swarm-engine/artifacts';
    this.maxInlineSize = options.maxInlineSize || 64 * 1024; // 64KB inline limit
    
    this.db = null;
  }

  /**
   * Initialize the artifact store
   */
  init() {
    // Ensure artifact directory exists
    if (!existsSync(this.artifactDir)) {
      mkdirSync(this.artifactDir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    
    this.createTables();
  }

  /**
   * Create database tables
   */
  createTables() {
    this.db.exec(`
      -- Execution artifacts
      CREATE TABLE IF NOT EXISTS execution_artifacts (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        workflow_run_id TEXT,
        step_id TEXT,
        vm_id INTEGER,
        artifact_type TEXT NOT NULL,
        content TEXT,
        file_path TEXT,
        size_bytes INTEGER,
        metadata JSON,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_artifacts_ticket ON execution_artifacts(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_run ON execution_artifacts(workflow_run_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_type ON execution_artifacts(artifact_type);
      
      -- VM assignments tracking
      CREATE TABLE IF NOT EXISTS vm_assignments (
        vm_id INTEGER PRIMARY KEY,
        ticket_id TEXT,
        workflow_run_id TEXT,
        step_id TEXT,
        assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'running',
        completed_at TEXT,
        exit_code INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_vm_assign_ticket ON vm_assignments(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_vm_assign_status ON vm_assignments(status);
      
      -- Execution metrics
      CREATE TABLE IF NOT EXISTS execution_metrics (
        id TEXT PRIMARY KEY,
        ticket_id TEXT,
        workflow_run_id TEXT,
        step_id TEXT,
        vm_id INTEGER,
        metric_name TEXT NOT NULL,
        metric_value REAL,
        unit TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_metrics_ticket ON execution_metrics(ticket_id);
    `);
  }

  /**
   * Store an artifact
   */
  storeArtifact(artifact) {
    const id = artifact.id || randomUUID();
    let content = artifact.content;
    let filePath = null;
    let sizeBytes = 0;
    
    if (content) {
      sizeBytes = Buffer.byteLength(content, 'utf-8');
      
      // Store large artifacts to file
      if (sizeBytes > this.maxInlineSize) {
        filePath = join(this.artifactDir, `${id}.artifact`);
        writeFileSync(filePath, content);
        content = null; // Don't store in DB
      }
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO execution_artifacts 
        (id, ticket_id, workflow_run_id, step_id, vm_id, artifact_type, content, file_path, size_bytes, metadata, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      artifact.ticketId,
      artifact.workflowRunId || null,
      artifact.stepId || null,
      artifact.vmId || null,
      artifact.type,
      content,
      filePath,
      sizeBytes,
      JSON.stringify(artifact.metadata || {}),
      artifact.expiresAt || null
    );
    
    return id;
  }

  /**
   * Get artifact by ID
   */
  getArtifact(id) {
    const row = this.db.prepare('SELECT * FROM execution_artifacts WHERE id = ?').get(id);
    
    if (!row) return null;
    
    // Load content from file if needed
    if (row.file_path && existsSync(row.file_path)) {
      row.content = readFileSync(row.file_path, 'utf-8');
    }
    
    row.metadata = JSON.parse(row.metadata || '{}');
    return row;
  }

  /**
   * Get artifacts for a ticket
   */
  getArtifactsForTicket(ticketId, type = null) {
    let sql = 'SELECT * FROM execution_artifacts WHERE ticket_id = ?';
    const params = [ticketId];
    
    if (type) {
      sql += ' AND artifact_type = ?';
      params.push(type);
    }
    
    sql += ' ORDER BY created_at ASC';
    
    return this.db.prepare(sql).all(...params).map(row => {
      if (row.file_path && existsSync(row.file_path)) {
        row.content = readFileSync(row.file_path, 'utf-8');
      }
      row.metadata = JSON.parse(row.metadata || '{}');
      return row;
    });
  }

  /**
   * Record VM assignment
   */
  recordVMAssignment(vmId, ticketId, workflowRunId = null, stepId = null) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vm_assignments 
        (vm_id, ticket_id, workflow_run_id, step_id, assigned_at, status)
      VALUES (?, ?, ?, ?, datetime('now'), 'running')
    `);
    
    stmt.run(vmId, ticketId, workflowRunId, stepId);
  }

  /**
   * Update VM assignment status
   */
  updateVMAssignment(vmId, status, exitCode = null) {
    const stmt = this.db.prepare(`
      UPDATE vm_assignments 
      SET status = ?, completed_at = datetime('now'), exit_code = ?
      WHERE vm_id = ?
    `);
    
    stmt.run(status, exitCode, vmId);
  }

  /**
   * Get active VM assignments
   */
  getActiveAssignments() {
    return this.db.prepare(
      "SELECT * FROM vm_assignments WHERE status = 'running' ORDER BY assigned_at ASC"
    ).all();
  }

  /**
   * Record execution metric
   */
  recordMetric(data) {
    const id = randomUUID();
    
    const stmt = this.db.prepare(`
      INSERT INTO execution_metrics 
        (id, ticket_id, workflow_run_id, step_id, vm_id, metric_name, metric_value, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      data.ticketId || null,
      data.workflowRunId || null,
      data.stepId || null,
      data.vmId || null,
      data.name,
      data.value,
      data.unit || null
    );
    
    return id;
  }

  /**
   * Get metrics for a ticket
   */
  getMetricsForTicket(ticketId) {
    return this.db.prepare(
      'SELECT * FROM execution_metrics WHERE ticket_id = ? ORDER BY created_at ASC'
    ).all(ticketId);
  }

  /**
   * Cleanup expired artifacts
   */
  cleanupExpired() {
    const result = this.db.prepare(`
      DELETE FROM execution_artifacts 
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `).run();
    
    return result.changes;
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

export default ArtifactStore;
