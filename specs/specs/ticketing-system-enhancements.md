# Ticketing System Enhancements

## Overview
Feature gap analysis comparing Swarm's ticket system against Jira, with recommended enhancements for enterprise adoption.

**Created**: December 23, 2025  
**Status**: Planning

---

## Current Features (✅ Implemented)

| Category | Feature | Notes |
|----------|---------|-------|
| **Core CRUD** | Create, Read, Update, Delete tickets | Full API + UI |
| **States** | 12 states | draft, ready, blocked, on_hold, assigned, in_progress, verifying, in_review, changes_requested, done, needs_review, cancelled |
| **Dependencies** | `depends_on`, `blocks`, `blocked_by` | DAG resolution for blocked tickets |
| **Hierarchy** | `parent_id` | Parent/child ticket relationships |
| **Projects** | Multi-project | Tenant-isolated projects |
| **Assignees** | `assignee_id`, `assignee_type` | Supports human and agent assignees |
| **Activity Timeline** | Event sourcing | `ticket_events` table with real-time WebSocket |
| **Time Tracking** | `estimated_hours`, `actual_hours` | Basic time fields |
| **Verification** | `verification_status` | Agent output verification workflow |
| **Scope Estimation** | `estimated_scope` | S/M/L sizing |
| **Acceptance Criteria** | Text field | Stored on ticket |
| **RBAC** | Role-based permissions | `manage_tickets`, `view_projects` |
| **Kanban Board** | Visual board | Drag-drop state changes |
| **PR Integration** | `pr_url`, `branch_name` | GitHub integration |

---

## Missing Features (Gap Analysis)

### Priority 1: Critical for Enterprise

| Feature | Jira Equivalent | Impact |
|---------|-----------------|--------|
| **Comments/Discussion** | Issue comments | No threaded discussions on tickets |
| **Watchers/Subscribers** | Watch issue | No notification subscriptions |
| **Labels/Tags** | Labels, components | Only `epic` field for categorization |
| **Custom Fields** | Custom field schema | Hardcoded schema |
| **Sprint/Iteration** | Sprints, versions | No sprint planning |
| **Attachments** | File attachments | Can't attach files to tickets |
| **Search/Query Language** | JQL | Only basic filters |

### Priority 2: Important for Workflow

| Feature | Jira Equivalent | Impact |
|---------|-----------------|--------|
| **Workflow Automation** | Automation rules | No trigger-based automation |
| **Story Points** | Story points | No velocity tracking |
| **Bulk Operations** | Bulk change | Single ticket updates only |
| **Clone/Duplicate** | Clone issue | No ticket templates |
| **Link Types** | Issue links | Missing "duplicates", "relates to" |
| **Due Dates** | Due date | No deadline tracking |
| **Transitions/Guards** | Workflow transitions | No state change validation |
| **Reporter Field** | Reporter | Implicit via timestamps |
| **Resolution** | Resolution types | No structured closure reasons |

### Priority 3: Nice to Have

| Feature | Jira Equivalent | Impact |
|---------|-----------------|--------|
| **Time Logging** | Work log | No detailed work entries |
| **Custom Dashboards** | Widgets | Basic dashboard only |
| **Export** | CSV/Excel export | No export functionality |
| **Roadmap View** | Timeline/Gantt | No visual timeline |
| **SLA Tracking** | SLA goals | No service-level monitoring |
| **Saved Filters** | Quick filters | Filters not persisted |
| **Voting** | Vote for issues | No prioritization voting |
| **Templates** | Issue templates | No ticket templates |

---

## Implementation Roadmap

### Phase 1: Comments & Notifications (1-2 weeks)
- [ ] `ticket_comments` table with threading support
- [ ] `ticket_watchers` table for subscriptions
- [ ] Comment API endpoints (CRUD)
- [ ] WebSocket events for new comments
- [ ] UI: Comment panel in TicketDetail

### Phase 2: Labels & Search (1 week)
- [ ] `labels` table (tenant-scoped)
- [ ] `ticket_labels` junction table
- [ ] Label management API
- [ ] Basic query language parser
- [ ] UI: Label picker, search bar

### Phase 3: Due Dates & Workflow Guards (1 week)
- [ ] Add `due_date` column
- [ ] `workflow_rules` table for transitions
- [ ] Transition validation middleware
- [ ] SLA monitoring for agent tickets
- [ ] UI: Due date picker, overdue indicators

### Phase 4: Sprints & Velocity (2 weeks)
- [ ] `sprints` table
- [ ] Add `sprint_id`, `story_points` to tickets
- [ ] Sprint management API
- [ ] Velocity/burndown calculations
- [ ] UI: Sprint board, velocity charts

---

## Schema Extensions

### Comments Table
```sql
CREATE TABLE ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  author_type TEXT DEFAULT 'human', -- 'human' | 'agent' | 'system'
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  parent_comment_id TEXT REFERENCES ticket_comments(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX idx_comments_author ON ticket_comments(author_id);
```

### Watchers Table
```sql
CREATE TABLE ticket_watchers (
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticket_id, user_id)
);
```

### Labels Tables
```sql
CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6b7280',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, name)
);

CREATE TABLE ticket_labels (
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, label_id)
);
```

### Sprints Table
```sql
CREATE TABLE sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  goal TEXT,
  start_date DATE,
  end_date DATE,
  state TEXT DEFAULT 'future', -- 'future' | 'active' | 'closed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tickets ADD COLUMN sprint_id TEXT REFERENCES sprints(id);
ALTER TABLE tickets ADD COLUMN story_points INTEGER;
ALTER TABLE tickets ADD COLUMN due_date TIMESTAMP;
ALTER TABLE tickets ADD COLUMN reporter_id TEXT REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN resolution TEXT; -- 'fixed' | 'wont_fix' | 'duplicate' | 'invalid'
```

---

## API Endpoints (Planned)

### Comments
- `GET /api/tickets/:id/comments` - List comments
- `POST /api/tickets/:id/comments` - Add comment
- `PUT /api/tickets/:id/comments/:commentId` - Edit comment
- `DELETE /api/tickets/:id/comments/:commentId` - Delete comment

### Watchers
- `GET /api/tickets/:id/watchers` - List watchers
- `POST /api/tickets/:id/watch` - Subscribe to ticket
- `DELETE /api/tickets/:id/watch` - Unsubscribe

### Labels
- `GET /api/labels` - List tenant labels
- `POST /api/labels` - Create label
- `PUT /api/labels/:id` - Update label
- `DELETE /api/labels/:id` - Delete label
- `POST /api/tickets/:id/labels` - Add label to ticket
- `DELETE /api/tickets/:id/labels/:labelId` - Remove label

### Sprints
- `GET /api/projects/:id/sprints` - List sprints
- `POST /api/projects/:id/sprints` - Create sprint
- `PUT /api/sprints/:id` - Update sprint
- `POST /api/sprints/:id/start` - Start sprint
- `POST /api/sprints/:id/complete` - Complete sprint

---

## Key Decisions

1. **Comments before custom fields** - Discussion is more critical than flexibility
2. **Labels over custom fields** - Simpler to implement, covers 80% of use cases
3. **Workflow guards at API layer** - Not database constraints, for flexibility
4. **Notification queue** - Future: persistent queue for offline users
5. **JQL-lite** - Simple query syntax: `state:in_progress assignee:forge-agent`
