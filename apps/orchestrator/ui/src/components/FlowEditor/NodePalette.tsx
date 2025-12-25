const nodeCategories = [
  {
    name: 'Triggers',
    nodes: [
      { type: 'webhook', label: 'Webhook', icon: '🌐' },
      { type: 'schedule', label: 'Schedule', icon: '⏰' },
      { type: 'manual', label: 'Manual', icon: '▶️' }
    ]
  },
  {
    name: 'Swarm',
    nodes: [
      { type: 'create-ticket', label: 'Create Ticket', icon: '🎫' },
      { type: 'spawn-vm', label: 'Spawn VM', icon: '🖥️' },
      { type: 'wait-for-agent', label: 'Wait for Agent', icon: '⏳' },
      { type: 'approve-ticket', label: 'Approve Ticket', icon: '✅' }
    ]
  },
  {
    name: 'Integrations',
    nodes: [
      { type: 'http-request', label: 'HTTP Request', icon: '🔗' },
      { type: 'slack-message', label: 'Slack Message', icon: '💬' }
    ]
  },
  {
    name: 'Logic',
    nodes: [
      { type: 'branch', label: 'Branch (If/Else)', icon: '🔀' },
      { type: 'delay', label: 'Delay', icon: '⏱️' },
      { type: 'code', label: 'Code (JS)', icon: '📝' }
    ]
  },
  {
    name: 'Human',
    nodes: [
      { type: 'approval-gate', label: 'Approval Gate', icon: '👤' }
    ]
  }
];

export default function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-700 p-4 overflow-y-auto">
      <h2 className="text-lg font-bold text-white mb-4">📦 Nodes</h2>
      {nodeCategories.map((category) => (
        <div key={category.name} className="mb-4">
          <h3 className="text-sm font-semibold text-slate-400 mb-2">{category.name}</h3>
          <div className="space-y-2">
            {category.nodes.map((node) => (
              <div
                key={node.type}
                draggable
                onDragStart={(e) => onDragStart(e, node.type)}
                className="flex items-center gap-2 p-2 bg-slate-800 rounded cursor-grab hover:bg-slate-700 transition"
              >
                <span>{node.icon}</span>
                <span className="text-sm text-white">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
