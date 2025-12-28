# Swarm Dashboard UI Implementation Prompt

> **Purpose**: Complete implementation guide for the Swarm Dashboard with React + Vite
> **Estimated Sessions**: 4-6 focused sessions (~16-17 hours total)
> **Prerequisites**: Auth system implemented (Phase 7 testing pending)

---

## Architecture Decision: UI Location

**Recommendation**: `app.swarmstack.net` (subdomain)

**Why subdomain over path-based routing:**
1. **Clean separation** - API at `api.swarmstack.net`, app at `app.swarmstack.net`, marketing at `swarmstack.net`
2. **Independent deployment** - Can update frontend without touching API
3. **CORS simplicity** - Same-origin cookies work naturally with proper Caddy config
4. **Future flexibility** - Can move to CDN (Cloudflare Pages, Vercel) without API changes
5. **SSL certificate** - Caddy auto-provisions wildcard or per-subdomain certs

**Directory structure**:
```
/opt/swarm-dashboard/          # NEW - React + Vite app
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── services/
│   └── main.jsx
├── public/
├── vite.config.js
└── package.json

/opt/swarm-tickets/            # EXISTING - API server
├── api-server.js              # Main API (port 8080)
├── api-auth.js                # Auth routes
├── auth.js                    # Auth utilities
└── public/index.html          # OLD dashboard (keep as fallback)
```

---

## Current State Assessment

### What Exists

| Component | Location | Status |
|-----------|----------|--------|
| Auth module (JWT, bcrypt) | `/opt/swarm-tickets/auth.js` | ✅ Implemented |
| Auth routes | `/opt/swarm-tickets/api-auth.js` | ✅ Implemented |
| Design sessions API | `/opt/swarm-tickets/api-design-sessions.js` | ⚠️ Exists, needs review |
| Old HTML dashboard | `/opt/swarm-tickets/public/index.html` | ✅ Working (45KB single file) |
| Users in DB | admin@swarmstack.net, test@swarmstack.net | ✅ Created |

### What Needs Building

| Component | Priority | Phase |
|-----------|----------|-------|
| Gate enforcement middleware | HIGH | 2 |
| AI Dispatcher service | HIGH | 3 |
| React scaffold + routing | HIGH | 4 |
| Login page | HIGH | 4 |
| CreateProject page | HIGH | 5 |
| DesignSession chat page | HIGH | 5 |
| SpecReview page | MEDIUM | 6 |
| BuildConfirmation modal | MEDIUM | 6 |
| Build progress page | LOW | 7 |

---

## Phase 0: Auth Verification (~30 min)

**Goal**: Verify existing auth endpoints work before building UI

### Test Script
```bash
# Set variables
API="https://api.swarmstack.net"
AUTH_HEADER="Authorization: Bearer sk-swarm-prod-7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a"

# 1. Health check
curl -s "$API/api/health" | jq

# 2. Login (should return tokens + set cookies)
curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"email":"admin@swarmstack.net","password":"SwarmAdmin2024!"}' \
  -c cookies.txt | jq

# 3. Get current user (using cookie)
curl -s "$API/api/auth/me" \
  -H "$AUTH_HEADER" \
  -b cookies.txt | jq

# 4. Refresh token
curl -s -X POST "$API/api/auth/refresh" \
  -H "$AUTH_HEADER" \
  -b cookies.txt \
  -c cookies.txt | jq

# 5. List users (admin only)
curl -s "$API/api/admin/users" \
  -H "$AUTH_HEADER" \
  -b cookies.txt | jq

# 6. Logout
curl -s -X POST "$API/api/auth/logout" \
  -H "$AUTH_HEADER" \
  -b cookies.txt | jq
```

### Success Criteria
- [ ] Login returns `{ success: true, user: {...} }`
- [ ] httpOnly cookies are set (check with `-v` flag)
- [ ] `/api/auth/me` returns user when cookie present
- [ ] `/api/auth/me` returns 401 without cookie
- [ ] `/api/admin/users` returns 403 for non-admin users
- [ ] Logout clears cookies

### If Tests Fail
Document specific failures and fix before proceeding. Common issues:
- CORS not configured for credentials
- Cookie domain mismatch
- JWT secret not set in environment

---

## Phase 1: Schema Verification (~1 hour)

