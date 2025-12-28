# Pending Promotions

Changes developed on **dev** (134.199.235.140) awaiting promotion to **production** (146.190.35.235).

---

## PROM-014: Deploy Agent Fixes - Node Version & Package Manager

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-deploy (deploy-agent)  
**Service:** deploy-agent on port 3457

### Overview

Fixed deployment failures in the deploy-agent service caused by wrong Node.js version path and incorrect package manager commands.

### Issues Fixed

| Issue | Root Cause | Fix |
|-------|------------|-----|
| `npm: command not found` | executor.ts had wrong Node version (`v22.12.0` vs `v22.21.1`) | Updated NODE_BIN path |
| `vite: not found` | swarm-dashboard uses pnpm but manifest used npm | Changed to pnpm commands |
| Rollback typo | `ppnpm run build` typo | Fixed to `pnpm run build` |

### Files Modified on DEV

1. `/opt/swarm-deploy/src/executor.ts`
```typescript
// Before
const NODE_BIN = '/root/.nvm/versions/node/v22.12.0/bin';

// After
const NODE_BIN = '/root/.nvm/versions/node/v22.21.1/bin';
```

2. `/opt/swarm-deploy/manifests/swarm-dashboard.yaml`
```yaml
# Build section - Before
commands:
  - npm ci
  - npm run build

# Build section - After
commands:
  - pnpm install
  - pnpm run build

# Rollback section - also updated npm → pnpm
```

### Testing Completed on DEV
- [x] Two successful deployments after fix
- [x] `331a4ed4` - SUCCESS (11s total)
- [x] `9e24b3c1` - SUCCESS (11s total)
- [x] Health check passes with retry
- [x] PM2 restart works correctly

### Promotion Commands
```bash
# 1. Update executor.ts on PROD
ssh root@146.190.35.235
cd /opt/swarm-deploy
sed -i 's/v22.12.0/v22.21.1/g' src/executor.ts

# 2. Update swarm-dashboard manifest on PROD
sed -i 's/npm ci/pnpm install/g; s/npm run build/pnpm run build/g' manifests/swarm-dashboard.yaml

# 3. Rebuild and restart
npm run build
pm2 restart deploy-agent
```

### Rollback
```bash
# Revert executor.ts
sed -i 's/v22.21.1/v22.12.0/g' /opt/swarm-deploy/src/executor.ts

# Revert manifest
sed -i 's/pnpm install/npm ci/g; s/pnpm run build/npm run build/g' /opt/swarm-deploy/manifests/swarm-dashboard.yaml

npm run build
pm2 restart deploy-agent
```

### Notes
- PROD Node version must match DEV (v22.21.1) for this fix to work
- If PROD uses different Node version, adjust NODE_BIN path accordingly
- swarm-platform manifest uses npm (correct) - no changes needed

---

## PROM-015: Deploy Agent Service Manifests

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-deploy (deploy-agent)  
**Service:** deploy-agent manifests

### Overview

Added deployment manifests for mcp-factory and swarm-verifier services. Deploy agent now supports automated deployments for all 4 core services.

### New Manifests

| Service | Port | PM2 Name | Health Check |
|---------|------|----------|--------------|
| mcp-factory | 3456 | mcp-factory | GET /api/health |
| swarm-verifier | 8090 | swarm-verifier | GET /health |

### Files Added

1. `/opt/swarm-deploy/manifests/mcp-factory.yaml`
   - Repository: corynaegle-ai/swarm-mcp-factory
   - Path: /opt/swarm-mcp-factory
   - Build: npm ci

2. `/opt/swarm-deploy/manifests/swarm-verifier.yaml`
   - Repository: corynaegle-ai/swarm-verifier
   - Path: /opt/swarm-verifier
   - Build: npm ci

### Testing Completed on DEV
- [x] Deploy agent loads all 4 manifests
- [x] GET /api/manifests returns: mcp-factory, swarm-dashboard, swarm-platform, swarm-verifier
- [x] Health endpoints verified for both services

### Promotion Commands
```bash
# Copy manifests to PROD
scp /opt/swarm-deploy/manifests/mcp-factory.yaml root@146.190.35.235:/opt/swarm-deploy/manifests/
scp /opt/swarm-deploy/manifests/swarm-verifier.yaml root@146.190.35.235:/opt/swarm-deploy/manifests/

# Restart deploy-agent on PROD
pm2 restart deploy-agent

# Verify
curl http://localhost:3457/api/manifests
```

### Rollback
```bash
rm /opt/swarm-deploy/manifests/mcp-factory.yaml
rm /opt/swarm-deploy/manifests/swarm-verifier.yaml
pm2 restart deploy-agent
```

---

## PROM-013: executeGenerateTickets Implementation

**Created:** 2025-12-16  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-platform  
**Commit:** 384b31f

### Overview

Implemented the `executeGenerateTickets()` method in ai-dispatcher.js to convert approved specifications into actionable development tickets. This is the final step in the HITL design session workflow.

### Changes Made

**1. New Prompt Files**

