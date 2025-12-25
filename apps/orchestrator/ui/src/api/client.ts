const API_BASE = '/api';

export interface Flow {
  id: string;
  name: string;
  description?: string;
  definition?: FlowDefinition;
  active: boolean;
  created_at: string;
  updated_at: string;
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

export const api = {
  async listFlows(): Promise<Flow[]> {
    const res = await fetch(`${API_BASE}/flows`);
    if (!res.ok) throw new Error('Failed to fetch flows');
    return res.json();
  },

  async getFlow(id: string): Promise<Flow> {
    const res = await fetch(`${API_BASE}/flows/${id}`);
    if (!res.ok) throw new Error('Failed to fetch flow');
    return res.json();
  },

  async createFlow(name: string, description: string, definition: FlowDefinition): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, definition })
    });
    if (!res.ok) throw new Error('Failed to create flow');
    return res.json();
  },

  async updateFlow(id: string, data: Partial<{ name: string; description: string; definition: FlowDefinition; active: boolean }>): Promise<void> {
    const res = await fetch(`${API_BASE}/flows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update flow');
  },

  async deleteFlow(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/flows/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete flow');
  },

  async executeFlow(id: string, triggerData?: Record<string, unknown>): Promise<{ executionId: string }> {
    const res = await fetch(`${API_BASE}/flows/${id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerData })
    });
    if (!res.ok) throw new Error('Failed to execute flow');
    return res.json();
  }
};
