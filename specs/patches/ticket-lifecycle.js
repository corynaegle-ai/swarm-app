/**
 * Ticket Lifecycle Management
 * Handles state transitions and dependency cascading
 * 
 * Created: 2025-12-23
 * Purpose: Implement P0-1 - Dependency Cascade Unblocking
 */

const { queryAll, queryOne, execute, getClient } = require('../db');
const { broadcast } = require('../websocket');

/**
 * Cascade unblock dependent tickets when a ticket completes
 * @param {string} completedTicketId - The ticket that just completed
 * @param {string} sessionId - Design session for scoping
 * @returns {Promise<{unblocked: string[], stillBlocked: Array}>}
 */
async function cascadeUnblockDependents(completedTicketId, sessionId) {
  const result = { unblocked: [], stillBlocked: [] };
  
  console.log(`[cascade] Starting cascade check for completed ticket ${completedTicketId} in session ${sessionId}`);
  
  // Find all blocked tickets in this session
  const blockedTickets = await queryAll(`
    SELECT id, title, depends_on, project_id FROM tickets
    WHERE design_session = $1 AND state = 'blocked'
  `, [sessionId]);
  
  console.log(`[cascade] Found ${blockedTickets.length} blocked tickets in session`);
  
  for (const ticket of blockedTickets) {
    // Parse dependencies - handle both JSON array and comma-separated string formats
    let deps = [];
    try {
      if (ticket.depends_on) {
        deps = typeof ticket.depends_on === 'string' 
          ? JSON.parse(ticket.depends_on) 
          : ticket.depends_on;
      }
    } catch (e) {
      // Fallback to comma-separated parsing
      deps = ticket.depends_on?.split(',').map(d => d.trim()).filter(Boolean) || [];
    }
    
    // Skip if this ticket doesn't depend on the completed one
    if (!deps.includes(completedTicketId)) {
      continue;
    }
    
    console.log(`[cascade] Ticket ${ticket.id} depends on completed ticket. Checking all deps: ${deps.join(', ')}`);
    
    // Check if ALL dependencies are now satisfied (state = 'done' or 'completed')
    const unsatisfiedDeps = await queryAll(`
      SELECT id, state FROM tickets
      WHERE id = ANY($1::uuid[])
        AND state NOT IN ('done', 'completed')
    `, [deps]);
    
    if (unsatisfiedDeps.length === 0) {
      // All dependencies satisfied - unblock this ticket
      await execute(`
        UPDATE tickets
        SET state = 'ready',
            assignee_id = 'forge-agent',
            assignee_type = 'agent',
            unblocked_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [ticket.id]);
      
      result.unblocked.push(ticket.id);
      
      console.log(`[cascade] ✅ Unblocked ticket ${ticket.id}: ${ticket.title}`);
      
      // Broadcast unblock event
      if (broadcast && broadcast.ticketUnblocked) {
        broadcast.ticketUnblocked(sessionId, {
          ticketId: ticket.id,
          title: ticket.title,
          unlockedBy: completedTicketId,
          projectId: ticket.project_id
        });
      }
      
      // Also send a general ticket update
      if (broadcast && broadcast.ticketUpdate) {
        broadcast.ticketUpdate(ticket.id, 'ready', {
          sessionId,
          projectId: ticket.project_id,
          unlockedBy: completedTicketId
        });
      }
      
      // Log activity for audit trail
      await logTicketActivity(ticket.id, 'unblocked', {
        triggeredBy: completedTicketId,
        previousState: 'blocked',
        newState: 'ready'
      });
      
    } else {
      result.stillBlocked.push({
        ticketId: ticket.id,
        title: ticket.title,
        waitingFor: unsatisfiedDeps.map(d => ({ id: d.id, state: d.state }))
      });
      
      console.log(`[cascade] ⏳ Ticket ${ticket.id} still blocked, waiting for: ${unsatisfiedDeps.map(d => d.id).join(', ')}`);
    }
  }
  
  console.log(`[cascade] Cascade complete. Unblocked: ${result.unblocked.length}, Still blocked: ${result.stillBlocked.length}`);
  
  return result;
}

/**
 * Log ticket activity for audit trail
 * @param {string} ticketId - Ticket ID
 * @param {string} action - Action type (unblocked, completed, failed, etc.)
 * @param {object} metadata - Additional context
 */
async function logTicketActivity(ticketId, action, metadata = {}) {
  try {
    await execute(`
      INSERT INTO ticket_activity (id, ticket_id, action, metadata, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
    `, [ticketId, action, JSON.stringify(metadata)]);
  } catch (e) {
    // Log but don't fail the main operation if activity logging fails
    console.error(`[cascade] Failed to log activity for ticket ${ticketId}:`, e.message);
  }
}

/**
 * Wrapper to handle ticket completion with cascade
 * Call this when a ticket transitions to 'done' or 'completed'
 * @param {string} ticketId - The ticket that completed
 */
async function handleTicketCompletion(ticketId) {
  // Get the ticket's session ID
  const ticket = await queryOne(
    'SELECT design_session, project_id, title FROM tickets WHERE id = $1',
    [ticketId]
  );
  
  if (!ticket) {
    console.error(`[cascade] Cannot cascade - ticket ${ticketId} not found`);
    return { unblocked: [], stillBlocked: [] };
  }
  
  if (!ticket.design_session) {
    console.log(`[cascade] Ticket ${ticketId} has no design_session, skipping cascade`);
    return { unblocked: [], stillBlocked: [] };
  }
  
  // Log completion activity
  await logTicketActivity(ticketId, 'completed', {
    title: ticket.title,
    projectId: ticket.project_id
  });
  
  // Run cascade unblocking
  return cascadeUnblockDependents(ticketId, ticket.design_session);
}

module.exports = {
  cascadeUnblockDependents,
  logTicketActivity,
  handleTicketCompletion
};
