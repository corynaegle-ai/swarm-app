# Phase 4: Real-Time Activity Timeline Component

## Objective
Create a React component that displays real-time agent activity events in the dashboard.

## Context
- Forge Agent logs: `ticket_claimed`, `code_generation`, `file_created`, `file_modified`, `git_operation`, `pr_created`, `error`
- Events stored in `ticket_events` table
- WebSocket broadcasts `ticket:activity` events
- API: `GET /api/tickets/:id/activity`

## Requirements

### 1. ActivityTimeline Component
Create `/opt/swarm-app/apps/dashboard/src/components/ActivityTimeline.jsx`:
- Fetches initial activity from API
- Subscribes to WebSocket for real-time updates
- Auto-scrolls to newest entry
- Shows timestamp, category icon, message, metadata

### 2. Visual Design (Dark Theme)
Category colors:
- `ticket_claimed`: blue (#3b82f6)
- `code_generation`: cyan (#00d4ff)
- `file_created`: green (#10b981)
- `file_modified`: yellow (#f59e0b)
- `git_operation`: purple (#8b5cf6)
- `pr_created`: emerald (#34d399)
- `error`: red (#ef4444)

### 3. Category Icons (Lucide)
- ticket_claimed: Ticket
- code_generation: Cpu
- file_created: FilePlus
- file_modified: FileEdit
- git_operation: GitBranch
- pr_created: GitPullRequest
- error: AlertTriangle

### 4. Files to Create
1. `src/components/ActivityTimeline.jsx`
2. `src/components/ActivityTimeline.css`
3. `src/hooks/useTicketActivity.js`
4. `src/pages/TicketDetail.jsx`

## API Reference

### GET /api/tickets/:id/activity
```json
{
  "ticket_id": "TKT-123",
  "activity": [{
    "timestamp": "2024-12-22T22:55:00Z",
    "category": "code_generation",
    "actor": { "id": "forge-agent", "type": "agent" },
    "message": "Starting code generation",
    "metadata": { "model": "claude-sonnet-4" }
  }]
}
```

### WebSocket: ticket:activity
```json
{
  "ticket_id": "TKT-123",
  "entry": { "timestamp": "...", "category": "...", ... }
}
```

## Success Criteria
- [ ] Activity appears in real-time as agent works
- [ ] Historical activity loads on page open
- [ ] Entries color-coded by category
- [ ] Metadata expands on click
- [ ] Works with existing dark theme

## Dev Environment
- Droplet: 134.199.235.140
- Dashboard: `/opt/swarm-app/apps/dashboard`
- Node: `/root/.nvm/versions/node/v22.21.1/bin`
