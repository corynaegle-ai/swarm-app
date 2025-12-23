/**
 * Ticket Generator Service (RAG-Enhanced v3 - Quality Gates)
 * Parses spec_card JSON from HITL sessions and generates tickets
 * 
 * Flow: spec_card → RAG context → features → tickets → validation → insert
 * Updated: 2025-12-23 - Added quality gates to prevent abstract tickets
 */

const { queryOne, getPool } = require('../db');
const { randomUUID: uuidv4 } = require('crypto');
const { chat, parseJsonResponse } = require('./claude-client');
const { fetchSessionContext, extractSessionRepoUrls, fetchContext } = require('./rag-client');

// Invalid ticket patterns for existing repositories
const INVALID_TICKET_PATTERNS = [
  'project setup',
  'project initialization',
  'initialize project',
  'setup configuration',
  'initial configuration',
  'boilerplate setup'
];

/**
 * Validate ticket quality - returns array of errors
 * @param {Object} ticket - Ticket to validate
 * @param {boolean} isExistingRepo - Whether this is for an existing repository
 * @returns {string[]} Array of validation errors (empty = valid)
 */
function validateTicketQuality(ticket, isExistingRepo = true) {
  const errors = [];
  
  // CRITICAL: files_hint required for agent to know output targets
  if (!ticket.files_hint || ticket.files_hint.trim() === '') {
    // Only error if rag_context also has no files
    const hasRagFiles = ticket.rag_context && (
      (ticket.rag_context.files_to_modify?.length > 0) ||
      (ticket.rag_context.files_to_create?.length > 0) ||
      (ticket.rag_context.files?.length > 0)
    );
    if (!hasRagFiles) {
      errors.push('files_hint required: must specify files to create or modify');
    }
  }
  
  // Description must have minimum detail
  if (!ticket.description || ticket.description.length < 50) {
    errors.push('description too short: need implementation details (min 50 chars)');
  }
  
  // Filter out nonsensical tickets for existing repos
  if (isExistingRepo) {
    const titleLower = (ticket.title || '').toLowerCase();
    for (const pattern of INVALID_TICKET_PATTERNS) {
      if (titleLower.includes(pattern)) {
        errors.push(`invalid ticket type for existing repository: "${pattern}"`);
        break;
      }
    }
  }
  
  // Validate acceptance criteria exists and is parseable
  if (ticket.acceptance_criteria) {
    try {
      const criteria = typeof ticket.acceptance_criteria === 'string' 
        ? JSON.parse(ticket.acceptance_criteria) 
        : ticket.acceptance_criteria;
      if (!Array.isArray(criteria) || criteria.length === 0) {
        errors.push('acceptance_criteria must be a non-empty array');
      }
    } catch {
      errors.push('acceptance_criteria must be valid JSON array');
    }
  }
  
  return errors;
}

/**
 * Generate tickets from a HITL session's spec_card
 * @param {string} sessionId - HITL session ID
 * @param {string} projectId - Project ID to attach tickets to
 * @returns {Promise<{success: boolean, tickets: Array, error?: string}>}
 */
