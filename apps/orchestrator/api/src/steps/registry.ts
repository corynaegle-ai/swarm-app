import type { ExecutionContext, StepExecuteResult } from '../types/index.js';

export interface InputSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'select';
  label: string;
  required: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
}

export interface OutputSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  label: string;
}

export interface StepDefinition {
  id: string;
  name: string;
  description: string;
  category: 'trigger' | 'swarm' | 'integration' | 'logic' | 'human';
  icon: string;
  inputs: InputSchema[];
  outputs: OutputSchema[];
  execute: (inputs: Record<string, unknown>, context: ExecutionContext) => Promise<StepExecuteResult>;
}

class StepRegistry {
  private steps: Map<string, StepDefinition> = new Map();

  register(step: StepDefinition): void {
    this.steps.set(step.id, step);
    console.log(`[REGISTRY] Registered step: ${step.id}`);
  }

  get(id: string): StepDefinition | undefined {
    return this.steps.get(id);
  }

  getAll(): StepDefinition[] {
    return Array.from(this.steps.values());
  }

  getByCategory(category: string): StepDefinition[] {
    return this.getAll().filter(s => s.category === category);
  }
}

export const registry = new StepRegistry();
