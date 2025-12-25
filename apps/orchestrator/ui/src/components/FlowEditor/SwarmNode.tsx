import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getNodeDefinition } from '../../lib/nodeDefinitions';

interface SwarmNodeData {
  label: string;
  config: Record<string, unknown>;
}

function SwarmNode({ data, selected }: NodeProps<SwarmNodeData>) {
  const nodeDef = getNodeDefinition(data.label);
  const color = nodeDef?.color || '#6366f1';
  const icon = nodeDef?.icon || '📦';
  const hasInputs = nodeDef?.inputs && nodeDef.inputs.length > 0;
  const hasOutputs = nodeDef?.outputs && nodeDef.outputs.length > 0;

  return (
    <div
      className={`min-w-[180px] rounded-lg shadow-lg transition-all ${
        selected ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900' : ''
      }`}
      style={{ borderTop: `3px solid ${color}` }}
    >
      {/* Input Handle */}
      {data.label !== 'manual' && data.label !== 'webhook' && data.label !== 'schedule' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-slate-400 !border-2 !border-slate-600"
        />
      )}

      {/* Header */}
      <div 
        className="px-3 py-2 rounded-t-lg flex items-center gap-2"
        style={{ backgroundColor: color + '20' }}
      >
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-semibold text-white truncate">
          {nodeDef?.label || data.label}
        </span>
      </div>

      {/* Body */}
      <div className="bg-slate-800 px-3 py-2 rounded-b-lg">
        {/* Show configured values preview */}
        {hasInputs && Object.keys(data.config || {}).length > 0 ? (
          <div className="space-y-1">
            {Object.entries(data.config || {}).slice(0, 2).map(([key, value]) => (
              <div key={key} className="text-xs">
                <span className="text-slate-500">{key}: </span>
                <span className="text-slate-300 truncate">
                  {typeof value === 'string' ? (value.length > 20 ? value.slice(0, 20) + '...' : value) : JSON.stringify(value)}
                </span>
              </div>
            ))}
            {Object.keys(data.config || {}).length > 2 && (
              <div className="text-xs text-slate-500">
                +{Object.keys(data.config).length - 2} more
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic">
            {hasInputs ? 'Click to configure' : 'No configuration needed'}
          </div>
        )}
      </div>

      {/* Output Handle(s) */}
      {hasOutputs && (
        <>
          {nodeDef?.type === 'branch' ? (
            <>
              <Handle
                type="source"
                position={Position.Right}
                id="true"
                className="!w-3 !h-3 !bg-green-400 !border-2 !border-green-600"
                style={{ top: '40%' }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id="false"
                className="!w-3 !h-3 !bg-red-400 !border-2 !border-red-600"
                style={{ top: '60%' }}
              />
            </>
          ) : (
            <Handle
              type="source"
              position={Position.Right}
              className="!w-3 !h-3 !bg-slate-400 !border-2 !border-slate-600"
            />
          )}
        </>
      )}
    </div>
  );
}

export default memo(SwarmNode);
