/**
 * Clarification Agent
 * 
 * Conversational AI agent that gathers project requirements through
 * structured Q&A dialogue before spec generation.
 * 
 * Part of HITL (Human-in-the-Loop) Phase 4
 * Uses Claude Opus 4.5 for superior reasoning and context handling
 * 
 * @module agents/clarification-agent
 */

const Anthropic = require('@anthropic-ai/sdk');

// Required information categories with weights for progress calculation
const REQUIRED_CATEGORIES = {
  project_type: { weight: 20, fields: ['what', 'why', 'who', 'platform'] },
  tech_stack: { weight: 25, fields: ['frontend', 'backend', 'database', 'hosting'] },
  scale: { weight: 15, fields: ['users', 'data_volume', 'performance'] },
  features: { weight: 25, fields: ['core_features', 'mvp_scope'] },
  constraints: { weight: 15, fields: ['timeline', 'budget', 'compliance'] }
};

const READY_THRESHOLD = 80;

const SYSTEM_PROMPT = `You are a senior technical requirements analyst at a software development firm. Your role is to gather enough information through conversation to create a comprehensive spec card for a software project.

## Your Personality
- Professional but warm and approachable
- Ask clarifying questions when answers are vague
- Acknowledge what you've learned before moving on
- Never overwhelm - ONE focused question at a time

## Information Categories to Gather

1. **Project Type** (Required)
   - What: One-sentence description of the product
   - Why: Problem being solved / value proposition  
   - Who: Primary users/personas
   - Platform: Web, Mobile (iOS/Android), API, CLI, Desktop

2. **Tech Stack** (Required)
   - Frontend: Framework preference (React, Vue, Angular, etc.)
   - Backend: Language/framework (Node, Python, Go, etc.)
   - Database: SQL vs NoSQL, specific preferences
   - Hosting: Cloud provider preferences, serverless vs traditional

3. **Scale** (Required)
   - Users: Expected concurrent users (10s, 100s, 1000s, millions)
   - Data Volume: Expected data size and growth
   - Performance: Latency requirements, SLAs

4. **Features** (Required)
   - Core Features: Essential functionality for MVP
   - MVP Scope: What's in vs out for first release

5. **Constraints** (Optional but helpful)
   - Timeline: Deadlines or time constraints
   - Budget: Cost considerations
   - Compliance: Security, regulatory requirements (HIPAA, GDPR, etc.)

## Conversation Rules

1. Start by acknowledging their initial description
2. Ask ONE question at a time - never multiple questions
3. After each response, briefly acknowledge what you learned
4. Track which categories have sufficient information
5. Skip questions if user already provided that info
6. When ~80% complete, ask if they're ready to generate the spec card
7. Be smart about inferring information (e.g., "e-commerce" implies certain features)

## Output Format

You MUST respond with valid JSON in this exact structure:
\`\`\`json
{
  "message": "Your conversational response to the user",
  "gathered": {
    "project_type": { "what": "...", "why": "...", "who": "...", "platform": "..." },
    "tech_stack": { "frontend": "...", "backend": "...", "database": "...", "hosting": "..." },
    "scale": { "users": "...", "data_volume": "...", "performance": "..." },
    "features": { "core_features": ["..."], "mvp_scope": "..." },
    "constraints": { "timeline": "...", "budget": "...", "compliance": "..." }
  },
  "progress": 0-100,
  "ready_for_spec": false,
  "next_category": "category_name or null if ready"
}
\`\`\`

Only include fields in "gathered" that you have actual information for. Omit empty/unknown fields.
Calculate "progress" based on how complete each category is (weighted average).
Set "ready_for_spec" to true only when progress >= 80 AND you've confirmed with the user.`;



class ClarificationAgent {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Anthropic API key
   * @param {Object} config.db - Database interface with session/message methods
   * @param {Object} [config.options] - Optional configuration
   */
  constructor(config) {
    this.claude = new Anthropic({ apiKey: config.apiKey });
    this.db = config.db;
    this.model = 'claude-opus-4-5-20251101';
    this.maxTokens = config.options?.maxTokens || 2048;
  }