| File | Lines | Purpose |
|------|-------|---------|
| `prompts/generate-tickets.md` | 95 | Generic ticket generation prompt |
| `prompts/build-feature-tickets.md` | 109 | Build feature variant with repo integration |
| `prompts/build-feature-clarify.md` | 50 | Clarification prompt for build_feature |
| `prompts/build-feature-spec.md` | 65 | Spec generation with repo analysis |

**2. ai-dispatcher.js Updates**

Added full placeholder injection for build_feature projects.

**3. repoAnalysis.js Service**

New service (194 lines) for GitHub repository analysis with PAT authentication.

### Files Modified
- [x] `services/ai-dispatcher.js` - Placeholder injection
- [x] `prompts/generate-tickets.md` - NEW
- [x] `prompts/build-feature-tickets.md` - NEW  
- [x] `prompts/build-feature-clarify.md` - NEW
- [x] `prompts/build-feature-spec.md` - NEW
- [x] `services/repoAnalysis.js` - NEW

### Testing Completed on DEV
- [x] Syntax check passes
- [x] PM2 restart successful
- [x] Platform running stable

### Promotion Commands
```bash
cd /opt/swarm-platform
git pull origin main
pm2 restart swarm-platform
```

### Rollback
```bash
cd /opt/swarm-platform
git checkout f29cec3
pm2 restart swarm-platform
```

---


## PROM-012: MCP Factory Ticket Integration

**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard, Caddyfile  
**Commit:** 09d1090

### Overview

Integrated MCP Server project type with the MCP Factory service for direct ticket generation. MCP projects now bypass the generic HITL ticket generator and use purpose-built MCP-specific ticket patterns.

### Changes Made

**1. Caddy Proxy Route** (`/etc/caddy/Caddyfile`)
```caddy
@mcpfactory path /api/mcp-factory/*
handle @mcpfactory {
    uri strip_prefix /api/mcp-factory
    reverse_proxy localhost:3456
}
```

**2. New MCP API Service** (`src/services/mcpApi.js`)
- `designMcpServer(description)` - Calls mcp-factory `/api/design` endpoint

**3. CreateProject.jsx Updates**
- Import `designMcpServer` from new service
- Added `isDesigning` state for loading UI
- Modified `handleMcpSubmit` to call mcp-factory directly
- Navigate to `/projects/{id}` after design complete
- Button shows "⏳ Designing MCP Server..." during API call

### Ticket Pattern Generated

MCP projects create structured tickets:
- `TKT-xxx-EPIC` - Server Scaffold (state: ready)
- `TKT-xxx-TOOL-N` - One per tool (state: blocked)
- `TKT-xxx-VAL` - Validation & Tests (state: blocked)
- `TKT-xxx-PKG` - Package & Distribution (state: blocked)

### Files Modified
- [x] `/etc/caddy/Caddyfile` - Added mcp-factory proxy route
- [x] `src/services/mcpApi.js` - New file
- [x] `src/pages/CreateProject.jsx` - MCP submit handler refactored

### Testing Completed on DEV
- [x] Caddy proxy routes to mcp-factory (port 3456)
- [x] API returns success with MCP spec and tickets
- [x] Projects created with type='mcp'
- [x] Tickets follow EPIC → TOOL-N → VAL → PKG pattern

### Promotion Commands
```bash
# 1. Update Caddyfile on PROD - add to dashboard block:
@mcpfactory path /api/mcp-factory/*
handle @mcpfactory {
    uri strip_prefix /api/mcp-factory
    reverse_proxy localhost:3456
}
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy reload --config /etc/caddy/Caddyfile

# 2. Update dashboard
cd /opt/swarm-dashboard && git pull && npm run build && pm2 restart swarm-dashboard

# 3. Ensure mcp-factory is running on PROD
pm2 status mcp-factory
```

### Dependencies
- Requires mcp-factory service running on port 3456 on PROD

---

## PROM-011: BuildProgress Page Sidebar Navigation Fix

**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard  
**Commit:** 049910c

### Problem

The BuildProgress page (/build/:sessionId) was using an outdated header-based navigation layout instead of the sidebar layout used by all other pages in the dashboard. This created visual inconsistency and a jarring user experience when navigating from the design session to the build progress page.

### Fix Applied

Completely refactored BuildProgress.jsx to use the standard sidebar layout pattern:

| Before | After |
|--------|-------|
| `<header>` with h1 | `<div className="page-container">` wrapper |
| `<nav>` with text links | `<Sidebar />` component |
| Dashboard-nav class | `<main className="page-main">` content area |
| Inline UserMenu | Sidebar includes user info and logout |

### Visual Changes

- Added Sidebar component matching other pages (Dashboard, Tickets, VMs, etc.)
- Replaced emoji-based header with Lucide icon (Hammer)
- Connection status uses Wifi/WifiOff icons with styled badge
- Grid layout for progress, logs, and tickets cards
- Consistent glass-card styling with other pages
- Responsive breakpoints for mobile/tablet

### Files Modified
- [x] src/pages/BuildProgress.jsx - Complete rewrite with sidebar layout

