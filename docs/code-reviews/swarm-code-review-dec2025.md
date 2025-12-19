# Swarm Code Review - Dec 2025

> **📁 MOVED TO GIT:** This document is now maintained in git at `/code-reviews/swarm-code-review-dec2025.md`
> Original Notion URL: https://www.notion.so/2c5c56ed45a7810cb78df7699da5c2c7

**Date:** December 10, 2025  
**Reviewer:** Claude (Systems Architect)  
**Total Issues Found:** 47

## Summary by Severity

- Critical: 8 issues
- High: 14 issues
- Medium: 16 issues
- Low: 9 issues

---

## Critical Issues (Security)

### 1. Command Injection - swarm-manager.js exec()
The exec() method passes user commands to SSH without sanitization. Quote escaping is insufficient.

### 2. Command Injection - fcAPI() curl
JSON embedded in curl command can break shell quoting.

### 3. Command Injection - executor.js execInNs()
Namespace and command passed directly to shell spawn.

### 4. Shell Injection - swarm-agent.sh status JSON
Status JSON created via string interpolation without escaping.

### 5. eval() in retry function
The retry function uses eval on command arguments.

### 6. Race Condition - Ticket Claiming
SELECT and UPDATE not atomic - multiple agents could claim same ticket.

### 7. Race Condition - VM Slot Acquisition
VM slot selection has no locking mechanism.

### 8. Credentials in Git URL
GitHub token embedded in clone URL visible in logs.

---

## High Severity Issues

### 9-22. Summary
- Missing HTTP request timeouts (pull-agent.js)
- JSON.parse without try-catch (multiple files)
- No CORS/security headers (api-server.js)
- No input validation (api-server.js)
- Resource leak in spawnOne() (swarm-manager.js)
- Unvalidated branch names (pull-agent.js)
- Hardcoded API version throughout
- Missing error context in logging
- Inconsistent slugify implementations
- Exposed process.env in context
- Database connection not closed on error
- Missing transaction wrapping (store.js)
- Predictable temp file names
- Missing VM cleanup on error

---

## Medium Severity Issues

### 23-38. Summary
- Validation function return inconsistency
- Mock data in production (streamLogs)
- MAC address overflow > 65535
- IP subnet overflow > 253
- Compressed production code (design-agent.js)
- console.error for non-errors
- Awk field missing in VM delete
- No API retry logic
- State file race condition
- Cycle detection direction issue
- Missing nested variable handling
- Condition evaluation security
- macOS resource fork files in git
- Heartbeat timer leak potential
- process.exit without cleanup
- WebSocket error swallowing

---

## Low Severity Issues

### 39-47. Summary
- Missing JSDoc comments
- Inconsistent error messages
- Magic numbers throughout
- No package-lock verification
- No TypeScript types
- Color codes not reset in scripts
- No health endpoint auth
- Missing .gitignore entries
- Mixed async/await patterns


---

## Top Recommendations

1. Fix command injection with proper escaping or spawn arrays
2. Add transaction wrapping for ticket operations
3. Implement VM slot locking
4. Use git credential helper instead of URL tokens
5. Add input validation to all API endpoints
6. Implement security middleware (helmet, rate limiting)
7. Set timeouts on all HTTP requests
8. Add comprehensive error handling

---

## Files Reviewed

27 JavaScript files, 43 shell scripts across:
- /opt/swarm
- /opt/swarm-tickets
- /opt/swarm-engine
- /usr/local/bin

---

## Detailed Critical Issue Analysis

### Issue 1: Command Injection in swarm-manager.js

**Location:** `/opt/swarm/swarm-control/lib/swarm-manager.js` line ~145

