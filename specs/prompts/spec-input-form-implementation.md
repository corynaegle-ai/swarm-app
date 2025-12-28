# Project Specification Input Form - Implementation Spec

**Document ID:** SPEC-INPUT-FORM-001  
**Created:** 2024-12-11  
**Status:** In Progress  
**Location:** Swarm Dashboard (`/projects/new` route)

---

## 1. Overview

### Purpose
The Project Specification Input Form is the **entry point** for the Design Agent Pipeline. It captures user requirements via natural language or file upload, then triggers the 3-phase ticket generation system that breaks project specs into actionable development tickets.

### User Flow
```
User lands on /projects/new
        ↓
Fills form OR uploads spec.md
        ↓
Clicks "Start Design Agent"
        ↓
API receives ProjectSpec
        ↓
Design Agent Pipeline triggered
        ↓
User sees progress → Tickets generated
```

---

## 2. Data Model

### 2.1 ProjectSpec Interface

```typescript
// Location: swarm-dashboard/src/types/project.ts

export interface ProjectSpec {
  id: string;                    // UUID v4
  name: string;                  // Required: 3-100 chars
  description: string;           // Required: Natural language spec
  specFile?: SpecFile;           // Optional: Uploaded markdown file
  techStack?: TechStackOption[]; // Optional: Technology preferences
  priority: Priority;            // Required: low | medium | high
  targetRepo?: TargetRepo;       // Optional: GitHub repo reference
  constraints?: string;          // Optional: Budget, timeline, etc.
  createdAt: Date;
  createdBy: string;             // User ID from auth
  status: ProjectStatus;
}

export interface SpecFile {
  filename: string;
  content: string;               // Raw markdown content
  parsedSections?: ParsedSections;
}

export interface ParsedSections {
  goals?: string;
  features?: string[];
  constraints?: string;
  technicalRequirements?: string;
  outOfScope?: string;
}

export type Priority = 'low' | 'medium' | 'high';

export type ProjectStatus = 
  | 'draft'           // Form saved but not submitted
  | 'submitted'       // Submitted, waiting for pipeline
  | 'processing'      // Design Agent running
  | 'tickets_ready'   // Tickets generated successfully
  | 'failed';         // Pipeline failed

export interface TechStackOption {
  category: 'frontend' | 'backend' | 'database' | 'infrastructure' | 'other';
  technology: string;
}

export interface TargetRepo {
  type: 'new' | 'existing';
  repoUrl?: string;              // For existing repos
  suggestedName?: string;        // For new repos
}
```

### 2.2 Database Schema

```sql
-- Location: swarm-tickets/src/db/migrations/003_projects.sql

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  spec_file_content TEXT,
  spec_file_name TEXT,
  tech_stack TEXT,               -- JSON array
  priority TEXT NOT NULL DEFAULT 'medium',
  target_repo_type TEXT,
  target_repo_url TEXT,
  constraints TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  design_agent_job_id TEXT,
  error_message TEXT
);

CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_by ON projects(created_by);
```

---

## 3. UI Components

### 3.1 Component Hierarchy

```
NewProjectPage.tsx
├── ProjectNameInput.tsx
├── SpecInputTabs.tsx
│   ├── NaturalLanguageTab.tsx
│   │   └── SpecDescriptionArea.tsx
│   └── FileUploadTab.tsx
│       └── FileUploadZone.tsx
├── TechStackSelector.tsx (optional section)
├── PriorityPicker.tsx
├── TargetRepoSection.tsx (optional section)
├── ConstraintsInput.tsx (optional section)
└── SubmitSection.tsx
    ├── SubmitButton.tsx
    └── StatusIndicator.tsx
```

### 3.2 Component Specifications

#### ProjectNameInput
- Text input with real-time validation
- Length: 3-100 characters
- No special characters except hyphens/underscores
- Auto-generates slug preview

#### SpecDescriptionArea
- Large textarea (min 6 rows, expandable)
- Character count indicator
- Markdown preview toggle
- Placeholder with example spec format

#### FileUploadZone
- Drag-and-drop area
- Accepts: `.md`, `.txt`, `.markdown`
- Max size: 1MB
- Shows file preview after upload
- Parse button to extract sections

#### TechStackSelector
- Multi-select chips grouped by category
- Common options pre-defined
- Custom entry allowed
- Categories: Frontend, Backend, Database, Infrastructure, Other

