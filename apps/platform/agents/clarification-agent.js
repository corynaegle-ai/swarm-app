/**
 * Clarification Agent (RAG-Enhanced)
 * Conversational Q&A flow for gathering project requirements
 * 
 * Phase 4 of HITL Implementation
 * Updated: 2025-12-18 - Added RAG context injection for build_feature
 */

const { chat, parseJsonResponse } = require('../services/claude-client');
const { fetchSessionContext } = require('../services/rag-client');
const fs = require("fs");
const path = require("path");
const { queryAll, execute } = require('../db');
const { broadcast } = require('../websocket');
const fsModule = require('fs');
const pathModule = require('path');

// System prompt for clarification conversations
const CLARIFICATION_SYSTEM_PROMPT = `You are a requirements gathering assistant for a software development project. Your role is to:

1. UNDERSTAND the user's project description
2. ASK clarifying questions to fill in gaps
3. TRACK what information has been gathered
4. DETERMINE when you have enough information to create a specification

## Information Categories to Gather

Track completion across these categories (0-100% each):
- **overview**: Project name, description, high-level purpose (required)
- **users**: Who will use this, their roles, permissions (required)
- **features**: Core features and functionality (required)  
- **technical**: Tech stack, integrations, APIs, database needs
- **constraints**: Timeline, budget, performance requirements
- **acceptance**: Success criteria, how to validate completion

## Response Format

ALWAYS respond with valid JSON in this exact structure:
{
  "message": "Your conversational response to the user",
  "gathered": {
    "overview": { "score": 0-100, "details": {} },
    "users": { "score": 0-100, "details": {} },
    "features": { "score": 0-100, "details": {} },
    "technical": { "score": 0-100, "details": {} },
    "constraints": { "score": 0-100, "details": {} },
    "acceptance": { "score": 0-100, "details": {} }
  },
  "overallProgress": 0-100,
  "readyForSpec": boolean,
  "nextQuestion": "Your next question if not ready",
  "reasoning": "Brief internal reasoning"
}

## Rules

1. Be conversational and friendly, not robotic
2. Ask ONE focused question at a time
3. Acknowledge what the user said before asking next question
4. Update gathered info with each response
5. readyForSpec = true when overview, users, features all >= 80%
6. Don't ask about technical/constraints if user hasn't provided basics yet
7. CRITICAL: If your previous message asked the user a question, you MUST acknowledge their answer before anything else. Never ignore what the user just told you.
8. After acknowledging an answer, choose ONE path:
   - If you need more clarity → Ask ONE focused follow-up question
   - If you have enough info (readyForSpec=true) → Tell user to click Generate Spec
9. When readyForSpec is true, your message MUST:
   a) First acknowledge/validate the user's most recent answer
   b) Then instruct: "I have enough information to generate your specification. When you're ready, click the **Generate Spec** button. If you'd like to add more details first, just keep chatting!"
10. The conversation should feel natural and collaborative - never abruptly end or ignore what the user said.

## Anti-Patterns to Avoid

❌ BAD - Ignoring the user's answer:
Agent: "What tech stack are you using?"
User: "React and Node.js"  
Agent: "Click Generate Spec when ready." (No acknowledgment!)

❌ BAD - Asking a question then immediately saying ready:
Agent: "How many users do you expect?"
User: "About 1000 initially"
Agent: "Ready to generate! Click the button." (Didn't respond to the answer!)

✅ GOOD - Proper flow:
Agent: "What tech stack are you using?"
User: "React and Node.js"
Agent: "React and Node.js is a great choice for this feature. I now have all the details I need. Click the **Generate Spec** button when you're ready, or keep chatting if you want to add anything else!"`;


class ClarificationAgent {
  constructor() {
    this.systemPrompt = CLARIFICATION_SYSTEM_PROMPT;
  }

