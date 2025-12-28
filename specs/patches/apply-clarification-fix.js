#!/usr/bin/env node
/**
 * Apply clarification agent fix for backlog context awareness
 */

const fs = require('fs');
const path = '/opt/swarm-app/apps/platform/agents/clarification-agent.js';

let content = fs.readFileSync(path, 'utf8');

// Add helper methods before the class closing brace
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
    
    // Fetch RAG context if repo_url exists
    let codeContext = '';
    if (session.repo_url && session.description) {
      try {
        const ragResult = await fetchSessionContext(session, session.description, { maxTokens: 4000 });
        if (ragResult.success) {
          codeContext = \`\\n\\nRelevant code from repository:\\n\${ragResult.context}\`;
          console.log(\`[ClarificationAgent] Continuation RAG: \${ragResult.tokenCount} tokens\`);
        }
      } catch (e) {
        console.log('[ClarificationAgent] RAG fetch failed:', e.message);
      }
    }

    const continuationPrompt = \`You are CONTINUING a conversation that started in backlog refinement.

## CRITICAL: This is NOT a fresh start
The user already discussed this with a refinement agent. You must:
1. Acknowledge what was discussed (don't repeat questions they answered)
2. Pick up where refinement left off
3. Ask targeted clarifying questions to fill remaining gaps

## Prior Refinement Discussion
\${refinementHistory}

## Feature Being Built
\${session.description || session.project_name || 'Not specified'}

## \${repoInfo}
\${codeContext}

## Your Task
Generate a message that:
1. Acknowledges you've reviewed the refinement discussion
2. Summarizes what you understood (2-3 bullet points)
3. Identifies 1-2 remaining questions
4. Asks your most important clarifying question

Return JSON with message, gathered scores, overallProgress, readyForSpec, nextQuestion.\`;

    const response = await chat({
      system: this.systemPrompt,
      messages: [{ role: 'user', content: continuationPrompt }],
      maxTokens: 1500
    });

    const parsed = parseJsonResponse(response.content);
    const progress = parsed?.overallProgress || 30;
    
    return {
      type: 'clarification',
      message: parsed?.message || \`I've reviewed your refinement discussion about "\${session.project_name || 'this feature'}". I see you've already covered the basics. What's the most important capability you want users to have?\`,
      gathered: parsed?.gathered || this.initializeContext().gathered,
      progress: Math.max(progress, 30), // Minimum 30% for refined items
      readyForSpec: parsed?.readyForSpec || false,
      fromRefinement: true
    };
  }
`;

// Find the position to insert helper methods (before the last closing brace of the class)
const classEndMatch = content.match(/(\n}\s*module\.exports)/);
if (classEndMatch) {
  const insertPos = content.indexOf(classEndMatch[0]);
  
  // Check if already applied
  if (content.includes('hasRefinementContext')) {
    console.log('Helper methods already present');
  } else {
    content = content.slice(0, insertPos) + helperMethods + content.slice(insertPos);
    console.log('Added helper methods for backlog context');
  }
} else {
  console.log('Could not find class end position');
}

// Modify generateInitialMessage to check for refinement context
const oldGenInitial = /async generateInitialMessage\(session\) \{[\s\S]*?\/\/ Build context for build_feature/;
const newGenInitial = `async generateInitialMessage(session) {
    // Handle sessions promoted from backlog with refinement context
    if (this.hasRefinementContext(session)) {
      console.log('[ClarificationAgent] Session from backlog - generating continuation');
      return this.generateContinuationMessage(session);
    }
    
    // Build context for build_feature`;

if (content.includes('hasRefinementContext(session)')) {
  console.log('generateInitialMessage already updated');
} else {
  content = content.replace(oldGenInitial, newGenInitial);
  console.log('Updated generateInitialMessage to check for backlog context');
}

// Add refinement context to buildFeatureSystemPrompt
const oldBuildFeature = /return buildFeaturePrompt[\s\S]*?\.replace\('{{FEATURE_DESCRIPTION}}'/;
if (content.includes('refinementContext')) {
  console.log('buildFeatureSystemPrompt already has refinement context');
} else {
  // Find buildFeatureSystemPrompt return statement and add refinement context
  const buildFeatureReturn = content.match(/return buildFeaturePrompt\s*\n\s*\.replace\('{{REPO_ANALYSIS}}'[\s\S]*?\.replace\('{{FEATURE_DESCRIPTION}}'[^;]+;/);
  if (buildFeatureReturn) {
    const oldReturn = buildFeatureReturn[0];
    const newReturn = oldReturn.replace(
      /(\+ '\\n\\n## Current Gathered Information)/,
      `+ (this.hasRefinementContext(session) ? \`\\n\\n## Prior Refinement Discussion\\nThis session was promoted from backlog:\\n\${this.formatRefinementHistory(session)}\\n\\nIMPORTANT: Do NOT ask questions already answered in refinement.\\n\` : '')
    $1`
    );
    content = content.replace(oldReturn, newReturn);
    console.log('Added refinement context to buildFeatureSystemPrompt');
  } else {
    console.log('Could not find buildFeatureSystemPrompt return');
  }
}

fs.writeFileSync(path, content);
console.log('Clarification agent saved');
