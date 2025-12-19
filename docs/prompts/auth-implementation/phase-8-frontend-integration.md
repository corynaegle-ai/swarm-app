# Phase 8: Frontend Authentication Integration

**Project**: Swarm Dashboard Authentication
**Phase**: 8 (Post-Core Implementation)
**Estimated Time**: 30-45 minutes
**Prerequisite**: Phases 1-7 complete (all backend auth endpoints tested)

---

## Context

Backend authentication is complete and tested. All endpoints work:
- POST /api/auth/login - Login with email/password
- POST /api/auth/logout - Clear auth cookies
- POST /api/auth/refresh - Refresh access token
- GET /api/auth/me - Get current user
- GET/POST/PUT/DELETE /api/admin/users - User management (admin only)

**Test Credentials**:
- Admin: admin@swarmstack.net / AdminTest123!
- User: test@swarmstack.net / TestUser123!

## Objective

Create React frontend components to integrate with the auth backend.

## Implementation Plan

### Step 1: Check if Dashboard Exists

First, verify the React dashboard location:
```bash
ls -la /opt/swarm-dashboard/src/ 2>/dev/null || ls -la /opt/ | grep -i dash
```

If no dashboard exists, we need to create it first with Vite + React.

### Step 2: Auth Context & Provider

Create `src/context/AuthContext.jsx` with:
- useState for user and loading state
- useEffect to check auth on mount via /api/auth/me
- login() function that POSTs to /api/auth/login
- logout() function that POSTs to /api/auth/logout
- AuthContext.Provider wrapping children

### Step 3: Login Page Component

Create `src/pages/Login.jsx` with:
- Email and password form inputs
- Error state for failed logins
- Loading state during submission
- Redirect to /dashboard on success

### Step 4: Protected Route Component

Create `src/components/ProtectedRoute.jsx` with:
- Check loading state (show spinner)
- Check user state (redirect to /login if null)
- Check adminOnly prop (redirect if not admin)
- Render children if all checks pass

### Step 5: Update App Router

Wrap app in AuthProvider and add routes:
- /login -> Login page (public)
- /dashboard -> Dashboard (protected)
- /admin/users -> Admin page (protected + adminOnly)

### Step 6: User Menu Component

Create `src/components/UserMenu.jsx` with:
- Display user name and role
- Logout button that calls logout() and redirects

## Verification Checklist

- [ ] AuthContext provides user state globally
- [ ] Login form submits to /api/auth/login
- [ ] Failed login shows error message
- [ ] Successful login redirects to dashboard
- [ ] Protected routes redirect to login when unauthenticated
- [ ] Admin routes block non-admin users
- [ ] Logout clears session and redirects to login
- [ ] Page refresh maintains auth state (via /api/auth/me)

## Test Plan

1. Navigate to /dashboard when logged out -> redirect to /login
2. Login with wrong password -> show "Invalid credentials"
3. Login with admin@swarmstack.net / AdminTest123! -> redirect to dashboard
4. Access /admin/users as admin -> should work
5. Logout -> redirect to login
6. Login as test@swarmstack.net -> try /admin/users -> redirect away

---

## Future Phases

| Phase | Description | Priority |
|-------|-------------|----------|
| 9 | GitHub OAuth SSO | Medium |
| 10 | Password Reset Flow | Medium |
| 11 | Session Management UI | Low |
| 12 | User Profile Page | Low |

---

## Anti-Freeze Protocol

- Check if React app exists first
- Create files one at a time
- Test each component before moving to next
- Session limit: 20 minutes
