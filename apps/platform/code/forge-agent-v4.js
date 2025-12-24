/**
 * Forge Agent v4 - RAG-Enhanced Implementation Agent
 * 
 * Key enhancements over v3:
 * - Queries RAG for ticket context before implementation
 * - Uses stored rag_context from ticket generator
 * - Understands existing codebase patterns
 * - Knows which files to modify vs create
 * 
 * Updated: 2025-12-18
 */

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Activity logging for real-time dashboard
const activity = require('../lib/activity-logger.js');

// Configuration
const CONFIG = {
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  claudeApiKey: process.env.ANTHROPIC_API_KEY,
  workDir: process.env.FORGE_WORK_DIR || '/tmp/forge-work',
  platformUrl: process.env.PLATFORM_URL || 'http://localhost:8080',
  ragUrl: process.env.RAG_URL || 'http://localhost:8082',
  githubPat: process.env.GITHUB_PAT
};

// Model selection by scope
const MODEL_BY_SCOPE = {
  'small': 'claude-sonnet-4-20250514',
  'medium': 'claude-sonnet-4-20250514',
  'large': 'claude-sonnet-4-20250514'
};

// Simple logger
const log = {
  info: (msg, data) => console.log(`[FORGE] ${msg}`, data ? JSON.stringify(data) : ''),
  error: (msg, data) => console.error(`[FORGE ERROR] ${msg}`, data ? JSON.stringify(data) : ''),
  debug: (msg, data) => process.env.DEBUG && console.log(`[FORGE DEBUG] ${msg}`, data ? JSON.stringify(data) : '')
};

/**
 * Fetch RAG context for a ticket
 * Uses ticket's stored rag_context if available, otherwise queries fresh
 */
async function fetchRagContext(ticket) {
  // If ticket already has RAG context, use it
  if (ticket.rag_context) {
    const ctx = typeof ticket.rag_context === 'string' 
      ? JSON.parse(ticket.rag_context) 
      : ticket.rag_context;
    log.info('Using stored RAG context', { 
      files_to_modify: ctx.files_to_modify?.length || 0,
      files_to_create: ctx.files_to_create?.length || 0
    });
    return ctx;
  }
  
  // Otherwise, query RAG service
  if (!ticket.repo_url) {
    log.info('No repo_url - skipping RAG fetch');
    return null;
  }
  
  try {
    const query = `${ticket.title}: ${ticket.description}`;
    log.info('Fetching fresh RAG context', { query: query.slice(0, 100) });
    
    const response = await httpPost(`${CONFIG.ragUrl}/api/rag/search`, {
      query,
      repoUrls: [ticket.repo_url],
      limit: 10,
      maxTokens: 4000
    });
    
    if (response.results && response.results.length > 0) {
      return {
        files_found: response.results.map(r => r.filepath),
        snippets: response.results.slice(0, 5).map(r => ({
          file: r.filepath,
          content: r.content,
          similarity: r.similarity
        }))
      };
    }
  } catch (e) {
    log.error('RAG fetch failed', { error: e.message });
  }
  
  return null;
}

/**
 * Build implementation prompt with RAG context
 */
