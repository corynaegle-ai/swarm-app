/**
 * Project Types - Data models for Project Specification Input Form
 * Location: swarm-dashboard/src/types/project.js
 * 
 * These are JSDoc type definitions for use with JavaScript (no TypeScript required)
 */

/**
 * @typedef {Object} ProjectSpec
 * @property {string} id - UUID v4
 * @property {string} name - Project name (3-100 chars)
 * @property {string} description - Natural language specification
 * @property {SpecFile} [specFile] - Optional uploaded markdown file
 * @property {TechStackOption[]} [techStack] - Technology preferences
 * @property {'low' | 'medium' | 'high'} priority - Project priority
 * @property {TargetRepo} [targetRepo] - GitHub repo reference
 * @property {string} [constraints] - Budget, timeline, etc.
 * @property {Date} createdAt - Creation timestamp
 * @property {string} createdBy - User ID from auth
 * @property {ProjectStatus} status - Current project status
 */

/**
 * @typedef {Object} SpecFile
 * @property {string} filename - Original filename
 * @property {string} content - Raw markdown content
 * @property {ParsedSections} [parsedSections] - Extracted sections
 */

/**
 * @typedef {Object} ParsedSections
 * @property {string} [goals] - Project goals
 * @property {string[]} [features] - Feature list
 * @property {string} [constraints] - Constraints section
 * @property {string} [technicalRequirements] - Tech requirements
 * @property {string} [outOfScope] - Out of scope items
 */

/**
 * @typedef {'draft' | 'submitted' | 'processing' | 'tickets_ready' | 'failed'} ProjectStatus
 */

/**
 * @typedef {Object} TechStackOption
 * @property {'frontend' | 'backend' | 'database' | 'infrastructure' | 'other'} category
 * @property {string} technology - Technology name
 */

/**
 * @typedef {Object} TargetRepo
 * @property {'new' | 'existing'} type - New or existing repo
 * @property {string} [repoUrl] - For existing repos
 * @property {string} [suggestedName] - For new repos
 */

/**
 * @typedef {Object} SubmitProjectRequest
 * @property {string} name - Project name
 * @property {string} description - Natural language spec
 * @property {SpecFile} [specFile] - Uploaded file
 * @property {TechStackOption[]} [techStack] - Tech preferences
 * @property {'low' | 'medium' | 'high'} priority - Priority level
 * @property {TargetRepo} [targetRepo] - Repo config
 * @property {string} [constraints] - Constraints text
 */

/**
 * @typedef {Object} SubmitProjectResponse
 * @property {string} projectId - Created project UUID
 * @property {'submitted'} status - Always 'submitted' on success
 * @property {string} designAgentJobId - Job tracking ID
 * @property {string} message - Success message
 * @property {number} [estimatedTickets] - Estimated ticket count
 * @property {Object} links - Related API links
 * @property {string} links.status - Status endpoint
 * @property {string} links.tickets - Tickets endpoint
 */

/**
 * @typedef {Object} ProjectStatusResponse
 * @property {string} projectId - Project UUID
 * @property {ProjectStatus} status - Current status
 * @property {number} [phase] - Pipeline phase (1-3)
 * @property {string} [phaseDescription] - Phase description
 * @property {Object} [progress] - Progress details
 * @property {number} progress.totalPhases - Total phases (3)
 * @property {number} progress.currentPhase - Current phase
 * @property {number} progress.ticketsGenerated - Tickets created
 * @property {number} [progress.estimatedRemaining] - Estimated remaining
 * @property {string} startedAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

// Default tech stack options for the selector
export const DEFAULT_TECH_STACK_OPTIONS = {
  frontend: [
    'React', 'Vue.js', 'Angular', 'Svelte', 'Next.js', 
    'Remix', 'Astro', 'HTML/CSS', 'Tailwind CSS'
  ],
  backend: [
    'Node.js', 'Express', 'Fastify', 'Python', 'Django',
    'FastAPI', 'Go', 'Rust', 'Java', 'Spring Boot', '.NET'
  ],
  database: [
    'PostgreSQL', 'MySQL', 'SQLite', 'MongoDB', 'Redis',
    'Supabase', 'Firebase', 'DynamoDB', 'Prisma'
  ],
  infrastructure: [
    'AWS', 'GCP', 'Azure', 'Vercel', 'Netlify',
    'Docker', 'Kubernetes', 'Terraform', 'GitHub Actions'
  ],
  other: [
    'GraphQL', 'REST API', 'WebSocket', 'OAuth', 
    'Stripe', 'SendGrid', 'Twilio', 'OpenAI'
  ]
};

// Priority options with colors
export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: '#22c55e' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'high', label: 'High', color: '#ef4444' }
];

// Status display config
export const STATUS_CONFIG = {
  draft: { label: 'Draft', color: '#6b7280', icon: '📝' },
  submitted: { label: 'Submitted', color: '#3b82f6', icon: '📤' },
  processing: { label: 'Processing', color: '#f59e0b', icon: '⚙️' },
  tickets_ready: { label: 'Ready', color: '#22c55e', icon: '✅' },
  failed: { label: 'Failed', color: '#ef4444', icon: '❌' }
};

/**
 * Validate project spec before submission
 * @param {SubmitProjectRequest} spec 
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validateProjectSpec(spec) {
  const errors = {};
  
  if (!spec.name || spec.name.trim().length < 3) {
    errors.name = 'Project name must be at least 3 characters';
  }
  if (spec.name && spec.name.length > 100) {
    errors.name = 'Project name must be under 100 characters';
  }
  if (!spec.description || spec.description.trim().length < 20) {
    errors.description = 'Description must be at least 20 characters';
  }
  if (!['low', 'medium', 'high'].includes(spec.priority)) {
    errors.priority = 'Invalid priority value';
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

export default {
  DEFAULT_TECH_STACK_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_CONFIG,
  validateProjectSpec
};
