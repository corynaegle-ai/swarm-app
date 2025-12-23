const { Pool } = require('pg');
const { validateTicketData, generateTicketId } = require('../utils/ticket-utils');
const logger = require('../utils/logger');

class AIDispatcher {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  /**
   * Valid priority enum values
   */
  static VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

  /**
   * Validates priority value
   * @param {string} priority - Priority value to validate
   * @returns {string} - Validated priority or default 'medium'
   */
  validatePriority(priority) {
    if (!priority) {
      return 'medium'; // Default priority
    }
    
    const normalizedPriority = priority.toLowerCase().trim();
    
    if (!AIDispatcher.VALID_PRIORITIES.includes(normalizedPriority)) {
      throw new Error(`Invalid priority value: ${priority}. Valid values are: ${AIDispatcher.VALID_PRIORITIES.join(', ')}`);
    }
    
    return normalizedPriority;
  }

  /**
   * Creates a new ticket with AI processing
   * @param {Object} ticketData - Ticket information
   * @param {string} ticketData.title - Ticket title
   * @param {string} ticketData.description - Ticket description
   * @param {string} ticketData.category - Ticket category
   * @param {string} ticketData.userId - User ID creating the ticket
   * @param {string} [ticketData.priority='medium'] - Ticket priority (low, medium, high, urgent)
   * @returns {Promise<Object>} Created ticket with AI analysis
   */
  async createTicket(ticketData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Validate required fields
      if (!ticketData.title || !ticketData.description || !ticketData.category || !ticketData.userId) {
        throw new Error('Missing required fields: title, description, category, and userId are required');
      }
      
      // Validate and normalize priority
      const validatedPriority = this.validatePriority(ticketData.priority);
      
      // Generate unique ticket ID
      const ticketId = generateTicketId();
      
      // AI analysis of the ticket
      const aiAnalysis = await this.analyzeTicketWithAI(ticketData);
      
      // Insert ticket with priority
      const insertQuery = `
        INSERT INTO tickets (
          id, 
          title, 
          description, 
          category, 
          user_id, 
          priority,
          status, 
          ai_tags, 
          ai_confidence_score, 
          estimated_complexity,
          created_at, 
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        ) RETURNING *;
      `;
      
      const insertValues = [
        ticketId,
        ticketData.title,
        ticketData.description,
        ticketData.category,
        ticketData.userId,
        validatedPriority,
        'open',
        JSON.stringify(aiAnalysis.tags),
        aiAnalysis.confidenceScore,
        aiAnalysis.estimatedComplexity
      ];
      
      const result = await client.query(insertQuery, insertValues);
      const createdTicket = result.rows[0];
      
      // Log ticket creation
      logger.info(`AI Dispatcher: Created ticket ${ticketId} with priority ${validatedPriority}`, {
        ticketId,
        priority: validatedPriority,
        userId: ticketData.userId,
        aiConfidence: aiAnalysis.confidenceScore
      });
      
      await client.query('COMMIT');
      
      return {
        ...createdTicket,
        aiAnalysis: {
          tags: aiAnalysis.tags,
          confidenceScore: aiAnalysis.confidenceScore,
          estimatedComplexity: aiAnalysis.estimatedComplexity,
          recommendations: aiAnalysis.recommendations
        }
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('AI Dispatcher: Failed to create ticket', {
        error: error.message,
        ticketData: { ...ticketData, priority: ticketData.priority }
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Analyzes ticket content using AI
   * @param {Object} ticketData - Ticket data to analyze
   * @returns {Promise<Object>} AI analysis results
   */
  async analyzeTicketWithAI(ticketData) {
    // Mock AI analysis - in production this would call actual AI service
    const complexity = this.calculateComplexity(ticketData.description);
    const tags = this.extractTags(ticketData.title + ' ' + ticketData.description);
    
    return {
      tags,
      confidenceScore: Math.random() * 0.3 + 0.7, // 0.7-1.0 range
      estimatedComplexity: complexity,
      recommendations: this.generateRecommendations(ticketData)
    };
  }

  /**
   * Calculates ticket complexity based on description
   * @param {string} description - Ticket description
   * @returns {string} Complexity level
   */
  calculateComplexity(description) {
    const wordCount = description.split(' ').length;
    const complexityKeywords = ['integration', 'database', 'security', 'performance', 'architecture'];
    const hasComplexKeywords = complexityKeywords.some(keyword => 
      description.toLowerCase().includes(keyword)
    );
    
    if (wordCount > 100 || hasComplexKeywords) {
      return 'high';
    } else if (wordCount > 50) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Extracts relevant tags from ticket content
   * @param {string} content - Combined title and description
   * @returns {Array<string>} Extracted tags
   */
  extractTags(content) {
    const tagKeywords = {
      'bug': ['error', 'broken', 'issue', 'problem', 'fail'],
      'feature': ['add', 'new', 'implement', 'create'],
      'ui': ['interface', 'design', 'layout', 'visual'],
      'api': ['endpoint', 'request', 'response', 'integration'],
      'performance': ['slow', 'optimize', 'speed', 'performance']
    };
    
    const contentLower = content.toLowerCase();
    const tags = [];
    
    Object.entries(tagKeywords).forEach(([tag, keywords]) => {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        tags.push(tag);
      }
    });
    
    return tags;
  }

  /**
   * Generates AI recommendations for the ticket
   * @param {Object} ticketData - Ticket data
   * @returns {Array<string>} Recommendations
   */
  generateRecommendations(ticketData) {
    const recommendations = [];
    
    if (ticketData.category === 'technical') {
      recommendations.push('Consider technical review before implementation');
    }
    
    if (ticketData.description.toLowerCase().includes('urgent')) {
      recommendations.push('High priority - consider immediate attention');
    }
    
    recommendations.push('Ensure proper testing before deployment');
    
    return recommendations;
  }

  /**
   * Bulk create tickets with AI processing
   * @param {Array<Object>} ticketsData - Array of ticket data objects
   * @returns {Promise<Array<Object>>} Array of created tickets
   */
  async createBulkTickets(ticketsData) {
    const results = [];
    const errors = [];
    
    for (const ticketData of ticketsData) {
      try {
        const ticket = await this.createTicket(ticketData);
        results.push(ticket);
      } catch (error) {
        errors.push({
          ticketData,
          error: error.message
        });
      }
    }
    
    return {
      successful: results,
      failed: errors
    };
  }

  /**
   * Close database pool
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = AIDispatcher;