function buildImplementationPrompt(ticket, ragContext, existingFiles = []) {
  let prompt = `You are an expert software engineer implementing a specific ticket. Your code will be committed directly to a repository.

## Ticket Details
**ID:** ${ticket.id}
**Title:** ${ticket.title}
**Description:** ${ticket.description}

**Acceptance Criteria:**
${formatAcceptanceCriteria(ticket.acceptance_criteria)}

**Scope:** ${ticket.estimated_scope || 'medium'}
`;

  // Add files hint
  if (ticket.files_hint) {
    prompt += `\n**Files Hint:** ${ticket.files_hint}\n`;
  }
  
  // Inject sentinel feedback if this is a retry attempt
  const sentinelFeedbackSection = formatSentinelFeedback(ticket);
  if (sentinelFeedbackSection) {
    prompt += sentinelFeedbackSection;
    log.info('Injected sentinel feedback into prompt', { 
        ticketId: ticket.id, 
        retryCount: ticket.retry_count,
        promptLength: prompt.length 
    });
  }
  
  // Add RAG context if available
  if (ragContext) {
    prompt += `\n## Existing Codebase Context\n`;
    
    if (ragContext.files_to_modify?.length > 0) {
      prompt += `\n**Files to Modify:** ${ragContext.files_to_modify.join(', ')}\n`;
    }
    
    if (ragContext.files_to_create?.length > 0) {
      prompt += `\n**Files to Create:** ${ragContext.files_to_create.join(', ')}\n`;
    }
    
    if (ragContext.implementation_notes) {
      prompt += `\n**Implementation Notes:** ${ragContext.implementation_notes}\n`;
    }
    
    if (ragContext.snippets?.length > 0) {
      prompt += `\n### Relevant Code Snippets\n\nThese snippets show existing patterns in the codebase. Follow these conventions:\n\n`;
      for (const snippet of ragContext.snippets.slice(0, 5)) {
        prompt += `\`\`\`javascript\n// File: ${snippet.file}\n${snippet.content?.slice(0, 800) || '...'}\n\`\`\`\n\n`;
      }
    }
  }
  
  // Add existing file structure if we fetched it
  if (existingFiles.length > 0) {
    prompt += `\n### Current Repository Structure\n\`\`\`\n${existingFiles.slice(0, 50).join('\n')}\n\`\`\`\n`;
  }

  prompt += `
## Instructions

1. **Follow existing patterns** - Match the coding style and conventions in the snippets above
2. **Modify existing files when appropriate** - Don't create new files if functionality belongs in existing ones
3. **Create new files when needed** - Use the suggested paths or follow the project structure
4. **Be complete** - Include all imports, exports, and necessary boilerplate
5. **Test compatibility** - Ensure your changes don't break existing functionality

## Response Format

Return a JSON object:
\`\`\`json
{
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "modify|create",
      "content": "complete file content"
    }
  ],
  "summary": "Brief description of changes made",
  "criteriaStatus": [
    {
      "criterion": "The acceptance criterion text",
      "status": "PASS|FAIL|BLOCKED",
      "evidence": "How this was addressed"
    }
  ]
}
\`\`\`
`;

  return prompt;
}

/**
 * Format acceptance criteria for prompt
 */
function formatAcceptanceCriteria(criteria) {
  if (!criteria) return '- None specified';
  
  try {
    const parsed = typeof criteria === 'string' ? JSON.parse(criteria) : criteria;
    if (Array.isArray(parsed)) {
      return parsed.map(c => `- ${c}`).join('\n');
    }
    return `- ${criteria}`;
  } catch {
    return `- ${criteria}`;
  }
}

/**
 * Format sentinel feedback for injection into forge agent prompt
 * @param {Object} ticket - Ticket object with sentinel_feedback and retry_count
 * @returns {string} Formatted feedback section or empty string
 */
function formatSentinelFeedback(ticket) {
    if (!ticket.sentinel_feedback) return '';
    
    const feedback = typeof ticket.sentinel_feedback === 'string' 
        ? JSON.parse(ticket.sentinel_feedback) 
        : ticket.sentinel_feedback;
    
    const feedbackItems = feedback.feedback_for_agent || [];
    if (feedbackItems.length === 0) return '';
    
    const attempt = (ticket.retry_count || 0) + 1;
    const maxAttempts = 3;
    
    log.info('Formatting sentinel feedback for prompt injection', { 
        ticketId: ticket.id, 
        attempt, 
        issueCount: feedbackItems.length 
    });
    
    return `

## ⚠️ PREVIOUS ATTEMPT REJECTED - MUST FIX THESE ISSUES

Your previous implementation was rejected by the code review sentinel.
This is attempt ${attempt} of ${maxAttempts}.

**You MUST address ALL of the following issues:**

${feedbackItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

**CRITICAL REQUIREMENTS**:
- Do NOT repeat the same mistakes
- Address each issue explicitly in your implementation
- Add inline comments showing how you fixed each issue
- If an issue mentions missing validation → ADD validation
- If an issue mentions security → ADD security measures
- If an issue mentions error handling → ADD proper error handling
- If an issue mentions accessibility → ADD ARIA attributes

**FAILURE TO ADDRESS THESE ISSUES WILL RESULT IN REJECTION.**
`;
}



/**
 * Process a ticket - main entry point
 */
