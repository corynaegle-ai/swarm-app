const { Pool } = require('pg');
const logger = require('../utils/logger');

/**
 * Ticket Generator Implementation
 * Handles ticket generation with priority support and validation
 */
class TicketGeneratorImpl {
  constructor(dbConfig) {
    this.pool = new Pool(dbConfig);
  }

  /**
   * Valid priority enum values for tickets
   */
  static PRIORITY_ENUM = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  };

  /**
   * Default priority value
   */
  static DEFAULT_PRIORITY = TicketGeneratorImpl.PRIORITY_ENUM.MEDIUM;

  /**
   * Validates priority parameter
   * @param {string|null|undefined} priority - Priority value to validate
   * @returns {string} Validated priority value
   * @throws {Error} If priority is invalid
   */
  validatePriority(priority) {
    // Handle null, undefined, or empty string - return default
    if (!priority || typeof priority !== 'string') {
      return TicketGeneratorImpl.DEFAULT_PRIORITY;
    }

    const normalizedPriority = priority.toLowerCase().trim();
    const validPriorities = Object.values(TicketGeneratorImpl.PRIORITY_ENUM);

    if (!validPriorities.includes(normalizedPriority)) {
      throw new Error(
        `Invalid priority '${priority}'. Valid values are: ${validPriorities.join(', ')}`
      );
    }

    return normalizedPriority;
  }

  /**
   * Generates a new ticket with priority support
   * @param {Object} ticketParams - Ticket creation parameters
   * @param {string} ticketParams.title - Ticket title
   * @param {string} ticketParams.description - Ticket description
   * @param {string} ticketParams.assigneeId - ID of the assigned user
   * @param {string} ticketParams.reporterId - ID of the reporting user
   * @param {string} ticketParams.projectId - Project ID
   * @param {string} [ticketParams.priority='medium'] - Ticket priority
   * @param {string} [ticketParams.type='task'] - Ticket type
   * @param {Array<string>} [ticketParams.labels=[]] - Ticket labels
   * @returns {Promise<Object>} Created ticket object
   */
  async generateTicket(ticketParams) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Validate required parameters
      this.validateRequiredParams(ticketParams);
      
      // Validate and set priority
      const validatedPriority = this.validatePriority(ticketParams.priority);
      
      // Generate ticket number
      const ticketNumber = await this.generateTicketNumber(client, ticketParams.projectId);
      
      // Prepare ticket data
      const ticketData = {
        ...ticketParams,
        priority: validatedPriority,
        ticketNumber,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Insert ticket into database
      const createdTicket = await this.insertTicket(client, ticketData);
      
      // Create audit log entry
      await this.createAuditLog(client, {
        ticketId: createdTicket.id,
        action: 'CREATED',
        userId: ticketParams.reporterId,
        changes: {
          priority: validatedPriority,
          status: 'open',
          assignee: ticketParams.assigneeId
        }
      });
      
      await client.query('COMMIT');
      
      logger.info('Ticket generated successfully', {
        ticketId: createdTicket.id,
        ticketNumber: createdTicket.ticket_number,
        priority: validatedPriority,
        projectId: ticketParams.projectId
      });
      
      return this.formatTicketResponse(createdTicket);
      
    } catch (error) {
      await client.query('ROLLBACK');
      
      logger.error('Failed to generate ticket', {
        error: error.message,
        ticketParams: {
          ...ticketParams,
          // Don't log sensitive data
          description: ticketParams.description ? '[REDACTED]' : undefined
        }
      });
      
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validates required parameters for ticket creation
   * @param {Object} ticketParams - Parameters to validate
   * @throws {Error} If required parameters are missing
   */
  validateRequiredParams(ticketParams) {
    const required = ['title', 'description', 'assigneeId', 'reporterId', 'projectId'];
    const missing = required.filter(param => !ticketParams[param]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
    
    // Validate parameter types
    if (typeof ticketParams.title !== 'string' || ticketParams.title.trim().length === 0) {
      throw new Error('Title must be a non-empty string');
    }
    
    if (typeof ticketParams.description !== 'string' || ticketParams.description.trim().length === 0) {
      throw new Error('Description must be a non-empty string');
    }
  }

  /**
   * Inserts ticket into the database
   * @param {Object} client - Database client
   * @param {Object} ticketData - Ticket data to insert
   * @returns {Promise<Object>} Inserted ticket row
   */
  async insertTicket(client, ticketData) {
    const insertQuery = `
      INSERT INTO tickets (
        ticket_number,
        title,
        description,
        priority,
        status,
        type,
        assignee_id,
        reporter_id,
        project_id,
        labels,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      ) RETURNING *;
    `;
    
    const values = [
      ticketData.ticketNumber,
      ticketData.title.trim(),
      ticketData.description.trim(),
      ticketData.priority,
      ticketData.status,
      ticketData.type || 'task',
      ticketData.assigneeId,
      ticketData.reporterId,
      ticketData.projectId,
      JSON.stringify(ticketData.labels || []),
      ticketData.createdAt,
      ticketData.updatedAt
    ];
    
    const result = await client.query(insertQuery, values);
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create ticket - no rows returned');
    }
    
    return result.rows[0];
  }

  /**
   * Generates a unique ticket number for the project
   * @param {Object} client - Database client
   * @param {string} projectId - Project ID
   * @returns {Promise<string>} Generated ticket number
   */
  async generateTicketNumber(client, projectId) {
    // Get project prefix
    const projectQuery = 'SELECT code FROM projects WHERE id = $1';
    const projectResult = await client.query(projectQuery, [projectId]);
    
    if (projectResult.rows.length === 0) {
      throw new Error(`Project not found: ${projectId}`);
    }
    
    const projectCode = projectResult.rows[0].code;
    
    // Get next sequence number for the project
    const sequenceQuery = `
      SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '${projectCode}-(\\d+)') AS INTEGER)), 0) + 1 AS next_number
      FROM tickets 
      WHERE project_id = $1 AND ticket_number LIKE $2
    `;
    
    const sequenceResult = await client.query(sequenceQuery, [projectId, `${projectCode}-%`]);
    const nextNumber = sequenceResult.rows[0].next_number;
    
    return `${projectCode}-${nextNumber}`;
  }

  /**
   * Creates an audit log entry for ticket creation
   * @param {Object} client - Database client
   * @param {Object} logData - Audit log data
   */
  async createAuditLog(client, logData) {
    const auditQuery = `
      INSERT INTO ticket_audit_log (
        ticket_id,
        action,
        user_id,
        changes,
        created_at
      ) VALUES (
        $1, $2, $3, $4, NOW()
      )
    `;
    
    await client.query(auditQuery, [
      logData.ticketId,
      logData.action,
      logData.userId,
      JSON.stringify(logData.changes)
    ]);
  }

  /**
   * Formats ticket data for API response
   * @param {Object} ticketRow - Raw ticket row from database
   * @returns {Object} Formatted ticket object
   */
  formatTicketResponse(ticketRow) {
    return {
      id: ticketRow.id,
      ticketNumber: ticketRow.ticket_number,
      title: ticketRow.title,
      description: ticketRow.description,
      priority: ticketRow.priority,
      status: ticketRow.status,
      type: ticketRow.type,
      assigneeId: ticketRow.assignee_id,
      reporterId: ticketRow.reporter_id,
      projectId: ticketRow.project_id,
      labels: JSON.parse(ticketRow.labels || '[]'),
      createdAt: ticketRow.created_at,
      updatedAt: ticketRow.updated_at
    };
  }

  /**
   * Batch generate multiple tickets
   * @param {Array<Object>} ticketParamsArray - Array of ticket parameters
   * @returns {Promise<Array<Object>>} Array of created tickets
   */
  async generateBatchTickets(ticketParamsArray) {
    const results = [];
    const errors = [];
    
    for (let i = 0; i < ticketParamsArray.length; i++) {
      try {
        const ticket = await this.generateTicket(ticketParamsArray[i]);
        results.push({ index: i, ticket });
      } catch (error) {
        errors.push({ 
          index: i, 
          error: error.message,
          params: ticketParamsArray[i]
        });
      }
    }
    
    return {
      successful: results,
      failed: errors,
      summary: {
        total: ticketParamsArray.length,
        successful: results.length,
        failed: errors.length
      }
    };
  }

  /**
   * Update ticket priority
   * @param {string} ticketId - Ticket ID to update
   * @param {string} newPriority - New priority value
   * @param {string} userId - User making the change
   * @returns {Promise<Object>} Updated ticket
   */
  async updateTicketPriority(ticketId, newPriority, userId) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Validate priority
      const validatedPriority = this.validatePriority(newPriority);
      
      // Get current ticket
      const currentTicket = await client.query(
        'SELECT * FROM tickets WHERE id = $1',
        [ticketId]
      );
      
      if (currentTicket.rows.length === 0) {
        throw new Error(`Ticket not found: ${ticketId}`);
      }
      
      const oldPriority = currentTicket.rows[0].priority;
      
      // Update priority
      const updateResult = await client.query(
        'UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [validatedPriority, ticketId]
      );
      
      // Create audit log
      await this.createAuditLog(client, {
        ticketId,
        action: 'PRIORITY_CHANGED',
        userId,
        changes: {
          priority: {
            from: oldPriority,
            to: validatedPriority
          }
        }
      });
      
      await client.query('COMMIT');
      
      logger.info('Ticket priority updated', {
        ticketId,
        oldPriority,
        newPriority: validatedPriority,
        userId
      });
      
      return this.formatTicketResponse(updateResult.rows[0]);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close database pool
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = TicketGeneratorImpl;