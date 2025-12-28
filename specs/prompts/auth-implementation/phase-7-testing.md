# Phase 7: Test Auth Endpoints

**Project**: Swarm Dashboard Authentication
**Phase**: 7 of 7
**Estimated Time**: 15-20 minutes
**Prerequisite**: Phases 1-6 complete

---

## Context

End-to-end testing of the authentication system. Verify all endpoints work correctly with proper error handling.

## Objective

Test all auth endpoints and document any issues found.

## Test Plan

### 1. Login Flow

```bash
# Test invalid credentials
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"wrong@test.com","password":"wrong"}' \
  -c cookies.txt -b cookies.txt -v
# Expected: 401 Invalid credentials

# Test valid login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@swarm.local","password":"yourpassword"}' \
  -c cookies.txt -b cookies.txt -v
# Expected: 200 + user object + cookies set
```

### 2. Token Validation

```bash
# Test /api/auth/me with valid token
curl http://localhost:8080/api/auth/me \
  -c cookies.txt -b cookies.txt
# Expected: 200 + user object

# Test without token
curl http://localhost:8080/api/auth/me
# Expected: 401 Authentication required
```

### 3. Token Refresh

```bash
# Refresh access token
curl -X POST http://localhost:8080/api/auth/refresh \
  -c cookies.txt -b cookies.txt
# Expected: 200 + success: true + new access_token cookie
```

### 4. Admin User Management

```bash
# List users (requires admin)
curl http://localhost:8080/api/admin/users \
  -c cookies.txt -b cookies.txt
# Expected: 200 + users array

# Create new user
curl -X POST http://localhost:8080/api/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@swarm.local","password":"testpass123","name":"Test User"}' \
  -c cookies.txt -b cookies.txt
# Expected: 201 + user object

# Try to create duplicate
curl -X POST http://localhost:8080/api/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@swarm.local","password":"testpass123"}' \
  -c cookies.txt -b cookies.txt
# Expected: 409 Email already registered

# Update user role
curl -X PATCH http://localhost:8080/api/admin/users/{user_id} \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}' \
  -c cookies.txt -b cookies.txt
# Expected: 200 + success: true

# Delete user
curl -X DELETE http://localhost:8080/api/admin/users/{user_id} \
  -c cookies.txt -b cookies.txt
# Expected: 200 + success: true
```

### 5. Logout

```bash
# Logout
curl -X POST http://localhost:8080/api/auth/logout \
  -c cookies.txt -b cookies.txt -v
# Expected: 200 + cookies cleared

# Verify logged out
curl http://localhost:8080/api/auth/me \
  -c cookies.txt -b cookies.txt
# Expected: 401 Authentication required
```

### 6. Non-Admin Access Control

```bash
# Login as regular user
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@swarm.local","password":"testpass123"}' \
  -c user-cookies.txt -b user-cookies.txt

# Try admin endpoint
curl http://localhost:8080/api/admin/users \
  -c user-cookies.txt -b user-cookies.txt
# Expected: 403 Admin access required
```

## Test Checklist

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Invalid login | 401 | | ⏳ |
| Valid login | 200 + cookies | | ⏳ |
| Get /me with token | 200 + user | | ⏳ |
| Get /me without token | 401 | | ⏳ |
| Refresh token | 200 + new cookie | | ⏳ |
| List users (admin) | 200 + array | | ⏳ |
| Create user (admin) | 201 | | ⏳ |
| Duplicate email | 409 | | ⏳ |
| Update user | 200 | | ⏳ |
| Delete user | 200 | | ⏳ |
| Self-delete blocked | 400 | | ⏳ |
| Logout clears cookies | 200 | | ⏳ |
| Non-admin blocked | 403 | | ⏳ |

## Success Criteria

- [ ] All tests pass
- [ ] No unexpected errors in server logs
- [ ] Cookies are httpOnly (verify in browser devtools)
- [ ] Token expiration works correctly

## Session Notes Update

Update Step 7 status from ⏳ to ✅.
Mark Phase 1 Authentication as COMPLETE.

## Commit

```bash
cd /opt/swarm-tickets
git add -A
git commit -m "feat(auth): implement backend authentication system

- Add users table with OAuth-ready schema
- Add JWT/bcrypt auth module
- Add auth middleware (requireAuth, requireAdmin)
- Add /api/auth routes (login, logout, refresh, me)
- Add /api/admin/users routes (CRUD)
- Add admin setup script

Phase 1 of dashboard authentication complete."
git push
```
