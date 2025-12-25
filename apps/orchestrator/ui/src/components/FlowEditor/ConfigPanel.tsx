import type { Node } from '@xyflow/react';

interface ConfigPanelProps {
  node: Node;
  onClose: () => void;
}

export default function ConfigPanel({ node, onClose }: ConfigPanelProps) {
  return (
    <div className="w-80 bg-slate-900 border-l border-slate-700 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-white">Configure Node</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Node ID</label>
          <input
            type="text"
            value={node.id}
            disabled
            className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-slate-300"
          />
        </div>
        
        <div>
          <label className="block text-sm text-slate-400 mb-1">Label</label>
          <input
            type="text"
            defaultValue={String(node.data?.label || '')}
            className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        
        <div className="pt-4 border-t border-slate-700">
          <p className="text-sm text-slate-500">
            Node type: <span className="text-indigo-400">{node.type}</span>
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Configuration options will appear here based on node type.
          </p>
        </div>
      </div>
    </div>
  );
}