  /**
   * Process a user response in the clarification conversation
   */
  async processResponse(session, userMessage) {
    // Build conversation history
    const messages = await this.buildConversationHistory(session.id, userMessage);
    
    // Get current context
    const currentContext = session.clarification_context 
      ? (typeof session.clarification_context === 'string' 
         ? JSON.parse(session.clarification_context) 
         : session.clarification_context)
      : this.initializeContext();

    // Prepare enhanced system prompt
    const contextSummary = this.summarizeContext(currentContext);
    let enhancedSystem;
    
    // Use build-feature specific prompt if applicable
    if (session.project_type === 'build_feature') {
      enhancedSystem = await this.buildFeatureSystemPrompt(session, contextSummary, userMessage);
    } else {
      enhancedSystem = `${this.systemPrompt}

## Current Gathered Information
${contextSummary}

## Project Description
${session.description || session.project_name || 'Not provided yet'}`;
    }

    // Call Claude
    const response = await chat({
      system: enhancedSystem,
      messages,
      maxTokens: 2048
    });

    if (!response.success) {
      return {
        type: 'clarification',
        error: response.error,
        message: 'Sorry, I encountered an issue. Please try again.',
        gathered: currentContext.gathered || {},
        progress: currentContext.overallProgress || 0,
        readyForSpec: false
      };
    }

    // Parse response
    const parsed = parseJsonResponse(response.content);
    
    if (!parsed) {
      return {
        type: 'clarification',
        message: response.content,
        gathered: currentContext.gathered || {},
        progress: currentContext.overallProgress || 0,
        readyForSpec: false,
        raw: response.content
      };
    }

    // Store messages
    await this.storeMessages(session.id, userMessage, parsed.message || response.content);

    // Update context (include suggested files if present)
    const updatedContext = {
      gathered: parsed.gathered,
      overallProgress: parsed.overallProgress,
      suggestedFiles: parsed.suggestedFiles || [],
      existingPatterns: parsed.existingPatterns || [],
      lastUpdated: new Date().toISOString()
    };

    await execute(`
      UPDATE hitl_sessions 
      SET clarification_context = $1, progress_percent = $2, updated_at = NOW()
      WHERE id = $3
    `, [JSON.stringify(updatedContext), parsed.overallProgress || 0, session.id]);

    // Transition state if ready
    if (parsed.readyForSpec) {
      await execute(`
        UPDATE hitl_sessions 
        SET state = 'ready_for_docs', updated_at = NOW()
        WHERE id = $1
      `, [session.id]);
      
      broadcast.sessionUpdate(session.id, 'ready_for_docs', parsed.overallProgress || 50);
    } else {
      broadcast.sessionUpdate(session.id, 'clarifying', parsed.overallProgress || 0);
    }

    return {
      type: 'clarification',
      message: parsed.message,
      gathered: parsed.gathered,
      progress: parsed.overallProgress,
      readyForSpec: parsed.readyForSpec,
      nextQuestion: parsed.nextQuestion,
      suggestedFiles: parsed.suggestedFiles,
      existingPatterns: parsed.existingPatterns
    };
  }

  /**
   * Build system prompt for build_feature with RAG context
   */
  async buildFeatureSystemPrompt(session, contextSummary, userMessage) {
    const buildFeaturePrompt = this.getBuildFeaturePrompt();
    
    // Parse repo analysis
    let repoAnalysis = {};
    try {
      repoAnalysis = typeof session.repo_analysis === 'string' 
        ? JSON.parse(session.repo_analysis) 
        : (session.repo_analysis || {});
    } catch (e) {
      repoAnalysis = { error: 'Failed to parse repo analysis' };
    }

    // Fetch RAG context using centralized session handler
    let codeContext = 'No code context available.';
    const searchQuery = `${session.description || session.project_name || ''} ${userMessage}`.trim();
    
    if (searchQuery) {
      console.log(`[ClarificationAgent] Fetching RAG context for: "${searchQuery.slice(0, 60)}..."`);
      const ragResult = await fetchSessionContext(session, searchQuery, { maxTokens: 8000 });
      
      if (ragResult.success && ragResult.context) {
        codeContext = ragResult.context;
        console.log(`[ClarificationAgent] RAG returned ${ragResult.tokenCount} tokens from ${ragResult.reposSearched} repos`);
      } else {
        codeContext = `Code search returned no results. Reason: ${ragResult.reason || 'unknown'}`;
        console.log(`[ClarificationAgent] RAG failed: ${ragResult.reason}`);
      }
    }

    // Build the enhanced prompt
    return buildFeaturePrompt
      .replace('{{REPO_ANALYSIS}}', JSON.stringify(repoAnalysis, null, 2))
      .replace('{{CODE_CONTEXT}}', codeContext)
      .replace('{{FEATURE_DESCRIPTION}}', session.description || session.project_name || 'Not provided')
      + (this.hasRefinementContext(session) ? `\n\n## Prior Refinement Discussion\nThis session was promoted from backlog:\n${this.formatRefinementHistory(session)}\n\nIMPORTANT: Do NOT ask questions already answered in refinement.\n` : '')
    + '\n\n## Current Gathered Information\n' + contextSummary
      + '\n\n## Response Format\nRespond with valid JSON as specified in the prompt.';
  }