**Goal**: Ensure design_sessions and related tables match spec

### Required Schema
```sql
-- Verify these tables exist with correct structure

-- 1. Users (should exist from auth implementation)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  role TEXT DEFAULT 'user',
  oauth_provider TEXT,
  oauth_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  owner_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 3. Design Sessions (core of HITL workflow)
CREATE TABLE IF NOT EXISTS design_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  state TEXT DEFAULT 'input' CHECK (state IN (
    'input', 'clarifying', 'ready_for_docs', 
    'documenting', 'reviewing', 'approved', 'generating', 'complete'
  )),
  initial_description TEXT,
  clarification_context JSON,
  spec_card TEXT,
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. Design Messages (chat history)
CREATE TABLE IF NOT EXISTS design_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  message_type TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 5. State Transitions (audit log)
CREATE TABLE IF NOT EXISTS state_transitions (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES design_sessions(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT,
  action TEXT,
  user_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_design_sessions_project ON design_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_design_sessions_state ON design_sessions(state);
CREATE INDEX IF NOT EXISTS idx_design_messages_session ON design_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_state_transitions_session ON state_transitions(session_id);
```

### Verification Commands
```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin

# Check existing tables
sqlite3 /opt/swarm-tickets/data/swarm.db ".tables"

# Check design_sessions schema
sqlite3 /opt/swarm-tickets/data/swarm.db ".schema design_sessions"

# Run migration if needed
sqlite3 /opt/swarm-tickets/data/swarm.db < migration.sql
```

### Deliverables
- [ ] All tables exist with correct schema
- [ ] Foreign key constraints working
- [ ] Indexes created

---

## Phase 2: Gate Enforcement Middleware (~2 hours)

**Goal**: API middleware that enforces state machine transitions

### File: `/opt/swarm-tickets/middleware/gate-enforcement.js`

```javascript
const ALLOWED_ACTIONS = {
  'input':          ['submit_description'],
  'clarifying':     ['respond', 'confirm_ready'],
  'ready_for_docs': ['generate_spec'],
  'documenting':    [], // AI only
  'reviewing':      ['edit_spec', 'request_revision', 'approve'],
  'approved':       ['start_build'],
  'generating':     [], // AI only
  'complete':       ['view']
};

const STATE_TRANSITIONS = {
  'input':          ['clarifying'],
  'clarifying':     ['clarifying', 'ready_for_docs'],
  'ready_for_docs': ['documenting'],
  'documenting':    ['reviewing'],
  'reviewing':      ['reviewing', 'approved'],
  'approved':       ['generating'],
  'generating':     ['complete'],
  'complete':       []
};

function deriveActionFromEndpoint(req) {
  const { method, path } = req;
  if (path.includes('/respond')) return 'respond';
  if (path.includes('/generate-spec')) return 'generate_spec';
  if (path.includes('/approve')) return 'approve';
  if (path.includes('/start-build')) return 'start_build';
  if (method === 'POST' && path.endsWith('/design-sessions')) return 'submit_description';
  return 'view';
}

async function enforceGate(req, res, next) {
  const sessionId = req.params.id;
  if (!sessionId) return next();
  
  const session = await getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'session_not_found' });
  
  const action = deriveActionFromEndpoint(req);
  const allowedActions = ALLOWED_ACTIONS[session.state] || [];
  
  if (!allowedActions.includes(action)) {
    return res.status(403).json({
      error: 'action_not_allowed',
      current_state: session.state,
      allowed_actions: allowedActions,
      attempted_action: action
    });
  }
  
  req.session = session;
  req.action = action;
  next();
}

async function logTransition(sessionId, fromState, toState, action, userId) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO state_transitions (id, session_id, from_state, to_state, action, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, fromState, toState, action, userId);
}

module.exports = { enforceGate, logTransition, ALLOWED_ACTIONS, STATE_TRANSITIONS };
```

### Integration
```javascript
// In api-server.js or api-design-sessions.js
const { enforceGate } = require('./middleware/gate-enforcement');

// Apply to design session routes
router.use('/design-sessions/:id/*', enforceGate);
```

