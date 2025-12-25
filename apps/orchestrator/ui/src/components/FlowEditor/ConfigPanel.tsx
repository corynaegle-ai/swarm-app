import { useState, useEffect } from 'react';
import type { Node } from '@xyflow/react';
import { getNodeDefinition, type NodeInput } from '../../lib/nodeDefinitions';

interface ConfigPanelProps {
  node: Node;
  onClose: () => void;
  onUpdate: (nodeId: string, config: Record<string, unknown>) => void;
}

export default function ConfigPanel({ node, onClose, onUpdate }: ConfigPanelProps) {
  const nodeDef = getNodeDefinition(node.data?.label as string);
  const [config, setConfig] = useState<Record<string, unknown>>(
    (node.data?.config as Record<string, unknown>) || {}
  );

  useEffect(() => {
    setConfig((node.data?.config as Record<string, unknown>) || {});
  }, [node.id, node.data?.config]);

  const handleChange = (name: string, value: unknown) => {
    const newConfig = { ...config, [name]: value };
    setConfig(newConfig);
    onUpdate(node.id, newConfig);
  };

  const renderInput = (input: NodeInput) => {
    const value = config[input.name] ?? input.default ?? '';

    switch (input.type) {
      case 'string':
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handleChange(input.name, e.target.value)}
            placeholder={input.placeholder}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={Number(value) || ''}
            onChange={(e) => handleChange(input.name, Number(e.target.value))}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleChange(input.name, e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-300">Enabled</span>
          </label>
        );

      case 'select':
        return (
          <select
            value={String(value)}
            onChange={(e) => handleChange(input.name, e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
          >
            {input.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'json':
        return (
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                handleChange(input.name, JSON.parse(e.target.value));
              } catch {
                handleChange(input.name, e.target.value);
              }
            }}
            rows={4}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
            placeholder="{}"
          />
        );

      case 'code':
        return (
          <textarea
            value={String(value)}
            onChange={(e) => handleChange(input.name, e.target.value)}
            rows={6}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
            placeholder={input.placeholder}
          />
        );

      default:
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handleChange(input.name, e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
          />
        );
    }
  };

  if (!nodeDef) {
    return (
      <div className="w-80 bg-slate-900 border-l border-slate-700 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white">Unknown Node</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <p className="text-slate-500">No configuration available</p>
      </div>
    );
  }

  return (
    <div className="w-96 bg-slate-900 border-l border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{nodeDef.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{nodeDef.label}</h3>
              <p className="text-xs text-slate-500">{nodeDef.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
      </div>

      {/* Inputs */}
      <div className="flex-1 overflow-y-auto p-4">
        {nodeDef.inputs.length === 0 ? (
          <p className="text-slate-500 text-sm">This node has no configurable inputs.</p>
        ) : (
          <div className="space-y-4">
            {nodeDef.inputs.map((input) => (
              <div key={input.name}>
                <label className="block mb-1.5">
                  <span className="text-sm font-medium text-slate-300">
                    {input.label}
                    {input.required && <span className="text-red-400 ml-1">*</span>}
                  </span>
                  {input.description && (
                    <span className="block text-xs text-slate-500 mt-0.5">{input.description}</span>
                  )}
                </label>
                {renderInput(input)}
              </div>
            ))}
          </div>
        )}

        {/* Outputs Preview */}
        {nodeDef.outputs.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold text-slate-400 mb-2">Outputs</h4>
            <div className="space-y-1">
              {nodeDef.outputs.map((output) => (
                <div key={output.name} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{output.label}</span>
                  <code className="text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                    {`{{${node.data?.label}.${output.name}}}`}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500">
          Use <code className="bg-slate-800 px-1 rounded">{`{{nodeName.outputName}}`}</code> to reference outputs from other nodes.
        </p>
      </div>
    </div>
  );
}
