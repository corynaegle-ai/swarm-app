# Dashboard Frontend Auth Test Prompt

**Created**: 2024-12-12
**Purpose**: Test the Swarm Dashboard frontend authentication UI and flow

---

## Context

You are a master systems architect testing the Swarm Dashboard frontend authentication system. The backend API has been verified as operational, and now the frontend React UI needs to be tested.

## Dashboard URLs
- **Frontend**: https://dashboard.swarmstack.net
- **Backend API**: https://api.swarmstack.net
- **Local Dev**: http://localhost:5173 (if running dev server)

## Test Credentials
```
Admin User:
  Email: admin@swarmstack.net
  Password: AdminTest123!

Regular User:
  Email: test@swarmstack.net
  Password: TestUser123!
```

## What's Already Verified ✅
- Backend API server is running at `/opt/swarm-api/`
- Auth endpoint working: `POST /api/auth/login` returns 200 OK
- Session cookie set properly with security flags
- CORS configured with explicit origins
- User exists in database

---

## Test Sequence

### Pre-Flight: Verify Frontend Deployment

**Step 1: Check if dashboard is built and deployed**
```bash
ssh root@146.190.35.235 'ls -la /opt/swarm-dashboard/dist/ | head -10'
```

**Step 2: Check Caddy configuration for dashboard**
```bash
ssh root@146.190.35.235 'cat /etc/caddy/Caddyfile | grep -A 10 dashboard.swarmstack.net'
```

**Step 3: Test dashboard URL accessibility**
```bash
curl -I https://dashboard.swarmstack.net
```

Expected: 200 OK with HTML content

---

### Phase 1: Login Page Tests

**Test 1.1: Access Login Page**
- Open browser to `https://dashboard.swarmstack.net`
- Open DevTools (F12) → Console tab
- Verify:
  - [ ] Page loads without console errors
  - [ ] Login form is visible
  - [ ] Email and password fields present
  - [ ] Submit button present

**Test 1.2: Check Network Configuration**
- DevTools → Network tab
- Check for:
  - [ ] No failed API requests on page load
  - [ ] Static assets load from correct origin
  - [ ] No CORS errors in console

---

### Phase 2: Valid Login Flow

**Test 2.1: Login with Admin Credentials**
1. Enter email: `admin@swarmstack.net`
2. Enter password: `AdminTest123!`
3. Click "Login" or "Sign In" button
4. Watch DevTools Network tab

**Verify Request:**
- [ ] POST request to `https://api.swarmstack.net/api/auth/login`
- [ ] Request payload contains email and password
- [ ] Response status: 200 OK
- [ ] Response body contains user object:
  ```json
  {
    "user": {
      "id": "...",
      "email": "admin@swarmstack.net",
      "name": "Admin User",
      "role": "admin"
    }
  }
  ```

**Verify Cookie:**
- DevTools → Application → Cookies → `https://api.swarmstack.net`
- [ ] Session cookie is present
- [ ] Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] Expiry: ~7 days from now

**Verify UI Response:**
- [ ] User is redirected from login page
- [ ] Dashboard/home page loads
- [ ] User info displayed (name, email, or avatar)
- [ ] No error messages shown

---

### Phase 3: Authenticated State Tests

**Test 3.1: Session Persistence**
1. While logged in, refresh the page (F5)
2. Verify:
   - [ ] User remains logged in
   - [ ] No redirect to login page
   - [ ] Session cookie still present
   - [ ] User info still displayed

**Test 3.2: Protected Routes**
1. Navigate to different dashboard sections/pages
2. For each route, verify:
   - [ ] Page loads without redirect to login
   - [ ] API requests include authentication
   - [ ] No 401 Unauthorized errors

**Test 3.3: Direct URL Access**
1. Copy current dashboard URL
2. Open new browser tab/window
3. Paste URL and navigate
4. Verify:
   - [ ] Session restored (if same browser)
   - [ ] Dashboard loads (not redirected to login)

---

### Phase 4: Invalid Credentials Tests

**Test 4.1: Logout (if button exists)**
1. Click logout button
2. Verify:
   - [ ] Redirected to login page
   - [ ] Session cookie cleared
   - [ ] User info removed from UI

