import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';

export const approvalGate: StepDefinition = {
  id: 'approval-gate',
  name: 'Approval Gate',
  description: 'Pause workflow until a human approves or rejects',
  category: 'human',
  icon: '✋',
  inputs: [
    { name: 'title', type: 'string', label: 'Approval Title', required: true },
    { name: 'description', type: 'string', label: 'Description', required: false },
    { name: 'prUrl', type: 'string', label: 'PR URL to Review', required: false },
    { name: 'ticketId', type: 'string', label: 'Ticket ID', required: false }
  ],
  outputs: [
    { name: 'approved', type: 'boolean', label: 'Was Approved' },
    { name: 'approvedBy', type: 'string', label: 'Approved By' },
    { name: 'comments', type: 'string', label: 'Review Comments' },
    { name: 'approvedAt', type: 'string', label: 'Approval Time' }
  ],
  execute: async (inputs, context): Promise<StepExecuteResult> => {
    // This step always suspends - it will be resumed via webhook/API
    // when the human approves or rejects
    
    const { title, description, prUrl, ticketId } = inputs as {
      title: string; description?: string; prUrl?: string; ticketId?: string;
    };

    console.log(`[APPROVAL-GATE] Suspending execution ${context.executionId}`);
    console.log(`  Title: ${title}`);
    console.log(`  PR: ${prUrl || 'N/A'}`);
    console.log(`  Ticket: ${ticketId || 'N/A'}`);

    // Store the approval request metadata in the execution
    // The UI will show pending approvals and allow approve/reject
    return {
      success: true,
      outputs: {
        approved: false,  // Will be updated when resumed
        approvedBy: '',
        comments: '',
        approvedAt: ''
      },
      suspend: true,  // Key: this suspends the execution
      suspendReason: 'Waiting for human approval',
      suspendMetadata: {
        type: 'approval',
        title,
        description: description || '',
        prUrl: prUrl || '',
        ticketId: ticketId || '',
        requestedAt: new Date().toISOString()
      }
    };
  }
};

registry.register(approvalGate);
