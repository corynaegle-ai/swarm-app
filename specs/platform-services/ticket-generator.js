/**
 * Ticket Generator Service
 * Converts HITL spec_card JSON into actionable tickets
 * 
 * Flow: spec_card → parse features → create project → create tickets → set dependencies
 */

const { getDb } = require('../db');
const { randomUUID: uuidv4 } = require('crypto');
const { broadcast } = require('../websocket');

/**
 * Estimate ticket scope based on acceptance criteria count and description length
 */
function estimateScope(feature) {
  const criteriaCount = feature.acceptance?.length || 0;
  const descLength = (feature.description || '').length;
  
  if (criteriaCount >= 5 || descLength > 300) return 'large';
  if (criteriaCount >= 3 || descLength > 150) return 'medium';
  return 'small';
}

/**
 * Map feature priority to epic category
 */
function mapToEpic(feature, index) {
  if (feature.priority === 'high') return 'core';
  if (feature.priority === 'medium') return 'enhancement';
  return 'nice-to-have';
}

/**
 * Generate ticket ID with prefix
 */
function generateTicketId(projectPrefix, index) {
  const padded = String(index).padStart(3, '0');
  return `${projectPrefix}-${padded}`;
}

/**
 * Generate project prefix from title (e.g., "My App" → "MA")
 */
function generatePrefix(title) {
  if (!title) return 'TKT';
  const words = title.split(/\s+/).filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return title.substring(0, 3).toUpperCase();
}

/**
 * Create project from spec_card
 */
function createProject(db, specCard, sessionId, tenantId) {
  const projectId = uuidv4();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO projects (id, name, description, status, tenant_id, hitl_session_id, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    projectId,
    specCard.title || 'Untitled Project',
    specCard.summary || '',
    tenantId,
    sessionId,
    now,
    now
  );
  
  return projectId;
}

/**
 * Create tickets from features array
 */
function createTickets(db, projectId, specCard, sessionId) {
  const features = specCard.features || [];
  const prefix = generatePrefix(specCard.title);
  const tickets = [];
  
  const insertStmt = db.prepare(`
    INSERT INTO tickets (
      id, project_id, title, description, acceptance_criteria,
      state, epic, estimated_scope, design_session, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'ready', ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  features.forEach((feature, index) => {
    const ticketId = generateTicketId(prefix, index + 1);
    const acceptance = Array.isArray(feature.acceptance) 
      ? feature.acceptance.join('\n- ') 
      : feature.acceptance || '';
    
    insertStmt.run(
      ticketId,
      projectId,
      feature.name,
      feature.description || '',
      acceptance ? `- ${acceptance}` : '',
      mapToEpic(feature, index),
      estimateScope(feature),
      sessionId
    );
    
    tickets.push({
      id: ticketId,
      title: feature.name,
      priority: feature.priority,
      epic: mapToEpic(feature, index),
      scope: estimateScope(feature)
    });
  });
  
  return tickets;
}

/**
 * Create dependencies between tickets based on priority ordering
 */
function createDependencies(db, tickets) {
  const highPriority = tickets.filter(t => t.priority === 'high');
  const mediumPriority = tickets.filter(t => t.priority === 'medium');
  const lowPriority = tickets.filter(t => t.priority !== 'high' && t.priority !== 'medium');
  
  const insertDep = db.prepare(`
    INSERT OR IGNORE INTO dependencies (ticket_id, depends_on)
    VALUES (?, ?)
  `);
  
  // Medium depends on high priority completion
  if (highPriority.length > 0 && mediumPriority.length > 0) {
    const lastHigh = highPriority[highPriority.length - 1];
    mediumPriority.forEach(ticket => {
      insertDep.run(ticket.id, lastHigh.id);
    });
  }
  
  // Low depends on medium priority completion  
  if (mediumPriority.length > 0 && lowPriority.length > 0) {
    const lastMedium = mediumPriority[mediumPriority.length - 1];
    lowPriority.forEach(ticket => {
      insertDep.run(ticket.id, lastMedium.id);
    });
  }
}

/**
 * Main entry point: Generate tickets from HITL session
 * 
 * @param {string} sessionId - HITL session ID
 * @returns {object} - { projectId, tickets: [], error? }
 */
async function generateFromSession(sessionId) {
  const db = getDb();
  
  // 1. Load session and spec_card
  const session = db.prepare('SELECT * FROM hitl_sessions WHERE id = ?').get(sessionId);
  if (!session) {
    return { error: 'Session not found', projectId: null, tickets: [] };
  }
  
  if (!session.spec_card) {
    return { error: 'No spec_card in session', projectId: null, tickets: [] };
  }
  
  let specCard;
  try {
    specCard = JSON.parse(session.spec_card);
  } catch (e) {
    return { error: 'Invalid spec_card JSON', projectId: null, tickets: [] };
  }
  
  if (!specCard.features || specCard.features.length === 0) {
    return { error: 'No features in spec_card', projectId: null, tickets: [] };
  }
  
  // 2. Create project
  const projectId = createProject(db, specCard, sessionId, session.tenant_id);
  
  // 3. Create tickets from features
  const tickets = createTickets(db, projectId, specCard, sessionId);
  
  // 4. Create dependencies
  createDependencies(db, tickets);
  
  // 5. Update session with ticket count
  db.prepare(`
    UPDATE hitl_sessions 
    SET progress_percent = 95, updated_at = datetime('now')
    WHERE id = ?
  `).run(sessionId);
  
  // 6. Broadcast update
  broadcast.sessionUpdate(sessionId, 'building', 95);
  
  console.log(`[TicketGenerator] Created ${tickets.length} tickets for session ${sessionId}`);
  
  return {
    projectId,
    tickets,
    summary: {
      total: tickets.length,
      byPriority: {
        high: tickets.filter(t => t.priority === 'high').length,
        medium: tickets.filter(t => t.priority === 'medium').length,
        low: tickets.filter(t => t.priority !== 'high' && t.priority !== 'medium').length
      }
    }
  };
}

module.exports = {
  generateFromSession,
  generatePrefix,
  estimateScope,
  createProject,
  createTickets
};
