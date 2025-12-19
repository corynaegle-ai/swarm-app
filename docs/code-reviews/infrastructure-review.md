# Swarm Infrastructure Code Review Report

**Review Date:** December 10, 2025
**Reviewer:** Claude (Systems Architect)
**Scope:** Core infrastructure files in `/opt/swarm`

---

## Executive Summary

Comprehensive code review of the Swarm infrastructure identified **69 issues** across 8 files. The most critical findings involve security vulnerabilities including shell injection, path traversal, and unauthenticated API endpoints.

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 |
| 🔴 HIGH | 10 |
| 🟡 MEDIUM | 28 |
| 🟢 LOW | 28 |
| **Total** | **69** |

---

## 🎯 Top Priority Fixes

> 🚨 These critical/high security issues should be addressed immediately before any production deployment.

1. **#29** - `test-claude-api.sh` shell injection via `$PROMPT`
2. **#43** - `swarm-manager.js` command injection in `exec()`
3. **#55** - `dashboard.js` path traversal vulnerability
4. **#44** - `fcAPI()` shell injection via JSON interpolation
5. **#56** - Unauthenticated command execution API endpoint
6. **#11** - `swarm-agent.sh` shell injection via `eval`
7. **#2** - `pull-agent.js` path traversal via generated file paths
8. **#20** - No checksum verification on downloaded binaries

---

## File: `/opt/swarm/agents/pull-agent.js`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 1 | 🔴 HIGH | Logic Error | `branchName` is computed in `cloneAndBranch()` and returned, but `commitAndPush()` and `createPullRequest()` recalculate it via `ticket.branch_name` |
| 2 | 🔴 HIGH | Security | `parseGeneratedFiles()` doesn't validate file paths - Claude could generate `../../etc/passwd` enabling path traversal |
| 3 | 🟡 MEDIUM | Reliability | No retry logic for network operations (`httpRequest`, git push, PR creation) |
| 4 | 🟡 MEDIUM | Reliability | `httpRequest()` has no timeout - could hang indefinitely |
| 5 | 🟡 MEDIUM | Error Handling | `httpRequest()` catch block for JSON parse is empty - silently returns raw string without indication |
| 6 | 🟡 MEDIUM | Logic Error | `execGit()` commit message escaping `replace(/"/g, '\\"')` doesn't handle `$`, backticks, or `!` - shell injection possible |
| 7 | 🟢 LOW | Code Smell | Empty catch block in finally cleanup: `try { fs.rmSync(...) } catch {}` - hides potential errors |
| 8 | 🟢 LOW | Resource Leak | Signal handlers set `running = false` but don't wait for in-progress ticket processing to complete |
| 9 | 🟢 LOW | Missing Feature | No rate limiting on heartbeat calls - could spam API if loop iterates fast |
| 10 | 🟢 LOW | Unused Code | `projectId` is passed to `claimTicket()` but never used after filtering - dead parameter |

---

## File: `/opt/swarm/scripts/swarm-agent.sh`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 11 | 🔴 HIGH | Security | `retry()` function uses `eval "$cmd"` - shell injection if `$REPO_URL` or `$BRANCH_NAME` contain metacharacters |
| 12 | 🔴 HIGH | Data Corruption | `update_status()` heredoc doesn't escape JSON strings - if `$TASK` or `$message` contain `"` or `\`, JSON breaks |
| 13 | 🟡 MEDIUM | Logic Error | `AGENT_ID` extraction `sed 's/[^0-9]//g'` could return empty string if hostname has no digits |
| 14 | 🟡 MEDIUM | Security | Branch names constructed from user input without sanitization - could contain shell metacharacters |
| 15 | 🟡 MEDIUM | Portability | `timeout` command may not exist on all systems |
| 16 | 🟢 LOW | Resource Leak | Log files grow unbounded - no rotation mechanism |
| 17 | 🟢 LOW | Security | `STATUS_FILE` uses `/tmp` - potential symlink attack on shared systems |
| 18 | 🟢 LOW | Missing Feature | No lock file to prevent concurrent agent instances |
| 19 | 🟢 LOW | Error Handling | `curl` for callback doesn't check HTTP status code, only command exit |

---

## File: `/opt/swarm/scripts/swarm-bootstrap.sh`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 20 | 🔴 HIGH | Security | Downloaded files (kernel, rootfs) have no checksum verification |
| 21 | 🟡 MEDIUM | Logic Error | IP calculation `$((2 + VM_ID))` overflows at VM_ID > 253 (10.0.0.255 is broadcast) |
| 22 | 🟡 MEDIUM | Logic Error | MAC generation overflows for VM_ID > 256^4 |
| 23 | 🟡 MEDIUM | Logic Error | First iptables check uses hardcoded `eth0`, but rule may be added on different interface |
| 24 | 🟡 MEDIUM | Performance | Rootfs overlay copies entire base image - should use CoW or sparse copies |
| 25 | 🟢 LOW | Race Condition | `swarm-boot-vm` can be called before socket cleanup completes |
| 26 | 🟢 LOW | Error Handling | TAP device creation loop doesn't check for errors |
| 27 | 🟢 LOW | Cleanup | No cleanup of partially downloaded files on failure |
| 28 | 🟢 LOW | Bash Anti-Pattern | Embedded scripts in heredocs lose shellcheck analysis |

---