  /**
   * Build message history from hitl_messages table
   */
  async buildConversationHistory(sessionId, newUserMessage) {
    const history = await queryAll(`
      SELECT role, content FROM hitl_messages 
      WHERE session_id = $1 
      ORDER BY created_at ASC
      LIMIT 20
    `, [sessionId]);

    const messages = history.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Add current user message
    messages.push({
      role: 'user',
      content: newUserMessage
    });

    return messages;
  }

  /**
   * Store user and assistant messages
   */
  async storeMessages(sessionId, userMessage, assistantMessage) {
    const { randomUUID } = require('crypto');
    
    // Store user message
    await execute(`
      INSERT INTO hitl_messages (id, session_id, role, content, created_at)
      VALUES ($1, $2, 'user', $3, NOW())
    `, [randomUUID(), sessionId, userMessage]);

    // Store assistant message
    await execute(`
      INSERT INTO hitl_messages (id, session_id, role, content, created_at)
      VALUES ($1, $2, 'assistant', $3, NOW())
    `, [randomUUID(), sessionId, assistantMessage]);
  }

  /**
   * Initialize empty context
   */
  initializeContext() {
    return {
      gathered: {
        overview: { score: 0, details: {} },
        users: { score: 0, details: {} },
        features: { score: 0, details: {} },
        technical: { score: 0, details: {} },
        constraints: { score: 0, details: {} },
        acceptance: { score: 0, details: {} }
      },
      overallProgress: 0,
      suggestedFiles: [],
      existingPatterns: []
    };
  }

  /**
   * Summarize current context for prompt
   */
  summarizeContext(context) {
    if (!context || !context.gathered) {
      return 'No information gathered yet.';
    }

    const lines = [];
    for (const [category, data] of Object.entries(context.gathered)) {
      if (data.score > 0) {
        lines.push(`- ${category}: ${data.score}% complete`);
        if (data.details && Object.keys(data.details).length > 0) {
          lines.push(`  Details: ${JSON.stringify(data.details)}`);
        }
      }
    }

    if (context.suggestedFiles?.length > 0) {
      lines.push(`\nSuggested files to modify: ${context.suggestedFiles.join(', ')}`);
    }

    if (context.existingPatterns?.length > 0) {
      lines.push(`\nExisting patterns identified: ${context.existingPatterns.join(', ')}`);
    }

    return lines.length > 0 ? lines.join('\n') : 'No information gathered yet.';
  }

  /**
   * Start a new clarification session
   */
  async startSession(session) {
    const initialMessage = await this.generateInitialMessage(session);
    
    // Store initial assistant message
    await this.storeMessages(session.id, 
      session.description || session.project_name || 'New project',
      initialMessage.message
    );

    return initialMessage;
  }

  /**
   * Generate initial greeting/question
   */
  async generateInitialMessage(session) {
    // Handle sessions promoted from backlog with refinement context
    if (this.hasRefinementContext(session)) {
      console.log('[ClarificationAgent] Session from backlog - generating continuation');
      return this.generateContinuationMessage(session);
    }
    
    // Build context for build_feature
    if (session.project_type === 'build_feature') {
      return this.generateBuildFeatureInitial(session);
    }

    // Generic initial message for other types
    const prompt = `A user wants to create: "${session.description || session.project_name || 'a new project'}"

Generate a friendly greeting and your first clarifying question. Return JSON:
{
  "message": "Your greeting and first question",
  "gathered": { initial scores },
  "overallProgress": number,
  "readyForSpec": false,
  "nextQuestion": "Your question"
}`;

    const response = await chat({
      system: this.systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024
    });

    const parsed = parseJsonResponse(response.content);
    return {
      type: 'clarification',
      message: parsed?.message || "Hello! I'd love to help you build this. Can you tell me more about what problem you're trying to solve?",
      gathered: parsed?.gathered || this.initializeContext().gathered,
      progress: parsed?.overallProgress || 5,
      readyForSpec: false
    };
  }