async function processTicket(ticket, projectSettings = {}) {
  console.log('[FORGE] Processing ticket - processTicket() invoked', { ticketId: ticket?.id, title: ticket?.title });
  const model = projectSettings?.worker_model || MODEL_BY_SCOPE[ticket.estimated_scope] || CONFIG.claudeModel;
  const branchName = `forge/${ticket.id}-${Date.now()}`;
  let repoDir = null;
  const agentLearning = require('../lib/agent-learning.js');
  const startTime = Date.now();

  try {
    log.info('Processing ticket', { id: ticket.id, title: ticket.title, model });

    // Step 1: Clone repo
    repoDir = path.join(CONFIG.workDir, `repo-${ticket.id}-${Date.now()}`);
    cloneRepo(ticket.repo_url, repoDir);
    createBranch(repoDir, branchName);

    // Step 2: Get existing file list for context
    const existingFiles = getRepoFileList(repoDir);
    log.info('Repository cloned', { files: existingFiles.length });

    // Step 3: Fetch RAG context
    const ragContext = await fetchRagContext(ticket);

    // Step 4: Read existing files that need modification
    let enrichedRagContext = ragContext;
    if (ragContext?.files_to_modify?.length > 0) {
      enrichedRagContext = await enrichWithFileContents(ragContext, repoDir);
    }

    // Step 5: Build prompt and call Claude
    const prompt = buildImplementationPrompt(ticket, enrichedRagContext, existingFiles);
    const response = await callClaude([{ role: 'user', content: prompt }], model, ticket.id);
    const result = parseCodeResponse(response);

    if (!result.files || result.files.length === 0) {
      throw new Error('No files generated - Claude returned empty response');
    }

    log.info('Implementation generated', {
      files: result.files.length,
      modifications: result.files.filter(f => f.action === 'modify').length,
      creations: result.files.filter(f => f.action === 'create').length
    });

    // Step 6: Write, commit, push, create PR
    const filesWritten = writeFiles(repoDir, result.files);
    commitAndPush(repoDir, ticket, branchName, result.summary || 'Implementation');
    const prUrl = await createPullRequest(ticket, branchName, result.summary || 'Implementation');

    log.info('Ticket completed', { id: ticket.id, prUrl, files: filesWritten.length });

    return {
      success: true,
      prUrl,
      filesWritten,
      summary: result.summary,
      criteriaStatus: result.criteriaStatus,
      durationMs: Date.now() - startTime
    };

  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Classify error for intelligent retry strategy
    const classification = agentLearning.classifyError(err.message);

    log.error('Ticket failed', {
      id: ticket.id,
      error: err.message,
      errorCategory: classification.category,
      errorSubcategory: classification.subcategory,
      durationMs
    });

    // Determine error type for better reporting
    let errorType = 'runtime';
    if (err.message.includes('timeout') || err.message.includes('timed out')) {
      errorType = 'timeout';
    } else if (err.message.includes('API') || err.message.includes('rate limit')) {
      errorType = 'api';
    } else if (err.message.includes('ENOENT') || err.message.includes('EACCES')) {
      errorType = 'runtime';
    } else if (err.message.includes('git') || err.message.includes('clone')) {
      errorType = 'git';
    }

    return {
      success: false,
      error: err.message,
      errorType,
      errorClassification: {
        category: classification.category,
        subcategory: classification.subcategory,
        confidence: classification.confidence
      },
      durationMs,
      stack: err.stack
    };
  } finally {
    if (repoDir && fs.existsSync(repoDir)) {
      try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch {}
    }
  }
}

/**
 * Enrich RAG context with actual file contents for files to modify
 */
async function enrichWithFileContents(ragContext, repoDir) {
  const enriched = { ...ragContext, snippets: ragContext.snippets || [] };
  
  for (const filePath of ragContext.files_to_modify || []) {
    const fullPath = path.join(repoDir, filePath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        enriched.snippets.push({
          file: filePath,
          content: content.slice(0, 2000), // Limit size
          source: 'local_file'
        });
        log.debug('Added file content to context', { file: filePath, size: content.length });
      } catch (e) {
        log.error('Failed to read file', { file: filePath, error: e.message });
      }
    }
  }
  
  return enriched;
}

/**
 * Get list of files in repository
 */
function getRepoFileList(repoDir) {
  try {
    const result = execSync(`find . -type f -not -path '*/\\.git/*' -not -path '*/node_modules/*' | head -100`, {
      cwd: repoDir,
      encoding: 'utf8'
    });
    return result.trim().split('\n').filter(f => f);
  } catch {
    return [];
  }
}



