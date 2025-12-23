const { Pool } = require('pg');

class SwarmEngine {
  constructor(config) {
    this.pool = new Pool({
      user: config.user || process.env.DB_USER,
      host: config.host || process.env.DB_HOST,
      database: config.database || process.env.DB_NAME,
      password: config.password || process.env.DB_PASSWORD,
      port: config.port || process.env.DB_PORT || 5432,
    });
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  // Ticket operations
  async createTicket(ticketData) {
    const {
      title,
      description,
      status = 'open',
      priority = 'medium',
      assigned_to,
      created_by,
      metadata = {}
    } = ticketData;

    const query = `
      INSERT INTO tickets (
        title, 
        description, 
        status, 
        priority, 
        assigned_to, 
        created_by, 
        metadata, 
        created_at, 
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      title,
      description,
      status,
      priority,
      assigned_to,
      created_by,
      JSON.stringify(metadata)
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getTickets(filters = {}) {
    let query = `
      SELECT 
        id,
        ticket_id,
        title,
        description,
        status,
        priority,
        assigned_to,
        created_by,
        metadata,
        created_at,
        updated_at
      FROM tickets
    `;
    
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      values.push(filters.status);
    }

    if (filters.priority) {
      paramCount++;
      conditions.push(`priority = $${paramCount}`);
      values.push(filters.priority);
    }

    if (filters.assigned_to) {
      paramCount++;
      conditions.push(`assigned_to = $${paramCount}`);
      values.push(filters.assigned_to);
    }

    if (filters.created_by) {
      paramCount++;
      conditions.push(`created_by = $${paramCount}`);
      values.push(filters.created_by);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await this.query(query, values);
    return result.rows;
  }

  async getTicketById(id) {
    const query = `
      SELECT 
        id,
        ticket_id,
        title,
        description,
        status,
        priority,
        assigned_to,
        created_by,
        metadata,
        created_at,
        updated_at
      FROM tickets 
      WHERE id = $1
    `;

    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async updateTicket(id, updateData) {
    const allowedFields = [
      'title',
      'description', 
      'status', 
      'priority', 
      'assigned_to', 
      'metadata'
    ];
    
    const updates = [];
    const values = [];
    let paramCount = 0;

    Object.keys(updateData).forEach(field => {
      if (allowedFields.includes(field)) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        values.push(field === 'metadata' ? JSON.stringify(updateData[field]) : updateData[field]);
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    
    paramCount++;
    const query = `
      UPDATE tickets 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    values.push(id);

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async deleteTicket(id) {
    const query = 'DELETE FROM tickets WHERE id = $1 RETURNING *';
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  // Workflow operations
  async createWorkflow(workflowData) {
    const {
      name,
      description,
      steps = [],
      metadata = {},
      created_by
    } = workflowData;

    const query = `
      INSERT INTO workflows (name, description, steps, metadata, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      name,
      description,
      JSON.stringify(steps),
      JSON.stringify(metadata),
      created_by
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getWorkflows(filters = {}) {
    let query = 'SELECT * FROM workflows';
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (filters.created_by) {
      paramCount++;
      conditions.push(`created_by = $${paramCount}`);
      values.push(filters.created_by);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.query(query, values);
    return result.rows;
  }

  // Agent operations
  async createAgent(agentData) {
    const {
      name,
      type,
      config = {},
      status = 'active',
      metadata = {}
    } = agentData;

    const query = `
      INSERT INTO agents (name, type, config, status, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      name,
      type,
      JSON.stringify(config),
      status,
      JSON.stringify(metadata)
    ];

    const result = await this.query(query, values);
    return result.rows[0];
  }

  async getAgents(filters = {}) {
    let query = 'SELECT * FROM agents';
    const conditions = [];
    const values = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      values.push(filters.status);
    }

    if (filters.type) {
      paramCount++;
      conditions.push(`type = $${paramCount}`);
      values.push(filters.type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.query(query, values);
    return result.rows;
  }

  // Utility methods
  async ping() {
    const result = await this.query('SELECT NOW() as timestamp');
    return result.rows[0];
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = SwarmEngine;