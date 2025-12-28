# Phase 5: HITL Frontend - Submit + Chat Pages

## ✅ COMPLETION STATUS (Updated: 2025-12-12)

| Task | Status | Notes |
|------|--------|-------|
| Task 1: useHITL.js Hook | ✅ COMPLETE | Full API integration implemented |
| Task 2: CreateProject.jsx | ✅ COMPLETE | Form wired to HITL API, redirects to chat |
| Task 3: DesignSession.jsx | ✅ COMPLETE | Full chat UI with state-aware actions |
| Task 4: CSS Enhancements | ✅ COMPLETE | Glass-card, typing-indicator, slideIn animations all implemented |
| Task 5: Navigation | ✅ COMPLETE | Consistent nav across all pages |
| Build Verification | ✅ PASSES | npm run build succeeds |
| API Verification | ✅ WORKING | /api/hitl endpoints functional |

---

## 🎨 Your Persona

You are an expert at web design and building beautiful web pages. You excel in making CSS work to bring beauty to ordinary business web sites. You have been hired by Swarm to fix their internal dashboards. Keep in tune with their colors but wow them. Think outside the box. The dashboards must be easy to see the relevant data. The layout should follow modern design principals. Most of the work has been done so audit the components to know where to start. Verify functionality before claiming to be done. Deliver a beautiful masterpiece.

---

## 🎯 Mission

Wire up the **CreateProject** and **DesignSession** pages to the new HITL backend API. Transform the existing UI into a stunning, functional experience that guides users through:

1. **Project Submission** → User describes their project idea
2. **AI Clarification Chat** → Interactive Q&A with Claude to refine requirements  
3. **Spec Review** → View generated specification card
4. **Approval** → Approve spec to proceed to ticket generation

---

## 🏗️ System Context

### What is Swarm?
Swarm is a distributed AI agent coordination system. The HITL (Human-in-the-Loop) flow allows users to describe a project, chat with AI to clarify requirements, review a generated spec, and approve it for automated ticket generation.

### HITL State Machine
```
input → clarifying → ready_for_docs → reviewing → approved → building → completed
                                                          ↘ failed
                                                          ↘ cancelled
```

### Current Architecture
- **Backend**: `/opt/swarm-platform` - Express API on port 8080
- **Frontend**: `/opt/swarm-dashboard` - React SPA (Vite)
- **Server**: 146.190.35.235 (DigitalOcean droplet)

---

## 📡 HITL Backend API (Already Built & Working)

Base URL: `/api/hitl`

### Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/hitl` | List sessions (optional `?state=` filter) |
| `POST` | `/api/hitl` | Create session `{project_name, description}` |
| `GET` | `/api/hitl/:id` | Get session with messages |
| `DELETE` | `/api/hitl/:id` | Delete session |
| `POST` | `/api/hitl/:id/respond` | User sends message (works in `input` or `clarifying` state) |
| `POST` | `/api/hitl/:id/start-clarification` | Explicitly start AI Q&A |
| `POST` | `/api/hitl/:id/generate-spec` | Generate spec card (from `clarifying` or `ready_for_docs`) |
| `POST` | `/api/hitl/:id/approve` | Approve spec (from `reviewing`) |
| `POST` | `/api/hitl/:id/request-revision` | Request AI revision `{feedback}` |
| `GET` | `/api/hitl/:id/messages` | Get message history |
| `GET` | `/api/hitl/meta/states` | State machine metadata |

### Response Formats

**Create Session Response:**
```json
{ "success": true, "id": "uuid", "state": "input" }
```

**Get Session Response:**
```json
{
  "session": {
    "id": "uuid",
    "project_name": "My Project",
    "description": "...",
    "state": "clarifying",
    "spec_card": null,
    "clarificationContext": { "gathered": {...}, "pendingQuestions": [...] }
  },
  "messages": [
    { "id": 1, "role": "user", "content": "...", "message_type": "user", "created_at": "..." },
    { "id": 2, "role": "assistant", "content": "...", "message_type": "question", "created_at": "..." }
  ]
}
```

**Respond Response (AI processes and replies):**
```json
{
  "success": true,
  "state": "clarifying",
  "messages": [...],
  "clarificationContext": {...}
}
```

---

## 🎨 Design System

### Colors (CSS Variables)
```css
--cyan: #00d4ff;           /* Primary accent */
--cyan-hover: #00b8e6;     /* Hover state */
--green: #00ff88;          /* Success/progress */
--bg-darkest: #0a0a0a;     /* Input backgrounds */
--bg-dark: #0d0d15;        /* Page backgrounds */
--bg-card: #1a1a2e;        /* Cards, bubbles */
--bg-nav: #16213e;         /* Navigation, sidebars */
--border: #333;            /* Borders */
--text-primary: #fff;
--text-secondary: #888;
--text-muted: #666;
```

