# Build Backlog UI - Complete Implementation

## Persona

You are a **Senior Frontend Architect** with 20 years of experience building enterprise React applications. Your expertise includes:

- **React ecosystem**: Hooks, Context, React Router, state management patterns
- **UI/UX design**: Component composition, accessibility, responsive design
- **Real-time systems**: WebSocket integration, optimistic updates, event-driven UIs
- **Enterprise patterns**: Error boundaries, loading states, form validation, toast notifications
- **CSS architectures**: CSS modules, Tailwind-style utilities, component-scoped styling

You've built dashboards for DevOps platforms, project management tools, and AI agent orchestration systems. You understand the importance of clear state visualization, intuitive workflows, and responsive feedback.

---

## Context

**Project**: Swarm Platform - AI Agent Orchestration System  
**Task**: Build a complete Backlog UI page for quick idea capture and refinement  
**Tech Stack**: React 18, React Router, CSS Modules, Fetch API  
**DEV Droplet**: 134.199.235.140  
**Dashboard Location**: `/opt/swarm-app/apps/dashboard/src/`  
**API Base**: `http://localhost:8080/api/backlog`

---

## MANDATORY: RAG Query First

Before writing ANY code, query the RAG to understand existing patterns:

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'curl -s -X POST http://localhost:8082/api/rag/search \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"React dashboard page component structure useState useEffect fetch API\", \"limit\": 5}" | jq -r ".results[].content" | head -100'
```

Also query for:
- Existing CSS patterns: `"dashboard CSS styling patterns className"`
- API integration: `"fetch API authorization Bearer token useAuth"`
- Toast notifications: `"toast notification success error message"`
- Modal patterns: `"modal dialog component React"`

---

## MANDATORY: File Transfer Protocol

**NEVER use sed, scp, or heredocs for file creation/editing.**

**ALWAYS use this workflow:**
1. Create/edit files locally with Desktop Commander on Mac
2. Use rsync to transfer to droplet
3. Restart PM2 if needed

```bash
# Create locally first, then:
rsync -avz -e "ssh -i ~/.ssh/swarm_key" \
  /Users/cory.naegle/swarm-specs-local/temp/Backlog.jsx \
  root@134.199.235.140:/opt/swarm-app/apps/dashboard/src/pages/Backlog.jsx

rsync -avz -e "ssh -i ~/.ssh/swarm_key" \
  /Users/cory.naegle/swarm-specs-local/temp/Backlog.css \
  root@134.199.235.140:/opt/swarm-app/apps/dashboard/src/pages/Backlog.css

# Restart dashboard
ssh -i ~/.ssh/swarm_key root@134.199.235.140 'export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH && pm2 restart swarm-dashboard-dev'
```

---

## Backlog API Endpoints (All Must Be Supported)

### Core CRUD
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/backlog` | List all items (with state filter) |
| POST | `/api/backlog` | Create new item |
| GET | `/api/backlog/:id` | Get single item |
| PUT | `/api/backlog/:id` | Update item |
| DELETE | `/api/backlog/:id` | Delete item (blocked if promoted) |

### Chat Refinement
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/backlog/:id/start-chat` | Start refinement chat → state: chatting |
| POST | `/api/backlog/:id/chat` | Send message, get AI response |
| POST | `/api/backlog/:id/end-chat` | Complete refinement → state: refined |
| POST | `/api/backlog/:id/abandon-chat` | Cancel chat → state: draft |

### Promotion
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/backlog/:id/promote` | Convert to HITL session → state: promoted |

---

## Backlog Item States

```
draft → chatting → refined → promoted
  ↑        ↓
  └── abandon-chat
```

| State | Color | Actions Available |
|-------|-------|-------------------|
| draft | gray | Edit, Delete, Start Chat, Promote |
| chatting | blue | Chat, End Chat, Abandon Chat |
| refined | green | Edit, Delete, Promote |
| promoted | purple | View Only (linked to HITL session) |

---

## Required UI Components

### 1. Backlog List View (Main Page)
- Header with "New Idea" button
- Filter tabs: All, Draft, Chatting, Refined, Promoted
- Item cards showing: title, state badge, created date, truncated description
- Click card → expand or open detail modal
- Empty state when no items

### 2. Quick Add Form
- Minimal: just title field (description optional)
- Submit creates item in "draft" state
- Auto-focus, enter to submit
- Toast on success

