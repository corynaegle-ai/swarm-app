/**
 * AI Dispatcher Service
 * Central control point for all AI actions with approval checks
 * 
 * Phase 3 of HITL Implementation
 * 
 * State Machine Aligned: 2025-12-12
 * States match hitl_session_states table exactly
 * 
 * MIGRATED TO POSTGRESQL: 2025-12-17
 */

const { queryAll, queryOne, execute } = require('../db');
const fs = require('fs');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const { chat, parseJsonResponse } = require('./claude-client');
const { clarificationAgent } = require('../agents/clarification-agent');
const { broadcast } = require('../websocket');
const { fetchContext } = require('./rag-client');

// Actions that require explicit user approval before execution
const APPROVAL_REQUIRED_ACTIONS = [
  'generate_tickets',      // Creating work items
  'execute_ticket',        // Running agent on ticket  
  'merge_pr',              // Merging code changes
  'delete_resource',       // Destructive operations
  'modify_infrastructure', // Infrastructure changes
  'start_build'            // Begin autonomous execution
];

// AI action permissions per session state
// Keys MUST match hitl_session_states.state values exactly
const AI_PERMISSIONS = {
  // Initial state - user submits description
  'input': [
    'suggest',            // Suggest improvements to description
    'validate_input'      // Check if description is sufficient
  ],
  
  // AI gathering requirements through Q&A
  'clarifying': [
    'clarify',            // Ask clarifying questions
    'summarize',          // Summarize conversation so far
    'suggest',            // Make suggestions
    'check_completeness'  // Check if ready for spec generation
  ],
  
  // Ready to generate spec card
  'ready_for_docs': [
    'generate_spec',      // Create specification document
    'summarize'           // Summarize gathered requirements
  ],
  
  // User reviewing/editing spec card
  'reviewing': [
    'explain',            // Explain parts of the spec
    'suggest_edits',      // Suggest improvements
    'validate_spec'       // Check spec completeness
  ],
  
  // Spec approved, ready for build
  'approved': [
    'generate_tickets',   // Create tickets from spec (requires approval)
    'estimate',           // Provide time/effort estimates
    'plan_execution'      // Create execution plan
  ],
  
  // Autonomous agents executing
  'building': [
    'status_update',      // Report build progress
    'diagnose',           // Diagnose issues
    'decompose_ticket'    // Break down complex tickets
  ],
  
  // Terminal states - limited or no AI actions
  'completed': [
    'summarize',          // Summarize what was built
    'generate_report'     // Create completion report
  ],
  
  'failed': [
    'diagnose',           // Help diagnose what went wrong
    'suggest_fixes',      // Suggest remediation steps
    'summarize'           // Summarize failure context
  ],
  
  'cancelled': []         // No AI actions on cancelled sessions
};


// UI hints for blocked states - helps frontend show appropriate UI
const BLOCKED_HINTS = {
  'input': {
    message: 'Waiting for initial project description',
    suggestedAction: 'submit_description',
    uiComponent: 'DescriptionForm'
  },
  'clarifying': {
    message: 'AI is asking clarifying questions',
    suggestedAction: 'answer_questions', 
    uiComponent: 'ChatInterface'
  },
  'ready_for_docs': {
    message: 'Ready to generate specification',
    suggestedAction: 'generate_spec',
    uiComponent: 'GenerateSpecButton'
  },
  'reviewing': {
    message: 'Please review the generated specification',
    suggestedAction: 'approve_or_edit',
    uiComponent: 'SpecReviewPanel'
  },
  'approved': {
    message: 'Spec approved - ready to start build',
    suggestedAction: 'start_build',
    uiComponent: 'BuildStartPanel'
  },
  'building': {
    message: 'Build in progress - agents are working',
    suggestedAction: 'monitor',
    uiComponent: 'BuildProgressView'
  },
  'completed': {
    message: 'Session completed successfully',
    suggestedAction: null,
    uiComponent: 'CompletedView'
  },
  'failed': {
    message: 'Build failed - review errors and retry',
    suggestedAction: 'retry_or_cancel',
    uiComponent: 'FailureView'
  },
  'cancelled': {
    message: 'Session was cancelled',
    suggestedAction: 'restart',
    uiComponent: 'CancelledView'
  }
};


