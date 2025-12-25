import { useEffect } from 'react';
import { useFlowStore } from '../../hooks/useFlow';

interface FlowListProps {
  onSelectFlow: (id: string) => void;
  onNewFlow: () => void;
}

export default function FlowList({ onSelectFlow, onNewFlow }: FlowListProps) {
  const { flows, loading, error, fetchFlows, deleteFlow } = useFlowStore();

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Workflows</h2>
        <button
          onClick={onNewFlow}
          className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
        >
          + New Flow
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
      {loading && <div className="text-slate-400 text-sm">Loading...</div>}

      <div className="space-y-2">
        {flows.map((flow) => (
          <div
            key={flow.id}
            className="p-3 bg-slate-800 rounded border border-slate-700 hover:border-indigo-500 cursor-pointer group"
            onClick={() => onSelectFlow(flow.id)}
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-white">{flow.name}</h3>
                {flow.description && (
                  <p className="text-sm text-slate-400 mt-1">{flow.description}</p>
                )}
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                <span className={`text-xs px-2 py-1 rounded ${flow.active ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
                  {flow.active ? 'Active' : 'Draft'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id); }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && flows.length === 0 && (
          <p className="text-slate-500 text-sm">No workflows yet. Create your first one!</p>
        )}
      </div>
    </div>
  );
}
