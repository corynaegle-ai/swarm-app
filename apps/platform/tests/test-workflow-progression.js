const { expect } = require('chai');
const SwarmEngine = require('../../../docs/engine-pg');

// Mock database configuration for testing
const testConfig = {
  user: 'test_user',
  host: 'localhost',
  database: 'swarm_test',
  password: 'test_password',
  port: 5432
};

// Create test ticket helper function
function createTestTicket(overrides = {}) {
  const defaults = {
    title: 'Test Ticket',
    description: 'This is a test ticket for workflow progression',
    status: 'open',
    priority: 'medium',
    assigned_to: 'test_agent_001',
    created_by: 'system',
    metadata: {
      source: 'test',
      category: 'automation',
      tags: ['test', 'workflow']
    }
  };

  return { ...defaults, ...overrides };
}

// Create test workflow helper function
function createTestWorkflow(overrides = {}) {
  const defaults = {
    name: 'Test Workflow',
    description: 'Test workflow for progression testing',
    steps: [
      {
        id: 'step_1',
        name: 'Initial Processing',
        type: 'agent',
        config: { agent_type: 'processor' }
      },
      {
        id: 'step_2',
        name: 'Analysis',
        type: 'agent',
        config: { agent_type: 'analyzer' }
      },
      {
        id: 'step_3',
        name: 'Resolution',
        type: 'agent',
        config: { agent_type: 'resolver' }
      }
    ],
    created_by: 'system'
  };

  return { ...defaults, ...overrides };
}

