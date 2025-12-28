/**
 * PATCH: Clarification Agent - Backlog Context Awareness
 * 
 * File: apps/platform/agents/clarification-agent.js
 * 
 * Changes:
 * 1. Detect source_type='backlog' sessions
 * 2. Include refinement history acknowledgment in system prompt
 * 3. Start conversation as continuation, not fresh start
 */

// ============================================================================
// ADD: Helper method to check for refinement context (add near line 200)
// ============================================================================

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
    history = JSON.parse(history);
  }
  if (!Array.isArray(history) || history.length === 0) {
    return 'No prior refinement discussion.';
  }
  
  return history.map(m => {
    const role = m.role === 'user' ? 'User' : 'Refinement Agent';
    return `${role}: ${m.content}`;
  }).join('\n\n');
}

// ============================================================================
// MODIFY: generateInitialMessage method (around line 355)
// Add backlog context handling BEFORE the existing build_feature check
// ============================================================================

async generateInitialMessage(session) {
  // NEW: Handle sessions promoted from backlog with refinement context
  if (this.hasRefinementContext(session)) {
    return this.generateContinuationMessage(session);
  }
  
  // Build context for build_feature (existing code)
  if (session.project_type === 'build_feature') {
    return this.generateBuildFeatureInitial(session);
  }

  // ... rest of existing generateInitialMessage code
}

// ============================================================================
// ADD: New method for continuation messages (add after generateInitialMessage)
// ============================================================================

/**
 * Generate continuation message for backlog-promoted sessions
 * Acknowledges prior refinement and continues intelligently
 */
async generateContinuationMessage(session) {
  const refinementHistory = this.formatRefinementHistory(session);
  const repoInfo = session.repo_url ? `Repository: ${session.repo_url}` : 'No repository selected yet.';
  
  // Fetch RAG context if repo_url exists
  let codeContext = '';
  if (session.repo_url && session.description) {
    const ragResult = await fetchSessionContext(session, session.description, { maxTokens: 4000 });
    if (ragResult.success) {
      codeContext = `\n\nRelevant code from repository:\n${ragResult.context}`;
      console.log(`[ClarificationAgent] Continuation RAG: ${ragResult.tokenCount} tokens`);
    }
  }

  const continuationPrompt = `You are CONTINUING a conversation that started in backlog refinement.

## CRITICAL: This is NOT a fresh start
The user has already discussed this feature with a refinement agent. You must:
1. Acknowledge what was discussed (don't ask questions they already answered)
2. Pick up where refinement left off
3. Ask targeted clarifying questions to fill remaining gaps
4. DO NOT repeat questions from the refinement discussion

## Prior Refinement Discussion
${refinementHistory}

## Feature/Project Being Built
${session.description || session.project_name || 'Not specified'}

## ${repoInfo}
${codeContext}

## Your Task
Generate a message that:
1. Briefly acknowledges you've reviewed the refinement discussion
2. Summarizes what you understood from it (2-3 bullet points)
3. Identifies 1-2 remaining questions that weren't answered
4. Asks your most important clarifying question

Return JSON:
{
  "message": "Your continuation message",
  "gathered": { 
    "overview": { "score": X, "details": {...} },
    "users": { "score": X, "details": {...} },
    "features": { "score": X, "details": {...} },
    "technical": { "score": X, "details": {...} },
    "constraints": { "score": X, "details": {...} },
    "acceptance": { "score": X, "details": {...} }
  },
  "overallProgress": X,
  "readyForSpec": boolean,
  "nextQuestion": "Your question if not ready"
}

IMPORTANT: Pre-populate gathered scores based on what was discussed in refinement!`;

  const response = await chat({
    system: this.systemPrompt,
    messages: [{ role: 'user', content: continuationPrompt }],
    maxTokens: 1500
  });

  const parsed = parseJsonResponse(response.content);
  
  // Ensure higher starting progress for backlog-promoted sessions
  const progress = parsed?.overallProgress || 30; // At least 30% if they went through refinement
  
  return {
    type: 'clarification',
    message: parsed?.message || this.getDefaultContinuationMessage(session),
    gathered: parsed?.gathered || this.initializeContext().gathered,
    progress: Math.max(progress, 30), // Minimum 30% for refined items
    readyForSpec: parsed?.readyForSpec || false,
    fromRefinement: true
  };
}

/**
 * Fallback continuation message if Claude fails
 */
getDefaultContinuationMessage(session) {
  return `I've reviewed your refinement discussion about "${session.project_name || 'this feature'}". ` +
    `I see you've already covered the basics. Let me ask a few more targeted questions ` +
    `to make sure we have everything needed for the specification. ` +
    `What's the most important capability you want users to have?`;
}

// ============================================================================
// MODIFY: buildFeatureSystemPrompt to also check for refinement context
// (around line 204)
// ============================================================================

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

  // NEW: Add refinement context if session was promoted from backlog
  let refinementContext = '';
  if (this.hasRefinementContext(session)) {
    refinementContext = `
## Prior Refinement Discussion
This session was promoted from a backlog item. The user already discussed this feature:

${this.formatRefinementHistory(session)}

IMPORTANT: Do NOT ask questions that were already answered in refinement. Build on what was discussed.
`;
  }

  // Build the enhanced prompt
  return buildFeaturePrompt
    .replace('{{REPO_ANALYSIS}}', JSON.stringify(repoAnalysis, null, 2))
    .replace('{{CODE_CONTEXT}}', codeContext)
    .replace('{{FEATURE_DESCRIPTION}}', session.description || session.project_name || 'Not provided')
    + refinementContext  // NEW: Include refinement context
    + '\n\n## Current Gathered Information\n' + contextSummary
    + '\n\n## Response Format\nRespond with valid JSON as specified in the prompt.';
}
