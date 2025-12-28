#!/usr/bin/env node
/**
 * Add missing helper methods to clarification agent
 */

const fs = require('fs');
const path = '/opt/swarm-app/apps/platform/agents/clarification-agent.js';

let content = fs.readFileSync(path, 'utf8');

// Check if methods already exist
if (content.includes('hasRefinementContext(session) {')) {
  console.log('Helper methods already exist');
  process.exit(0);
}

const helperMethods = `
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
      return \`\${role}: \${m.content}\`;
    }).join('\\n\\n');
  }

  /**
   * Generate continuation message for backlog-promoted sessions
   */
  async generateContinuationMessage(session) {
    const refinementHistory = this.formatRefinementHistory(session);
    const repoInfo = session.repo_url ? \`Repository: \${session.repo_url}\` : 'No repository selected yet.';
    
    let codeContext = '';
    if (session.repo_url && session.description) {
      try {
        const ragResult = await fetchSessionContext(session, session.description, { maxTokens: 4000 });
        if (ragResult.success) {
          codeContext = \`\\n\\nRelevant code:\\n\${ragResult.context}\`;
        }
      } catch (e) {
        console.log('[ClarificationAgent] RAG fetch failed:', e.message);
      }
    }

    const continuationPrompt = \`You are CONTINUING a conversation from backlog refinement.

## CRITICAL: NOT a fresh start
The user already discussed this. You must:
1. Acknowledge what was discussed
2. NOT repeat questions they answered
3. Ask targeted questions for remaining gaps

## Prior Refinement Discussion
\${refinementHistory}

## Feature Being Built
\${session.description || session.project_name || 'Not specified'}

## \${repoInfo}
\${codeContext}

Generate a message that acknowledges refinement, summarizes understanding, and asks 1-2 remaining questions.
Return JSON with message, gathered, overallProgress, readyForSpec, nextQuestion.\`;

    const response = await chat({
      system: this.systemPrompt,
      messages: [{ role: 'user', content: continuationPrompt }],
      maxTokens: 1500
    });

    const parsed = parseJsonResponse(response.content);
    const progress = parsed?.overallProgress || 30;
    
    return {
      type: 'clarification',
      message: parsed?.message || \`I've reviewed your refinement discussion about "\${session.project_name || 'this feature'}". I see you've covered the basics. What's the most important capability you want users to have?\`,
      gathered: parsed?.gathered || this.initializeContext().gathered,
      progress: Math.max(progress, 30),
      readyForSpec: parsed?.readyForSpec || false,
      fromRefinement: true
    };
  }

`;

// Insert before getBuildFeaturePrompt
const insertBefore = '  getBuildFeaturePrompt() {';
if (content.includes(insertBefore)) {
  content = content.replace(insertBefore, helperMethods + insertBefore);
  fs.writeFileSync(path, content);
  console.log('Helper methods added successfully');
} else {
  console.log('Could not find insertion point');
}
