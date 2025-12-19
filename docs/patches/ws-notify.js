/**
 * WebSocket Notification Helper for Swarm Engine
 * 
 * Calls the Platform's internal API to broadcast ticket events
 * to connected WebSocket clients.
 */

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:8080';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'swarm-internal-dev-key-2024';

/**
 * Notify Platform of ticket state change
 */
async function notifyTicketStateChange(ticketId, state, extra = {}) {
  try {
    const response = await fetch(`${PLATFORM_URL}/api/internal/ticket-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        ticketId,
        event: 'state_change',
        state,
        ...extra
      })
    });
    
    if (!response.ok) {
      console.warn(`[WS Notify] Failed to notify state change: ${response.status}`);
    }
  } catch (err) {
    // Non-fatal - log and continue
    console.warn(`[WS Notify] Error notifying state change: ${err.message}`);
  }
}

/**
 * Notify Platform of ticket progress
 */
async function notifyTicketProgress(ticketId, phase, message, extra = {}) {
  try {
    await fetch(`${PLATFORM_URL}/api/internal/ticket-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        ticketId,
        event: 'progress',
        phase,
        message,
        ...extra
      })
    });
  } catch (err) {
    console.warn(`[WS Notify] Error notifying progress: ${err.message}`);
  }
}

/**
 * Notify Platform of PR creation
 */
async function notifyPRCreated(ticketId, prUrl, extra = {}) {
  try {
    await fetch(`${PLATFORM_URL}/api/internal/ticket-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        ticketId,
        event: 'pr_created',
        prUrl,
        ...extra
      })
    });
  } catch (err) {
    console.warn(`[WS Notify] Error notifying PR created: ${err.message}`);
  }
}

/**
 * Notify Platform of build progress
 */
async function notifyBuildProgress(sessionId, percent, message, extra = {}) {
  try {
    await fetch(`${PLATFORM_URL}/api/internal/build-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${INTERNAL_API_KEY}`
      },
      body: JSON.stringify({
        sessionId,
        event: 'progress',
        percent,
        message,
        ...extra
      })
    });
  } catch (err) {
    console.warn(`[WS Notify] Error notifying build progress: ${err.message}`);
  }
}

module.exports = {
  notifyTicketStateChange,
  notifyTicketProgress,
  notifyPRCreated,
  notifyBuildProgress
};
