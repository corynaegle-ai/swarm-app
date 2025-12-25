import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';
import { getSwarmDb } from '../../db/swarm-connection.js';
import { randomUUID } from 'crypto';

export const createTicket: StepDefinition = {
  id: 'create-ticket',
  name: 'Create Ticket',
  description: 'Create a ticket for the Swarm agent system',
  category: 'swarm',
  icon: '🎫',
  inputs: [
    { name: 'title', type: 'string', label: 'Title', required: true },
    { name: 'description', type: 'string', label: 'Description', required: true },
    { name: 'acceptance_criteria', type: 'string', label: 'Acceptance Criteria', required: false },
    { name: 'repository', type: 'string', label: 'Repository URL', required: false },
    { name: 'priority', type: 'select', label: 'Priority', required: false, default: 'medium',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'Critical', value: 'critical' }
      ]
    },
    { name: 'project_id', type: 'string', label: 'Project ID', required: false },
    { name: 'agent_type', type: 'string', label: 'Agent Type', required: false, default: 'forge' }
  ],
  outputs: [
    { name: 'ticketId', type: 'string', label: 'Ticket ID' },
    { name: 'status', type: 'string', label: 'Status' }
  ],
  execute: async (inputs): Promise<StepExecuteResult> => {
    try {
      const db = await getSwarmDb();
      const ticketId = randomUUID();
      
      const { title, description, acceptance_criteria, repository, priority, project_id, agent_type } = inputs as {
        title: string; description: string; acceptance_criteria?: string;
        repository?: string; priority?: string; project_id?: string; agent_type?: string;
      };

      // Insert ticket with state='ready' so SwarmEngine picks it up
      await db.query(`
        INSERT INTO tickets (
          id, title, description, acceptance_criteria, 
          state, priority, project_id, agent_type, repo_url,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        ticketId,
        title,
        description,
        acceptance_criteria || '',
        'ready',  // SwarmEngine polls for 'ready' tickets
        priority || 'medium',
        project_id || null,
        agent_type || 'forge',
        repository || null
      ]);

      console.log(`[CREATE-TICKET] Created ticket ${ticketId}: ${title}`);

      return {
        success: true,
        outputs: { ticketId, status: 'ready' }
      };
    } catch (e) {
      console.error('[CREATE-TICKET] Error:', e);
      return { success: false, outputs: {}, error: (e as Error).message };
    }
  }
};

registry.register(createTicket);