**Vulnerable Code:**
```javascript
async exec(id, command) {
  const { stdout, stderr } = await execAsync(
    `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@${vm.ip} "${command.replace(/"/g, '\\"')}"`
  );
}
```

**Attack Vector:** The quote escaping only handles double quotes. Characters like `$(command)`, backticks, and `$VAR` still allow command substitution.

**Proof of Concept:**
```javascript
command = "echo $(cat /etc/passwd)"
command = "echo `whoami`"
```

**Fix:** Use SSH with explicit command separation or spawn with array arguments.

---

### Issue 6: Race Condition in Ticket Claiming

**Location:** `/opt/swarm-tickets/api-server.js` lines 50-80

**Problem Flow:**
1. Agent A: SELECT ready ticket -> gets ticket #123
2. Agent B: SELECT ready ticket -> also gets ticket #123
3. Agent A: UPDATE ticket #123 as claimed
4. Agent B: UPDATE ticket #123 as claimed (overwrites A)

**Result:** Both agents work on same ticket, one's work is lost.

**Fix:** Use SQLite's `UPDATE ... WHERE state='ready' RETURNING *` or wrap in IMMEDIATE transaction.

---

### Issue 7: VM Slot Race

**Location:** `/opt/swarm-engine/lib/executor.js` line ~210

**Problem:** The check-then-spawn pattern has a race window:
```javascript
for (let vmId = 1; vmId <= 99; vmId++) {
  try {
    execSync(`ip netns list | grep -q "^vm${vmId}$"`);
  } catch {
    // Race window: another process could claim this slot NOW
    execSync(`swarm-spawn-ns ${vmId}`);
  }
}
```

**Fix:** Implement a VM pool manager with exclusive locks, or use flock on a slot-specific file.

---

## Repository Health Metrics

| Metric | Status |
|--------|--------|
| Security vulnerabilities | 8 critical |
| Test coverage | Unknown (no tests found) |
| Type safety | None (JavaScript only) |
| Documentation | Minimal |
| Error handling | Inconsistent |
| Logging | Ad-hoc |

---

## Immediate Action Items

- [ ] Fix command injection in swarm-manager.js exec()
- [ ] Fix command injection in executor.js execInNs()
- [ ] Add transaction to ticket claiming
- [ ] Implement VM slot locking
- [ ] Remove credentials from git URLs
- [ ] Add input validation to API endpoints
- [ ] Set HTTP timeouts on all requests
- [ ] Add try-catch to all JSON.parse calls

---

## Dashboard & Platform Review (Dec 15, 2025)

### Critical Issues Found

#### Issue 48: XSS in MarkdownPreview.jsx (CRITICAL)
**Location:** 
**Problem:** Link URL not sanitized before inserting into href attribute
```javascript
.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
```
**Attack:** `[click me](javascript:alert('XSS'))` executes arbitrary JavaScript
**Fix:** Validate URLs only allow http:/https: protocols, use DOMPurify

#### Issue 49: Hardcoded JWT Secret Fallback (CRITICAL)
**Location:** `/opt/swarm-platform/middleware/auth.js`
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
```
**Impact:** If env var missing, all tokens predictable. Complete auth bypass.
**Fix:** Throw error on startup if JWT_SECRET not set

#### Issue 50: JWT Signature Timing Attack
**Location:** `/opt/swarm-platform/middleware/auth.js`
```javascript
if (signature !== expectedSig) return null;
```
**Problem:** String comparison leaks timing info, enables signature brute-force
**Fix:** Use `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))`

### High Severity Issues

#### Issue 51: No CSRF Protection
**Location:** `/opt/swarm-dashboard/src/context/AuthContext.jsx`
**Problem:** No CSRF tokens in any mutating requests
**Fix:** Implement CSRF tokens or SameSite=Strict cookies

#### Issue 52: Client-Side Role Check Trusted
**Location:** `/opt/swarm-dashboard/src/components/ProtectedRoute.jsx`
```javascript
if (adminOnly && user.role !== 'admin')
```
**Problem:** Role comes from JWT payload - can be forged if secret compromised
**Fix:** Server should re-verify role from DB for sensitive operations

#### Issue 53: Window.location Redirect (SPA Anti-pattern)
**Location:** `/opt/swarm-dashboard/src/components/ProtectedRoute.jsx`
```javascript
window.location.href = 'https://swarmstack.net/signin';
```
**Problem:** Full page reload loses SPA state
**Fix:** Use React Router navigate

### Medium Severity Issues

#### Issue 54: Alert() for Errors
**Locations:** Multiple files in /opt/swarm-dashboard
**Problem:** alert() blocks UI, poor UX, may leak info
**Fix:** Use toast notifications