## File: `/opt/swarm/scripts/test-claude-api.sh`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 29 | 🔴 CRITICAL | Security | Shell injection via `$PROMPT` embedded directly in JSON without escaping - any `"` or `\` breaks JSON, `'$(cmd)'` enables RCE |
| 30 | 🟡 MEDIUM | Error Handling | No check if `$1` is empty/provided |
| 31 | 🟡 MEDIUM | Error Handling | No curl timeout - could hang indefinitely |
| 32 | 🟡 MEDIUM | Dependency | Assumes `jq` is installed - no fallback |
| 33 | 🟢 LOW | Error Handling | curl exit status not checked |
| 34 | 🟢 LOW | Hardcoding | Model version `claude-sonnet-4-20250514` hardcoded |

---

## File: `/opt/swarm/swarm-control/bin/swarm.js`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 35 | 🔴 HIGH | Security | `exec` command joins user input without escaping: `command.join(' ')` - command injection |
| 36 | 🟡 MEDIUM | Security | SSH with `StrictHostKeyChecking=no` without warning user of MITM risk |
| 37 | 🟡 MEDIUM | Input Validation | No validation on `vmId` parameters - could be used for path traversal |
| 38 | 🟡 MEDIUM | Resource Leak | Watch mode `setInterval(showStatus, 2000)` never cleaned up on exit |
| 39 | 🟢 LOW | Error Handling | `parseInt(count)` could return NaN - no validation |
| 40 | 🟢 LOW | Input Validation | No validation of port number for dashboard |
| 41 | 🟢 LOW | UX | Table column widths hardcoded - could break with long data |
| 42 | 🟢 LOW | Error Handling | `logs` command doesn't handle non-existent VM gracefully |

---

## File: `/opt/swarm/swarm-control/lib/swarm-manager.js`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 43 | 🔴 CRITICAL | Security | `exec()` escaping `replace(/"/g, '\\"')` is insufficient - backticks, `$()`, all enable command injection |
| 44 | 🔴 HIGH | Security | `fcAPI()` shell injection - JSON is interpolated into shell command with inadequate escaping |
| 45 | 🔴 HIGH | Logic Error | `generateMac()` only handles 2-byte IDs (0-65535), but id can exceed this |
| 46 | 🔴 HIGH | Logic Error | IP address `10.0.0.${id + 2}` overflows for id > 253 |
| 47 | 🟡 MEDIUM | Resource Leak | `spawn()` increments `nextId` before checking if spawn succeeds - IDs skip on failure |
| 48 | 🟡 MEDIUM | Resource Leak | Failed `spawnOne()` doesn't cleanup TAP device or copied rootfs |
| 49 | 🟡 MEDIUM | Race Condition | No locking on state file - concurrent operations could corrupt |
| 50 | 🟡 MEDIUM | Stub Code | `streamLogs()` returns mock data - not actual implementation |
| 51 | 🟡 MEDIUM | Error Handling | `init()` silently swallows all errors including corrupted state file |
| 52 | 🟢 LOW | Resource Leak | `spawn()` detaches Firecracker but `fc.unref()` doesn't close stdio pipes |
| 53 | 🟢 LOW | Logic Error | `waitForSocket()` checks file existence, not actual socket connectivity |
| 54 | 🟢 LOW | Reliability | `pkill` pattern in `kill()` could match unintended processes |

---

## File: `/opt/swarm/swarm-control/lib/dashboard.js`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 55 | 🔴 CRITICAL | Security | Path traversal vulnerability - `filePath` from URL not sanitized: `/../../../etc/passwd` |
| 56 | 🔴 HIGH | Security | `/api/exec` endpoint accepts commands without authentication or sanitization |
| 57 | 🟡 MEDIUM | DoS | `readBody()` has no size limit - large request body could exhaust memory |
| 58 | 🟡 MEDIUM | Security | CORS allows all origins (`*`) - enables cross-site attacks |
| 59 | 🟡 MEDIUM | Security | WebSocket has no authentication |
| 60 | 🟡 MEDIUM | Error Handling | JSON.parse in some routes without try/catch - crashes on invalid JSON |
| 61 | 🟡 MEDIUM | Performance | `fs.readFileSync()` blocks event loop |
| 62 | 🟢 LOW | Resource Leak | `setInterval` for broadcasts never cleaned up on server close |
| 63 | 🟢 LOW | Missing Feature | No rate limiting on API endpoints |
| 64 | 🟢 LOW | Input Validation | No validation on spawn `count` parameter - could exhaust resources |
| 65 | 🟢 LOW | Information Leak | Error messages sent to client could leak internal details |

---

## File: `/opt/swarm/swarm-control/package.json`

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| 66 | 🟡 MEDIUM | Security | No package-lock.json - dependency versions not pinned |
| 67 | 🟡 MEDIUM | Quality | No testing framework - `test` script is just `echo` |
| 68 | 🟢 LOW | Quality | No linting/formatting tools configured |
| 69 | 🟢 LOW | Quality | No TypeScript or JSDoc type definitions |

---

## Recommendations

### Immediate Actions (Before Production)

- [ ] Fix all CRITICAL and HIGH security vulnerabilities
- [ ] Add input validation/sanitization across all user inputs
- [ ] Implement authentication for dashboard API
- [ ] Add checksum verification for downloaded binaries

### Short-Term Improvements

- [ ] Add proper error handling with specific error types
- [ ] Implement retry logic with exponential backoff
- [ ] Add request timeouts to all HTTP calls
- [ ] Fix IP/MAC address overflow issues (support > 254 VMs)
- [ ] Add state file locking

### Long-Term Technical Debt

- [ ] Add comprehensive test suite
- [ ] Set up linting (ESLint) and formatting (Prettier)
- [ ] Consider TypeScript migration for type safety
- [ ] Implement proper logging with structured output
- [ ] Add rate limiting and request size limits
- [ ] Implement log rotation

---

*Report generated by systematic code review of Swarm infrastructure*
