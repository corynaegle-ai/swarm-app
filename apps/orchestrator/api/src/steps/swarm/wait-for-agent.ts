import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';
import { getSwarmDb } from '../../db/swarm-connection.js';

export const waitForAgent: StepDefinition = {
  id: 'wait-for-agent',
  name: 'Wait for Agent',
  description: 'Wait for a Swarm agent to complete its work on a ticket',
  category: 'swarm',
  icon: '⏳',
  inputs: [
    { name: 'ticketId', type: 'string', label: 'Ticket ID', required: true },
    { name: 'timeout', type: 'number', label: 'Timeout (seconds)', required: false, default: 1800 },
    { name: 'pollInterval', type: 'number', label: 'Poll Interval (seconds)', required: false, default: 10 }
  ],
  outputs: [
    { name: 'status', type: 'string', label: 'Final Status' },
    { name: 'prUrl', type: 'string', label: 'PR URL' },
    { name: 'branch', type: 'string', label: 'Branch Name' },
    { name: 'error', type: 'string', label: 'Error Message' }
  ],
  execute: async (inputs): Promise<StepExecuteResult> => {
    const { ticketId, timeout = 1800, pollInterval = 10 } = inputs as {
      ticketId: string; timeout?: number; pollInterval?: number;
    };

    const db = await getSwarmDb();
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    const pollMs = pollInterval * 1000;

    console.log(`[WAIT-FOR-AGENT] Waiting for ticket ${ticketId} (timeout: ${timeout}s)`);

    while (Date.now() - startTime < timeoutMs) {
      const result = await db.query(
        'SELECT state, pr_url, branch, error FROM tickets WHERE id = $1',
        [ticketId]
      );

      if (result.rows.length === 0) {
        return { success: false, outputs: {}, error: 'Ticket not found' };
      }

      const ticket = result.rows[0];
      const state = ticket.state;

      // Terminal states
      if (state === 'completed' || state === 'merged') {
        console.log(`[WAIT-FOR-AGENT] Ticket ${ticketId} completed with PR: ${ticket.pr_url}`);
        return {
          success: true,
          outputs: {
            status: state,
            prUrl: ticket.pr_url || '',
            branch: ticket.branch || '',
            error: ''
          }
        };
      }

      if (state === 'failed' || state === 'cancelled') {
        console.log(`[WAIT-FOR-AGENT] Ticket ${ticketId} failed: ${ticket.error}`);
        return {
          success: false,
          outputs: {
            status: state,
            prUrl: '',
            branch: '',
            error: ticket.error || 'Unknown error'
          },
          error: ticket.error || `Ticket ${state}`
        };
      }

      // Still in progress - wait and poll again
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }

    // Timeout reached
    console.log(`[WAIT-FOR-AGENT] Timeout waiting for ticket ${ticketId}`);
    return {
      success: false,
      outputs: { status: 'timeout', prUrl: '', branch: '', error: 'Timeout waiting for agent' },
      error: 'Timeout waiting for agent completion',
      suspend: true  // Allow manual intervention
    };
  }
};

registry.register(waitForAgent);