**Test 4.2: Login with Wrong Password**
1. Enter email: `admin@swarmstack.net`
2. Enter password: `WrongPassword123!`
3. Click login
4. Verify:
   - [ ] Request returns 401 Unauthorized
   - [ ] Error message displayed in UI
   - [ ] No session cookie set
   - [ ] User remains on login page

**Test 4.3: Login with Non-existent User**
1. Enter email: `fake@example.com`
2. Enter password: `FakePassword123!`
3. Click login
4. Verify:
   - [ ] Request returns 401 Unauthorized
   - [ ] Error message displayed
   - [ ] No session cookie set

---

### Phase 5: Security & Edge Cases

**Test 5.1: CSRF Protection**
- Check if CSRF tokens are used (if applicable)
- Verify cookie flags prevent CSRF

**Test 5.2: XSS Protection**
- Check Content-Security-Policy headers
- Verify user input is sanitized

**Test 5.3: Session Timeout**
- Wait 7+ days (or manually expire cookie)
- Try accessing dashboard
- Verify redirect to login

**Test 5.4: Concurrent Sessions**
1. Login in Browser 1
2. Login with same user in Browser 2
3. Verify both sessions work independently

---

## Success Criteria

**All checks must pass:**
- [ ] Login page loads without errors
- [ ] Valid credentials authenticate successfully (admin@swarmstack.net)
- [ ] Session cookie set with proper security flags
- [ ] User redirected to dashboard after login
- [ ] Authentication persists across page refreshes
- [ ] Protected routes remain accessible when authenticated
- [ ] Invalid credentials show appropriate error messages
- [ ] No session cookie set for failed logins
- [ ] Logout clears session and redirects (if implemented)
- [ ] No console errors during any test phase
- [ ] CORS allows requests between dashboard and API domains

---

## Troubleshooting Guide

### Issue: Login page doesn't load
**Check:**
```bash
# Verify frontend is built
ssh root@146.190.35.235 'ls /opt/swarm-dashboard/dist/'

# Check Caddy is serving dashboard
curl -I https://dashboard.swarmstack.net

# Check Caddy logs
ssh root@146.190.35.235 'tail -50 /var/log/caddy/access.log'
```

### Issue: Login request fails with CORS error
**Check:**
```bash
# Verify CORS config in backend
ssh root@146.190.35.235 'grep -A 3 "cors(" /opt/swarm-api/server.js'

# Should include: https://dashboard.swarmstack.net
```

### Issue: 502 Bad Gateway on login
**Check:**
```bash
# Verify API server is running
ssh root@146.190.35.235 'cat /tmp/swarm-api.log | tail -20'

# Restart if needed
ssh root@146.190.35.235 'cd /opt/swarm-api && /usr/bin/node server.js > /tmp/swarm-api.log 2>&1 &'
```

### Issue: Session cookie not set
**Check:**
- Browser DevTools → Network → Response Headers
- Look for `Set-Cookie` header in login response
- Verify cookie domain matches API domain
- Check browser settings allow cookies

### Issue: Authentication doesn't persist
**Check:**
```javascript
// In browser console, check cookie:
document.cookie

// Check localStorage/sessionStorage
localStorage
sessionStorage
```

---

## Anti-Freeze Protocol

**When testing via browser:**
- Take screenshots of each phase
- Save Network HAR exports for failed requests
- Document console errors immediately

**When automating tests:**
- Use headless browser with screenshots
- Capture network logs
- Max 3 test scenarios per checkpoint

---

## Next Steps After Testing

**If all tests pass:**
- [ ] Document any UI/UX improvements needed
- [ ] Create user onboarding documentation
- [ ] Plan additional user roles testing

**If tests fail:**
- [ ] Document exact failure point
- [ ] Capture relevant logs/screenshots
- [ ] Check troubleshooting guide above
- [ ] Fix identified issues
- [ ] Rerun failed tests

---

## Notes

- Tests assume default test users exist in database
- Session duration is 7 days (604800 seconds)
- API server must be running at https://api.swarmstack.net
- Frontend must be deployed at https://dashboard.swarmstack.net