#### Issue 55: Tenant ID Not Validated
**Location:** `/opt/swarm-platform/middleware/tenant.js`
**Problem:** tenant_id from JWT not validated against DB
**Fix:** Verify tenant exists and is active

#### Issue 56: Legacy PBKDF2 Weak Iterations
**Location:** `/opt/swarm-platform/middleware/auth.js`
```javascript
crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512')
```
**Problem:** 10000 iterations is outdated (2012 era), should be 100000+
**Fix:** Migrate to bcrypt-only, increase iterations on legacy check

#### Issue 57: No Request Timeout (GitHub Service)
**Location:** `/opt/swarm-platform/services/github-service.js`
**Problem:** fetch() calls have no timeout - could hang indefinitely
**Fix:** Use AbortController with timeout

#### Issue 58: WebSocket Room Injection
**Location:** `/opt/swarm-dashboard/src/hooks/useWebSocket.js`
**Problem:** Room name passed directly without validation
**Fix:** Validate room format on server side

---

## Repositories Still To Review
- [ ] /opt/swarm-mcp-factory
- [ ] /opt/swarm-registry  
- [ ] /opt/swarm-verifier
- [ ] /opt/swarm-agents



---

## Dashboard & Platform Review (Dec 15, 2025)

### Critical Issues Found

#### Issue 48: XSS in MarkdownPreview.jsx (CRITICAL)
**Location:** `/opt/swarm-dashboard/src/components/MarkdownPreview.jsx`
**Problem:** Link URL not sanitized before inserting into href attribute
```javascript
.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
```
**Attack:** `[click me](javascript:alert('XSS'))` executes arbitrary JavaScript
**Fix:** Validate URLs only allow http:/https: protocols, use DOMPurify

