import { useState } from 'react';
import { nodesByCategory, type NodeDefinition } from '../../lib/nodeDefinitions';

const categoryLabels: Record<string, { label: string; icon: string }> = {
  triggers: { label: 'Triggers', icon: '⚡' },
  swarm: { label: 'Swarm', icon: '🐝' },
  integrations: { label: 'Integrations', icon: '🔌' },
  logic: { label: 'Logic', icon: '⚙️' },
  human: { label: 'Human', icon: '👤' }
};

const categoryOrder = ['triggers', 'swarm', 'integrations', 'logic', 'human'];

export default function NodePalette() {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categoryOrder)
  );

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const onDragStart = (event: React.DragEvent, node: NodeDefinition) => {
    event.dataTransfer.setData('application/reactflow', node.type);
    event.dataTransfer.setData('application/node-label', node.label);
    event.dataTransfer.effectAllowed = 'move';
  };

  // Filter nodes by search
  const filteredCategories = categoryOrder.map(cat => ({
    key: cat,
    ...categoryLabels[cat],
    nodes: (nodesByCategory[cat] || []).filter(node =>
      search === '' ||
      node.label.toLowerCase().includes(search.toLowerCase()) ||
      node.description.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.nodes.length > 0);

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span>📦</span> Nodes
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredCategories.map((category) => (
          <div key={category.key} className="mb-2">
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category.key)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-slate-400 hover:text-white transition"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span>{category.icon}</span>
                {category.label}
                <span className="text-xs text-slate-500">({category.nodes.length})</span>
              </span>
              <span className="text-xs">{expandedCategories.has(category.key) ? '▼' : '▶'}</span>
            </button>

            {/* Nodes */}
            {expandedCategories.has(category.key) && (
              <div className="mt-1 space-y-1">
                {category.nodes.map((node) => (
                  <div
                    key={node.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, node)}
                    className="group flex items-start gap-3 p-2.5 mx-1 rounded-lg cursor-grab bg-slate-800/50 hover:bg-slate-800 border border-transparent hover:border-slate-600 transition-all"
                    style={{ borderLeftColor: node.color, borderLeftWidth: '3px' }}
                  >
                    <span className="text-xl mt-0.5">{node.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white">{node.label}</div>
                      <div className="text-xs text-slate-500 truncate">{node.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredCategories.length === 0 && (
          <div className="text-center text-slate-500 py-8">
            No nodes match "{search}"
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
        Drag nodes onto the canvas
      </div>
    </div>
  );
}
