/**
 * MCP Ticket Generator Service
 * Converts MCP Factory specs into actionable tickets
 */

const { queryOne, execute, getPool } = require('../db');
const { randomUUID } = require('crypto');

/**
 * Generate tickets from an MCP spec
 * @param {Object} spec - Parsed MCP spec from mcp-factory
 * @param {string} projectId - Project to attach tickets to
 * @param {string} jobId - MCP Factory job ID for tracing
 * @returns {Promise<{success: boolean, tickets: Array, count: number, error?: string}>}
 */
async function generateMcpTickets(spec, projectId, jobId = null) {
  // Validate inputs
  if (!spec || !spec.name) {
    return { success: false, error: 'Invalid spec: missing name' };
  }
  
  if (!projectId) {
    return { success: false, error: 'Project ID required' };
  }
  
  // Verify project exists
  const project = await queryOne('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }
  
  const tickets = [];
  const mcpName = spec.name;
  const prefix = `TKT-${randomUUID().slice(0, 8).toUpperCase()}`;
  
  // 1. Scaffold Epic Ticket
  const epicId = `${prefix}-EPIC`;
  tickets.push({
    id: epicId,
    project_id: projectId,
    title: `[MCP] ${mcpName} - Server Scaffold`,
    description: `Create MCP server structure for: ${spec.description || mcpName}\n\nJob ID: ${jobId || 'N/A'}`,
    acceptance_criteria: JSON.stringify([
      'package.json with MCP SDK dependency',
      'src/index.ts with server initialization',
      'TypeScript configuration',
      'README.md with usage instructions'
    ]),
    state: 'ready',
    epic: null,
    estimated_scope: 'small',
    files_hint: 'package.json, src/index.ts, tsconfig.json, README.md',
    mcp_job_id: jobId
  });
  
  // 2. Tool Implementation Tickets
  const tools = spec.tools || [];
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const toolId = `${prefix}-TOOL-${i + 1}`;
    
    // Estimate scope based on parameter complexity
    const paramCount = tool.parameters?.properties ? Object.keys(tool.parameters.properties).length : 0;
    const scope = paramCount > 5 ? 'large' : paramCount > 2 ? 'medium' : 'small';
    
    tickets.push({
      id: toolId,
      project_id: projectId,
      title: `[MCP] ${mcpName} - Implement tool: ${tool.name}`,
      description: `Implement MCP tool: ${tool.name}\n\n${tool.description || ''}\n\nParameters:\n${JSON.stringify(tool.parameters || {}, null, 2)}`,
      acceptance_criteria: JSON.stringify([
        `Tool ${tool.name} registered with server`,
        'Input validation implemented',
        'Error handling for edge cases',
        'Returns properly formatted response'
      ]),
      state: 'blocked', // Blocked until scaffold complete
      epic: epicId,
      estimated_scope: scope,
      files_hint: `src/tools/${tool.name}.ts`,
      mcp_job_id: jobId
    });
  }
  
  // 3. Resource Implementation Tickets (if any)
  const resources = spec.resources || [];
  for (let i = 0; i < resources.length; i++) {
    const resource = resources[i];
    const resourceId = `${prefix}-RES-${i + 1}`;
    
    tickets.push({
      id: resourceId,
      project_id: projectId,
      title: `[MCP] ${mcpName} - Implement resource: ${resource.name || resource.uri}`,
      description: `Implement MCP resource:\n${JSON.stringify(resource, null, 2)}`,
      acceptance_criteria: JSON.stringify([
        'Resource registered with server',
        'Returns valid content',
        'MIME type set correctly'
      ]),
      state: 'blocked',
      epic: epicId,
      estimated_scope: 'small',
      files_hint: `src/resources/${resource.name || 'resource'}.ts`,
      mcp_job_id: jobId
    });
  }
  
  // 4. Validation Ticket
  const validationId = `${prefix}-VAL`;
  tickets.push({
    id: validationId,
    project_id: projectId,
    title: `[MCP] ${mcpName} - Validation & Tests`,
    description: 'Add validation tests for all tools and resources',
    acceptance_criteria: JSON.stringify([
      'Unit tests for each tool',
      'Integration test with MCP client',
      'TypeScript compiles without errors',
      'ESLint passes'
    ]),
    state: 'blocked',
    epic: epicId,
    estimated_scope: 'medium',
    files_hint: 'test/*.test.ts, src/**/*.ts',
    mcp_job_id: jobId
  });
  
  // 5. Packaging Ticket
  const packageId = `${prefix}-PKG`;
  tickets.push({
    id: packageId,
    project_id: projectId,
    title: `[MCP] ${mcpName} - Package & Distribution`,
    description: 'Build distribution packages for npm and standalone',
    acceptance_criteria: JSON.stringify([
      'npm package builds successfully',
      'Standalone binary created',
      'Package metadata correct',
      'Installation instructions verified'
    ]),
    state: 'blocked',
    epic: epicId,
    estimated_scope: 'small',
    files_hint: 'dist/, package.json',
    mcp_job_id: jobId
  });
  
  // Insert all tickets using PostgreSQL transaction
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const t of tickets) {
      await client.query(`
        INSERT INTO tickets (
          id, project_id, title, description, acceptance_criteria,
          state, epic, estimated_scope, files_hint
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        t.id,
        t.project_id,
        t.title,
        t.description,
        t.acceptance_criteria,
        t.state,
        t.epic,
        t.estimated_scope,
        t.files_hint
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`[MCP Tickets] Created ${tickets.length} tickets for ${mcpName}`);
    return { 
      success: true, 
      tickets: tickets.map(t => ({ id: t.id, title: t.title, state: t.state })),
      count: tickets.length,
      epicId
    };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[MCP Tickets] Database error:', e.message);
    return { success: false, error: `Database error: ${e.message}` };
  } finally {
    client.release();
  }
}

module.exports = { generateMcpTickets };