async function generateTicketsFromSpec(sessionId, projectId) {
  // Get session with spec_card
  const session = await queryOne('SELECT * FROM hitl_sessions WHERE id = $1', [sessionId]);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  
  if (!session.spec_card) {
    return { success: false, error: 'No spec_card found in session' };
  }
  
  let specCard;
  try {
    specCard = typeof session.spec_card === 'string' 
      ? JSON.parse(session.spec_card) 
      : session.spec_card;
  } catch (e) {
    return { success: false, error: 'Invalid spec_card JSON' };
  }
  
  // Validate project exists
  const project = await queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }
  
  // Gather repo URLs using centralized extraction
  const repoUrls = extractSessionRepoUrls(session);
  const repoUrl = session.repo_url || repoUrls[0] || null;
  
  // Check if this is an existing repo (has URL) vs greenfield
  const isExistingRepo = !!repoUrl;
  
  console.log(`[TicketGenerator] Starting ticket generation for session ${sessionId}`);
  console.log(`[TicketGenerator] Found ${repoUrls.length} repo URLs for RAG context`);
  console.log(`[TicketGenerator] Existing repo mode: ${isExistingRepo}`);
  
  // Generate tickets using Claude for intelligent breakdown
  let tickets = await breakdownSpecToTickets(specCard, projectId, sessionId, repoUrls, repoUrl);
  
  // QUALITY GATE: Validate and filter tickets
  const validatedTickets = [];
  const rejectedTickets = [];
  
  for (const ticket of tickets) {
    const errors = validateTicketQuality(ticket, isExistingRepo);
    if (errors.length === 0) {
      validatedTickets.push(ticket);
    } else {
      rejectedTickets.push({ ticket, errors });
      console.warn(`[TicketGenerator] REJECTED ticket "${ticket.title}": ${errors.join(', ')}`);
    }
  }
  
  console.log(`[TicketGenerator] Validation: ${validatedTickets.length} valid, ${rejectedTickets.length} rejected`);
  
  // If too many tickets were rejected, log details
  if (rejectedTickets.length > validatedTickets.length) {
    console.error('[TicketGenerator] WARNING: More tickets rejected than accepted!');
    console.error('[TicketGenerator] Rejection details:', JSON.stringify(rejectedTickets.map(r => ({
      title: r.ticket.title,
      errors: r.errors
    })), null, 2));
  }
  
  // Insert ONLY validated tickets into database
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const ticket of validatedTickets) {
      await client.query(`
        INSERT INTO tickets (
          id, project_id, title, description, acceptance_criteria, 
          state, epic, estimated_scope, files_hint, design_session,
          repo_url, rag_context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        ticket.id,
        ticket.project_id,
        ticket.title,
        ticket.description,
        ticket.acceptance_criteria,
        ticket.state,
        ticket.epic,
        ticket.estimated_scope,
        ticket.files_hint,
        ticket.design_session,
        ticket.repo_url || repoUrl,
        ticket.rag_context ? JSON.stringify(ticket.rag_context) : null
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`[TicketGenerator] Created ${validatedTickets.length} tickets for project ${projectId}`);
    return { 
      success: true, 
      tickets: validatedTickets, 
      count: validatedTickets.length,
      rejected: rejectedTickets.length,
      rejectionDetails: rejectedTickets.map(r => ({ title: r.ticket.title, errors: r.errors }))
    };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[TicketGenerator] DB transaction failed:', e.message);
    return { success: false, error: e.message };
  } finally {
    client.release();
  }
}


/**
 * Break down spec_card into granular tickets using Claude with RAG context
 */
async function breakdownSpecToTickets(specCard, projectId, sessionId, repoUrls = [], repoUrl = null) {
  const tickets = [];
  const features = specCard.features || [];
  const isExistingRepo = !!repoUrl;
  
  // Map priority to scope
  const priorityToScope = {
    'high': 'medium',
    'medium': 'medium', 
    'low': 'small'
  };
  
  // First pass: create epic tickets for each major feature
  for (const feature of features) {
    const epicId = `TKT-${uuidv4().slice(0, 8).toUpperCase()}`;
    
    // Fetch RAG context for the epic feature
    let epicRagContext = null;
    if (repoUrls.length > 0) {
      const ragQuery = `${feature.name}: ${feature.description}`;
      console.log(`[TicketGenerator] Fetching RAG for epic: "${feature.name}"`);
      
      const ragResult = await fetchContext(ragQuery, repoUrls, { maxTokens: 3000 });
      if (ragResult.success && ragResult.chunks && ragResult.chunks.length > 0) {
        epicRagContext = {
          query: ragQuery,
          files: extractUniqueFiles(ragResult.chunks),
          snippets: ragResult.chunks.slice(0, 5).map(c => ({
            file: c.filepath,
            content: c.content?.slice(0, 500),
            similarity: c.similarity
          }))
        };
        console.log(`[TicketGenerator] Found ${epicRagContext.files.length} relevant files for "${feature.name}"`);
      }
    }
    
    // Create epic ticket with RAG context
    tickets.push({
      id: epicId,
      project_id: projectId,
      title: feature.name,
      description: feature.description,
      acceptance_criteria: JSON.stringify(feature.acceptance || []),
      state: 'draft',
      epic: null, // This IS the epic
      estimated_scope: priorityToScope[feature.priority] || 'medium',
      files_hint: epicRagContext?.files?.join(', ') || null,
      design_session: sessionId,
      repo_url: repoUrl,
      rag_context: epicRagContext
    });
    
    // Generate sub-tickets for complex features (with RAG context)
    if (feature.acceptance && feature.acceptance.length > 1) {
      const subTickets = await generateSubTickets(feature, epicId, projectId, sessionId, repoUrls, repoUrl, epicRagContext, isExistingRepo);
      tickets.push(...subTickets);
    }
  }
  
  // Only add infrastructure tickets for greenfield projects
  if (!isExistingRepo && specCard.technical) {
    const infraTickets = generateInfraTickets(specCard.technical, projectId, sessionId, repoUrl);
    tickets.push(...infraTickets);
  }
  
  return tickets;
}

/**
 * Extract unique file paths from RAG chunks
 */
function extractUniqueFiles(chunks) {
  const files = new Set();
  for (const chunk of chunks) {
    if (chunk.filepath) {
      files.add(chunk.filepath);
    }
  }
  return Array.from(files);
}


/**
 * Generate sub-tickets for a feature using Claude with RAG context
 * Enhanced with stricter file requirement prompts
 */
async function generateSubTickets(feature, epicId, projectId, sessionId, repoUrls = [], repoUrl = null, epicRagContext = null, isExistingRepo = true) {
  // Use existing RAG context or fetch new
  let codeContext = '';
  let relevantFiles = epicRagContext?.files || [];
  
  if (!epicRagContext && repoUrls.length > 0) {
    const ragQuery = `${feature.name}: ${feature.description}`;
    console.log(`[TicketGenerator] Fetching RAG for sub-tickets: "${ragQuery.slice(0, 50)}..."`);
    
    const ragResult = await fetchContext(ragQuery, repoUrls, { maxTokens: 4000 });
    if (ragResult.success && ragResult.context) {
      codeContext = ragResult.context;
      relevantFiles = extractUniqueFiles(ragResult.chunks || []);
    }
  } else if (epicRagContext?.snippets) {
    // Build context from epic's RAG snippets
    codeContext = epicRagContext.snippets
      .map(s => `// File: ${s.file}\n${s.content}`)
      .join('\n\n---\n\n');
  }

  // Build prompt with STRICTER file requirements
  let prompt = `You are a senior software architect breaking down a feature into implementation tickets for an AI coding agent.

## CRITICAL REQUIREMENTS

1. **EVERY ticket MUST specify exact file paths** - The AI agent cannot work without knowing which files to create or modify
2. **Use existing file patterns** - Reference the codebase context below to match existing conventions
3. **Be specific, not abstract** - "Create API endpoint" is too vague; "Add POST /api/comments in routes/comments.js" is correct

## Feature to Implement
**Name:** ${feature.name}
**Description:** ${feature.description}

**Acceptance Criteria:**
${(feature.acceptance || []).map(a => `- ${a}`).join('\n')}
`;

  // Add code context if available
  if (codeContext) {
    prompt += `
## Existing Codebase Context

The following code snippets are from the existing codebase. STUDY THESE CAREFULLY to understand:
- File naming conventions
- Directory structure patterns  
- Import/export patterns
- Coding style

\`\`\`
${codeContext}
\`\`\`

**Files Found in Codebase:** ${relevantFiles.join(', ')}

Based on these patterns, your tickets should reference similar file paths and follow the same conventions.
`;
  }

  prompt += `
## Your Task

Break this feature into 2-4 specific implementation tickets. 

### MANDATORY Requirements for Each Ticket:
1. ✅ MUST have "files_to_modify" AND/OR "files_to_create" with actual file paths
2. ✅ Paths must follow existing codebase patterns (see context above)
3. ✅ Description must explain WHAT to implement and WHERE
4. ✅ Each ticket completable in 1-2 hours by an AI agent
5. ❌ Do NOT create abstract tickets like "Database Schema" or "API Design"
6. ❌ Do NOT create project setup tickets (repository already exists)

### Response Format

Return a JSON array - EVERY ticket must have file paths:
\`\`\`json
[{
  "title": "Add comment creation endpoint to tickets API",
  "description": "Implement POST /api/tickets/:id/comments endpoint that accepts {comment_text} body, validates input, and inserts into ticket_comments table. Follow patterns from existing tickets.js route handlers.",
  "acceptance": ["POST endpoint returns 201 with created comment", "Invalid input returns 400"],
  "scope": "small",
  "files_to_modify": ["apps/platform/routes/tickets.js"],
  "files_to_create": [],
  "implementation_notes": "Use existing auth middleware, follow Joi validation pattern"
}]
\`\`\`

Remember: A ticket without file paths is USELESS to the AI agent. Include real file paths for every ticket.`;

  try {
    const response = await chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000
    });
    
    const parsed = parseJsonResponse(response.content);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.map(t => {
      // Combine file hints - REQUIRED
      const allFiles = [
        ...(t.files_to_modify || []),
        ...(t.files_to_create || [])
      ];
      
      // Build enriched description with file references
      let enrichedDesc = t.description || '';
      if (t.implementation_notes) {
        enrichedDesc += `\n\n**Implementation Notes:** ${t.implementation_notes}`;
      }
      if (t.files_to_modify?.length > 0) {
        enrichedDesc += `\n\n**Files to Modify:** ${t.files_to_modify.join(', ')}`;
      }
      if (t.files_to_create?.length > 0) {
        enrichedDesc += `\n\n**Files to Create:** ${t.files_to_create.join(', ')}`;
      }
      
      return {
        id: `TKT-${uuidv4().slice(0, 8).toUpperCase()}`,
        project_id: projectId,
        title: t.title,
        description: enrichedDesc,
        acceptance_criteria: JSON.stringify(t.acceptance || []),
        state: 'draft',
        epic: epicId,
        estimated_scope: t.scope || 'small',
        files_hint: allFiles.join(', ') || null,
        design_session: sessionId,
        repo_url: repoUrl,
        rag_context: {
          files_to_modify: t.files_to_modify || [],
          files_to_create: t.files_to_create || [],
          implementation_notes: t.implementation_notes || null,
          inherited_from_epic: epicRagContext ? true : false
        }
      };
    });
  } catch (e) {
    console.error('[TicketGenerator] Sub-ticket generation failed:', e.message);
    return [];
  }
}


