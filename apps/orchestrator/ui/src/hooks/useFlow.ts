import { create } from 'zustand';
import { api, type Flow, type FlowDefinition } from '../api/client';
import type { Node, Edge } from '@xyflow/react';

interface FlowStore {
  flows: Flow[];
  currentFlow: Flow | null;
  loading: boolean;
  error: string | null;
  
  fetchFlows: () => Promise<void>;
  loadFlow: (id: string) => Promise<void>;
  saveFlow: (name: string, description: string, nodes: Node[], edges: Edge[]) => Promise<string>;
  updateCurrentFlow: (nodes: Node[], edges: Edge[]) => Promise<void>;
  deleteFlow: (id: string) => Promise<void>;
  clearCurrentFlow: () => void;
}

export const useFlowStore = create<FlowStore>((set, get) => ({
  flows: [],
  currentFlow: null,
  loading: false,
  error: null,

  fetchFlows: async () => {
    set({ loading: true, error: null });
    try {
      const flows = await api.listFlows();
      set({ flows, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  loadFlow: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const flow = await api.getFlow(id);
      set({ currentFlow: flow, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  saveFlow: async (name: string, description: string, nodes: Node[], edges: Edge[]) => {
    set({ loading: true, error: null });
    try {
      const definition: FlowDefinition = {
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type || 'default',
          position: n.position,
          data: { label: String(n.data?.label || ''), config: (n.data?.config as Record<string, unknown>) || {} }
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle || undefined,
          target: e.target
        })),
        variables: []
      };
      const { id } = await api.createFlow(name, description, definition);
      await get().fetchFlows();
      set({ loading: false });
      return id;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  updateCurrentFlow: async (nodes: Node[], edges: Edge[]) => {
    const { currentFlow } = get();
    if (!currentFlow) return;
    
    set({ loading: true, error: null });
    try {
      const definition: FlowDefinition = {
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type || 'default',
          position: n.position,
          data: { label: String(n.data?.label || ''), config: (n.data?.config as Record<string, unknown>) || {} }
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle || undefined,
          target: e.target
        })),
        variables: []
      };
      await api.updateFlow(currentFlow.id, { definition });
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  deleteFlow: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.deleteFlow(id);
      const { currentFlow } = get();
      if (currentFlow?.id === id) set({ currentFlow: null });
      await get().fetchFlows();
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  clearCurrentFlow: () => set({ currentFlow: null })
}));