class AIDispatcher {
  constructor(claudeClient = null) {
    this.claude = claudeClient;
  }

  /**
   * Main entry point - dispatch an AI action with all checks
   * @param {string} sessionId - HITL session ID
   * @param {string} action - Action to perform
   * @param {object} context - Additional context for the action
   * @returns {object} Result with status, data, or blocked info
   */
  async dispatch(sessionId, action, context = {}) {
    // 1. Get session state
    const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [sessionId]);
    if (!session) {
      return { 
        status: 'error', 
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      };
    }

    // 2. Check if AI is allowed to act in this state
    if (!this.isAIAllowed(session.state, action)) {
      return {
        status: 'blocked',
        reason: 'state_restriction',
        currentState: session.state,
        requestedAction: action,
        allowedActions: AI_PERMISSIONS[session.state] || [],
        hint: BLOCKED_HINTS[session.state] || { message: 'Action not permitted in current state' }
      };
    }


    // 3. Check if action requires explicit approval
    if (this.requiresApproval(action)) {
      const hasApproval = await this.checkApproval(sessionId, action);
      if (!hasApproval) {
        // Create pending approval request
        const approvalId = await this.createApprovalRequest(sessionId, action, context);
        return {
          status: 'pending_approval',
          approvalId,
          action,
          message: `Action '${action}' requires human approval`,
          hint: {
            message: 'Please review and approve this action',
            suggestedAction: 'approve',
            uiComponent: 'ApprovalPanel'
          }
        };
      }
    }