  /**
   * Process a user response and continue the clarification dialogue
   * @param {string} sessionId - Design session ID
   * @param {string} userResponse - User's response text
   * @returns {Promise<Object>} Agent response with message, gathered info, progress
   */
  async processResponse(sessionId, userResponse) {
    // 1. Get session and conversation history
    const session = await this.db.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const messages = await this.db.getMessages(sessionId);
    const currentContext = session.clarification_context || {};

    // 2. Build conversation for Claude
    const conversationMessages = this.buildConversationMessages(
      messages,
      userResponse,
      currentContext,
      session.initial_description
    );

    // 3. Call Claude Opus 4.5
    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages: conversationMessages
    });

    // 4. Parse and validate response
    const parsed = this.parseAgentResponse(response.content[0].text);

    // 5. Merge gathered info with existing context
    const updatedContext = this.mergeContext(currentContext, parsed.gathered);

    // 6. Recalculate progress (don't trust AI's calculation blindly)
    const calculatedProgress = this.calculateProgress(updatedContext);
    parsed.progress = calculatedProgress;

    // 7. Determine if ready (progress >= threshold AND AI says ready)
    const isReady = calculatedProgress >= READY_THRESHOLD && parsed.ready_for_spec;

    // 8. Update session in database
    await this.db.updateSession(sessionId, {
      clarification_context: updatedContext,
      state: isReady ? 'ready_for_docs' : 'clarifying',
      updated_at: new Date().toISOString()
    });

    // 9. Save messages to history
    await this.db.addMessage(sessionId, 'user', userResponse, 'answer');
    await this.db.addMessage(sessionId, 'assistant', parsed.message, 'question');

    return {
      message: parsed.message,
      gathered: updatedContext,
      progress: calculatedProgress,
      ready_for_spec: isReady,
      next_category: parsed.next_category
    };
  }


  /**
   * Start a new clarification session with initial description
   * @param {string} sessionId - Design session ID
   * @param {string} initialDescription - User's initial project description
   * @returns {Promise<Object>} First agent question
   */
  async startSession(sessionId, initialDescription) {
    // Store initial description and get first question
    const session = await this.db.getSession(sessionId);
    
    const conversationMessages = [{
      role: 'user',
      content: `New project request:\n\n${initialDescription}\n\nPlease acknowledge this and ask your first clarifying question.`
    }];

    const response = await this.claude.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages: conversationMessages
    });

    const parsed = this.parseAgentResponse(response.content[0].text);
    
    // Initialize session state
    await this.db.updateSession(sessionId, {
      initial_description: initialDescription,
      clarification_context: parsed.gathered || {},
      state: 'clarifying',
      updated_at: new Date().toISOString()
    });

    // Save the exchange
    await this.db.addMessage(sessionId, 'user', initialDescription, 'initial');
    await this.db.addMessage(sessionId, 'assistant', parsed.message, 'question');

    return {
      message: parsed.message,
      gathered: parsed.gathered || {},
      progress: this.calculateProgress(parsed.gathered || {}),
      ready_for_spec: false,
      next_category: parsed.next_category
    };
  }

  /**
   * Build conversation messages array for Claude API
   */
  buildConversationMessages(history, currentResponse, context, initialDesc) {
    const messages = [];

    // Add context summary as first user message
    messages.push({
      role: 'user',
      content: `Initial project description:\n${initialDesc}\n\nInformation gathered so far:\n${JSON.stringify(context, null, 2)}`
    });

    messages.push({
      role: 'assistant',
      content: 'I understand the context. Let me continue gathering requirements.'
    });

    // Add conversation history
    for (const msg of history.slice(-10)) { // Last 10 messages for context
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Add current user response
    messages.push({
      role: 'user',
      content: currentResponse
    });

    return messages;
  }


  /**
   * Parse and validate agent JSON response
   */
  parseAgentResponse(responseText) {
    // Try to extract JSON from response
    let jsonStr = responseText;
    
    // Handle markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      
      // Validate required fields
      if (!parsed.message) {
        throw new Error('Missing required field: message');
      }

      return {
        message: parsed.message,
        gathered: parsed.gathered || {},
        progress: parsed.progress || 0,
        ready_for_spec: parsed.ready_for_spec || false,
        next_category: parsed.next_category || null
      };
    } catch (e) {
      // Fallback: treat entire response as message
      console.error('Failed to parse agent response as JSON:', e.message);
      return {
        message: responseText,
        gathered: {},
        progress: 0,
        ready_for_spec: false,
        next_category: null
      };
    }
  }

  /**
   * Deep merge gathered context, preserving existing info
   */
  mergeContext(existing, incoming) {
    const merged = { ...existing };

    for (const [category, values] of Object.entries(incoming || {})) {
      if (typeof values === 'object' && values !== null) {
        merged[category] = {
          ...(merged[category] || {}),
          ...values
        };
      } else {
        merged[category] = values;
      }
    }

    return merged;
  }

  /**
   * Calculate progress percentage based on filled categories
   */
  calculateProgress(context) {
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const [category, config] of Object.entries(REQUIRED_CATEGORIES)) {
      totalWeight += config.weight;
      
      const categoryData = context[category] || {};
      const filledFields = config.fields.filter(field => {
        const value = categoryData[field];
        return value !== undefined && value !== null && value !== '';
      });

      // Partial credit based on fields filled
      const categoryCompletion = filledFields.length / config.fields.length;
      earnedWeight += config.weight * categoryCompletion;
    }

    return Math.round((earnedWeight / totalWeight) * 100);
  }


  /**
   * Force transition to ready state (user override)
   * @param {string} sessionId 
   */
  async forceReady(sessionId) {
    const session = await this.db.getSession(sessionId);
    const progress = this.calculateProgress(session.clarification_context || {});

    if (progress < 50) {
      throw new Error(`Cannot proceed: only ${progress}% complete. Need at least 50%.`);
    }

    await this.db.updateSession(sessionId, {
      state: 'ready_for_docs',
      updated_at: new Date().toISOString()
    });

    await this.db.addMessage(
      sessionId, 
      'system', 
      `User elected to proceed with ${progress}% information gathered.`,
      'system'
    );

    return { progress, state: 'ready_for_docs' };
  }

  /**
   * Get current session status
   */
  async getStatus(sessionId) {
    const session = await this.db.getSession(sessionId);
    const messages = await this.db.getMessages(sessionId);
    const progress = this.calculateProgress(session.clarification_context || {});

    return {
      state: session.state,
      progress,
      message_count: messages.length,
      gathered: session.clarification_context,
      ready_for_spec: progress >= READY_THRESHOLD
    };
  }
}

// Export class and constants
module.exports = {
  ClarificationAgent,
  REQUIRED_CATEGORIES,
  READY_THRESHOLD,
  SYSTEM_PROMPT
};
