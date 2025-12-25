import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';

export const webhookTrigger: StepDefinition = {
  id: 'webhook',
  name: 'Webhook Trigger',
  description: 'Trigger workflow via HTTP webhook',
  category: 'trigger',
  icon: '🌐',
  inputs: [],
  outputs: [
    { name: 'body', type: 'json', label: 'Request Body' },
    { name: 'headers', type: 'json', label: 'Request Headers' },
    { name: 'query', type: 'json', label: 'Query Parameters' },
    { name: 'timestamp', type: 'string', label: 'Trigger Time' }
  ],
  execute: async (inputs, context): Promise<StepExecuteResult> => {
    // Webhook data comes from triggerData in context
    const triggerData = context.variables.triggerData as Record<string, unknown> || {};
    return {
      success: true,
      outputs: {
        body: triggerData.body || {},
        headers: triggerData.headers || {},
        query: triggerData.query || {},
        timestamp: (triggerData.timestamp as string) || new Date().toISOString()
      }
    };
  }
};

registry.register(webhookTrigger);