### Test Cases
```bash
# Should fail - can't approve from 'input' state
curl -X POST "$API/api/design-sessions/123/approve" \
  -H "$AUTH_HEADER" -b cookies.txt
# Expected: 403 { error: 'action_not_allowed', current_state: 'input' }

# Should succeed - submit description from 'input'
curl -X POST "$API/api/design-sessions" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"description":"Build a todo app"}' -b cookies.txt
# Expected: 200 { session_id, state: 'clarifying' }
```

### Deliverables
- [ ] gate-enforcement.js created
- [ ] Integrated into API routes
- [ ] State transitions logged to audit table
- [ ] Tests pass for allowed/blocked actions

---

## Phase 3: AI Dispatcher Service (~2 hours)

**Goal**: Centralized control for all AI actions

### File: `/opt/swarm-tickets/services/ai-dispatcher.js`

```javascript
const Anthropic = require('@anthropic-ai/sdk');

const AI_ACTIONS = {
  'clarifying':  ['ask_question', 'analyze_response'],
  'documenting': ['generate_spec_card'],
  'reviewing':   ['revise_spec'],
  'generating':  ['create_tickets', 'spawn_agents']
};

const APPROVAL_REQUIRED = {
  'generate_spec_card': true,
  'create_tickets': true,
  'spawn_agents': true
};

class AIDispatcher {
  constructor(apiKey) {
    this.client = new Anthropic({ apiKey });
  }

  async dispatch(sessionId, intendedAction, context) {
    const session = await getSession(sessionId);
    
    // Check if AI is allowed to act in this state
    const allowed = AI_ACTIONS[session.state] || [];
    if (!allowed.includes(intendedAction)) {
      return { 
        blocked: true, 
        reason: 'ai_not_allowed_in_state',
        state: session.state 
      };
    }
    
    // Check if action requires explicit user approval
    if (APPROVAL_REQUIRED[intendedAction] && !context.userApproved) {
      return { 
        blocked: true, 
        reason: 'requires_user_approval',
        action: intendedAction 
      };
    }
    
    // Execute the AI action
    return this.execute(session, intendedAction, context);
  }

  async execute(session, action, context) {
    switch (action) {
      case 'ask_question':
        return this.askClarifyingQuestion(session, context);
      case 'analyze_response':
        return this.analyzeUserResponse(session, context);
      case 'generate_spec_card':
        return this.generateSpecCard(session);
      case 'revise_spec':
        return this.reviseSpec(session, context.feedback);
      case 'create_tickets':
        return this.createTickets(session);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  async askClarifyingQuestion(session, context) {
    const prompt = `You are helping design a software project.
    
Project description: ${session.initial_description}

Previous conversation:
${formatMessages(context.messages)}

Ask ONE clarifying question to better understand the requirements.
Focus on: tech stack, scale, integrations, or constraints.
Be conversational and specific.`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    return { 
      type: 'question',
      content: response.content[0].text 
    };
  }

  async generateSpecCard(session) {
    const prompt = `Generate a spec card for this project.

Project description: ${session.initial_description}

Clarification context:
${JSON.stringify(session.clarification_context, null, 2)}

Output a markdown spec card with:
- Summary (what, why, who, platform)
- Constraints
- Core Features (numbered list)
- Key Entities (with fields and relationships)
- API Outline (table format)
- Open Questions`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      type: 'spec_card',
      content: response.content[0].text
    };
  }

  // Additional methods...
}

module.exports = AIDispatcher;
```

### Integration Points
```javascript
// In design session respond endpoint
const dispatcher = new AIDispatcher(process.env.ANTHROPIC_API_KEY);

router.post('/design-sessions/:id/respond', async (req, res) => {
  const { response } = req.body;
  
  // Save user message
  await saveMessage(req.params.id, 'user', response);
  
  // Get AI response
  const aiResult = await dispatcher.dispatch(
    req.params.id, 
    'ask_question',
    { messages: await getMessages(req.params.id) }
  );
  
  if (aiResult.blocked) {
    return res.status(403).json(aiResult);
  }
  
  // Save AI message
  await saveMessage(req.params.id, 'assistant', aiResult.content);
  
  res.json({ message: aiResult.content, state: session.state });
});
```

### Deliverables
- [ ] ai-dispatcher.js created
- [ ] Claude API integration working
- [ ] Clarification questions generated
- [ ] Spec card generation working
- [ ] All AI actions gated properly