// ============================================================================
// GIT OPERATIONS
// ============================================================================

function cloneRepo(repoUrl, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  
  // Convert HTTPS URL with PAT if available
  let cloneUrl = repoUrl;
  if (CONFIG.githubPat && repoUrl.includes('github.com')) {
    cloneUrl = repoUrl.replace('https://', `https://${CONFIG.githubPat}@`);
  }
  
  execSync(`git clone --depth 1 ${cloneUrl} ${targetDir}`, { 
    stdio: 'pipe',
    timeout: 60000
  });
}

function createBranch(repoDir, branchName) {
  execSync(`git checkout -b ${branchName}`, { cwd: repoDir, stdio: 'pipe' });
}

function writeFiles(repoDir, files) {
  const written = [];
  
  for (const file of files) {
    const fullPath = path.join(repoDir, file.path);
    const dir = path.dirname(fullPath);
    
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, file.content);
    written.push(file.path);
    
    log.debug('Wrote file', { path: file.path, action: file.action || 'create' });
  }
  
  return written;
}

function commitAndPush(repoDir, ticket, branchName, message) {
  const commitMsg = `[${ticket.id}] ${message}`;
  
  execSync('git add -A', { cwd: repoDir, stdio: 'pipe' });
  execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: repoDir, stdio: 'pipe' });
  execSync(`git push -u origin ${branchName}`, { cwd: repoDir, stdio: 'pipe' });
}

async function createPullRequest(ticket, branchName, summary) {
  // Extract owner/repo from URL
  const repoPath = ticket.repo_url.replace(/.*github\.com[:/]/, '').replace(/\.git$/, '');
  const [owner, repo] = repoPath.split('/');
  
  const prBody = {
    title: `[${ticket.id}] ${ticket.title}`,
    body: `## Summary\n${summary}\n\n## Ticket\n${ticket.description}\n\n---\n*Generated by FORGE Agent*`,
    head: branchName,
    base: 'main'
  };
  
  try {
    const response = await httpPost(`https://api.github.com/repos/${owner}/${repo}/pulls`, prBody, {
      'Authorization': `token ${CONFIG.githubPat}`,
      'Accept': 'application/vnd.github.v3+json'
    });
    
    return response.html_url;
  } catch (e) {
    log.error('PR creation failed', { error: e.message });
    return `https://github.com/${owner}/${repo}/compare/${branchName}?expand=1`;
  }
}

// ============================================================================
// CLAUDE API
// ============================================================================

async function callClaude(messages, model = CONFIG.claudeModel, ticketId = null) {
  const requestBody = {
    model,
    max_tokens: 4096,
    messages
  };
  
  // Extract prompt preview for logging
  const promptPreview = messages.map(m => m.content?.substring?.(0, 200) || '').join(' | ');
  
  // Log AI request with prompt
  if (ticketId) {
    await activity.logAiRequest(ticketId, model, promptPreview);
  }
  
  const response = await httpPost('https://api.anthropic.com/v1/messages', requestBody, {
    'x-api-key': CONFIG.claudeApiKey,
    'anthropic-version': '2023-06-01'
  });
  
  const responseText = response.content?.[0]?.text || '';
  const usage = response.usage || {};
  
  // Log AI response with usage stats
  if (ticketId) {
    await activity.logAiResponse(ticketId, model, responseText.substring(0, 500), usage);
  }
  
  return responseText;
}

function parseCodeResponse(response) {
  // Extract JSON from response
  const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) {
      log.error('Failed to parse JSON response', { error: e.message });
    }
  }
  
  // Try parsing entire response as JSON
  try {
    return JSON.parse(response);
  } catch {
    return { files: [], summary: 'Parse error', criteriaStatus: [] };
  }
}

// ============================================================================
// HTTP HELPERS
// ============================================================================

function httpPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders
      }
    };
    
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  processTicket,
  fetchRagContext,
  buildImplementationPrompt,
  CONFIG
};

// Allow running directly
if (require.main === module) {
  // Test mode - fetch a ticket and process it
  const ticketId = process.argv[2];
  if (ticketId) {
    console.log(`Processing ticket: ${ticketId}`);
    // Would fetch from API and process
  } else {
    console.log('Usage: node forge-agent-v4.js <ticket-id>');
  }
}
