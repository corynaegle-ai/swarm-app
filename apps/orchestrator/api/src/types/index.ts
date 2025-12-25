// Core types for Swarm Visual Orchestrator

export interface Flow {
  id: string;
  name: string;
  description?: string;
  definition: FlowDefinition;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: Variable[];
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

export interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  defaultValue?: unknown;
}

export interface Execution {
  id: string;
  flowId: string;
  status: ExecutionStatus;
  triggerData: Record<string, unknown>;
  currentNodeId?: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'suspended' | 'completed' | 'failed';

export interface StepResult {
  id: string;
  executionId: string;
  nodeId: string;
  stepType: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExecutionContext {
  executionId: string;
  flowId: string;
  variables: Record<string, unknown>;
  previousOutputs: Record<string, unknown>;
}

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

export interface StepExecuteResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
  suspend?: boolean;
  suspendData?: Record<string, unknown>;
}