  /**
   * Generate initial message for build_feature with RAG
   */
  async generateBuildFeatureInitial(session) {
    // Fetch initial RAG context using centralized utility
    let codeContext = '';
    if (session.description) {
      const ragResult = await fetchSessionContext(session, session.description, { maxTokens: 4000 });
      if (ragResult.success) {
        codeContext = `\n\nRelevant code found:\n${ragResult.context}`;
        console.log(`[ClarificationAgent] Initial RAG: ${ragResult.tokenCount} tokens from ${ragResult.reposSearched} repos`);
      }
    }

    const prompt = `A user wants to add a feature to an existing codebase.

Feature request: "${session.description || session.project_name}"
Repository: ${session.repo_url || 'Not specified'}
${codeContext}

Generate a friendly greeting that:
1. Acknowledges their feature request
2. If code context is available, reference specific patterns or files you found
3. Ask 2-3 targeted clarifying questions based on what you see in the code

Return JSON with message, gathered scores, etc.`;

    const buildFeaturePrompt = this.getBuildFeaturePrompt();
    
    const response = await chat({
      system: buildFeaturePrompt
        .replace('{{REPO_ANALYSIS}}', JSON.stringify(session.repo_analysis || {}, null, 2))
        .replace('{{CODE_CONTEXT}}', codeContext || 'No code context available yet.')
        .replace('{{FEATURE_DESCRIPTION}}', session.description || 'Not provided'),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1500
    });

    const parsed = parseJsonResponse(response.content);
    return {
      type: 'clarification',
      message: parsed?.message || "I'd be happy to help you add this feature. Let me understand a bit more about what you need.",
      gathered: parsed?.gathered || this.initializeContext().gathered,
      progress: parsed?.overallProgress || 10,
      readyForSpec: false,
      suggestedFiles: parsed?.suggestedFiles || [],
      existingPatterns: parsed?.existingPatterns || []
    };
  }


  /**
   * Check if session was promoted from backlog with refinement context
   */
  hasRefinementContext(session) {
    return session.source_type === 'backlog' && 
           session.chat_history && 
           (Array.isArray(session.chat_history) ? session.chat_history.length > 0 : 
            JSON.parse(session.chat_history || '[]').length > 0);
  }

  /**
   * Format refinement history for system prompt
   */
  formatRefinementHistory(session) {
    let history = session.chat_history;
    if (typeof history === 'string') {
      try {
        history = JSON.parse(history);
      } catch (e) {
        return 'Could not parse refinement history.';
      }
    }
    if (!Array.isArray(history) || history.length === 0) {
      return 'No prior refinement discussion.';
    }
    
    return history.map(m => {
      const role = m.role === 'user' ? 'User' : 'Refinement Agent';
      return `${role}: ${m.content}`;
    }).join('\n\n');
  }

  /**
   * Generate continuation message for backlog-promoted sessions
   */
  async generateContinuationMessage(session) {
    const refinementHistory = this.formatRefinementHistory(session);
    const repoInfo = session.repo_url ? `Repository: ${session.repo_url}` : 'No repository selected yet.';
    
    let codeContext = '';
    if (session.repo_url && session.description) {
      try {
        const ragResult = await fetchSessionContext(session, session.description, { maxTokens: 4000 });
        if (ragResult.success) {
          codeContext = `\n\nRelevant code:\n${ragResult.context}`;
        }
      } catch (e) {
        console.log('[ClarificationAgent] RAG fetch failed:', e.message);
      }
    }

    const continuationPrompt = `You are CONTINUING a conversation from backlog refinement.

## CRITICAL: NOT a fresh start
The user already discussed this. You must:
1. Acknowledge what was discussed
2. NOT repeat questions they answered
3. Ask targeted questions for remaining gaps

## Prior Refinement Discussion
${refinementHistory}

## Feature Being Built
${session.description || session.project_name || 'Not specified'}

## ${repoInfo}
${codeContext}

Generate a message that acknowledges refinement, summarizes understanding, and asks 1-2 remaining questions.
Return JSON with message, gathered, overallProgress, readyForSpec, nextQuestion.`;

    const response = await chat({
      system: this.systemPrompt,
      messages: [{ role: 'user', content: continuationPrompt }],
      maxTokens: 1500
    });

    const parsed = parseJsonResponse(response.content);
    const progress = parsed?.overallProgress || 30;
    
    return {
      type: 'clarification',
      message: parsed?.message || `I've reviewed your refinement discussion about "${session.project_name || 'this feature'}". I see you've covered the basics. What's the most important capability you want users to have?`,
      gathered: parsed?.gathered || this.initializeContext().gathered,
      progress: Math.max(progress, 30),
      readyForSpec: parsed?.readyForSpec || false,
      fromRefinement: true
    };
  }

  getBuildFeaturePrompt() {
    try {
      const promptPath = pathModule.join(__dirname, '../prompts/build-feature-clarify.md');
      return fsModule.readFileSync(promptPath, 'utf8');
    } catch (e) {
      console.error('Failed to load build-feature prompt:', e.message);
      return this.systemPrompt;
    }
  }
}

const clarificationAgent = new ClarificationAgent();
module.exports = { ClarificationAgent, clarificationAgent };