/**
 * Generate infrastructure setup tickets from technical requirements
 * Only for greenfield projects (not existing repos)
 */
function generateInfraTickets(technical, projectId, sessionId, repoUrl = null) {
  const tickets = [];
  
  // Project setup ticket - only for greenfield
  tickets.push({
    id: `TKT-${uuidv4().slice(0, 8).toUpperCase()}`,
    project_id: projectId,
    title: 'Project Setup & Configuration',
    description: `Initialize project structure with required stack:\n${(technical.stack || []).join(', ')}`,
    acceptance_criteria: JSON.stringify([
      'Project initialized with proper directory structure',
      'Dependencies installed and configured',
      'Development environment runnable'
    ]),
    state: 'draft',
    epic: null,
    estimated_scope: 'medium',
    files_hint: 'package.json, tsconfig.json, .env.example',
    design_session: sessionId,
    repo_url: repoUrl,
    rag_context: null
  });
  
  // Integration tickets for each service
  if (technical.integrations && technical.integrations.length > 0) {
    for (const integration of technical.integrations) {
      tickets.push({
        id: `TKT-${uuidv4().slice(0, 8).toUpperCase()}`,
        project_id: projectId,
        title: `Integrate ${integration}`,
        description: `Set up integration with ${integration} including configuration, authentication, and basic connectivity testing.`,
        acceptance_criteria: JSON.stringify([
          `${integration} SDK/client installed`,
          'Configuration variables documented',
          'Connection test passing'
        ]),
        state: 'draft',
        epic: null,
        estimated_scope: 'small',
        files_hint: `src/integrations/${integration.toLowerCase()}.js, .env`,
        design_session: sessionId,
        repo_url: repoUrl,
        rag_context: null
      });
    }
  }
  
  return tickets;
}

module.exports = {
  generateTicketsFromSpec,
  breakdownSpecToTickets,
  generateSubTickets,
  generateInfraTickets,
  validateTicketQuality
};
