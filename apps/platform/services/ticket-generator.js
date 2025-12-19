/**
 * Ticket Generator Service (RAG-Enhanced v2)
 * Parses spec_card JSON from HITL sessions and generates tickets
 * 
 * Flow: spec_card → RAG context → features → tickets (with file references)
 * Updated: 2025-12-18 - Enhanced RAG integration with file-level references
 */

const { queryOne, getPool } = require('../db');
const { randomUUID: uuidv4 } = require('crypto');
const { chat, parseJsonResponse } = require('./claude-client');
const { fetchSessionContext, extractSessionRepoUrls, fetchContext } = require('./rag-client');

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
  
  console.log(`[TicketGenerator] Starting ticket generation for session ${sessionId}`);
  console.log(`[TicketGenerator] Found ${repoUrls.length} repo URLs for RAG context`);
  
  // Generate tickets using Claude for intelligent breakdown
  const tickets = await breakdownSpecToTickets(specCard, projectId, sessionId, repoUrls, repoUrl);
  
  // Insert tickets into database using PostgreSQL transaction
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const ticket of tickets) {
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
    console.log(`[TicketGenerator] Created ${tickets.length} tickets for project ${projectId}`);
    return { success: true, tickets, count: tickets.length };
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
      const subTickets = await generateSubTickets(feature, epicId, projectId, sessionId, repoUrls, repoUrl, epicRagContext);
      tickets.push(...subTickets);
    }
  }
  
  // Add infrastructure tickets from technical requirements
  if (specCard.technical) {
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
 * @param {Object} feature - Feature from spec_card
 * @param {string} epicId - Parent epic ticket ID
 * @param {string} projectId - Project ID
 * @param {string} sessionId - HITL session ID
 * @param {string[]} repoUrls - Repository URLs for RAG
 * @param {string} repoUrl - Primary repo URL
 * @param {Object} epicRagContext - RAG context from epic (optional)
 */
async function generateSubTickets(feature, epicId, projectId, sessionId, repoUrls = [], repoUrl = null, epicRagContext = null) {
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

  // Build prompt with code context
  let prompt = `You are a senior software architect breaking down a feature into implementation tickets.

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

The following code snippets are from the existing codebase. Use these to understand patterns, conventions, and where to make changes:

\`\`\`
${codeContext}
\`\`\`

**Relevant Files:** ${relevantFiles.join(', ')}
`;
  }

  prompt += `
## Your Task

Break this feature into 2-4 specific implementation tickets. Each ticket should:
1. Be completable in 1-2 hours by an AI coding agent
2. Reference specific files to modify or create
3. Follow the patterns shown in the existing code context
4. Have clear, testable acceptance criteria

Return a JSON array:
\`\`\`json
[{
  "title": "Concise action-oriented title",
  "description": "Detailed implementation instructions including which files to modify and what patterns to follow",
  "acceptance": ["Specific testable criterion 1", "Criterion 2"],
  "scope": "small|medium|large",
  "files_to_modify": ["path/to/file1.js", "path/to/file2.js"],
  "files_to_create": ["path/to/new/file.js"],
  "implementation_notes": "Key technical considerations or dependencies"
}]
\`\`\``;

  try {
    const response = await chat({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2500
    });
    
    const parsed = parseJsonResponse(response.content);
    if (!Array.isArray(parsed)) return [];
    
    return parsed.map(t => {
      // Combine file hints
      const allFiles = [
        ...(t.files_to_modify || []),
        ...(t.files_to_create || [])
      ];
      
      // Build enriched description
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
 */
function generateInfraTickets(technical, projectId, sessionId, repoUrl = null) {
  const tickets = [];
  
  // Project setup ticket
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
  generateInfraTickets
};
