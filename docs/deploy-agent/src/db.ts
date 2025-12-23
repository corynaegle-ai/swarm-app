import { Database } from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

export class DeploymentDB {
  private db: Database;
  private dbPath: string;

  constructor(dbPath: string = './deployment.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
  }

  async initializeDatabase(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));

    // Create tickets table
    await run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        assignee TEXT,
        reporter TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        labels TEXT,
        project TEXT
      )
    `);

    // Create deployments table
    await run(`
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        environment TEXT NOT NULL,
        branch TEXT,
        commit_hash TEXT,
        deployed_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        logs TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
      )
    `);

    // Create ticket_comments table
    await run(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id)
      )
    `);

    // Create indexes for tickets
    await run('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee)');
    await run('CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at)');

    // Create indexes for deployments
    await run('CREATE INDEX IF NOT EXISTS idx_deployments_ticket ON deployments(ticket_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_deployments_created ON deployments(created_at)');

    // Create indexes for ticket_comments
    await run('CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_ticket_comments_created ON ticket_comments(created_at)');
  }

  async close(): Promise<void> {
    const close = promisify(this.db.close.bind(this.db));
    await close();
  }

  async createTicket(ticket: any): Promise<string> {
    const run = promisify(this.db.run.bind(this.db));
    const id = `TKT-${Date.now().toString(36).toUpperCase()}`;
    
    await run(
      `INSERT INTO tickets (id, title, description, status, priority, assignee, reporter, labels, project) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticket.title, ticket.description, ticket.status || 'open', ticket.priority || 'medium', 
       ticket.assignee, ticket.reporter, JSON.stringify(ticket.labels || []), ticket.project]
    );
    
    return id;
  }

  async getTickets(filters: any = {}): Promise<any[]> {
    const all = promisify(this.db.all.bind(this.db));
    let query = 'SELECT * FROM tickets';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    
    if (filters.assignee) {
      conditions.push('assignee = ?');
      params.push(filters.assignee);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';
    
    const tickets = await all(query, params);
    return tickets.map(ticket => ({
      ...ticket,
      labels: JSON.parse(ticket.labels || '[]')
    }));
  }

  async createDeployment(deployment: any): Promise<string> {
    const run = promisify(this.db.run.bind(this.db));
    const id = `DEP-${Date.now().toString(36).toUpperCase()}`;
    
    await run(
      `INSERT INTO deployments (id, ticket_id, status, environment, branch, commit_hash) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, deployment.ticket_id, deployment.status || 'pending', deployment.environment,
       deployment.branch, deployment.commit_hash]
    );
    
    return id;
  }

  async getDeployments(filters: any = {}): Promise<any[]> {
    const all = promisify(this.db.all.bind(this.db));
    let query = 'SELECT * FROM deployments';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters.ticket_id) {
      conditions.push('ticket_id = ?');
      params.push(filters.ticket_id);
    }
    
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';
    
    return await all(query, params);
  }

  async createComment(comment: any): Promise<string> {
    const run = promisify(this.db.run.bind(this.db));
    const id = `CMT-${Date.now().toString(36).toUpperCase()}`;
    
    await run(
      `INSERT INTO ticket_comments (id, ticket_id, author, content) 
       VALUES (?, ?, ?, ?)`,
      [id, comment.ticket_id, comment.author, comment.content]
    );
    
    return id;
  }

  async getComments(ticket_id: string): Promise<any[]> {
    const all = promisify(this.db.all.bind(this.db));
    return await all(
      'SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC',
      [ticket_id]
    );
  }

  async updateTicketStatus(id: string, status: string): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    await run(
      'UPDATE tickets SET status = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?',
      [status, id]
    );
  }

  async updateDeploymentStatus(id: string, status: string, logs?: string): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    const params = [status];
    let query = 'UPDATE deployments SET status = ?';
    
    if (status === 'deployed') {
      query += ', deployed_at = strftime(\'%s\', \'now\')';
    }
    
    if (logs) {
      query += ', logs = ?';
      params.push(logs);
    }
    
    query += ', updated_at = strftime(\'%s\', \'now\') WHERE id = ?';
    params.push(id);
    
    await run(query, params);
  }
}