### Testing Completed on DEV
- [x] Sidebar displays with all nav items
- [x] Active state highlights correct nav item
- [x] Connection status indicator works (Live/Disconnected)
- [x] Progress bar animates correctly
- [x] Ticket list populates with WebSocket events
- [x] Build logs display in real-time
- [x] Responsive layout works at breakpoints
- [x] Navigation from design session preserves context

### Promotion Commands
```bash
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Caddy serves static from dist/ - no restart needed
```

### Rollback
```bash
cd /opt/swarm-dashboard
git checkout 8396763  # PROM-010
npm run build
```

---


## PROM-010: Design Session Sticky Sidebar Fix

**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard  
**Commit:** 8396763

### Problem

On the Design Session page, when the chat conversation becomes long, the right sidebar (containing "Gathered Info", "Actions" buttons like Generate Spec/View Spec/Approve, and Spec Preview) scrolls out of view. Users had to scroll back up to access the action buttons.

### Fix Applied

Made the sidebar sticky so it stays in view while scrolling through the conversation.

### CSS Changes

```css
.ds-sidebar {
  position: sticky;
  top: 1rem;
  align-self: start;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  /* existing properties retained */
}
```

| Property | Purpose |
|----------|---------|
| position: sticky | Keeps sidebar fixed relative to viewport during scroll |
| top: 1rem | 1rem offset from top when stuck |
| align-self: start | Required for sticky in CSS grid - prevents height stretch |
| max-height: calc(100vh - 2rem) | Limits sidebar height to viewport minus margins |
| overflow-y: auto | Allows sidebar to scroll if content exceeds max-height |

### Files Modified
- [x] src/pages/DesignSession.css - Added sticky positioning to .ds-sidebar

### Testing Completed on DEV
- [x] Sidebar stays in view when scrolling long conversations
- [x] Action buttons (Generate Spec, View Spec, Approve) always accessible
- [x] Sidebar scrolls internally if it has too much content
- [x] Responsive behavior preserved (sidebar hides on mobile)

### Promotion Commands
```bash
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Caddy serves static from dist/ - no restart needed
```

### Rollback
```bash
cd /opt/swarm-dashboard
git checkout 7924612  # PROM-009
npm run build
```

---

## PROM-009: Learning Dashboard UI Redesign


**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard  
**Commit:** 7924612

### Overview

Complete visual redesign of the Learning Dashboard page with modern glass-morphism effects, smooth animations, and improved UX.

### Design Changes

| Component | Before | After |
|-----------|--------|-------|
| Stats Cards | Basic gray boxes | Glass-morphism with gradient borders, hover lift, staggered animations |
| Panels | Simple bordered cards | Frosted glass effect, colored header accents, smooth scrolling |
| Empty States | Plain text | Floating icon animation, descriptive text |
| Buttons | Basic styling | Shimmer hover effect, subtle shadows, loading states |
| Temporal Chart | Basic colored divs | Gradient bars with hover effects, legend |
| Loading State | Text only | Purple gradient spinner |

### New Features

- Staggered fade-in-up animations for page sections
- Scale-in for stat cards with delay cascade
- Floating animation for empty state icons
- Spin animation on refresh button hover
- Shimmer effect on generate button
- Color-coded success rate (green/yellow/red)
- Custom scrollbar styling
- Responsive grid (4→2 cols at 1200px, 2→1 at 900px)

### Files Modified
- [x] src/pages/LearningDashboard.jsx - Restructured with semantic classes
- [x] src/pages/LearningDashboard.css - NEW (625 lines premium styles)

### Testing Completed on DEV
- [x] Page loads with smooth animations
- [x] Stats cards display with hover effects
- [x] Empty states show floating icons
- [x] Refresh button spins on hover
- [x] Generate Rules button has shimmer effect
- [x] Responsive layout works at breakpoints
- [x] API data displays correctly

### Promotion Commands
```bash
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Caddy serves static from dist/ - no restart needed
```

### Rollback
```bash
cd /opt/swarm-dashboard
git checkout c08e684  # PROM-007
npm run build
```

---

## PROM-008: Cookie Domain Fix for Dev/Prod Environments

**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-platform  
**Commit:** f29cec3

### Problem

Authentication cookies were hardcoded to `.swarmstack.net` domain, causing 401 Unauthorized errors on DEV environment (`*.dev.swarmstack.net`).

### Root Cause

`routes/auth.js` had hardcoded cookie domain:
```javascript
// Before
domain: '.swarmstack.net'
```

### Fix Applied

Changed to environment variable with fallback:
```javascript
// After
domain: process.env.COOKIE_DOMAIN || '.swarmstack.net'
```

### Environment Configuration

| Environment | COOKIE_DOMAIN | Result |
|-------------|---------------|--------|
| DEV | `.dev.swarmstack.net` | Cookies work on dev subdomains |
| PROD | (not set, uses default) | Cookies work on prod subdomains |

### Files Modified
- [x] routes/auth.js - Line 20 (cookieOptions) and Line 108 (clearCookie)

