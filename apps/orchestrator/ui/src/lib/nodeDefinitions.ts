// Node definitions with full schema for n8n-like configuration
export interface NodeInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'code';
  label: string;
  description?: string;
  required: boolean;
  default?: unknown;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

export interface NodeOutput {
  name: string;
  type: string;
  label: string;
}

export interface NodeDefinition {
  type: string;
  label: string;
  description: string;
  category: 'triggers' | 'swarm' | 'integrations' | 'logic' | 'human';
  icon: string;
  color: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
}

export const nodeDefinitions: NodeDefinition[] = [
  // === TRIGGERS ===
  {
    type: 'webhook',
    label: 'Webhook',
    description: 'Trigger workflow via HTTP POST request',
    category: 'triggers',
    icon: '🌐',
    color: '#10b981',
    inputs: [
      { name: 'path', type: 'string', label: 'Path', required: false, default: '/webhook', placeholder: '/my-webhook' }
    ],
    outputs: [
      { name: 'body', type: 'json', label: 'Request Body' },
      { name: 'headers', type: 'json', label: 'Headers' }
    ]
  },
  {
    type: 'schedule',
    label: 'Schedule',
    description: 'Run workflow on a schedule (cron)',
    category: 'triggers',
    icon: '⏰',
    color: '#10b981',
    inputs: [
      { name: 'cron', type: 'string', label: 'Cron Expression', required: true, default: '0 * * * *', placeholder: '0 9 * * 1-5' },
      { name: 'timezone', type: 'string', label: 'Timezone', required: false, default: 'UTC' }
    ],
    outputs: [
      { name: 'timestamp', type: 'string', label: 'Trigger Time' }
    ]
  },
  {
    type: 'manual',
    label: 'Manual Trigger',
    description: 'Start workflow manually from UI',
    category: 'triggers',
    icon: '▶️',
    color: '#10b981',
    inputs: [],
    outputs: [
      { name: 'timestamp', type: 'string', label: 'Trigger Time' }
    ]
  },

  // === SWARM ===
  {
    type: 'create-project',
    label: 'Create Project',
    description: 'Create a new Swarm project',
    category: 'swarm',
    icon: '📁',
    color: '#6366f1',
    inputs: [
      { name: 'name', type: 'string', label: 'Project Name', required: true, placeholder: 'My Project' },
      { name: 'description', type: 'string', label: 'Description', required: false },
      { name: 'repository', type: 'string', label: 'Repository URL', required: false, placeholder: 'https://github.com/...' }
    ],
    outputs: [
      { name: 'projectId', type: 'string', label: 'Project ID' },
      { name: 'status', type: 'string', label: 'Status' }
    ]
  },
  {
    type: 'create-ticket',
    label: 'Create Ticket',
    description: 'Create a ticket for agent execution',
    category: 'swarm',
    icon: '🎫',
    color: '#6366f1',
    inputs: [
      { name: 'title', type: 'string', label: 'Title', required: true, placeholder: 'Implement feature X' },
      { name: 'description', type: 'string', label: 'Description', required: true },
      { name: 'acceptance_criteria', type: 'string', label: 'Acceptance Criteria', required: false },
      { name: 'priority', type: 'select', label: 'Priority', required: false, default: 'medium',
        options: [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
          { label: 'Critical', value: 'critical' }
        ]
      },
      { name: 'project_id', type: 'string', label: 'Project ID', required: false }
    ],
    outputs: [
      { name: 'ticketId', type: 'string', label: 'Ticket ID' },
      { name: 'status', type: 'string', label: 'Status' }
    ]
  },
  {
    type: 'wait-for-ticket',
    label: 'Wait for Ticket',
    description: 'Wait until ticket is completed or failed',
    category: 'swarm',
    icon: '⏳',
    color: '#6366f1',
    inputs: [
      { name: 'ticketId', type: 'string', label: 'Ticket ID', required: true, placeholder: '{{create-ticket.ticketId}}' },
      { name: 'timeout', type: 'number', label: 'Timeout (seconds)', required: false, default: 1800 }
    ],
    outputs: [
      { name: 'status', type: 'string', label: 'Final Status' },
      { name: 'prUrl', type: 'string', label: 'PR URL' },
      { name: 'branch', type: 'string', label: 'Branch' }
    ]
  },
  {
    type: 'list-agents',
    label: 'List Agents',
    description: 'Get all active Swarm agents',
    category: 'swarm',
    icon: '🤖',
    color: '#6366f1',
    inputs: [],
    outputs: [
      { name: 'agents', type: 'json', label: 'Agent List' },
      { name: 'count', type: 'number', label: 'Count' }
    ]
  },
  {
    type: 'spawn-agents',
    label: 'Spawn Agents',
    description: 'Spawn N agent VMs',
    category: 'swarm',
    icon: '🚀',
    color: '#6366f1',
    inputs: [
      { name: 'count', type: 'number', label: 'Number of Agents', required: true, default: 1 },
      { name: 'project_id', type: 'string', label: 'Project ID (optional)', required: false }
    ],
    outputs: [
      { name: 'spawned', type: 'number', label: 'Spawned Count' },
      { name: 'vmIds', type: 'json', label: 'VM IDs' }
    ]
  },

  // === INTEGRATIONS ===
  {
    type: 'http-request',
    label: 'HTTP Request',
    description: 'Make HTTP request to any API',
    category: 'integrations',
    icon: '🔗',
    color: '#f59e0b',
    inputs: [
      { name: 'url', type: 'string', label: 'URL', required: true, placeholder: 'https://api.example.com/...' },
      { name: 'method', type: 'select', label: 'Method', required: true, default: 'GET',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'PATCH', value: 'PATCH' },
          { label: 'DELETE', value: 'DELETE' }
        ]
      },
      { name: 'headers', type: 'json', label: 'Headers', required: false, default: {} },
      { name: 'body', type: 'json', label: 'Body', required: false }
    ],
    outputs: [
      { name: 'status', type: 'number', label: 'Status Code' },
      { name: 'data', type: 'json', label: 'Response Data' }
    ]
  },
  {
    type: 'slack-message',
    label: 'Slack Message',
    description: 'Send message to Slack channel',
    category: 'integrations',
    icon: '💬',
    color: '#f59e0b',
    inputs: [
      { name: 'channel', type: 'string', label: 'Channel', required: true, placeholder: '#general' },
      { name: 'message', type: 'string', label: 'Message', required: true },
      { name: 'webhook_url', type: 'string', label: 'Webhook URL', required: true }
    ],
    outputs: [
      { name: 'success', type: 'boolean', label: 'Success' }
    ]
  },
  {
    type: 'github-pr',
    label: 'GitHub PR',
    description: 'Create or manage GitHub Pull Request',
    category: 'integrations',
    icon: '🐙',
    color: '#f59e0b',
    inputs: [
      { name: 'action', type: 'select', label: 'Action', required: true, default: 'create',
        options: [
          { label: 'Create PR', value: 'create' },
          { label: 'Merge PR', value: 'merge' },
          { label: 'Get PR Status', value: 'status' }
        ]
      },
      { name: 'repo', type: 'string', label: 'Repository', required: true, placeholder: 'owner/repo' },
      { name: 'branch', type: 'string', label: 'Branch', required: false },
      { name: 'pr_number', type: 'number', label: 'PR Number', required: false }
    ],
    outputs: [
      { name: 'prUrl', type: 'string', label: 'PR URL' },
      { name: 'status', type: 'string', label: 'Status' }
    ]
  },

  // === LOGIC ===
  {
    type: 'branch',
    label: 'Branch (If/Else)',
    description: 'Conditional branching based on expression',
    category: 'logic',
    icon: '🔀',
    color: '#8b5cf6',
    inputs: [
      { name: 'condition', type: 'code', label: 'Condition', required: true, placeholder: '{{status}} === "completed"' }
    ],
    outputs: [
      { name: 'true', type: 'boolean', label: 'True Branch' },
      { name: 'false', type: 'boolean', label: 'False Branch' }
    ]
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait for specified duration',
    category: 'logic',
    icon: '⏱️',
    color: '#8b5cf6',
    inputs: [
      { name: 'seconds', type: 'number', label: 'Seconds', required: true, default: 5 }
    ],
    outputs: [
      { name: 'waited', type: 'number', label: 'Seconds Waited' }
    ]
  },
  {
    type: 'code',
    label: 'Code (JavaScript)',
    description: 'Run custom JavaScript code',
    category: 'logic',
    icon: '📝',
    color: '#8b5cf6',
    inputs: [
      { name: 'code', type: 'code', label: 'JavaScript Code', required: true, 
        placeholder: '// Access previous outputs via $input\nreturn { result: $input.data.length }' }
    ],
    outputs: [
      { name: 'result', type: 'json', label: 'Result' }
    ]
  },
  {
    type: 'loop',
    label: 'Loop',
    description: 'Iterate over array items',
    category: 'logic',
    icon: '🔄',
    color: '#8b5cf6',
    inputs: [
      { name: 'items', type: 'string', label: 'Items Expression', required: true, placeholder: '{{http-request.data.items}}' }
    ],
    outputs: [
      { name: 'item', type: 'json', label: 'Current Item' },
      { name: 'index', type: 'number', label: 'Index' }
    ]
  },

  // === HUMAN ===
  {
    type: 'approval-gate',
    label: 'Approval Gate',
    description: 'Pause for human approval',
    category: 'human',
    icon: '✋',
    color: '#ec4899',
    inputs: [
      { name: 'title', type: 'string', label: 'Approval Title', required: true },
      { name: 'description', type: 'string', label: 'Description', required: false },
      { name: 'approvers', type: 'string', label: 'Approvers (emails)', required: false, placeholder: 'user@example.com' }
    ],
    outputs: [
      { name: 'approved', type: 'boolean', label: 'Was Approved' },
      { name: 'approvedBy', type: 'string', label: 'Approved By' },
      { name: 'comments', type: 'string', label: 'Comments' }
    ]
  },
  {
    type: 'notify',
    label: 'Notify User',
    description: 'Send notification to user',
    category: 'human',
    icon: '🔔',
    color: '#ec4899',
    inputs: [
      { name: 'message', type: 'string', label: 'Message', required: true },
      { name: 'channel', type: 'select', label: 'Channel', required: true, default: 'email',
        options: [
          { label: 'Email', value: 'email' },
          { label: 'Slack', value: 'slack' },
          { label: 'In-App', value: 'app' }
        ]
      },
      { name: 'recipient', type: 'string', label: 'Recipient', required: true }
    ],
    outputs: [
      { name: 'sent', type: 'boolean', label: 'Was Sent' }
    ]
  }
];

export const nodesByCategory = nodeDefinitions.reduce((acc, node) => {
  if (!acc[node.category]) acc[node.category] = [];
  acc[node.category].push(node);
  return acc;
}, {} as Record<string, NodeDefinition[]>);

export const getNodeDefinition = (type: string): NodeDefinition | undefined => {
  return nodeDefinitions.find(n => n.type === type);
};