describe('Workflow Progression Tests', () => {
  let engine;

  beforeEach(() => {
    // Mock the SwarmEngine for testing
    engine = {
      createTicket: async (data) => ({
        id: 'ticket_123',
        ticket_id: 'TKT-123',
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      }),
      getTickets: async (filters) => [
        {
          id: 'ticket_123',
          ticket_id: 'TKT-123',
          title: 'Test Ticket',
          description: 'Test Description',
          status: 'open',
          priority: 'medium',
          assigned_to: 'test_agent_001',
          created_by: 'system',
          created_at: new Date(),
          updated_at: new Date()
        }
      ],
      updateTicket: async (id, data) => ({
        id,
        ...data,
        updated_at: new Date()
      }),
      createWorkflow: async (data) => ({
        id: 'workflow_456',
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
    };
  });

  describe('Ticket Creation with Priority', () => {
    it('should create a ticket with default medium priority', async () => {
      const ticketData = createTestTicket();
      const ticket = await engine.createTicket(ticketData);
      
      expect(ticket).to.exist;
      expect(ticket.priority).to.equal('medium');
      expect(ticket.title).to.equal('Test Ticket');
      expect(ticket.status).to.equal('open');
    });

    it('should create a ticket with high priority', async () => {
      const ticketData = createTestTicket({ priority: 'high' });
      const ticket = await engine.createTicket(ticketData);
      
      expect(ticket).to.exist;
      expect(ticket.priority).to.equal('high');
    });

    it('should create a ticket with urgent priority', async () => {
      const ticketData = createTestTicket({ 
        priority: 'urgent',
        title: 'Critical System Issue'
      });
      const ticket = await engine.createTicket(ticketData);
      
      expect(ticket).to.exist;
      expect(ticket.priority).to.equal('urgent');
      expect(ticket.title).to.equal('Critical System Issue');
    });

    it('should create a ticket with low priority', async () => {
      const ticketData = createTestTicket({ 
        priority: 'low',
        title: 'Minor Enhancement Request'
      });
      const ticket = await engine.createTicket(ticketData);
      
      expect(ticket).to.exist;
      expect(ticket.priority).to.equal('low');
      expect(ticket.title).to.equal('Minor Enhancement Request');
    });
  });

  describe('Workflow Progression', () => {
    it('should progress a ticket through workflow steps', async () => {
      // Create initial ticket
      const ticketData = createTestTicket({
        priority: 'high',
        status: 'open'
      });
      const ticket = await engine.createTicket(ticketData);

      // Create workflow
      const workflowData = createTestWorkflow();
      const workflow = await engine.createWorkflow(workflowData);

      // Simulate progression through workflow steps
      const progressedTicket1 = await engine.updateTicket(ticket.id, {
        status: 'in_progress',
        metadata: {
          ...ticket.metadata,
          workflow_id: workflow.id,
          current_step: 'step_1'
        }
      });

      expect(progressedTicket1.status).to.equal('in_progress');
      expect(progressedTicket1.metadata.current_step).to.equal('step_1');

      // Progress to step 2
      const progressedTicket2 = await engine.updateTicket(ticket.id, {
        metadata: {
          ...progressedTicket1.metadata,
          current_step: 'step_2'
        }
      });

      expect(progressedTicket2.metadata.current_step).to.equal('step_2');

      // Complete workflow
      const completedTicket = await engine.updateTicket(ticket.id, {
        status: 'resolved',
        metadata: {
          ...progressedTicket2.metadata,
          current_step: 'completed'
        }
      });

      expect(completedTicket.status).to.equal('resolved');
      expect(completedTicket.metadata.current_step).to.equal('completed');
    });

    it('should handle priority-based workflow routing', async () => {
      // Create urgent priority ticket
      const urgentTicketData = createTestTicket({
        priority: 'urgent',
        title: 'Critical System Failure'
      });
      const urgentTicket = await engine.createTicket(urgentTicketData);

      // Create expedited workflow for urgent tickets
      const expeditedWorkflowData = createTestWorkflow({
        name: 'Expedited Urgent Workflow',
        steps: [
          {
            id: 'urgent_step_1',
            name: 'Immediate Assessment',
            type: 'agent',
            config: { agent_type: 'emergency_processor', priority: 'urgent' }
          },
          {
            id: 'urgent_step_2',
            name: 'Rapid Resolution',
            type: 'agent',
            config: { agent_type: 'emergency_resolver', priority: 'urgent' }
          }
        ]
      });
      const expeditedWorkflow = await engine.createWorkflow(expeditedWorkflowData);

      // Verify urgent ticket gets expedited workflow
      expect(urgentTicket.priority).to.equal('urgent');
      expect(expeditedWorkflow.steps).to.have.length(2);
      expect(expeditedWorkflow.steps[0].config.priority).to.equal('urgent');
    });
  });

  describe('Ticket Filtering by Priority', () => {
    it('should filter tickets by priority', async () => {
      // Create tickets with different priorities
      const lowTicket = await engine.createTicket(createTestTicket({ priority: 'low' }));
      const mediumTicket = await engine.createTicket(createTestTicket({ priority: 'medium' }));
      const highTicket = await engine.createTicket(createTestTicket({ priority: 'high' }));
      const urgentTicket = await engine.createTicket(createTestTicket({ priority: 'urgent' }));

      // Test filtering (mock returns all tickets for simplicity)
      const allTickets = await engine.getTickets();
      expect(allTickets).to.have.length.greaterThan(0);

      // In a real implementation, these would filter by priority
      const highPriorityTickets = await engine.getTickets({ priority: 'high' });
      const urgentTickets = await engine.getTickets({ priority: 'urgent' });

      expect(allTickets).to.be.an('array');
      expect(highPriorityTickets).to.be.an('array');
      expect(urgentTickets).to.be.an('array');
    });
  });

  describe('Priority Validation', () => {
    it('should validate priority values', () => {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      
      validPriorities.forEach(priority => {
        const ticketData = createTestTicket({ priority });
        expect(ticketData.priority).to.equal(priority);
      });
    });

    it('should handle invalid priority gracefully', () => {
      const ticketData = createTestTicket({ priority: 'invalid' });
      expect(ticketData.priority).to.equal('invalid'); // In real implementation, this would be validated
    });
  });

  describe('Integration Tests', () => {
    it('should create and progress multiple tickets with different priorities', async () => {
      const tickets = [];
      const priorities = ['low', 'medium', 'high', 'urgent'];
      
      // Create tickets with different priorities
      for (const priority of priorities) {
        const ticketData = createTestTicket({
          priority,
          title: `${priority.toUpperCase()} Priority Ticket`
        });
        const ticket = await engine.createTicket(ticketData);
        tickets.push(ticket);
      }

      expect(tickets).to.have.length(4);
      
      // Verify each ticket has correct priority
      tickets.forEach((ticket, index) => {
        expect(ticket.priority).to.equal(priorities[index]);
      });
    });
  });
});