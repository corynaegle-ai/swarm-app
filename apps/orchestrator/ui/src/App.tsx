import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow, Controls, Background, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import NodePalette from './components/FlowEditor/NodePalette';
import ConfigPanel from './components/FlowEditor/ConfigPanel';
import FlowList from './components/FlowList';
import SwarmNode from './components/FlowEditor/SwarmNode';
import { useFlowStore } from './hooks/useFlow';
import { getNodeDefinition } from './lib/nodeDefinitions';

type View = 'list' | 'editor';

const nodeTypes = {
  swarm: SwarmNode
};

export default function App() {
  const [view, setView] = useState<View>('list');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [flowName, setFlowName] = useState('');
  const [flowDesc, setFlowDesc] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  const { currentFlow, loadFlow, saveFlow, updateCurrentFlow, clearCurrentFlow, loading } = useFlowStore();

  // Load flow into editor
  useEffect(() => {
    if (currentFlow?.definition) {
      const def = currentFlow.definition;
      // Convert stored nodes to use custom node type
      const loadedNodes = def.nodes.map(n => ({
        ...n,
        type: 'swarm',
        data: { ...n.data }
      }));
      setNodes(loadedNodes);
      setEdges(def.edges);
      setFlowName(currentFlow.name);
      setFlowDesc(currentFlow.description || '');
    }
  }, [currentFlow, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;
    
    const reactFlowBounds = event.currentTarget.getBoundingClientRect();
    const position = {
      x: event.clientX - reactFlowBounds.left - 90,
      y: event.clientY - reactFlowBounds.top - 30
    };
    
    const nodeDef = getNodeDefinition(type);
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: 'swarm',
      position,
      data: { 
        label: type, 
        config: nodeDef?.inputs.reduce((acc, input) => {
          if (input.default !== undefined) acc[input.name] = input.default;
          return acc;
        }, {} as Record<string, unknown>) || {}
      }
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleNodeConfigUpdate = useCallback((nodeId: string, config: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, config } }
          : node
      )
    );
  }, [setNodes]);

  const handleNewFlow = () => {
    clearCurrentFlow();
    setNodes([{
      id: 'manual-1',
      type: 'swarm',
      position: { x: 250, y: 50 },
      data: { label: 'manual', config: {} }
    }]);
    setEdges([]);
    setFlowName('');
    setFlowDesc('');
    setView('editor');
  };

  const handleSelectFlow = async (id: string) => {
    await loadFlow(id);
    setView('editor');
  };

  const handleSave = async () => {
    if (currentFlow) {
      await updateCurrentFlow(nodes, edges);
    } else {
      setShowSaveModal(true);
    }
  };

  const handleSaveNew = async () => {
    if (!flowName.trim()) return;
    await saveFlow(flowName, flowDesc, nodes, edges);
    setShowSaveModal(false);
    setView('list');
  };

  const handleBack = () => {
    clearCurrentFlow();
    setSelectedNode(null);
    setView('list');
  };

  // MiniMap node color
  const nodeColor = useCallback((node: Node) => {
    const def = getNodeDefinition(node.data?.label as string);
    return def?.color || '#6366f1';
  }, []);

  if (view === 'list') {
    return (
      <div className="h-screen bg-slate-900">
        <header className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔄</span>
            <div>
              <h1 className="text-2xl font-bold text-white">Swarm Orchestrator</h1>
              <p className="text-sm text-slate-500">Visual workflow builder for Swarm</p>
            </div>
          </div>
        </header>
        <FlowList onSelectFlow={handleSelectFlow} onNewFlow={handleNewFlow} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="text-slate-400 hover:text-white flex items-center gap-1">
            <span>←</span> Back
          </button>
          <div className="h-6 w-px bg-slate-700" />
          <div>
            <span className="text-white font-medium">{currentFlow?.name || 'New Workflow'}</span>
            {currentFlow?.description && (
              <span className="text-slate-500 text-sm ml-2">— {currentFlow.description}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Saving...' : currentFlow ? '💾 Save' : '💾 Save As...'}
          </button>
          {currentFlow && (
            <button className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              ▶ Run
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette />
        
        <div className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            defaultEdgeOptions={{
              style: { strokeWidth: 2, stroke: '#64748b' },
              type: 'smoothstep'
            }}
          >
            <Controls className="!bg-slate-800 !border-slate-700 !rounded-lg" />
            <MiniMap 
              nodeColor={nodeColor}
              className="!bg-slate-800 !border-slate-700 !rounded-lg"
              maskColor="rgba(0,0,0,0.8)"
            />
            <Background color="#334155" gap={15} />
          </ReactFlow>
        </div>

        {selectedNode && (
          <ConfigPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdate={handleNodeConfigUpdate}
          />
        )}
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-xl w-96 shadow-2xl border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-4">Save Workflow</h2>
            <input
              type="text"
              placeholder="Workflow name"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="w-full p-2.5 mb-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
              autoFocus
            />
            <textarea
              placeholder="Description (optional)"
              value={flowDesc}
              onChange={(e) => setFlowDesc(e.target.value)}
              className="w-full p-2.5 mb-4 bg-slate-700 border border-slate-600 rounded-lg text-white h-20 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNew}
                disabled={!flowName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