---

## Phase 4: React Scaffold + Login (~2 hours)

**Goal**: Set up React + Vite app with authentication

### Setup Commands
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin

# Create React app
cd /opt
npm create vite@latest swarm-dashboard -- --template react
cd swarm-dashboard
npm install

# Install dependencies
npm install react-router-dom @tanstack/react-query axios zustand
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Project Structure
```
/opt/swarm-dashboard/
├── src/
│   ├── components/
│   │   ├── Layout.jsx
│   │   ├── Navbar.jsx
│   │   ├── ProtectedRoute.jsx
│   │   └── LoadingSpinner.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── CreateProject.jsx
│   │   ├── DesignSession.jsx
│   │   └── SpecReview.jsx
│   ├── hooks/
│   │   └── useAuth.js
│   ├── services/
│   │   └── api.js
│   ├── store/
│   │   └── authStore.js
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

### Key Files

#### `src/services/api.js`
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://api.swarmstack.net',
  withCredentials: true, // Important for cookies
  headers: {
    'Authorization': `Bearer ${import.meta.env.VITE_API_KEY}`
  }
});

export const auth = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  refresh: () => api.post('/api/auth/refresh')
};

export const designSessions = {
  create: (description) => api.post('/api/design-sessions', { description }),
  get: (id) => api.get(`/api/design-sessions/${id}`),
  respond: (id, response) => api.post(`/api/design-sessions/${id}/respond`, { response }),
  generateSpec: (id) => api.post(`/api/design-sessions/${id}/generate-spec`),
  approve: (id) => api.post(`/api/design-sessions/${id}/approve`),
  startBuild: (id) => api.post(`/api/design-sessions/${id}/start-build`)
};

export default api;
```

#### `src/store/authStore.js`
```javascript
import { create } from 'zustand';
import { auth } from '../services/api';

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,
  
  login: async (email, password) => {
    const { data } = await auth.login(email, password);
    set({ user: data.user });
    return data;
  },
  
  logout: async () => {
    await auth.logout();
    set({ user: null });
  },
  
  checkAuth: async () => {
    try {
      const { data } = await auth.me();
      set({ user: data.user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  }
}));
```

#### `src/pages/Login.jsx`
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useAuthStore(s => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-lg w-96">
        <h1 className="text-2xl font-bold text-amber-500 mb-6">SwarmStack Login</h1>
        
        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded mb-4">{error}</div>}
        
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full p-3 mb-4 bg-gray-700 rounded text-white"
        />
        
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full p-3 mb-6 bg-gray-700 rounded text-white"
        />
        
        <button type="submit" className="w-full bg-amber-500 text-black p-3 rounded font-semibold hover:bg-amber-400">
          Sign In
        </button>
      </form>
    </div>
  );
}
```

### Caddy Configuration
```caddyfile
# Add to /etc/caddy/Caddyfile

app.swarmstack.net {
    root * /opt/swarm-dashboard/dist
    try_files {path} /index.html
    file_server
    encode gzip
    
    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
    }
}
```

### Deliverables
- [ ] Vite project created
- [ ] Dependencies installed
- [ ] Tailwind configured
- [ ] Auth store working
- [ ] Login page functional
- [ ] Protected routes working
- [ ] Caddy serving app.swarmstack.net

---

## Phase 5: CreateProject + DesignSession (~4 hours)

**Goal**: Build the project submission and clarification chat UI

### `src/pages/CreateProject.jsx`
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { designSessions } from '../services/api';

export default function CreateProject() {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data } = await designSessions.create(description);
      navigate(`/design/${data.session_id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-amber-500 mb-2">Start New Project</h1>
      <p className="text-gray-400 mb-6">
        Describe your project and our AI will help refine the requirements.
      </p>
      
      <form onSubmit={handleSubmit}>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Describe your project... What are you building? Who is it for? What problem does it solve?"
          className="w-full h-48 p-4 bg-gray-800 rounded-lg text-white resize-none"
          required
        />
        
        <button 
          type="submit" 
          disabled={isSubmitting || !description.trim()}
          className="mt-4 bg-amber-500 text-black px-6 py-3 rounded-lg font-semibold hover:bg-amber-400 disabled:opacity-50"
        >
          {isSubmitting ? 'Starting...' : 'Start Design Session'}
        </button>
      </form>
    </div>
  );
}
```

### `src/pages/DesignSession.jsx`
```jsx
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { designSessions } from '../services/api';