### 3. Item Detail/Edit Modal
- Full title and description editing
- State badge (read-only)
- Enriched description display (if refined)
- Action buttons based on state
- Delete confirmation

### 4. Refinement Chat Interface
- Chat history display (scrollable)
- Message input with send button
- AI typing indicator
- "End Refinement" and "Abandon" buttons
- Shows enriched_description after end-chat

### 5. Promote Confirmation
- Modal confirming promotion to HITL
- Option: skip_clarification checkbox
- Success shows link to new HITL session

---

## UI Component Structure

```
src/pages/
├── Backlog.jsx          # Main page component
├── Backlog.css          # Styles
└── components/
    └── backlog/
        ├── BacklogList.jsx
        ├── BacklogCard.jsx
        ├── BacklogForm.jsx
        ├── BacklogDetail.jsx
        ├── RefinementChat.jsx
        └── PromoteModal.jsx
```

Or simpler (single file to start):
```
src/pages/
├── Backlog.jsx          # All-in-one with internal components
├── Backlog.css          # Styles
```

---

## State Management Pattern

```javascript
const [items, setItems] = useState([]);
const [filter, setFilter] = useState('all');
const [selectedItem, setSelectedItem] = useState(null);
const [showForm, setShowForm] = useState(false);
const [chatMode, setChatMode] = useState(false);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
```

---

## API Integration Pattern

```javascript
const { token } = useAuth(); // Get from existing auth context

const fetchBacklog = async (stateFilter = null) => {
  const url = stateFilter 
    ? `/api/backlog?state=${stateFilter}`
    : '/api/backlog';
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.items;
};

const createItem = async (title, description = '') => {
  const res = await fetch('/api/backlog', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title, description })
  });
  return res.json();
};
```

---

## Router Integration

Add to existing router in `App.jsx` or router config:

```javascript
import Backlog from './pages/Backlog';

// In routes array:
{ path: '/backlog', element: <Backlog /> }
```

Add navigation link in sidebar/header.

---

## Implementation Phases

### Phase 1: Basic List + Create
- [ ] Create Backlog.jsx with list view
- [ ] Create Backlog.css with styling
- [ ] Implement GET /api/backlog
- [ ] Implement POST /api/backlog (quick add form)
- [ ] Add route and navigation link
- [ ] Test create and list

### Phase 2: Edit + Delete
- [ ] Add item detail modal
- [ ] Implement PUT /api/backlog/:id
- [ ] Implement DELETE /api/backlog/:id
- [ ] Add delete confirmation
- [ ] State badge styling

### Phase 3: Chat Refinement
- [ ] Add chat interface component
- [ ] Implement start-chat, chat, end-chat, abandon-chat
- [ ] Chat history display
- [ ] AI response streaming/loading
- [ ] Enriched description display

### Phase 4: Promote + Polish
- [ ] Promote modal with skip_clarification option
- [ ] Link to HITL session after promote
- [ ] Filter tabs
- [ ] Empty states
- [ ] Error handling
- [ ] Loading skeletons

---

## Testing Commands

```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@134.199.235.140
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH

# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarmstack.net","password":"AdminTest123!"}' | jq -r ".token")

# Test endpoints
curl -s http://localhost:8080/api/backlog -H "Authorization: Bearer $TOKEN" | jq
curl -s -X POST http://localhost:8080/api/backlog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test from UI"}' | jq
```

---

## File Locations

| File | Local Path | Remote Path |
|------|------------|-------------|
| Backlog.jsx | `/Users/cory.naegle/swarm-specs-local/temp/Backlog.jsx` | `/opt/swarm-app/apps/dashboard/src/pages/Backlog.jsx` |
| Backlog.css | `/Users/cory.naegle/swarm-specs-local/temp/Backlog.css` | `/opt/swarm-app/apps/dashboard/src/pages/Backlog.css` |

---

## Anti-Freeze Protocol

- Max 15s SSH timeouts
- Pipe outputs through `head -50`
- No sed/heredocs - use rsync
- Checkpoint to git after each phase
- Query RAG before major code decisions

---

## Definition of Done

- [ ] All 10 API endpoints have corresponding UI actions
- [ ] State transitions are visually clear
- [ ] Chat refinement flow works end-to-end
- [ ] Promote creates HITL session with link
- [ ] Filter tabs work
- [ ] Responsive design (desktop + mobile)
- [ ] Error states handled gracefully
- [ ] Code committed to git
