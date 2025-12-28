# Feature Spec: Ticket Comments System

## Overview

Add threaded comments to tickets enabling discussion between humans and agents. Comments provide context, decisions, and progress updates that persist with the ticket lifecycle.

## Goals

1. Enable humans to provide guidance/feedback on agent work
2. Allow agents to ask clarifying questions before proceeding
3. Create audit trail of decisions and discussions
4. Support @mentions for notifications
5. Distinguish internal notes from customer-visible comments (future multi-tenant)

---

## Database Schema

### New Tables

```sql
-- Ticket comments table
CREATE TABLE ticket_comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),           -- NULL for system comments
  author_type TEXT DEFAULT 'human',              -- 'human', 'agent', 'system'
  agent_id TEXT REFERENCES agent_definitions(id), -- If author_type='agent'
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,             -- Internal notes not shown to customers
  is_resolution BOOLEAN DEFAULT false,           -- Marks comment as resolution summary
  parent_id TEXT REFERENCES ticket_comments(id), -- For threaded replies
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP                           -- Soft delete
);

-- Indexes for common queries
CREATE INDEX idx_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX idx_comments_author ON ticket_comments(author_id);
CREATE INDEX idx_comments_created ON ticket_comments(created_at DESC);
CREATE INDEX idx_comments_parent ON ticket_comments(parent_id);

-- Mentions tracking for notifications
CREATE TABLE comment_mentions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id TEXT NOT NULL REFERENCES ticket_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mentions_user ON comment_mentions(user_id, read_at);
```

### Schema Notes

- `author_type` distinguishes human users, AI agents, and system-generated comments
- `is_internal` supports future B2B scenarios where some comments are team-only
- `parent_id` enables threaded replies (optional, can start flat)
- Soft delete with `deleted_at` preserves audit trail

---

## API Endpoints

### List Comments
```
GET /api/tickets/:ticketId/comments
Authorization: Bearer <jwt>

Query params:
  - include_internal: boolean (requires permission)
  - limit: number (default 50)
  - offset: number (default 0)
  - order: 'asc' | 'desc' (default 'asc' - oldest first)

Response 200:
{
  "comments": [
    {
      "id": "uuid",
      "ticket_id": "uuid",
      "author": {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "type": "human"
      },
      "content": "Have we considered using Redis for caching?",
      "is_internal": false,
      "parent_id": null,
      "created_at": "2025-12-23T10:00:00Z",
      "updated_at": "2025-12-23T10:00:00Z",
      "replies": []  // If threaded
    }
  ],
  "total": 12,
  "has_more": false
}
```

### Create Comment
```
POST /api/tickets/:ticketId/comments
Authorization: Bearer <jwt>
Content-Type: application/json

Body:
{
  "content": "This approach looks good. Proceeding with implementation.",
  "is_internal": false,
  "parent_id": null  // Optional, for replies
}

Response 201:
{
  "id": "uuid",
  "ticket_id": "uuid",
  "author": { ... },
  "content": "...",
  "created_at": "2025-12-23T10:05:00Z",
  "mentions": ["user-uuid-1", "user-uuid-2"]  // Parsed from @mentions
}
```

### Agent Comment (Internal Auth)
```
POST /api/tickets/:ticketId/comments
X-Agent-Key: agent-internal-key-dev
Content-Type: application/json

Body:
{
  "content": "I need clarification: should the cache TTL be 5 minutes or 1 hour?",
  "agent_id": "forge-agent",
  "author_type": "agent"
}
```

### Update Comment
```
PATCH /api/tickets/:ticketId/comments/:commentId
Authorization: Bearer <jwt>

Body:
{
  "content": "Updated comment text"
}

Response 200:
{
  "id": "uuid",
  "content": "Updated comment text",
  "updated_at": "2025-12-23T10:10:00Z"
}
```

### Delete Comment (Soft Delete)
```
DELETE /api/tickets/:ticketId/comments/:commentId
Authorization: Bearer <jwt>

Response 200:
{
  "success": true,
  "deleted_at": "2025-12-23T10:15:00Z"
}
```

---

## WebSocket Events

