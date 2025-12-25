import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow, Controls, Background, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import NodePalette from './components/FlowEditor/NodePalette';
import ConfigPanel from './components/FlowEditor/ConfigPanel';
import FlowList from './components/FlowList';
import { useFlowStore } from './hooks/useFlow';

type View = 'list' | 'editor';

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
      setNodes(def.nodes.map(n => ({ ...n, data: { ...n.data } })));
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
    const position = { x: event.clientX - 280, y: event.clientY - 50 };
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: 'default',
      position,
      data: { label: type, config: {} }
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleNewFlow = () => {
    clearCurrentFlow();
    setNodes([{ id: 'trigger-1', type: 'input', position: { x: 250, y: 50 }, data: { label: 'Manual Trigger' } }]);
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
    setView('list');
  };

  if (view === 'list') {
    return (
      <div className="h-screen bg-slate-900">
        <header className="border-b border-slate-700 p-4">
          <h1 className="text-2xl font-bold text-white">🔄 Swarm Orchestrator</h1>
        </header>
        <FlowList onSelectFlow={handleSelectFlow} onNewFlow={handleNewFlow} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="text-slate-400 hover:text-white">← Back</button>
          <span className="text-white font-medium">{currentFlow?.name || 'New Flow'}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : currentFlow ? 'Save' : 'Save As...'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        <NodePalette />
        <div className="flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background />
          </ReactFlow>
        </div>
        {selectedNode && <ConfigPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg w-96">
            <h2 className="text-lg font-bold text-white mb-4">Save Flow</h2>
            <input
              type="text" placeholder="Flow name" value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="w-full p-2 mb-3 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <textarea
              placeholder="Description (optional)" value={flowDesc}
              onChange={(e) => setFlowDesc(e.target.value)}
              className="w-full p-2 mb-4 bg-slate-700 border border-slate-600 rounded text-white h-20"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-slate-400">Cancel</button>
              <button onClick={handleSaveNew} className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
