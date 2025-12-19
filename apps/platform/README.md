# Swarm Platform

Unified backend API consolidating swarm-tickets + swarm-api into a single service.

## Architecture

```
swarm-platform/
├── server.js          # Entry point, port 8080
├── db.js              # Database connection (/opt/swarm-tickets/data/swarm.db)
├── middleware/
│   ├── auth.js        # JWT authentication
│   ├── tenant.js      # Multi-tenant isolation
│   └── session-gate.js # HITL state machine
└── routes/
    ├── health.js      # /health
    ├── auth.js        # /api/auth/*
    ├── vms.js         # /api/vms/*
    ├── tickets.js     # /api/tickets/*
    ├── tickets-legacy.js # /claim, /complete, /heartbeat (agent-facing)
    ├── projects.js    # /api/projects/*
    ├── design.js      # /api/design-sessions/*
    ├── hitl.js        # /api/hitl/* (state machine)
    └── secrets.js     # /api/secrets/* (admin only)
```

## Running

```bash
npm install
PORT=8080 node server.js
```

## Routes

See session notes for full route inventory.
