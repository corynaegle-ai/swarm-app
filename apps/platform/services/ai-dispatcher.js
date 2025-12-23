const { Pool } = require('pg');
const logger = require('../utils/logger');

class AIDispatcher {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  // Valid priority enum values
  static VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

  /**
   * Validates priority value against allowed enum values
   * @param {string} priority - Priority value to validate
   * @returns {boolean} True if valid, false otherwise
   */
  validatePriority(priority) {
    return AIDispatcher.VALID_PRIORITIES.includes(priority);
  }

  /**
   * Creates a new ticket with priority support
   * @param {Object} ticketData - Ticket creation data
   * @param {string} ticketData.title - Ticket title
   * @param {string} ticketData.description - Ticket description
   * @param {string} ticketData.type - Ticket type
   * @param {string} [ticketData.priority='medium'] - Ticket priority (low, medium, high, critical)
   * @param {string} ticketData.assignee - Ticket assignee
   * @returns {Promise<Object>} Created ticket object
   */
  async createTicket(ticketData) {
    const client = await this.pool.connect();
    
    try {
      const {
        title,
        description,
        type,
        priority = 'medium', // Default to medium for backward compatibility
        assignee
      } = ticketData;

      // Validate required fields
      if (!title || !description || !type || !assignee) {
        throw new Error('Missing required fields: title, description, type, assignee');
      }

      // Validate priority enum value
      if (!this.validatePriority(priority)) {
        throw new Error(`Invalid priority value: ${priority}. Must be one of: ${AIDispatcher.VALID_PRIORITIES.join(', ')}`);
      }

      // Generate ticket ID
      const ticketId = `TKT-${Date.now().toString(16).toUpperCase()}`;
      
      // Insert ticket with priority field
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
          updated_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      
      const values = [
        ticketId,
        title,
        description,
        type,
        priority,
        assignee,
        'open',
        new Date(),
        new Date()
      ];

      const result = await client.query(insertQuery, values);
      
      logger.info(`Ticket created successfully: ${ticketId} with priority: ${priority}`);
      
      return result.rows[0];
      
    } catch (error) {
      logger.error('Error creating ticket:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch create tickets with priority support
   * @param {Array<Object>} ticketsData - Array of ticket creation data
   * @returns {Promise<Array<Object>>} Array of created ticket objects
   */
  async createTickets(ticketsData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const createdTickets = [];
      
      for (const ticketData of ticketsData) {
        const {
          title,
          description,
          type,
          priority = 'medium', // Default to medium for backward compatibility
          assignee
        } = ticketData;

        // Validate required fields
        if (!title || !description || !type || !assignee) {
          throw new Error('Missing required fields in batch ticket creation');
        }

        // Validate priority enum value
        if (!this.validatePriority(priority)) {
          throw new Error(`Invalid priority value: ${priority}. Must be one of: ${AIDispatcher.VALID_PRIORITIES.join(', ')}`);
        }

        // Generate ticket ID
        const ticketId = `TKT-${Date.now().toString(16).toUpperCase()}-${Math.random().toString(36).substr(2, 4)}`;
        
        // Insert ticket with priority field
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
            updated_at
          ) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;
        
        const values = [
          ticketId,
          title,
          description,
          type,
          priority,
          assignee,
          'open',
          new Date(),
          new Date()
        ];

        const result = await client.query(insertQuery, values);
        createdTickets.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      
      logger.info(`Batch created ${createdTickets.length} tickets`);
      
      return createdTickets;
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error in batch ticket creation:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = AIDispatcher;