#### PriorityPicker
- Radio button group: Low, Medium, High
- Default: Medium
- Visual indicators (color-coded)

#### SubmitButton
- Primary action button
- Loading state with spinner
- Disabled when form invalid
- Text: "Start Design Agent"

---

## 4. API Endpoints

### 4.1 Submit Project Spec

```
POST /api/projects/submit-spec
Content-Type: application/json
Authorization: Bearer <token>

Request Body:
{
  "name": "My New Project",
  "description": "Build a task management app with...",
  "specFile": {
    "filename": "spec.md",
    "content": "# Project Spec\n\n## Goals..."
  },
  "techStack": [
    {"category": "frontend", "technology": "React"},
    {"category": "backend", "technology": "Node.js"}
  ],
  "priority": "high",
  "targetRepo": {
    "type": "new",
    "suggestedName": "task-manager"
  },
  "constraints": "Complete within 2 weeks"
}

Response (201 Created):
{
  "projectId": "uuid-here",
  "status": "submitted",
  "designAgentJobId": "job-uuid",
  "message": "Project submitted. Design Agent pipeline started.",
  "estimatedTickets": 15,
  "links": {
    "status": "/api/projects/uuid-here/status",
    "tickets": "/api/projects/uuid-here/tickets"
  }
}

Error Response (400 Bad Request):
{
  "error": "validation_error",
  "message": "Project name is required",
  "fields": {
    "name": "Required field missing"
  }
}
```

### 4.2 Get Project Status

```
GET /api/projects/:projectId/status
Authorization: Bearer <token>

Response:
{
  "projectId": "uuid",
  "status": "processing",
  "phase": 2,
  "phaseDescription": "Expanding ticket details",
  "progress": {
    "totalPhases": 3,
    "currentPhase": 2,
    "ticketsGenerated": 8,
    "estimatedRemaining": 7
  },
  "startedAt": "2024-12-11T10:00:00Z",
  "updatedAt": "2024-12-11T10:02:30Z"
}
```

### 4.3 Get Project Tickets

```
GET /api/projects/:projectId/tickets
Authorization: Bearer <token>

Response:
{
  "projectId": "uuid",
  "tickets": [
    {
      "id": "ticket-uuid",
      "title": "Set up React project structure",
      "type": "task",
      "priority": "high",
      "dependencies": []
    },
    ...
  ],
  "totalCount": 15,
  "dagVisualization": "/api/projects/uuid/dag"
}
```

---

## 5. File Parsing Logic

### 5.1 Markdown Section Extraction

```typescript
// Location: swarm-dashboard/src/utils/specParser.ts

export function parseSpecFile(content: string): ParsedSections {
  const sections: ParsedSections = {};
  
  // Extract ## Goals section
  const goalsMatch = content.match(/##\s*Goals?\s*\n([\s\S]*?)(?=##|$)/i);
  if (goalsMatch) sections.goals = goalsMatch[1].trim();
  
  // Extract ## Features section (as bullet list)
  const featuresMatch = content.match(/##\s*Features?\s*\n([\s\S]*?)(?=##|$)/i);
  if (featuresMatch) {
    sections.features = extractBulletPoints(featuresMatch[1]);
  }
  
  // Extract ## Constraints section
  const constraintsMatch = content.match(/##\s*Constraints?\s*\n([\s\S]*?)(?=##|$)/i);
  if (constraintsMatch) sections.constraints = constraintsMatch[1].trim();
  
  // Extract ## Technical Requirements section
  const techMatch = content.match(/##\s*Technical\s*Requirements?\s*\n([\s\S]*?)(?=##|$)/i);
  if (techMatch) sections.technicalRequirements = techMatch[1].trim();
  
  // Extract ## Out of Scope section
  const oosMatch = content.match(/##\s*Out\s*of\s*Scope\s*\n([\s\S]*?)(?=##|$)/i);
  if (oosMatch) sections.outOfScope = oosMatch[1].trim();
  
  return sections;
}

function extractBulletPoints(text: string): string[] {
  return text
    .split('\n')
    .filter(line => line.match(/^[\s]*[-*]\s/))
    .map(line => line.replace(/^[\s]*[-*]\s/, '').trim());
}
```

### 5.2 Spec Merge Strategy

