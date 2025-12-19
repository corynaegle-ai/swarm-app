# Swarm Dashboard Authentication Design Spec

**Created**: 2025-12-11
**Status**: Implementation Phase

---

## 1. Admin-Only User Creation

Registration endpoint requires admin authentication:
```
POST /api/admin/users  (admin-only)
```

No public `/api/auth/register` endpoint.

---

## 2. Default Admin Account

Setup script initializes admin account with credentials hashed via bcrypt.
Credentials read from environment variables (not committed to git).

---

## 3. Dashboard Architecture: Merged SPA

### Current Architecture (Before)
```
Port 8080 (api-server-dashboard.js)
├── /api/* endpoints
├── /ws WebSocket
└── /public/index.html (Ticket Dashboard)

Port 8081 (swarm-control/server.js)
└── /public/index.html (VM Dashboard)
```

### Target Architecture (After)
```
Port 8080 (api-server-dashboard.js)

API Routes:
├── /api/auth/*        (login, logout, refresh)
├── /api/admin/*       (user management)
├── /api/tickets/*     (ticket CRUD)
├── /api/vms/*         (VM operations)
├── /api/projects/*    (project builder)
└── /ws                (unified WebSocket)

Frontend (SPA):
└── /public/
    ├── index.html     (entry point)
    └── assets/        (JS, CSS)

Routes (client-side):
├── /login             (public)
├── /dashboard         (home - protected)
├── /vms               (VM dashboard - protected)
├── /tickets           (ticket dashboard - protected)
├── /projects          (project builder - protected)
└── /admin/users       (user mgmt - admin only)
```

Port 8081: Deprecated

---

## 4. Database Schema (OAuth-Ready)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,          -- NULL for OAuth-only users
  oauth_provider TEXT,         -- 'github', 'google', NULL
  oauth_id TEXT,               -- Provider's user ID
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_oauth ON users(oauth_provider, oauth_id);
```

---

## 5. OAuth Flow (Future)

```
User clicks → Swarm redirect → Provider login → Callback endpoint
                                                       │
  ┌────────────────────────────────────────────────────┘
  ▼
  1. Provider sends auth code to callback
  2. Swarm exchanges code for access token
  3. Swarm fetches user email from provider API
  4. Swarm creates/finds user by email
  5. Swarm issues JWT cookies
  6. Redirect to dashboard
```

---

## 6. Implementation Order

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Backend auth (password-based) + merged dashboard structure | In Progress |
| Phase 2 | Login UI + protected routes + admin user management | Pending |
| Phase 3 | Add GitHub OAuth | Future |
| Phase 4 | Add Google OAuth | Future |

---

## 7. Security Decisions

- JWT in httpOnly cookies (not localStorage)
- Access token: 15 min expiry
- Refresh token: 7 day expiry
- bcrypt for password hashing
- CSRF protection via SameSite=Strict cookies
