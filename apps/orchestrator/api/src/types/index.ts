export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: Variable[];
}

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; config: Record<string, unknown> };
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
}

export interface Variable {
  name: string;
  type: string;
  defaultValue?: unknown;
}

export interface ExecutionContext {
  executionId: string;
  flowId: string;
  variables: Record<string, unknown>;
  previousOutputs: Record<string, Record<string, unknown>>;
}

export interface StepExecuteResult {
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
  suspend?: boolean;
  suspendReason?: string;
  suspendMetadata?: Record<string, unknown>;
}

export interface Execution {
  id: string;
  flow_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'suspended' | 'cancelled';
  trigger_data: Record<string, unknown>;
  current_node_id?: string;
  started_at: string;
  completed_at?: string;
  error?: string;
}