When both natural language AND file are provided:
1. File sections take precedence for structured data
2. Natural language description is appended as "Additional Context"
3. Validation ensures no conflicts

---

## 6. Design Agent Pipeline Integration

### 6.1 Trigger Mechanism

```typescript
// Location: swarm-tickets/src/services/projectService.ts

export async function submitProject(spec: ProjectSpec): Promise<SubmitResult> {
  // 1. Validate spec
  const validation = validateProjectSpec(spec);
  if (!validation.valid) {
    throw new ValidationError(validation.errors);
  }
  
  // 2. Store in database
  const projectId = await db.projects.create(spec);
  
  // 3. Create Design Agent job
  const jobId = await designAgentQueue.enqueue({
    type: 'design-agent-pipeline',
    projectId,
    spec: {
      name: spec.name,
      description: mergeSpecContent(spec),
      techStack: spec.techStack,
      constraints: spec.constraints
    }
  });
  
  // 4. Update project with job reference
  await db.projects.update(projectId, {
    status: 'submitted',
    design_agent_job_id: jobId
  });
  
  return { projectId, jobId, status: 'submitted' };
}
```

### 6.2 Pipeline Input Format

The Design Agent expects:
```typescript
interface DesignAgentInput {
  projectId: string;
  spec: {
    name: string;
    description: string;      // Merged natural language + file
    techStack?: string[];
    constraints?: string;
  };
  options?: {
    maxTickets?: number;      // Default: 50
    tokenBudget?: number;     // Default: 100000
    skipValidation?: boolean; // Default: false
  };
}
```

---

## 7. Build Checklist

### Phase 1: Data Model & Types ✅ IN PROGRESS
- [ ] Create `project.ts` types file
- [ ] Create database migration for projects table
- [ ] Run migration on ticket-api database

### Phase 2: API Endpoints
- [ ] POST /api/projects/submit-spec
- [ ] GET /api/projects/:id/status
- [ ] GET /api/projects/:id/tickets
- [ ] Add validation middleware
- [ ] Add auth middleware integration

### Phase 3: UI Components
- [ ] Create NewProjectPage.tsx
- [ ] Create ProjectNameInput.tsx
- [ ] Create SpecInputTabs.tsx
- [ ] Create SpecDescriptionArea.tsx
- [ ] Create FileUploadZone.tsx
- [ ] Create TechStackSelector.tsx
- [ ] Create PriorityPicker.tsx
- [ ] Create SubmitButton.tsx
- [ ] Create StatusIndicator.tsx

### Phase 4: File Parsing
- [ ] Create specParser.ts utility
- [ ] Implement section extraction
- [ ] Add merge logic for dual input
- [ ] Add validation for uploaded files

### Phase 5: Pipeline Integration
- [ ] Wire submit endpoint to Design Agent
- [ ] Implement job queue integration
- [ ] Add status polling mechanism
- [ ] Handle pipeline errors gracefully

### Phase 6: Testing
- [ ] Unit tests for specParser
- [ ] API endpoint tests
- [ ] UI component tests
- [ ] E2E form submission test
- [ ] Error handling tests

### Phase 7: Polish
- [ ] Form validation UX
- [ ] Loading states
- [ ] Error messages
- [ ] Success feedback
- [ ] Navigation flow

---

## 8. Success Criteria

| Criteria | Measurement |
|----------|-------------|
| Form submits successfully | 200/201 response from API |
| File upload works | .md files parsed correctly |
| Pipeline triggered | Job ID returned, status trackable |
| Tickets generated | Tickets appear in dashboard |
| Error handling | Clear messages for all failure modes |
| Auth integration | Only authenticated users can submit |

---

## 9. Dependencies

### External
- Swarm Dashboard (React frontend)
- Ticket API (Express backend)
- Design Agent Pipeline (already implemented)
- SQLite database

### Internal Modules
- Auth middleware (existing)
- Job queue system (may need to create)
- Ticket store (existing)

---

## 10. Open Questions

1. **Job Queue**: Do we need a proper queue (Bull/BullMQ) or can we use simple async processing?
2. **File Storage**: Store uploaded files in DB or filesystem?
3. **Rate Limiting**: How many projects can a user submit per hour?
4. **Draft Saving**: Auto-save drafts before submission?

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2024-12-11 | Claude | Initial spec created |