### Design Principles to Follow
- **Glassmorphism touches** - subtle backdrop-blur on overlays
- **Gradient accents** - `linear-gradient(90deg, #00d4ff, #00ff88)` for progress/highlights
- **Smooth transitions** - 0.2s-0.3s ease for hover states
- **Generous spacing** - Don't crowd elements
- **Clear visual hierarchy** - State badges, progress indicators prominent
- **Micro-interactions** - Button hover effects, message animations

---

## 📁 Existing Files to Modify

### 1. `/opt/swarm-dashboard/src/hooks/useDesignSession.js`
**Problem**: Currently uses old `/api/design-sessions` endpoint
**Solution**: Rewrite to use `/api/hitl` endpoints

### 2. `/opt/swarm-dashboard/src/pages/CreateProject.jsx`
**Problem**: Form exists but may not connect to HITL API
**Solution**: Wire up to create HITL session, redirect to chat

### 3. `/opt/swarm-dashboard/src/pages/DesignSession.jsx`
**Problem**: Skeleton exists but needs full chat implementation
**Solution**: Build real-time chat UI with state-aware actions

### 4. `/opt/swarm-dashboard/src/components/ChatMessage.jsx`
**Status**: Already built, may need styling enhancements

### 5. `/opt/swarm-dashboard/src/App.css`
**Status**: Has base styles, enhance for wow factor

---

## ✅ Implementation Tasks

### Task 1: Rewrite `useHITL.js` Hook

Create a new hook (or rewrite useDesignSession) for the HITL API:

```javascript
// /opt/swarm-dashboard/src/hooks/useHITL.js
import { useState, useCallback } from 'react';

const API_BASE = '/api/hitl';

export function useHITL() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper for API calls
  const apiCall = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createSession = useCallback((projectName, description) => 
    apiCall(API_BASE, {
      method: 'POST',
      body: JSON.stringify({ project_name: projectName, description })
    }), [apiCall]);

  const getSession = useCallback((sessionId) => 
    apiCall(`${API_BASE}/${sessionId}`), [apiCall]);

  const listSessions = useCallback((state = null) => {
    const params = state ? `?state=${state}` : '';
    return apiCall(`${API_BASE}${params}`);
  }, [apiCall]);

  const respond = useCallback((sessionId, message) =>
    apiCall(`${API_BASE}/${sessionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ message })
    }), [apiCall]);

  const generateSpec = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}/generate-spec`, { method: 'POST' }), [apiCall]);

  const approveSpec = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}/approve`, { method: 'POST' }), [apiCall]);

  const requestRevision = useCallback((sessionId, feedback) =>
    apiCall(`${API_BASE}/${sessionId}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ feedback })
    }), [apiCall]);

  const deleteSession = useCallback((sessionId) =>
    apiCall(`${API_BASE}/${sessionId}`, { method: 'DELETE' }), [apiCall]);

  return {
    loading, error, clearError: () => setError(null),
    createSession, getSession, listSessions,
    respond, generateSpec, approveSpec, requestRevision, deleteSession
  };
}

export default useHITL;
```

---

### Task 2: Update `CreateProject.jsx`

The form should:
1. Collect project name and description
2. Create HITL session via API
3. Redirect to `/design/:sessionId` on success

Key requirements:
- Beautiful form with clear labels and hints
- Loading state on submit button
- Error display if creation fails
- Optional: Show recent sessions user can continue

---

### Task 3: Build `DesignSession.jsx` Chat Interface

This is the main work. The page should:

#### Layout Structure
```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: Project name, state badge, progress bar            │
├─────────────────────────────────────┬───────────────────────┤
│                                     │                       │
│  CHAT AREA                          │  SIDEBAR              │
│  - Message history                  │  - Gathered info      │
│  - Auto-scroll to bottom            │  - State actions      │
│  - Typing indicator                 │  - Quick stats        │
│                                     │                       │
├─────────────────────────────────────┴───────────────────────┤
│  INPUT AREA: Text input + context-aware action buttons      │
└─────────────────────────────────────────────────────────────┘
```

#### State-Aware Behavior

| State | Chat Input | Available Actions |
|-------|------------|-------------------|
| `input` | Enabled - "Describe your project..." | None yet |
| `clarifying` | Enabled - "Answer the question..." | "Skip to Spec" button |
| `ready_for_docs` | Disabled | "Generate Spec" button |
| `reviewing` | Disabled | "Approve" / "Request Changes" buttons |
| `approved` | Disabled | "Generate Tickets" button |
| `building` | Disabled | Progress indicator |
| `completed` | Disabled | "View Tickets" link |

#### Features to Implement
1. **Message List** - Scrollable, auto-scroll on new message
2. **User Messages** - Right-aligned, cyan background
3. **AI Messages** - Left-aligned, dark background  
4. **System Messages** - Centered, subtle styling
5. **Typing Indicator** - Show when waiting for AI response
6. **Sidebar** - Display `clarificationContext.gathered` data
7. **Progress Bar** - Visual indication of flow progress
8. **Action Buttons** - Context-aware based on state

#### Polling for Updates
Since we don't have WebSocket, implement polling:
```javascript
useEffect(() => {
  const interval = setInterval(() => {
    if (['clarifying', 'building'].includes(session?.state)) {
      refreshSession();
    }
  }, 3000);
  return () => clearInterval(interval);
}, [session?.state]);
```

---

### Task 4: Enhance CSS for Wow Factor

Ideas to implement:
```css
/* Glassmorphism card */
.glass-card {
  background: rgba(26, 26, 46, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 212, 255, 0.1);
}

/* Glowing input focus */
.chat-input:focus {
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
  border-color: #00d4ff;
}

/* Message slide-in animation */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.chat-message { animation: slideIn 0.3s ease; }

/* Pulsing typing indicator */
.typing-indicator span {
  animation: pulse 1.4s infinite;
}

/* Gradient progress bar */
.progress-fill {
  background: linear-gradient(90deg, #00d4ff, #00ff88);
  box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
}

/* State badge colors */
.state-badge.input { background: #666; }
.state-badge.clarifying { background: #00d4ff; }
.state-badge.ready_for_docs { background: #ffa500; }
.state-badge.reviewing { background: #ff69b4; }
.state-badge.approved { background: #00ff88; }
.state-badge.building { background: #9370db; }
.state-badge.completed { background: #32cd32; }
```

---

### Task 5: Wire Up Navigation

Ensure navigation is consistent. All pages should have:
```jsx
<nav className="dashboard-nav">
  <NavLink to="/dashboard">Dashboard</NavLink>
  <NavLink to="/projects/new">New Project</NavLink>
  <NavLink to="/tickets">Tickets</NavLink>
  <NavLink to="/vms">VMs</NavLink>
  {isAdmin && <NavLink to="/secrets">Secrets</NavLink>}
  {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
</nav>
```

---

## 🧪 Testing Checklist

### CreateProject Page
- [ ] Form renders with project name and description fields
- [ ] Submit creates session via `POST /api/hitl`
- [ ] Redirects to `/design/:sessionId` on success
- [ ] Shows error toast on failure
- [ ] Loading spinner during submission

### DesignSession Page  
- [ ] Loads session data on mount
- [ ] Displays message history correctly
- [ ] User messages appear on right (cyan)
- [ ] AI messages appear on left (dark)
- [ ] System messages centered
- [ ] Can send messages in `input` and `clarifying` states
- [ ] Input disabled in other states
- [ ] "Generate Spec" button appears in `clarifying`/`ready_for_docs`
- [ ] "Approve" button appears in `reviewing`
- [ ] Sidebar shows gathered context
- [ ] Progress bar reflects current state
- [ ] Auto-scroll on new messages
- [ ] Polling refreshes data every 3s in active states

### API Integration
- [ ] All endpoints return expected data
- [ ] Errors handled gracefully
- [ ] Loading states displayed
- [ ] Auth cookies sent with requests

---

## 🚀 Deployment Commands

After making changes:

```bash
# SSH to server
ssh -i ~/.ssh/swarm_key root@146.190.35.235

# Navigate to dashboard
cd /opt/swarm-dashboard

# Install deps if needed
npm install

# Build
npm run build

# Restart nginx (serves static build)
systemctl restart nginx

# Check logs
journalctl -u nginx -f
```

For development with hot reload:
```bash
cd /opt/swarm-dashboard
npm run dev -- --host 0.0.0.0
# Access at http://146.190.35.235:5173
```

---

## 📍 File Locations Reference

| File | Path |
|------|------|
| React App | `/opt/swarm-dashboard/src/App.jsx` |
| CSS | `/opt/swarm-dashboard/src/App.css` |
| HITL Hook | `/opt/swarm-dashboard/src/hooks/useHITL.js` (create) |
| Old Hook | `/opt/swarm-dashboard/src/hooks/useDesignSession.js` (replace) |
| CreateProject | `/opt/swarm-dashboard/src/pages/CreateProject.jsx` |
| DesignSession | `/opt/swarm-dashboard/src/pages/DesignSession.jsx` |
| ChatMessage | `/opt/swarm-dashboard/src/components/ChatMessage.jsx` |
| Backend Routes | `/opt/swarm-platform/routes/hitl.js` |

---

## 🎯 Success Criteria

1. **Functional**: All user flows work end-to-end
2. **Beautiful**: Visually stunning, modern design
3. **Responsive**: Works on desktop and tablet
4. **Performant**: No lag, smooth animations
5. **Error-Handled**: Graceful failures with user feedback

---

## 💡 Pro Tips

1. **Audit First**: Read existing code before writing new code
2. **Test API**: Use curl to verify endpoints before wiring UI
3. **Iterate**: Get basic functionality, then enhance styling
4. **Console Log**: Debug state transitions liberally
5. **Mobile Check**: Test responsive layouts

---

Go create something beautiful! 🚀