### Testing Completed on DEV
- [x] Login returns cookie with correct domain
- [x] Learning API returns 200 (was 401)
- [x] All authenticated endpoints work
- [x] Logout clears cookie correctly

### Promotion Commands
```bash
cd /opt/swarm-platform
git pull origin main
pm2 restart swarm-platform
# COOKIE_DOMAIN not needed on prod - uses default
```

### Rollback
```bash
cd /opt/swarm-platform
git checkout fa7756b  # Previous commit
pm2 restart swarm-platform
```

---

## PROM-007: CreateProject UI Enhancement - Lucide Icons & Sidebar Styling

**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard  
**Commit:** c08e684

### Changes

#### CreateProject Page Icon Overhaul
- **Before**: Emoji icons (📱, 🔌, ⚡) that looked unprofessional
- **After**: Lucide React icons with gradient backgrounds matching navbar style

| Card | Icon | Color Gradient |
|------|------|----------------|
| New Application | AppWindow | Blue (#3b82f6 → #2563eb) |
| New MCP Server | Plug2 | Green (#22c55e → #16a34a) |
| New Workflow | Workflow | Purple (#8b5cf6 → #7c3aed) |

#### Card Styling Updates
- Background: `linear-gradient(145deg, #1e293b, #0f172a)`
- Border: `#334155` (1px solid)
- Hover: `translateY(-2px)` with color-matched shadows
- Left-aligned layout (changed from center)

#### Recent Sessions Sidebar
- Matching gradient background as project cards
- Session items with subtle gradient and blue hover effect
- Consistent typography (`#f1f5f9` headings, `#94a3b8` text)

### Files Modified
- [x] src/pages/CreateProject.jsx - Lucide icons, card layout, icon wrappers
- [x] src/App.css - Project type styles, sidebar styles

### Testing Completed on DEV
- [x] All three project type cards display with correct icons
- [x] Hover effects work with color-matched shadows
- [x] Recent sessions sidebar matches card styling
- [x] Icons render at correct size (24px in 48px wrapper)
- [x] Navigation and form submission still functional

### Promotion Commands
```bash
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Caddy serves static from dist/ - no restart needed
```

### Rollback
```bash
cd /opt/swarm-dashboard
git checkout 57d6c94  # Previous commit (PROM-006)
npm run build
```

---

## PROM-006: Critical HITL Bug Fixes (AI Trigger + Ticket Generation)

**Created:** 2025-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard, swarm-platform  
**Dashboard Commit:** 57d6c94  
**Platform Commit:** c42d400

### Critical Bugs Fixed

#### Bug 1: Project Description Not Triggering AI
- **Symptom**: User enters description, clicks submit, navigates to design page, but AI never responds
- **Root Cause**: CreateProject.jsx only called createSession() but never startClarification()
- **Fix**: Added startClarification(result.id) after session creation

#### Bug 2: No Tickets Generated After Build Start
- **Symptom**: Build starts, repo created, but 0 tickets in database
- **Root Cause**: RepoSetupModal.jsx only called /api/repo/provision, never /api/hitl/:id/start-build
- **Fix**: Chain both API calls in handleSubmit()

#### Bug 3: Building Badge Not Clickable
- **Symptom**: "Building" state badge on design page isn't interactive
- **Fix**: Added onClick handler to navigate to /build/:sessionId with hover effects

### Files Modified

**swarm-dashboard:**
- [x] src/pages/CreateProject.jsx - Add startClarification() call after createSession()
- [x] src/components/RepoSetupModal.jsx - Chain provision + start-build API calls
- [x] src/pages/DesignSession.jsx - Clickable building badge
- [x] src/pages/DesignSession.css - Hover effects for clickable badge
- [x] src/context/AuthContext.jsx - Auth improvements
- [x] src/hooks/useWebSocket.js - WebSocket fixes

**swarm-platform:**
- [x] routes/hitl.js - Session/project linkage
- [x] routes/repo.js - Project ID fixes
- [x] routes/auth.js - JWT improvements
- [x] server.js - Middleware updates
- [x] websocket.js - Auth and broadcast fixes

### Testing Completed on DEV
- [x] Create new project → AI clarification triggers immediately
- [x] Full clarification flow → spec generated
- [x] Start build → 62 tickets generated
- [x] Building badge clickable → navigates to build progress
- [x] WebSocket auth works with JWT

### Promotion Commands

```bash
# 1. Dashboard
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Static files served by Caddy - no restart needed

# 2. Platform (if not auto-synced)
cd /opt/swarm-platform
git pull origin main
pm2 restart swarm-platform
```

### Rollback
```bash
# Dashboard
cd /opt/swarm-dashboard
git checkout 1ea7b99  # Previous commit
npm run build

# Platform  
cd /opt/swarm-platform
git checkout 3aa4349  # Previous commit
pm2 restart swarm-platform
```

---

## PROM-005: HITL UI Polish & CSS Enhancements

**Created:** 2024-12-16  
**Status:** ✅ DEPLOYED TO PROD (2025-12-16)  
**Repos:** swarm-dashboard  
**Commit:** 35c857d

### Scope
- CSS animations (glass-card, typing-indicator, message slide-in)
- State badge color differentiation
- Glowing input focus states

### Files Modified
- [x] src/App.css - Glass utilities, input focus glow, scrollbar styling
- [x] src/pages/DesignSession.jsx - Added data-state attribute to badge
- [x] src/pages/DesignSession.css - Full rewrite with animations
- [x] src/components/TypingIndicator.css - Cyan theme, bounce animation
- [x] src/components/ChatMessage.css - Slide-in animations

### Database Fix (DEV only - already in PROD)
Added `SYSTEM_GITHUB_PAT` to secrets table - was missing on DEV causing repo provision failure.

### Testing Checklist
- [x] CreateProject form submits and redirects
- [x] Chat messages animate in (slide from left/right)
- [x] Typing indicator pulses with cyan dots
- [x] State badges show correct colors
- [x] Glass card effects visible
- [x] Input focus glow
- [x] Full HITL flow to building state

### Promotion Command
```bash
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Caddy serves static from dist/ - no restart needed
```

---

*Add new entries above this line*


## PROM-016: Start-Build Race Condition Fix + HITL Cleanup

**Created:** 2025-12-17  
**Status:** ✅ DEPLOYED TO PROD (2025-12-17)

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-platform, swarm-dashboard  
**Platform Commits:** 0d6a67b, a9242c4, 8d60949, 6cd09a5  
**Dashboard Commit:** 8692d78

### Critical Bug Fixed

**Symptom:** User completes design session, approves spec, clicks "Start Build" but no tickets are generated. Session shows "building" state with 87% progress but tickets table is empty.

**Root Cause:** Race condition between `/api/repo/provision` and `/api/hitl/:id/start-build`:

| Time | Endpoint | Action | State After |
|------|----------|--------|-------------|
| T+0ms | /provision | Creates repo, sets state='building' | building |
| T+31ms | /start-build | Checks state === 'approved' -> FAILS 400 | building |

The `/provision` endpoint was setting the session state to "building" before `/start-build` could run. Since `/start-build` requires state='approved', it returned 400 error and never generated tickets.

### Fix Applied

Removed `state='building'` from all three repo endpoints in `routes/repo.js`:
- `/provision` (managed repos)
- `/link` (linked existing repos)  
- `/use-existing` (build_feature repos)

Now these endpoints only link the `project_id` to the session. The `/start-build` endpoint handles the full state transition and ticket generation workflow.

### Files Modified

**swarm-platform:**
| File | Change |
|------|--------|
| routes/repo.js | Remove state='building' from all 3 endpoints |
| agents/clarification-agent.js | Build-feature prompt handling |
| routes/hitl.js | Auto-analyze repo for build_feature |
| routes/tickets.js | parent_id support, deploy agent notify |
| server.js | Add MCP routes |
| routes/mcp.js | NEW - MCP server routes |
| services/mcp-ticket-generator.js | NEW - MCP ticket generation |

**swarm-dashboard:**
| File | Change |
|------|--------|
| src/pages/CreateProject.jsx | Pass featureDescription not featureSpec |
| src/pages/DesignSession.jsx | Proper clarification response handling |

### Database Cleanup Performed on DEV

Deleted 5 orphaned sessions stuck in "clarifying" state with 0 messages (IDs: 11749771..., e7293f84..., c1c23738..., 5575957b..., 1d9dce5c...)

### Testing Completed on DEV
- [x] Platform restarted successfully
- [x] New sessions reach "clarifying" with messages
- [x] Full workflow: input -> clarifying -> reviewing -> approved -> building
- [x] Tickets generated after start-build (verified in prior sessions)

### Promotion Commands
```bash
# 1. Platform
cd /opt/swarm-platform
git pull origin main
pm2 restart swarm-platform

# 2. Dashboard
cd /opt/swarm-dashboard
git pull origin main
npm run build
# Caddy serves static - no restart needed
```

### Rollback
```bash
# Platform
cd /opt/swarm-platform
git checkout 23541e4
pm2 restart swarm-platform

# Dashboard
cd /opt/swarm-dashboard
git checkout 09d1090
npm run build
```

---

## PROM-016: Start-Build Race Condition Fix + HITL Cleanup

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-platform, swarm-dashboard  
**Platform Commits:** 0d6a67b, a9242c4, 8d60949, 6cd09a5  
**Dashboard Commit:** 8692d78

### Critical Bug Fixed

**Symptom:** User completes design session, approves spec, clicks "Start Build" but no tickets are generated. Session shows "building" state with 87% progress but tickets table is empty.

**Root Cause:** Race condition between  and :

| Time | Endpoint | Action | State After |
|------|----------|--------|-------------|
| T+0ms | /provision | Creates repo, sets state='building' | building |
| T+31ms | /start-build | Checks state === 'approved' → **FAILS 400** | building |

The  endpoint was setting the session state to "building" before  could run. Since  requires state='approved', it returned 400 error and never generated tickets.

### Fix Applied

Removed  from all three repo endpoints in :
-  (managed repos)
-  (linked existing repos)  
-  (build_feature repos)

Now these endpoints only link the  to the session. The  endpoint handles the full state transition and ticket generation workflow.

### Files Modified

**swarm-platform:**
| File | Change |
|------|--------|
| routes/repo.js | Remove state='building' from all 3 endpoints |
| agents/clarification-agent.js | Build-feature prompt handling |
| routes/hitl.js | Auto-analyze repo for build_feature |
| routes/tickets.js | parent_id support, deploy agent notify |
| server.js | Add MCP routes |
| routes/mcp.js | NEW - MCP server routes |
| services/mcp-ticket-generator.js | NEW - MCP ticket generation |

**swarm-dashboard:**
| File | Change |
|------|--------|
| src/pages/CreateProject.jsx | Pass featureDescription not featureSpec |
| src/pages/DesignSession.jsx | Proper clarification response handling |

### Database Cleanup Performed on DEV

Deleted 5 orphaned sessions stuck in "clarifying" state with 0 messages:


### Testing Completed on DEV
- [x] Platform restarted successfully
- [x] New sessions reach "clarifying" with messages
- [x] Full workflow: input → clarifying → reviewing → approved → building
- [x] Tickets generated after start-build (verified in prior sessions)

### Promotion Commands


### Rollback


---


## PROM-017: Agent Catalog Dashboard + Login Fix

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-dashboard, swarm-platform  
**Dashboard Commits:** 5282401, 5bef1cd  
**Platform Fix:** PM2 environment variable correction

### Features Added

Complete Agent Catalog UI with grid display, filtering, and detail pages.

| Component | Location | Purpose |
|-----------|----------|---------|
| AgentCatalog.jsx | src/pages/ | Grid view with search/filter |
| AgentCatalog.css | src/pages/ | Dark theme styling (229 lines) |
| AgentCard.jsx | src/components/ | Card component with badges |
| AgentCard.css | src/components/ | Card styling (185 lines) |
| AgentDetail.jsx | src/pages/ | Detail page with tabs |
| AgentDetail.css | src/pages/ | Detail styling (325 lines) |
| registryApi.js | src/services/ | API client for registry |

### Bug Fixed: Login "no such table: users"

**Symptom:** Login at /signin returned "no such table: users" error.

**Root Cause:** PM2 process had wrong DB_PATH environment variable pointing to deployments.db instead of swarm.db.

**Fix:** Restarted swarm-platform-dev with correct DB_PATH, saved PM2 config.

### Bug Fixed: Catalog Layout Bleeding Under Sidebar

**Symptom:** Agent cards were clipped/hidden behind the sidebar.

**Root Cause:** AgentCatalog.jsx used wrong CSS classes instead of the shared layout classes.

**Fix:** Updated class names to use layout.css which has proper margin-left: 260px.

### Bug Fixed: Double Sidebar Highlight

**Symptom:** Both "Agents" and "Catalog" nav items highlighted when on /agents/catalog.

**Root Cause:** isActive() function used startsWith() which matched /agents for /agents/catalog.

**Fix:** Added exact match logic for /agents route in Sidebar.jsx.

### Backend Verified

| Component | Status |
|-----------|--------|
| Registry Routes | Mounted at /api/registry/* |
| Registry DB | 6 agents populated |
| Auth Middleware | Working on all registry routes |

### Testing Completed on DEV
- [x] Login works with admin@swarmstack.net
- [x] Agent catalog displays 6 agents in grid
- [x] Catalog layout properly offset from sidebar
- [x] Only "Catalog" highlighted when on /agents/catalog
- [x] Cards show runtime badges, memory, tags

### Promotion Commands
```bash
# 1. Dashboard
cd /opt/swarm-dashboard
git pull origin main
npm run build

# 2. Platform - ensure correct DB_PATH
cd /opt/swarm-platform
git pull origin main
pm2 delete swarm-platform 2>/dev/null
DB_PATH=/opt/swarm-platform/data/swarm.db pm2 start server.js --name swarm-platform
pm2 save
```

### Rollback
```bash
# Dashboard
cd /opt/swarm-dashboard
git checkout 8692d78
npm run build

# Platform
pm2 restart swarm-platform
```

---


## PROM-018: Build Feature Integration Chain (GAPs #3 & #5)

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm (engine), swarm-platform  
**Engine Commit:** 0f1f30c  
**Platform Commit:** 6a4581b

### Overview

Completes the Build Feature integration chain by implementing:
- GAP #3: Worker → Verifier → PR Chain
- GAP #5: Session completion when all tickets done

### GAP #3: Worker → Verifier → PR Chain

**File:** `/opt/swarm/engine/lib/engine.js`

| Method | Lines | Purpose |
|--------|-------|---------|
| `_postCodeGeneration()` | 529-590 | Orchestrates verification after code gen |
| `_createPR()` | 595-625 | Creates GitHub PR via `gh` CLI |

**Flow:**
```
Engine dispatches ticket → FORGE generates code → _postCodeGeneration() →
  → verify() service call →
    [pass] → _createPR() → ticket.state = 'in_review'
    [fail] → store feedback → ticket.state = 'needs_review'
```

**Features:**
- Calls verifier with acceptance criteria
- Max retry attempts with feedback storage
- GitHub PR creation with proper title/body
- Error handling with graceful fallback

### GAP #5: Session Completion Check

**File:** `/opt/swarm-platform/routes/tickets.js`

| Component | Line | Purpose |
|-----------|------|---------|
| `checkSessionCompletion()` | 393 | Checks if all session tickets done |
| Call site | 132 | Triggered on ticket state = 'done' |

**Flow:**
```
Ticket marked 'done' → checkSessionCompletion() →
  COUNT incomplete tickets in session →
    [0] → hitl_sessions.state = 'completed'
```

### All GAPs Now Complete

| Gap | Description | Status |
|-----|-------------|--------|
| #1 | HITL → Engine trigger | ✅ |
| #2 | Engine DB path + PM2 | ✅ |
| #3 | Worker → Verifier → PR | ✅ |
| #4 | Deploy → Ticket Completion | ✅ |
| #5 | All Tickets → Session Complete | ✅ |

### Promotion Commands
```bash
# 1. Engine
cd /opt/swarm/engine
git pull origin main
pm2 restart swarm-engine

# 2. Platform
cd /opt/swarm-platform
git pull origin main
pm2 restart swarm-platform
```

### Rollback
```bash
# Engine
cd /opt/swarm/engine
git checkout d84aba8
pm2 restart swarm-engine

# Platform
cd /opt/swarm-platform
git checkout 95dae1b
pm2 restart swarm-platform
```

### Testing Checklist
- [ ] Engine calls verifier after code generation (check logs)
- [ ] PR created on GitHub after verification passes
- [ ] Complete all tickets → session state = 'completed'

---

## PROM-017: Agent Catalog Dashboard + Login Fix

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm-dashboard, swarm-platform  
**Dashboard Commits:** 5282401, 5bef1cd  
**Platform Fix:** PM2 environment variable correction

### Features Added

Complete Agent Catalog UI with grid display, filtering, and detail pages.

| Component | Location | Purpose |
|-----------|----------|---------|
| AgentCatalog.jsx | src/pages/ | Grid view with search/filter |
| AgentCatalog.css | src/pages/ | Dark theme styling (229 lines) |
| AgentCard.jsx | src/components/ | Card component with badges |
| AgentCard.css | src/components/ | Card styling (185 lines) |
| AgentDetail.jsx | src/pages/ | Detail page with tabs |
| AgentDetail.css | src/pages/ | Detail styling (325 lines) |
| registryApi.js | src/services/ | API client for registry |

### Bug Fixed: Login no such table: users

**Symptom:** Login at /signin returned no such table: users error.

**Root Cause:** PM2 process had wrong  environment variable:
- Was: 
- Should be: 

**Fix:** Restarted swarm-platform-dev with correct DB_PATH, saved PM2 config.

### Bug Fixed: Catalog Layout Bleeding Under Sidebar

**Symptom:** Agent cards were clipped/hidden behind the sidebar.

**Root Cause:** AgentCatalog.jsx used wrong CSS classes (, ) instead of the shared layout classes (, ).

**Fix:** Updated class names to use layout.css which has proper .

### Bug Fixed: Double Sidebar Highlight

**Symptom:** Both Agents and Catalog nav items highlighted when on /agents/catalog.

**Root Cause:**  function used  which matched  for .

**Fix:** Added exact match logic for  route in Sidebar.jsx.

### Backend Verified

| Component | Status |
|-----------|--------|
| Registry Routes | ✅ Mounted at /api/registry/* |
| Registry DB | ✅ 6 agents populated |
| Auth Middleware | ✅ Working on all registry routes |

### Testing Completed on DEV
- [x] Login works with admin@swarmstack.net
- [x] Agent catalog displays 6 agents in grid
- [x] Catalog layout properly offset from sidebar
- [x] Only Catalog highlighted when on /agents/catalog
- [x] Cards show runtime badges, memory, tags

### Promotion Commands


### Rollback


---


## PROM-019: HornetOS Alpine VM Infrastructure with SNAT/DNAT

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm (infrastructure)  
**Commits:** 605973f (swarm-spawn-alpine-v2.sh)

### Overview

Complete HornetOS Alpine VM infrastructure with Firecracker snapshot restoration and SNAT/DNAT networking for clone isolation. Enables spawning multiple VMs from a single snapshot where each VM gets a unique external IP while internally sharing the same guest IP.

### Components to Deploy

| Component | DEV Location | Purpose |
|-----------|--------------|---------|
| Alpine rootfs | `/opt/swarm/snapshots/alpine3.19-hornetos/rootfs.ext4` | Base Alpine 3.19 filesystem |
| v2 Snapshot | `/opt/swarm/snapshots/alpine3.19-hornetos-v2/` | Snapshot with guest IP 192.168.241.2 |
| Spawn script | `/opt/swarm/swarm-spawn-alpine-v2.sh` | Production spawn with SNAT/DNAT |
| Boot script | `/opt/swarm/swarm-boot-alpine-v2.sh` | Creates fresh snapshots |

### Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     HOST (Droplet)                       │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ vm0 NS   │    │ vm1 NS   │    │ vm2 NS   │           │
│  │ veth0    │    │ veth0    │    │ veth0    │           │
│  │ 10.0.0.2 │    │ 10.0.0.3 │    │ 10.0.0.4 │           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │ SNAT/DNAT│    │ SNAT/DNAT│    │ SNAT/DNAT│           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │ tap0     │    │ tap0     │    │ tap0     │           │
│  │192.168.  │    │192.168.  │    │192.168.  │           │
│  │ 241.1/29 │    │ 241.1/29 │    │ 241.1/29 │           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │┌────────┐│    │┌────────┐│    │┌────────┐│           │
│  ││ Alpine ││    ││ Alpine ││    ││ Alpine ││           │
│  ││192.168.││    ││192.168.││    ││192.168.││           │
│  ││ 241.2  ││    ││ 241.2  ││    ││ 241.2  ││           │
│  │└────────┘│    │└────────┘│    │└────────┘│           │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘           │
│       └───────────────┼───────────────┘                  │
│                   ┌───┴───┐                               │
│                   │  br0  │ 10.0.0.1                     │
│                   └───────┘                               │
└──────────────────────────────────────────────────────────┘
```

### Key Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Guest IP | 192.168.241.2 | Static IP inside all VM clones |
| TAP Host IP | 192.168.241.1/29 | Host side of tap0 in each namespace |
| Clone IPs | 10.0.0.X | External IPs on br0 bridge |
| Kernel | `/opt/swarm/images/vmlinux.bin` | Shared kernel |

### SNAT/DNAT Rules (per namespace)

```bash
# Outbound: Guest → Clone IP
iptables -t nat -A POSTROUTING -o veth0 -s 192.168.241.2 -j SNAT --to $CLONE_IP
# Inbound: Clone IP → Guest
iptables -t nat -A PREROUTING -i veth0 -d $CLONE_IP -j DNAT --to 192.168.241.2
```

### Testing Completed on DEV
- [x] 3 VMs spawn successfully (3152ms total, ~1050ms avg)
- [x] SSH works to all 3 VMs via clone IPs
- [x] SNAT/DNAT translates traffic correctly
- [x] VMs resume from snapshot in <10ms

### Promotion Commands

```bash
# 1. SSH to PROD
ssh -i ~/.ssh/swarm_key root@146.190.35.235

# 2. Ensure br0 bridge exists (should already)
ip link show br0

# 3. Create snapshot directories
mkdir -p /opt/swarm/snapshots/alpine3.19-hornetos
mkdir -p /opt/swarm/snapshots/alpine3.19-hornetos-v2

# 4. Copy rootfs from DEV
scp root@134.199.235.140:/opt/swarm/snapshots/alpine3.19-hornetos/rootfs.ext4 \
    /opt/swarm/snapshots/alpine3.19-hornetos/

# 5. Copy v2 snapshot from DEV
scp root@134.199.235.140:/opt/swarm/snapshots/alpine3.19-hornetos-v2/* \
    /opt/swarm/snapshots/alpine3.19-hornetos-v2/

# 6. Pull spawn script (already in git)
cd /opt/swarm
git pull origin main

# 7. Make executable
chmod +x /opt/swarm/swarm-spawn-alpine-v2.sh

# 8. Test spawn 3 VMs
/opt/swarm/swarm-spawn-alpine-v2.sh 3 0

# 9. Test SSH to each
ssh -o StrictHostKeyChecking=no root@10.0.0.2 hostname
ssh -o StrictHostKeyChecking=no root@10.0.0.3 hostname
ssh -o StrictHostKeyChecking=no root@10.0.0.4 hostname

# 10. Cleanup test VMs
pkill firecracker
for ns in vm0 vm1 vm2; do ip netns del $ns 2>/dev/null; done
rm -f /tmp/alpine-* /tmp/fc-alpine-*
```

### Prerequisites on PROD
- [ ] Firecracker installed (`/usr/bin/firecracker`)
- [ ] br0 bridge configured with IP 10.0.0.1/24
- [ ] Kernel at `/opt/swarm/images/vmlinux.bin`
- [ ] IP forwarding enabled (`sysctl net.ipv4.ip_forward=1`)

### Rollback

```bash
# Stop any running Alpine VMs
pkill -f "fc-alpine"
# Remove namespaces
for ns in $(ip netns list | grep ^vm); do ip netns del $ns; done
# Remove snapshots (optional - doesn't affect other services)
rm -rf /opt/swarm/snapshots/alpine3.19-hornetos*
```

### References
- Firecracker network-for-clones: https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/network-for-clones.md
- Session notes: `/opt/swarm-specs/session-notes/current.md`

---