    // 4. Execute the action
    try {
      const result = await this.execute(session, action, context);
      await this.logDispatch(sessionId, action, 'success', result);
      return { status: 'success', action, result };
    } catch (error) {
      await this.logDispatch(sessionId, action, 'error', { error: error.message });
      return { status: 'error', action, error: error.message, code: 'EXECUTION_FAILED' };
    }
  }

  /** Check if AI is allowed to perform action in given state */
  isAIAllowed(state, action) {
    const allowedActions = AI_PERMISSIONS[state];
    if (!allowedActions) return false;
    return allowedActions.includes(action);
  }

  /** Check if action requires explicit user approval */
  requiresApproval(action) {
    return APPROVAL_REQUIRED_ACTIONS.includes(action);
  }

  /** Check if approval exists for this action */
  async checkApproval(sessionId, action) {
    const approval = await queryOne(`
      SELECT * FROM hitl_approvals 
      WHERE session_id = $1 AND action = $2 AND status = 'approved'
      ORDER BY created_at DESC LIMIT 1
    `, [sessionId, action]);
    return !!approval;
  }


  /** Create a pending approval request */
  async createApprovalRequest(sessionId, action, context) {
    const id = uuidv4();
    
    // Get tenant_id from session for proper isolation
    const session = await queryOne('SELECT tenant_id FROM hitl_sessions WHERE id = $1', [sessionId]);
    
    await execute(`
      INSERT INTO hitl_approvals (id, session_id, tenant_id, action, context, status, approval_type, created_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', 'action_approval', NOW())
    `, [id, sessionId, session?.tenant_id, action, JSON.stringify(context)]);
    
    // Broadcast approval request
    broadcast.approvalRequested(sessionId, {
      approvalId: id,
      action,
      context
    });
    
    // Record event (with graceful fallback if hitl_events doesn't exist)
    try {
      await this.logEvent(sessionId, 'approval_requested', { approvalId: id, action });
    } catch (e) {
      console.warn('Could not log event (hitl_events table may not exist):', e.message);
    }
    
    return id;
  }

  /** Log event to hitl_events table with tenant isolation */
  async logEvent(sessionId, eventType, payload) {
    try {
      // Get tenant_id from session for proper isolation
      const session = await queryOne('SELECT tenant_id FROM hitl_sessions WHERE id = $1', [sessionId]);
      const tenantId = session?.tenant_id || null;
      
      await execute(`
        INSERT INTO hitl_events (id, session_id, tenant_id, event_type, payload, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [uuidv4(), sessionId, tenantId, eventType, JSON.stringify(payload)]);
    } catch (e) {
      // Log to console as fallback
      console.error(`[HITL Event Error] ${eventType}:`, e.message, { sessionId, ...payload });
    }
  }

  /** Log dispatch attempt for audit trail */
  async logDispatch(sessionId, action, status, details) {
    await this.logEvent(sessionId, 'ai_dispatch', { action, status, details });
  }



  /** Execute the AI action */
  async execute(session, action, context) {
    switch (action) {
      // Input state actions
      case 'suggest':
        return this.executeSuggest(session, context);
      case 'validate_input':
        return this.executeValidateInput(session, context);
      
      // Clarifying state actions  
      case 'clarify':
        return this.executeClarify(session, context);
      case 'summarize':
        return this.executeSummarize(session, context);
      case 'check_completeness':
        return this.executeCheckCompleteness(session, context);
      
      // Ready for docs state actions
      case 'generate_spec':
        return this.executeGenerateSpec(session, context);
      
      // Reviewing state actions
      case 'explain':
        return this.executeExplain(session, context);
      case 'suggest_edits':
        return this.executeSuggestEdits(session, context);
      case 'validate_spec':
        return this.executeValidateSpec(session, context);
      
      // Approved state actions
      case 'generate_tickets':
        return this.executeGenerateTickets(session, context);
      case 'estimate':
        return this.executeEstimate(session, context);
      case 'plan_execution':
        return this.executePlanExecution(session, context);
      
      // Building state actions
      case 'status_update':
        return this.executeStatusUpdate(session, context);
      case 'decompose_ticket':
        return this.executeDecomposeTicket(session, context);
      
      // Failed state actions
      case 'diagnose':
        return this.executeDiagnose(session, context);
      case 'suggest_fixes':
        return this.executeSuggestFixes(session, context);
      
      // Completed state actions
      case 'generate_report':
        return this.executeGenerateReport(session, context);
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }


  // ============================================
  // Action Implementations (Stubs for Phase 3)
  // Will be wired to Claude API in Phase 4
  // ============================================

  async executeValidateInput(session, context) {
    return {
      type: 'validation',
      isValid: true,
      suggestions: [],
      message: 'Input validation placeholder - wire to Claude'
    };
  }

  async executeSuggest(session, context) {
    const systemPrompt = `You are a helpful project advisor. Analyze the project description and provide actionable suggestions.

Respond with JSON:
{
  "suggestions": [
    { "type": "improvement|clarification|warning", "title": "short title", "description": "detailed suggestion" }
  ],
  "message": "conversational summary of your suggestions"
}`;

    const response = await chat({
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Project: ${session.description || 'No description'}\n\nContext: ${JSON.stringify(context.additionalInfo || {})}`
      }],
      maxTokens: 1024
    });

    if (!response.success) {
      return { type: 'suggestions', suggestions: [], message: 'Unable to generate suggestions.', error: response.error };
    }

    const parsed = parseJsonResponse(response.content);
    return {
      type: 'suggestions',
      suggestions: parsed?.suggestions || [],
      message: parsed?.message || response.content
    };
  }

  async executeClarify(session, context) {
    // Use clarification agent for conversational Q&A
    if (context.userMessage) {
      // Continue existing conversation
      return clarificationAgent.processResponse(session, context.userMessage);
    } else {
      // Start new clarification conversation
      return clarificationAgent.startSession(session);
    }
  }

  async executeSummarize(session, context) {
    const messages = await queryAll(`
      SELECT role, content FROM hitl_messages 
      WHERE session_id = $1 ORDER BY created_at ASC
    `, [session.id]);

    const conversation = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');

    const response = await chat({
      system: 'Summarize this conversation. Output JSON: { "summary": "...", "keyPoints": ["..."], "message": "..." }',
      messages: [{ role: 'user', content: conversation || session.description || 'No content' }],
      maxTokens: 1024
    });

    if (!response.success) {
      return { type: 'summary', summary: 'Unable to generate summary.', keyPoints: [], message: response.error };
    }

    const parsed = parseJsonResponse(response.content);
    return {
      type: 'summary',
      summary: parsed?.summary || response.content,
      keyPoints: parsed?.keyPoints || [],
      message: parsed?.message || 'Summary generated.'
    };
  }

  async executeCheckCompleteness(session, context) {
    return {
      type: 'completeness_check',
      isComplete: false,
      missingAreas: ['technical requirements', 'acceptance criteria'],
      completionPercent: 60,
      message: 'Completeness check placeholder - wire to Claude'
    };
  }


  async executeGenerateSpec(session, context) {
    // Get conversation history for context
    const messages = await queryAll(`
      SELECT role, content FROM hitl_messages 
      WHERE session_id = $1 ORDER BY created_at ASC
    `, [session.id]);

    const conversationSummary = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    const clarificationContext = session.clarification_context 
      ? (typeof session.clarification_context === 'string' ? JSON.parse(session.clarification_context) : session.clarification_context) 
      : {};

    // Build system prompt based on project type
    let systemPrompt;
    let userContent;

    if (session.project_type === 'build_feature') {
      // Load build-feature-specific prompt
      try {
        const promptPath = path.join(__dirname, '../prompts/build-feature-spec.md');
        systemPrompt = fs.readFileSync(promptPath, 'utf8');
        
        // Parse repo_analysis
        let repoAnalysis = {};
        if (session.repo_analysis) {
          try {
            repoAnalysis = typeof session.repo_analysis === 'string' 
              ? JSON.parse(session.repo_analysis) 
              : session.repo_analysis;
          } catch (e) {
            repoAnalysis = { error: 'Failed to parse repo analysis' };
          }
        }
        
        // Inject repo analysis into prompt
        systemPrompt = systemPrompt.replace('{{REPO_ANALYSIS}}', JSON.stringify(repoAnalysis, null, 2));
        
        userContent = `## Feature Request
${session.project_name || 'Unnamed Feature'}

## Description
${session.description || 'No description provided'}

## Clarification Conversation
${conversationSummary || 'No clarification conversation'}

## Gathered Requirements
${JSON.stringify(clarificationContext.gathered || {}, null, 2)}

## Target Repository
${session.repo_url || 'Not specified'}`;

      } catch (e) {
        console.error('Failed to load build-feature spec prompt:', e.message);
        // Fall back to generic prompt
        systemPrompt = this.getGenericSpecPrompt();
        userContent = this.buildGenericUserContent(session, conversationSummary, clarificationContext);
      }
    } else {
      // Generic new application prompt
      systemPrompt = this.getGenericSpecPrompt();
      userContent = this.buildGenericUserContent(session, conversationSummary, clarificationContext);
    }

    const response = await chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 4096
    });

    if (!response.success) {
      return { type: 'spec', spec: null, status: 'error', message: 'Failed to generate spec.', error: response.error };
    }

    const parsed = parseJsonResponse(response.content);
    
    if (parsed?.spec) {
      // Store spec in session
      await execute(`
        UPDATE hitl_sessions 
        SET spec_card = $1, state = 'reviewing', updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(parsed.spec), session.id]);
      
      // Broadcast state change to reviewing
      broadcast.sessionUpdate(session.id, 'reviewing', 70);
      
      // Broadcast spec generated event
      broadcast.specGenerated(session.id, {
        spec: parsed.spec,
        confidence: parsed.confidence
      });

      return {
        type: 'spec',
        spec: parsed.spec,
        confidence: parsed.confidence,
        status: 'generated',
        message: parsed.message || 'Specification generated successfully.'
      };
    }

    return { type: 'spec', spec: null, status: 'parse_error', message: 'Could not parse spec.', raw: response.content };
  }

  getGenericSpecPrompt() {
    return `You are a technical specification writer. Create a detailed spec card from the gathered requirements.

Output JSON:
{
  "spec": {
    "title": "Project title",
    "summary": "2-3 sentence overview",
    "goals": ["list of project goals"],
    "users": { "primary": "description", "secondary": "description" },
    "features": [
      { "name": "Feature name", "description": "Details", "priority": "high|medium|low", "acceptance": ["criteria"] }
    ],
    "technical": {
      "stack": ["tech choices"],
      "integrations": ["external systems"],
      "dataModel": "description of data requirements"
    },
    "constraints": { "timeline": "...", "budget": "...", "performance": "..." },
    "outOfScope": ["explicitly excluded items"],
    "openQuestions": ["remaining unknowns"]
  },
  "confidence": 0-100,
  "message": "summary of the spec"
}`;
  }

  buildGenericUserContent(session, conversationSummary, clarificationContext) {
    return `Original description:\n${session.description}\n\nClarification conversation:\n${conversationSummary}\n\nGathered context:\n${JSON.stringify(clarificationContext.gathered || {})}`;
  }

  async executeExplain(session, context) {
    return {
      type: 'explanation',
      explanation: 'Explanation placeholder',
      relatedSections: [],
      message: 'Explain placeholder - wire to Claude'
    };
  }


  async executeSuggestEdits(session, context) {
    // 1. Load current spec
    let currentSpec = null;
    if (session.spec_card) {
      try {
        currentSpec = JSON.parse(session.spec_card);
      } catch (e) {
        return {
          type: 'revision',
          status: 'error',
          message: 'Could not parse current specification.'
        };
      }
    }

    if (!currentSpec) {
      return {
        type: 'revision',
        status: 'error',
        message: 'No specification exists to revise. Please generate a spec first.'
      };
    }

    // 2. Load conversation history for context
    const messageHistory = await queryAll(`
      SELECT role, content, message_type FROM hitl_messages 
      WHERE session_id = $1 
      ORDER BY created_at ASC
      LIMIT 30
    `, [session.id]);

    const conversationSummary = messageHistory
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // 3. Build prompt for spec revision
    const systemPrompt = `You are an expert software specification editor. Your job is to revise specifications based on user feedback.

## Current Specification
\`\`\`json
${JSON.stringify(currentSpec, null, 2)}
\`\`\`

## Project Context
Project Name: ${session.project_name || 'Untitled'}
Original Description: ${session.description || 'Not provided'}

## Previous Conversation
${conversationSummary || 'No previous conversation.'}

## Your Task
Analyze the user's feedback and either:
1. **REVISE** the specification if the feedback is clear and actionable
2. **CLARIFY** by asking questions if the feedback is ambiguous or needs more detail

## Response Format
Respond with valid JSON in this exact structure:
{
  "action": "revision" | "clarification",
  "message": "Your explanation of what you changed OR your clarifying questions",
  "spec": { /* Complete revised spec if action=revision, null if action=clarification */ },
  "changes": [
    { "section": "section name", "change": "description of change" }
  ],
  "questions": ["question 1", "question 2"] // Only if action=clarification
}

## Rules
1. If revising, return the COMPLETE updated spec (not just changes)
2. Keep changes minimal and targeted to the feedback
3. Maintain spec structure consistency
4. If user feedback is vague (e.g., "make it better"), ask for specifics
5. List all changes made so user can review them`;

    // 4. Call Claude
    const response = await chat({
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `User feedback: ${context.feedback || context.userMessage || 'No feedback provided'}`
      }],
      maxTokens: 4096
    });

    if (!response.success) {
      return {
        type: 'revision',
        status: 'error',
        message: 'Failed to process revision request.',
        error: response.error
      };
    }

    // 5. Parse response
    const parsed = parseJsonResponse(response.content);
    
    if (!parsed) {
      return {
        type: 'revision',
        status: 'parse_error',
        message: response.content,
        raw: response.content
      };
    }

    // 6. Store the feedback as a message
    const userMsgId = uuidv4();
    const assistantMsgId = uuidv4();
    
    // Store user feedback message (use 'chat' type as it's a user revision request)
    await execute(`
      INSERT INTO hitl_messages (id, session_id, role, content, message_type)
      VALUES ($1, $2, 'user', $3, 'chat')
    `, [userMsgId, session.id, context.feedback || context.userMessage || 'Revision requested']);

    broadcast.sessionMessage(session.id, {
      id: userMsgId,
      role: 'user',
      content: context.feedback || context.userMessage,
      messageType: 'chat'
    });

    // Store AI response message (use 'spec_update' for revision responses)
    await execute(`
      INSERT INTO hitl_messages (id, session_id, role, content, message_type)
      VALUES ($1, $2, 'assistant', $3, 'spec_update')
    `, [assistantMsgId, session.id, parsed.message]);

    broadcast.sessionMessage(session.id, {
      id: assistantMsgId,
      role: 'assistant',
      content: parsed.message,
      messageType: 'spec_update'
    });

    // 7. Handle based on action type
    if (parsed.action === 'revision' && parsed.spec) {
      // Update spec in database
      await execute(`
        UPDATE hitl_sessions 
        SET spec_card = $1, updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(parsed.spec), session.id]);

      // Broadcast spec updated
      broadcast.specGenerated(session.id, {
        spec: parsed.spec,
        isRevision: true,
        changes: parsed.changes || []
      });

      return {
        type: 'revision',
        status: 'revised',
        message: parsed.message,
        spec: parsed.spec,
        changes: parsed.changes || []
      };
    } else {
      // Clarification needed - stay in reviewing state but signal UI
      return {
        type: 'clarification',
        status: 'needs_clarification',
        message: parsed.message,
        questions: parsed.questions || [],
        spec: currentSpec // Return current spec unchanged
      };
    }
  }

  async executeValidateSpec(session, context) {
    return {
      type: 'spec_validation',
      isValid: true,
      issues: [],
      message: 'Spec validation placeholder - wire to Claude'
    };
  }


  async executeGenerateTickets(session, context) {
    // Validate we have a spec to work with
    if (!session.spec_card) {
      return { 
        type: 'tickets', 
        tickets: [], 
        status: 'error', 
        message: 'No specification found. Generate spec first.' 
      };
    }

    let spec;
    try {
      spec = typeof session.spec_card === 'string' 
        ? JSON.parse(session.spec_card) 
        : session.spec_card;
    } catch (e) {
      return { 
        type: 'tickets', 
        tickets: [], 
        status: 'error', 
        message: 'Failed to parse specification.' 
      };
    }

    // Build system prompt based on project type
    let systemPrompt;
    let userContent;

    if (session.project_type === 'build_feature') {
      // Load build-feature-specific ticket prompt
      try {
        const promptPath = path.join(__dirname, '../prompts/build-feature-tickets.md');
        systemPrompt = fs.readFileSync(promptPath, 'utf8');
        
        // Parse repo_analysis
        let repoAnalysis = {};
        if (session.repo_analysis) {
          try {
            repoAnalysis = typeof session.repo_analysis === 'string' 
              ? JSON.parse(session.repo_analysis) 
              : session.repo_analysis;
          } catch (e) {
            repoAnalysis = { error: 'Failed to parse repo analysis' };
          }
        }
        

        // ============================================
        // RAG CONTEXT INJECTION
        // Fetch relevant code snippets for ticket generation
        // ============================================
        let codeContext = 'No code context available.';
        
        if (session.repo_url) {
          try {
            // Build RAG query from spec features
            const features = spec.features || [];
            const featureNames = features.map(f => f.name || f.title || '').join(', ');
            const ragQuery = `${spec.title || session.description || ''} ${featureNames}`.trim();
            
            console.log(`[AIDispatcher] Fetching RAG context for ticket generation: "${ragQuery.slice(0, 60)}..."`);
            
            const ragResult = await fetchContext(ragQuery, [session.repo_url], { maxTokens: 6000 });
            
            if (ragResult.success && ragResult.context) {
              codeContext = ragResult.context;
              console.log(`[AIDispatcher] RAG returned ${ragResult.tokenCount} tokens from ${ragResult.reposSearched} repos`);
            } else {
              codeContext = `Code search returned no results. Reason: ${ragResult.reason || 'unknown'}`;
              console.log(`[AIDispatcher] RAG failed: ${ragResult.reason}`);
            }
          } catch (e) {
            console.error('[AIDispatcher] RAG fetch error:', e.message);
            codeContext = 'Code context unavailable due to error.';
          }
        }
        // ============================================
        // Inject all placeholders into prompt
        const techStack = repoAnalysis.techStack || {};
        systemPrompt = systemPrompt
          .replace('{{REPO_ANALYSIS}}', JSON.stringify(repoAnalysis, null, 2))
          .replace('{{REPO_URL}}', session.repo_url || 'Not specified')
          .replace('{{SPEC_CARD}}', JSON.stringify(spec, null, 2))
          .replace('{{TECH_STACK}}', Object.keys(techStack).join(', ') || 'Unknown');
        
        userContent = this.buildFeatureTicketsUserContent(session, spec);

      } catch (e) {
        console.error('Failed to load build-feature tickets prompt:', e.message);
        systemPrompt = this.getGenericTicketsPrompt();
        userContent = this.buildGenericTicketsUserContent(session, spec);
      }
    } else {
      // Generic new application ticket generation
      systemPrompt = this.getGenericTicketsPrompt();
      userContent = this.buildGenericTicketsUserContent(session, spec);
    }

    const response = await chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 8192
    });

    if (!response.success) {
      return { 
        type: 'tickets', 
        tickets: [], 
        status: 'error', 
        message: 'Failed to generate tickets.', 
        error: response.error 
      };
    }

    const parsed = parseJsonResponse(response.content);
    
    if (!parsed?.tickets || !Array.isArray(parsed.tickets)) {
      return { 
        type: 'tickets', 
        tickets: [], 
        status: 'parse_error', 
        message: 'Could not parse tickets from response.',
        raw: response.content 
      };
    }

    // Create or get project for tickets
    let projectId = session.project_id;
    
    if (!projectId) {
      // Create a new project for this session
      projectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      await execute(`
        INSERT INTO projects (id, name, repo_url, tenant_id, hitl_session_id, description, status, type)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
      `, [
        projectId,
        session.project_name || spec.title || 'Untitled Project',
        session.repo_url || '',
        session.tenant_id,
        session.id,
        session.description || spec.summary || '',
        session.project_type || 'standard'
      ]);

      // Link project back to session
      await execute(`
        UPDATE hitl_sessions SET project_id = $1 WHERE id = $2
      `, [projectId, session.id]);
    }

    // Insert tickets into database
    const createdTickets = [];

    for (const ticket of parsed.tickets) {
      const ticketId = 'tkt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      await execute(`
        INSERT INTO tickets (
          id, project_id, title, description, acceptance_criteria,
          state, epic, estimated_scope, files_hint, files_involved,
          design_session
        ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10)
      `, [
        ticketId,
        projectId,
        ticket.title,
        ticket.description,
        JSON.stringify(ticket.acceptance_criteria || []),
        ticket.epic || 'General',
        ticket.estimated_scope || 'medium',
        ticket.files_hint || '',
        JSON.stringify(ticket.files_involved || []),
        session.id
      ]);

      createdTickets.push({
        id: ticketId,
        ...ticket
      });
    }

    // Update session state to 'building'
    await execute(`
      UPDATE hitl_sessions 
      SET state = 'building', updated_at = NOW()
      WHERE id = $1
    `, [session.id]);

    // Broadcast state change
    broadcast.sessionUpdate(session.id, 'building', 90);
    
    // Broadcast tickets generated event
    broadcast.ticketsGenerated(session.id, {
      projectId,
      tickets: createdTickets,
      count: createdTickets.length
    });

    return {
      type: 'tickets',
      tickets: createdTickets,
      projectId,
      status: 'generated',
      message: 'Generated ' + createdTickets.length + ' tickets successfully.'
    };
  }

  buildFeatureTicketsUserContent(session, spec) {
    const parts = [
      '## Feature Name',
      session.project_name || spec.title || 'Unnamed Feature',
      '',
      '## Feature Description',
      session.description || spec.summary || 'No description provided',
      '',
      '## Approved Specification',
      JSON.stringify(spec, null, 2),
      '',
      '## Target Repository',
      session.repo_url || 'Not specified'
    ];
    return parts.join('\n');
  }

  getGenericTicketsPrompt() {
    try {
      const promptPath = path.join(__dirname, '../prompts/generate-tickets.md');
      return fs.readFileSync(promptPath, 'utf8');
    } catch (e) {
      return 'You are a technical project manager. Break down the specification into development tickets.\n\nOutput JSON:\n{\n  "tickets": [\n    {\n      "title": "Short title",\n      "description": "Implementation details",\n      "acceptance_criteria": ["criterion 1", "criterion 2"],\n      "epic": "Category",\n      "estimated_scope": "small|medium|large",\n      "files_hint": "Files to create/modify",\n      "dependencies": [],\n      "priority": "high|medium|low"\n    }\n  ]\n}\n\nReturn ONLY valid JSON.';
    }
  }

  buildGenericTicketsUserContent(session, spec) {
    const parts = [
      '## Project Name',
      session.project_name || spec.title || 'Untitled Project',
      '',
      '## Project Description', 
      session.description || spec.summary || 'No description',
      '',
      '## Approved Specification',
      JSON.stringify(spec, null, 2)
    ];
    return parts.join('\n');
  }



  async executeEstimate(session, context) {
    return {
      type: 'estimate',
      totalHours: null,
      breakdown: [],
      confidence: 'low',
      message: 'Estimation placeholder - wire to Claude'
    };
  }

  async executePlanExecution(session, context) {
    return {
      type: 'execution_plan',
      phases: [],
      dependencies: [],
      message: 'Execution planning placeholder - wire to Claude'
    };
  }


  async executeStatusUpdate(session, context) {
    return {
      type: 'status_update',
      progress: 0,
      currentTask: null,
      remainingTasks: [],
      message: 'Status update placeholder - wire to execution engine'
    };
  }

  async executeDecomposeTicket(session, context) {
    return { 
      type: 'decomposition', 
      subtasks: [], 
      status: 'not_implemented',
      message: 'Ticket decomposition placeholder - wire to Claude'
    };
  }

  async executeDiagnose(session, context) {
    return { 
      type: 'diagnosis', 
      diagnosis: null, 
      rootCause: null,
      suggestions: [], 
      status: 'not_implemented',
      message: 'Diagnosis placeholder - wire to Claude'
    };
  }

  async executeSuggestFixes(session, context) {
    return {
      type: 'fix_suggestions',
      fixes: [],
      message: 'Fix suggestions placeholder - wire to Claude'
    };
  }

  async executeGenerateReport(session, context) {
    return {
      type: 'completion_report',
      report: null,
      metrics: {},
      message: 'Report generation placeholder - wire to Claude'
    };
  }
}

// Export singleton and class
const dispatcher = new AIDispatcher();

module.exports = { 
  AIDispatcher,
  dispatcher,
  AI_PERMISSIONS,
  APPROVAL_REQUIRED_ACTIONS,
  BLOCKED_HINTS
};