### New Comment Broadcast
```javascript
// Server emits to ticket subscribers
broadcast.toTicket(ticketId, 'ticket:comment', {
  action: 'created',
  comment: {
    id: 'uuid',
    ticket_id: 'uuid',
    author: { id, name, type },
    content: '...',
    created_at: '...'
  }
});
```

### Comment Updated
```javascript
broadcast.toTicket(ticketId, 'ticket:comment', {
  action: 'updated',
  comment: { id, content, updated_at }
});
```

### Comment Deleted
```javascript
broadcast.toTicket(ticketId, 'ticket:comment', {
  action: 'deleted',
  comment_id: 'uuid'
});
```

---

## Frontend Components

### CommentSection.jsx
```jsx
/**
 * Main comments container for TicketDetail page
 * 
 * Features:
 * - Chronological comment list
 * - New comment form at bottom
 * - Real-time updates via WebSocket
 * - Author avatars with agent/human indicators
 * - @mention autocomplete
 * - Markdown rendering for content
 */

import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { MessageSquare, Bot, User, Send } from 'lucide-react';

export default function CommentSection({ ticketId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const { subscribe } = useWebSocket();
  
  // Fetch comments on mount
  // Subscribe to WebSocket for real-time updates
  // Handle @mention parsing and autocomplete
  // Render with author avatars and timestamps
}
```

### CommentItem.jsx
```jsx
/**
 * Single comment display
 * 
 * Visual indicators:
 * - Human: User icon, blue accent
 * - Agent: Bot icon, purple accent  
 * - System: Gear icon, gray accent
 * - Internal: Lock icon, yellow background
 */
```

### CommentForm.jsx
```jsx
/**
 * Comment input with:
 * - Textarea with auto-resize
 * - @mention trigger with user dropdown
 * - Markdown preview toggle
 * - Submit on Ctrl+Enter
 * - Internal toggle (if user has permission)
 */
```

---

## Permissions

Add new RBAC permissions:

```sql
INSERT INTO permissions (id, name, description) VALUES
  ('perm-comment-view', 'view_comments', 'View ticket comments'),
  ('perm-comment-create', 'create_comments', 'Add comments to tickets'),
  ('perm-comment-edit', 'edit_comments', 'Edit own comments'),
  ('perm-comment-delete', 'delete_comments', 'Delete own comments'),
  ('perm-comment-internal', 'view_internal_comments', 'View internal/private comments'),
  ('perm-comment-moderate', 'moderate_comments', 'Edit/delete any comment');

-- Grant to existing roles
INSERT INTO role_permissions (role_id, permission_id) VALUES
  -- Viewers can read comments
  ('role-viewer', 'perm-comment-view'),
  -- Members can comment
  ('role-member', 'perm-comment-view'),
  ('role-member', 'perm-comment-create'),
  ('role-member', 'perm-comment-edit'),
  -- Admins get full access
  ('role-admin', 'perm-comment-view'),
  ('role-admin', 'perm-comment-create'),
  ('role-admin', 'perm-comment-edit'),
  ('role-admin', 'perm-comment-delete'),
  ('role-admin', 'perm-comment-internal'),
  ('role-admin', 'perm-comment-moderate');
```

---

## @Mention System

### Parsing
```javascript
// Extract @mentions from comment content
function parseMentions(content) {
  const mentionRegex = /@\[([^\]]+)\]\(user:([a-f0-9-]+)\)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push({
      name: match[1],
      userId: match[2]
    });
  }
  return mentions;
}

// Format: @[John Doe](user:uuid) in stored content
// Display: @John Doe with link/highlight
```

### Notification on Mention
```javascript
// After creating comment, notify mentioned users
async function notifyMentions(comment, mentions) {
  for (const mention of mentions) {
    await execute(`
      INSERT INTO comment_mentions (comment_id, user_id)
      VALUES ($1, $2)
    `, [comment.id, mention.userId]);
    
    // Future: Send email/push notification
    broadcast.toUser(mention.userId, 'notification', {
      type: 'mention',
      ticket_id: comment.ticket_id,
      comment_id: comment.id,
      from: comment.author
    });
  }
}
```

---

## Agent Integration

### Agent Asking Questions
When an agent needs clarification, it posts a comment and optionally pauses:

