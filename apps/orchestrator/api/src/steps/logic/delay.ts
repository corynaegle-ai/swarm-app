import { registry, type StepDefinition } from '../registry.js';
import type { StepExecuteResult } from '../../types/index.js';

export const delay: StepDefinition = {
  id: 'delay',
  name: 'Delay',
  description: 'Wait for a specified duration',
  category: 'logic',
  icon: '⏱️',
  inputs: [
    { name: 'duration', type: 'number', label: 'Duration (seconds)', required: true, default: 5 }
  ],
  outputs: [
    { name: 'waited', type: 'number', label: 'Seconds Waited' }
  ],
  execute: async (inputs): Promise<StepExecuteResult> => {
    const duration = (inputs.duration as number) || 5;
    const ms = Math.min(duration * 1000, 300000); // Max 5 minutes
    
    await new Promise(resolve => setTimeout(resolve, ms));
    
    return {
      success: true,
      outputs: { waited: duration }
    };
  }
};

registry.register(delay);