export default function DesignSession() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadSession();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSession = async () => {
    const { data } = await designSessions.get(id);
    setSession(data.session);
    setMessages(data.messages || []);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    
    try {
      const { data } = await designSessions.respond(id, userMessage);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      setSession(prev => ({ ...prev, state: data.state }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSpec = async () => {
    setIsLoading(true);
    try {
      const { data } = await designSessions.generateSpec(id);
      // Navigate to review page
      window.location.href = `/design/${id}/review`;
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const canGenerateSpec = session?.state === 'ready_for_docs' || 
    (session?.state === 'clarifying' && messages.length >= 6);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white">Design Session</h1>
            <span className="text-sm text-gray-400">State: {session?.state}</span>
          </div>
          {canGenerateSpec && (
            <button
              onClick={handleGenerateSpec}
              disabled={isLoading}
              className="bg-amber-500 text-black px-4 py-2 rounded font-semibold hover:bg-amber-400"
            >
              Generate Spec Card
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-lg ${
              msg.role === 'user' 
                ? 'bg-amber-500 text-black' 
                : 'bg-gray-700 text-white'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 text-white p-3 rounded-lg animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-gray-800 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your response..."
            className="flex-1 p-3 bg-gray-700 rounded-lg text-white"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-amber-500 text-black px-6 py-3 rounded-lg font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Deliverables
- [ ] CreateProject page working
- [ ] Session created in database
- [ ] DesignSession chat working
- [ ] Messages persisted
- [ ] AI questions generated
- [ ] "Generate Spec Card" button appears when ready

---

## Phase 6: SpecReview + BuildConfirmation (~3 hours)

**Goal**: Review spec card and approve for build

### `src/pages/SpecReview.jsx`
```jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { designSessions } from '../services/api';
import ReactMarkdown from 'react-markdown';

export default function SpecReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [specCard, setSpecCard] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showBuildModal, setShowBuildModal] = useState(false);

  useEffect(() => {
    loadSession();
  }, [id]);

  const loadSession = async () => {
    const { data } = await designSessions.get(id);
    setSession(data.session);
    setSpecCard(data.session.spec_card || '');
  };

  const handleApprove = async () => {
    await designSessions.approve(id);
    setShowBuildModal(true);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-amber-500">Review Spec Card</h1>
        <div className="space-x-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            {isEditing ? 'Preview' : 'Edit'}
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 bg-amber-500 text-black rounded font-semibold hover:bg-amber-400"
          >
            Approve Spec Card
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        {isEditing ? (
          <textarea
            value={specCard}
            onChange={e => setSpecCard(e.target.value)}
            className="w-full h-[60vh] bg-gray-900 text-white p-4 rounded font-mono"
          />
        ) : (
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{specCard}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Build Confirmation Modal */}
      {showBuildModal && (
        <BuildConfirmationModal 
          sessionId={id}
          onClose={() => setShowBuildModal(false)}
          onConfirm={() => navigate(`/project/${session.project_id}/build`)}
        />
      )}
    </div>
  );
}

function BuildConfirmationModal({ sessionId, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  const handleStartBuild = async () => {
    setIsBuilding(true);
    try {
      await designSessions.startBuild(sessionId);
      onConfirm();
    } catch (err) {
      console.error(err);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-amber-500 mb-4">Start Build?</h2>
        
        <div className="space-y-3 mb-6 text-gray-300">
          <p>This will:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Generate development tickets</li>
            <li>Spawn AI agents in isolated VMs</li>
            <li>Begin autonomous code generation</li>
          </ul>
        </div>

        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="w-5 h-5"
          />
          <span className="text-white">I understand and want to proceed</span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleStartBuild}
            disabled={!confirmed || isBuilding}
            className="flex-1 px-4 py-2 bg-amber-500 text-black rounded font-semibold hover:bg-amber-400 disabled:opacity-50"
          >
            {isBuilding ? 'Starting...' : 'Start Build'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Deliverables
- [ ] SpecReview page showing markdown
- [ ] Edit mode working
- [ ] Approve button working
- [ ] Build confirmation modal with checkbox
- [ ] Start build triggers ticket generation

---

## Phase 7: Integration Testing (~2 hours)

**Goal**: End-to-end test the complete workflow

### Test Checklist

#### Authentication Flow
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (shows error)
- [ ] Protected routes redirect to login
- [ ] Logout clears session
- [ ] Token refresh works

#### Design Session Flow
- [ ] Create new project from dashboard
- [ ] Session created with 'input' state
- [ ] First message triggers AI question
- [ ] Chat continues for 3-5 rounds
- [ ] "Generate Spec Card" button appears
- [ ] Spec card generated (state → 'reviewing')
- [ ] Spec card editable in markdown
- [ ] Approve button works (state → 'approved')
- [ ] Build modal shows with checkbox
- [ ] Start Build triggers ticket generation

#### Gate Enforcement
- [ ] Cannot approve from 'input' state (403)
- [ ] Cannot generate spec from 'input' state (403)
- [ ] Cannot start build without approval (403)
- [ ] State transitions logged in audit table

#### Error Handling
- [ ] Network errors show user-friendly message
- [ ] API errors display properly
- [ ] Loading states show correctly
- [ ] Session recovery after page refresh

### Test Script
```bash
#!/bin/bash
# Full E2E test

API="https://api.swarmstack.net"
AUTH="Authorization: Bearer sk-swarm-prod-..."

# 1. Login
echo "=== Login ==="
curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"email":"admin@swarmstack.net","password":"SwarmAdmin2024!"}' \
  -c cookies.txt | jq

# 2. Create session
echo "=== Create Session ==="
SESSION=$(curl -s -X POST "$API/api/design-sessions" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -b cookies.txt \
  -d '{"description":"Build a todo app with user auth"}' | jq -r '.session_id')
echo "Session ID: $SESSION"

# 3. Respond to questions
echo "=== Respond ==="
curl -s -X POST "$API/api/design-sessions/$SESSION/respond" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -b cookies.txt \
  -d '{"response":"React frontend, Node.js backend, PostgreSQL database"}' | jq

# 4. Try invalid transition (should fail)
echo "=== Invalid Transition (should fail) ==="
curl -s -X POST "$API/api/design-sessions/$SESSION/approve" \
  -H "$AUTH" \
  -b cookies.txt | jq

# 5. Generate spec
echo "=== Generate Spec ==="
curl -s -X POST "$API/api/design-sessions/$SESSION/generate-spec" \
  -H "$AUTH" \
  -b cookies.txt | jq

# 6. Approve
echo "=== Approve ==="
curl -s -X POST "$API/api/design-sessions/$SESSION/approve" \
  -H "$AUTH" \
  -b cookies.txt | jq

# 7. Start build
echo "=== Start Build ==="
curl -s -X POST "$API/api/design-sessions/$SESSION/start-build" \
  -H "$AUTH" \
  -b cookies.txt | jq

echo "=== DONE ==="
```

### Deliverables
- [ ] All test cases pass
- [ ] No console errors in browser
- [ ] State transitions work correctly
- [ ] Build triggers ticket creation

---

## Environment Variables

### API Server (`/opt/swarm-tickets/.env`)
```env
JWT_SECRET=<generate-secure-random-string>
JWT_REFRESH_SECRET=<generate-secure-random-string>
ANTHROPIC_API_KEY=sk-ant-api03-...
COOKIE_DOMAIN=.swarmstack.net
NODE_ENV=production
```

### React App (`/opt/swarm-dashboard/.env`)
```env
VITE_API_URL=https://api.swarmstack.net
VITE_API_KEY=sk-swarm-prod-7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a
```

---

## Quick Reference Commands

```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin

# Build and deploy dashboard
cd /opt/swarm-dashboard
npm run build
systemctl reload caddy

# Restart API
systemctl restart swarm-api

# View logs
journalctl -u swarm-api -f
journalctl -u caddy -f

# Check database
sqlite3 /opt/swarm-tickets/data/swarm.db ".tables"
sqlite3 /opt/swarm-tickets/data/swarm.db "SELECT * FROM design_sessions"
```

---

*Created: December 11, 2025*
*Source: UI HITL Specification + Session Notes*