#### Issue 49: Hardcoded JWT Secret Fallback (CRITICAL)
**Location:** `/opt/swarm-platform/middleware/auth.js`
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
```
**Impact:** If env var missing, all tokens predictable. Complete auth bypass.
**Fix:** Throw error on startup if JWT_SECRET not set

#### Issue 50: JWT Signature Timing Attack
**Location:** `/opt/swarm-platform/middleware/auth.js`
```javascript
if (signature !== expectedSig) return null;
```
**Problem:** String comparison leaks timing info, enables signature brute-force
**Fix:** Use `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))`

### High Severity Issues

#### Issue 51: No CSRF Protection
**Location:** `/opt/swarm-dashboard/src/context/AuthContext.jsx`
**Problem:** No CSRF tokens in any mutating requests
**Fix:** Implement CSRF tokens or SameSite=Strict cookies

#### Issue 52: Client-Side Role Check Trusted
**Location:** `/opt/swarm-dashboard/src/components/ProtectedRoute.jsx`
```javascript
if (adminOnly && user.role !== 'admin')
```
**Problem:** Role comes from JWT payload - can be forged if secret compromised
**Fix:** Server should re-verify role from DB for sensitive operations

#### Issue 53: Window.location Redirect (SPA Anti-pattern)
**Location:** `/opt/swarm-dashboard/src/components/ProtectedRoute.jsx`
```javascript
window.location.href = 'https://swarmstack.net/signin';
```
**Problem:** Full page reload loses SPA state
**Fix:** Use React Router navigate

### Medium Severity Issues

#### Issue 54: Alert() for Errors
**Locations:** Multiple files in /opt/swarm-dashboard
**Problem:** alert() blocks UI, poor UX, may leak info
**Fix:** Use toast notifications

#### Issue 55: Tenant ID Not Validated
**Location:** `/opt/swarm-platform/middleware/tenant.js`
**Problem:** tenant_id from JWT not validated against DB
**Fix:** Verify tenant exists and is active

#### Issue 56: Legacy PBKDF2 Weak Iterations
**Location:** `/opt/swarm-platform/middleware/auth.js`
```javascript
crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512')
```
**Problem:** 10000 iterations is outdated (2012 era), should be 100000+
**Fix:** Migrate to bcrypt-only, increase iterations on legacy check

#### Issue 57: No Request Timeout (GitHub Service)
**Location:** `/opt/swarm-platform/services/github-service.js`
**Problem:** fetch() calls have no timeout - could hang indefinitely
**Fix:** Use AbortController with timeout

#### Issue 58: WebSocket Room Injection
**Location:** `/opt/swarm-dashboard/src/hooks/useWebSocket.js`
**Problem:** Room name passed directly without validation
**Fix:** Validate room format on server side

---

## Repositories Still To Review
- [ ] /opt/swarm-mcp-factory
- [ ] /opt/swarm-registry  
- [ ] /opt/swarm-verifier
- [ ] /opt/swarm-agents


---

## MCP Factory, Verifier & Agent Review (Dec 15, 2025)

### High Severity Issues

#### Issue 59: Path Traversal in MCP Packager
**Location:** `/opt/swarm-mcp-factory/src/packager.js`
```javascript
async runCommand(cmd, cwd = null) {
  exec(cmd, options, (error, stdout, stderr) => {...})
}
```
**Problem:** `cwd` (serverDir) passed without path validation - could escape to arbitrary directories
**Fix:** Validate serverDir is within expected output directory using `path.resolve()` checks

#### Issue 60: Command Injection Risk in Validator
**Location:** `/opt/swarm-mcp-factory/src/validator.js`
```javascript
execSync('./node_modules/.bin/tsc --noEmit', { cwd: serverDir, ... });
execSync('npx eslint src/ --format json', { cwd: serverDir, ... });
```
**Problem:** If serverDir contains shell metacharacters, could escape
**Fix:** Use spawn with array arguments, validate serverDir

#### Issue 61: Tool Name Injection in Generator
**Location:** `/opt/swarm-mcp-factory/src/generator.js`
```javascript
export async function ${tool.name}Tool(...)
```
**Problem:** Tool name inserted directly into generated TypeScript - could inject arbitrary code
**Fix:** Validate tool.name matches /^[a-z_][a-z0-9_]*$/i

### Medium Severity Issues

#### Issue 62: No Request Timeout in Claude Agent
**Location:** `/opt/swarm-agents/_templates/claude-agent/main.js`
```javascript
const req = https.request(options, (res) => {...});
```
**Problem:** No timeout on HTTPS request - could hang indefinitely
**Fix:** Add `req.setTimeout(30000)` with abort handler

#### Issue 63: File Path from Argv Not Validated
**Location:** `/opt/swarm-agents/_templates/claude-agent/main.js`
```javascript
const inputPath = process.argv[2] || '/tmp/input.json';
const outputPath = process.argv[3] || '/tmp/output.json';
```
**Problem:** Arbitrary file read/write via CLI args
**Fix:** Validate paths are within expected directory

#### Issue 64: GIT_SSH_COMMAND Injection Risk
**Location:** `/opt/swarm-verifier/lib/git.js`
```javascript
process.env.GIT_SSH_COMMAND = `ssh -i ${config.GIT_SSH_KEY_PATH} ...`;
```
**Problem:** If GIT_SSH_KEY_PATH contains spaces/metacharacters, command breaks
**Fix:** Quote the path properly

---

## Summary Statistics

| Repository | Critical | High | Medium | Low |
|------------|----------|------|--------|-----|
| swarm-dashboard | 1 | 3 | 2 | - |
| swarm-platform | 2 | 1 | 2 | - |
| swarm-mcp-factory | - | 2 | 1 | - |
| swarm-verifier | - | - | 1 | - |
| swarm-agents | - | - | 2 | - |
| **Subtotal (new)** | **3** | **6** | **8** | **0** |
| Previous review | 8 | 14 | 16 | 9 |
| **TOTAL** | **11** | **20** | **24** | **9** |

**Grand Total: 64 issues**

---

## Priority Fix List

### Immediate (Deploy Blockers)
1. Issue 48 - XSS in MarkdownPreview (CRITICAL)
2. Issue 49 - Hardcoded JWT secret fallback (CRITICAL)
3. Issue 50 - JWT timing attack
4. Issue 51 - No CSRF protection

### High Priority (This Week)
5. Issue 59 - Path traversal in MCP packager
6. Issue 60 - Command injection in validator
7. Issue 61 - Tool name injection in generator
8. Issues 6-7 - Race conditions (from original review)

### Medium Priority (This Month)
9. Request timeouts across all services
10. Input validation on all API endpoints
11. Error message standardization
12. Audit logging for sensitive operations