```javascript
// In agent execution loop
async function requestClarification(ticketId, question) {
  await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 
      'X-Agent-Key': AGENT_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: `🤔 **Clarification Needed**\n\n${question}`,
      author_type: 'agent',
      agent_id: 'forge-agent'
    })
  });
  
  // Optionally transition ticket to 'on_hold'
  await fetch(`${API_URL}/tickets/${ticketId}`, {
    method: 'PATCH',
    headers: { 'X-Agent-Key': AGENT_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      state: 'on_hold',
      hold_reason: 'Awaiting clarification'
    })
  });
}
```

### Agent Progress Updates
```javascript
// Agent posts progress as it works
async function logProgress(ticketId, message) {
  await fetch(`${API_URL}/tickets/${ticketId}/comments`, {
    method: 'POST',
    headers: { 'X-Agent-Key': AGENT_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `📝 ${message}`,
      author_type: 'agent',
      agent_id: 'forge-agent',
      is_internal: true  // Progress logs are internal
    })
  });
}
```

---

## Migration Script

```sql
-- Migration: 013_ticket_comments.sql

BEGIN;

-- Create comments table
CREATE TABLE IF NOT EXISTS ticket_comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  author_type TEXT DEFAULT 'human' CHECK (author_type IN ('human', 'agent', 'system')),
  agent_id TEXT,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  is_resolution BOOLEAN DEFAULT false,
  parent_id TEXT REFERENCES ticket_comments(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Create mentions table
CREATE TABLE IF NOT EXISTS comment_mentions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id TEXT NOT NULL REFERENCES ticket_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON ticket_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON ticket_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON ticket_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_mentions_user ON comment_mentions(user_id, read_at);

-- Add permissions
INSERT INTO permissions (id, name, description) VALUES
  (gen_random_uuid(), 'view_comments', 'View ticket comments'),
  (gen_random_uuid(), 'create_comments', 'Add comments to tickets'),
  (gen_random_uuid(), 'edit_comments', 'Edit own comments'),
  (gen_random_uuid(), 'delete_comments', 'Delete own comments'),
  (gen_random_uuid(), 'view_internal_comments', 'View internal comments'),
  (gen_random_uuid(), 'moderate_comments', 'Moderate all comments')
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## Testing Checklist

- [ ] Create comment as human user
- [ ] Create comment as agent (X-Agent-Key auth)
- [ ] Create system comment (state change notification)
- [ ] List comments with pagination
- [ ] Update own comment
- [ ] Cannot update others' comments (unless moderator)
- [ ] Soft delete comment
- [ ] WebSocket broadcasts on create/update/delete
- [ ] @mention parsing and notification
- [ ] Internal comments hidden from non-privileged users
- [ ] Threaded replies (parent_id)
- [ ] Comments deleted when ticket deleted (CASCADE)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `migrations/013_ticket_comments.sql` | Create | Database schema |
| `routes/comments.js` | Create | API endpoints |
| `routes/tickets.js` | Modify | Mount comments router |
| `middleware/rbac.js` | Modify | Add new permissions |
| `websocket.js` | Modify | Add `toTicket()` broadcast helper |
| `dashboard/src/components/CommentSection.jsx` | Create | Comments UI |
| `dashboard/src/components/CommentItem.jsx` | Create | Single comment |
| `dashboard/src/components/CommentForm.jsx` | Create | Input form |
| `dashboard/src/hooks/useComments.js` | Create | API hook |
| `dashboard/src/pages/TicketDetail.jsx` | Modify | Include CommentSection |

---

## Acceptance Criteria

1. ✅ Users can add comments to any ticket they can view
2. ✅ Comments display with author name, avatar, and timestamp
3. ✅ Agent comments show bot icon and agent name
4. ✅ Real-time updates via WebSocket (no refresh needed)
5. ✅ @mentions create notifications for mentioned users
6. ✅ Internal comments only visible to users with permission
7. ✅ Edit/delete only own comments (unless moderator)
8. ✅ Comments survive ticket state changes
9. ✅ Comments deleted when ticket is deleted
10. ✅ Mobile-responsive comment UI
