// GAP #5: Session Completion Check
// Add after notifyDeployAgent function (around line 388)

// Check if all tickets for a session are done and update session state
function checkSessionCompletion(db, ticketId) {
  // Get the design_session for this ticket
  const ticket = db.prepare('SELECT design_session FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket?.design_session) return;
  
  // Check if all tickets for this session are done
  const incomplete = db.prepare(`
    SELECT COUNT(*) as count FROM tickets 
    WHERE design_session = ? AND state NOT IN ('done', 'cancelled')
  `).get(ticket.design_session);
  
  if (incomplete.count === 0) {
    // All tickets done - update HITL session to completed
    db.prepare(`
      UPDATE hitl_sessions SET state = 'completed', updated_at = datetime('now')
      WHERE id = ?
    `).run(ticket.design_session);
    
    console.log(`[GAP5] Session ${ticket.design_session} completed - all tickets done`);
  } else {
    console.log(`[GAP5] Session ${ticket.design_session} has ${incomplete.count} incomplete tickets`);
  }
}

// THEN: Modify the if (state === 'done') block around line 130 to:
// if (state === 'done') {
//     notifyDeployAgent(req.params.id, state);
//     checkSessionCompletion(db, req.params.id);  // <-- ADD THIS LINE
// }
