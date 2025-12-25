import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';

export const manualTrigger: StepDefinition = {
  id: 'manual',
  name: 'Manual Trigger',
  description: 'Manually trigger a workflow execution',
  category: 'trigger',
  icon: '▶️',
  inputs: [],
  outputs: [
    { name: 'timestamp', type: 'string', label: 'Trigger Time' },
    { name: 'triggeredBy', type: 'string', label: 'Triggered By' }
  ],
  execute: async (inputs, context): Promise<StepExecuteResult> => {
    return {
      success: true,
      outputs: {
        timestamp: new Date().toISOString(),
        triggeredBy: 'manual',
        executionId: context.executionId
      }
    };
  }
};

registry.register(manualTrigger);
