const EventEmitter = require('events');
const logger = require('../utils/logger');

/**
 * Ticket Generator Implementation
 * Handles ticket creation with priority support and validation
 */
class TicketGeneratorImpl extends EventEmitter {
  constructor(database) {
    super();
    this.db = database;
    this.validPriorities = ['low', 'medium', 'high', 'critical'];
  }

  /**
   * Validates priority parameter
   * @param {string} priority - Priority value to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidPriority(priority) {
    return this.validPriorities.includes(priority?.toLowerCase());
  }

  /**
   * Normalizes priority value to lowercase
   * @param {string} priority - Priority value to normalize
   * @returns {string} Normalized priority value
   */
  normalizePriority(priority) {
    return priority?.toLowerCase() || 'medium';
  }

  /**
   * Generates a new ticket with priority support
   * @param {Object} ticketSpec - Ticket specification
   * @param {string} ticketSpec.title - Ticket title
   * @param {string} ticketSpec.description - Ticket description
   * @param {string} ticketSpec.type - Ticket type
   * @param {string} [ticketSpec.priority='medium'] - Ticket priority
   * @param {string} ticketSpec.assignee - Assigned user
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<Object>} Generated ticket
   */
  async generateTicket(ticketSpec, options = {}) {
    try {
      // Extract and normalize priority
      const priority = this.normalizePriority(ticketSpec.priority);
      
      // Validate priority enum value
      if (!this.isValidPriority(priority)) {
        const error = new Error(`Invalid priority '${ticketSpec.priority}'. Valid values are: ${this.validPriorities.join(', ')}`);
        error.code = 'INVALID_PRIORITY';
        throw error;
      }

      // Validate required fields
      const requiredFields = ['title', 'description', 'type', 'assignee'];
      const missingFields = requiredFields.filter(field => !ticketSpec[field]);
      
      if (missingFields.length > 0) {
        const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
        error.code = 'MISSING_FIELDS';
        throw error;
      }

      // Generate unique ticket ID
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const ticketId = `TKT-${timestamp.toString(16).toUpperCase()}${randomSuffix}`;

      // Prepare ticket data with priority
      const ticketData = {
        ticket_id: ticketId,
        title: ticketSpec.title.trim(),
        description: ticketSpec.description.trim(),
        type: ticketSpec.type.toLowerCase(),
        priority: priority,
        assignee: ticketSpec.assignee.trim(),
        status: 'open',
        created_at: new Date(),
        updated_at: new Date(),
        labels: ticketSpec.labels || [],
        metadata: {
          generator_version: '2.1.0',
          priority_source: ticketSpec.priority ? 'explicit' : 'default',
          ...options.metadata
        }
      };

      // Insert ticket into database with priority field
      const insertQuery = `
        INSERT INTO tickets (
          ticket_id,
          title,
          description,
          type,
          priority,
          assignee,
          status,
          created_at,
          updated_at,
          labels,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const queryParams = [
        ticketData.ticket_id,
        ticketData.title,
        ticketData.description,
        ticketData.type,
        ticketData.priority,
        ticketData.assignee,
        ticketData.status,
        ticketData.created_at,
        ticketData.updated_at,
        JSON.stringify(ticketData.labels),
        JSON.stringify(ticketData.metadata)
      ];

      const result = await this.db.query(insertQuery, queryParams);
      const createdTicket = result.rows[0];

      // Emit ticket creation event
      this.emit('ticketGenerated', {
        ticketId: createdTicket.ticket_id,
        priority: createdTicket.priority,
        timestamp: new Date()
      });

      logger.info(`Generated ticket ${createdTicket.ticket_id} with priority ${createdTicket.priority}`);

      return createdTicket;

    } catch (error) {
      logger.error('Ticket generation failed:', {
        error: error.message,
        code: error.code,
        ticketSpec: { ...ticketSpec, description: '[REDACTED]' }
      });

      // Emit error event
      this.emit('ticketGenerationFailed', {
        error: error.message,
        code: error.code,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Batch generate multiple tickets with priority support
   * @param {Array<Object>} ticketSpecs - Array of ticket specifications
   * @param {Object} [options={}] - Batch generation options
   * @returns {Promise<Array<Object>>} Array of generated tickets
   */
  async batchGenerateTickets(ticketSpecs, options = {}) {
    const results = [];
    const errors = [];

    try {
      // Start transaction for batch operation
      await this.db.query('BEGIN');

      for (let i = 0; i < ticketSpecs.length; i++) {
        try {
          const ticket = await this.generateTicket(ticketSpecs[i], {
            ...options,
            batchIndex: i,
            batchSize: ticketSpecs.length
          });
          results.push(ticket);
        } catch (error) {
          errors.push({ index: i, error: error.message, code: error.code });
          
          if (!options.continueOnError) {
            throw error;
          }
        }
      }

      await this.db.query('COMMIT');

      logger.info(`Batch generated ${results.length} tickets with ${errors.length} errors`);

      return {
        success: results,
        errors: errors,
        summary: {
          total: ticketSpecs.length,
          successful: results.length,
          failed: errors.length
        }
      };

    } catch (error) {
      await this.db.query('ROLLBACK');
      logger.error('Batch ticket generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get valid priority values
   * @returns {Array<string>} Array of valid priority values
   */
  getValidPriorities() {
    return [...this.validPriorities];
  }

  /**
   * Get priority validation schema for API documentation
   * @returns {Object} Priority validation schema
   */
  getPrioritySchema() {
    return {
      type: 'string',
      enum: this.validPriorities,
      default: 'medium',
      description: 'Ticket priority level'
    };
  }
}

module.exports = TicketGeneratorImpl;