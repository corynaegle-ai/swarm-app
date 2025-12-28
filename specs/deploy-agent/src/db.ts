/**
 * Database - SQLite storage for deployments and queue
 */

import Database from 'better-sqlite3';
import { logger } from './logger';

export class DeploymentDB {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }
  
  async initialize(): Promise<void> {
    this.db.exec(`
      -- Deployments table
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        service TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        build_log TEXT,
        deploy_log TEXT,
        health_check_result TEXT,
        rollback_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Deployment events for audit trail
      CREATE TABLE IF NOT EXISTS deployment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deployment_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (deployment_id) REFERENCES deployments(id)
      );
      
      -- Deploy queue for ticket-aware deployments
      CREATE TABLE IF NOT EXISTS deploy_queue (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        parent_ticket_id TEXT,
        commit_sha TEXT NOT NULL,
        repo TEXT NOT NULL,
        service TEXT NOT NULL,
        pr_number INTEGER,
        status TEXT DEFAULT 'waiting',
        waiting_for TEXT,
        queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deployed_at TEXT
      );
      
      -- Track which commits belong to which tickets
      CREATE TABLE IF NOT EXISTS commit_ticket_map (
        commit_sha TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        repo TEXT NOT NULL,
        pr_number INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_deployments_service ON deployments(service);
      CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
      CREATE INDEX IF NOT EXISTS idx_events_deployment ON deployment_events(deployment_id);
      CREATE INDEX IF NOT EXISTS idx_queue_status ON deploy_queue(status);
      CREATE INDEX IF NOT EXISTS idx_queue_parent ON deploy_queue(parent_ticket_id);
      CREATE INDEX IF NOT EXISTS idx_commit_ticket ON commit_ticket_map(ticket_id);
    `);
    
    logger.info('Database initialized');
  }
  
  // === Deployment Operations ===
  
  createDeployment(deployment: {
    id: string;
    service: string;
    commit_sha: string;
    triggered_by: string;
    trigger_type: string;
    status: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO deployments (id, service, commit_sha, triggered_by, trigger_type, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(deployment.id, deployment.service, deployment.commit_sha, 
             deployment.triggered_by, deployment.trigger_type, deployment.status);
  }
  
  updateDeploymentStatus(id: string, status: string): void {
    const stmt = this.db.prepare('UPDATE deployments SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }
  
  completeDeployment(id: string): void {
    const stmt = this.db.prepare('UPDATE deployments SET completed_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  }
  
  setRollbackReason(id: string, reason: string): void {
    const stmt = this.db.prepare('UPDATE deployments SET rollback_reason = ?, status = ? WHERE id = ?');
    stmt.run(reason, 'rolled_back', id);
  }
  
  addDeploymentEvent(deploymentId: string, stage: string, status: string, message: string, details?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO deployment_events (deployment_id, stage, status, message, details)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(deploymentId, stage, status, message, details || null);
  }
  
  getDeployment(id: string): any {
    const deployment = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    if (deployment) {
      const events = this.db.prepare('SELECT * FROM deployment_events WHERE deployment_id = ? ORDER BY created_at').all(id);
      return { ...deployment, events };
    }
    return null;
  }
  
  listDeployments(limit: number = 50): any[] {
    return this.db.prepare('SELECT * FROM deployments ORDER BY created_at DESC LIMIT ?').all(limit);
  }
  
  // === Queue Operations ===
  
  addToQueue(item: {
    id: string;
    ticket_id: string;
    parent_ticket_id: string | null;
    commit_sha: string;
    repo: string;
    service: string;
    pr_number?: number;
    waiting_for: string[];
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO deploy_queue (id, ticket_id, parent_ticket_id, commit_sha, repo, service, pr_number, waiting_for)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      item.id, 
      item.ticket_id, 
      item.parent_ticket_id, 
      item.commit_sha, 
      item.repo, 
      item.service,
      item.pr_number || null,
      JSON.stringify(item.waiting_for)
    );
  }
  
  getQueuedByParent(parentTicketId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM deploy_queue 
      WHERE parent_ticket_id = ? AND status = 'waiting'
      ORDER BY queued_at ASC
    `).all(parentTicketId);
  }
  
  getQueuedWaitingFor(ticketId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM deploy_queue 
      WHERE status = 'waiting' 
      AND waiting_for LIKE ?
    `).all(`%${ticketId}%`);
  }
  
  updateQueueStatus(id: string, status: string): void {
    const stmt = this.db.prepare(`
      UPDATE deploy_queue 
      SET status = ?, deployed_at = CASE WHEN ? = 'deployed' THEN CURRENT_TIMESTAMP ELSE deployed_at END
      WHERE id = ?
    `);
    stmt.run(status, status, id);
  }
  
  getQueueItem(id: string): any {
    return this.db.prepare('SELECT * FROM deploy_queue WHERE id = ?').get(id);
  }
  
  listQueue(status?: string): any[] {
    if (status) {
      return this.db.prepare('SELECT * FROM deploy_queue WHERE status = ? ORDER BY queued_at DESC').all(status);
    }
    return this.db.prepare('SELECT * FROM deploy_queue ORDER BY queued_at DESC LIMIT 100').all();
  }
  
  // === Commit-Ticket Mapping ===
  
  mapCommitToTicket(commitSha: string, ticketId: string, repo: string, prNumber?: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO commit_ticket_map (commit_sha, ticket_id, repo, pr_number)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(commitSha, ticketId, repo, prNumber || null);
  }
  
  getTicketForCommit(commitSha: string): any {
    return this.db.prepare('SELECT * FROM commit_ticket_map WHERE commit_sha = ?').get(commitSha);
  }
}

export { DeploymentDB as Database };
