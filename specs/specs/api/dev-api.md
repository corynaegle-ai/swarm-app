# Swarm Dev API - Design & Implementation

**Source**: Notion (migrated 2025-12-11)  
**Status**: ✅ COMPLETE (Sessions 1-3)

---

## Purpose

HTTP API enabling Claude iOS/iPad to perform Swarm development without Desktop Commander SSH access. Allows full development workflow from mobile devices.

## URLs

| URL | Purpose |
|-----|---------|
| https://swarmstack.net | Landing page |
| https://api.swarmstack.net | Dev API (HTTPS) |
| http://146.190.35.235:3000 | Direct API (backup) |

## Authentication

**Header:** `Authorization: Bearer <api-key>`

All endpoints except `/api/health` require authentication.

## Security

### Path Whitelist
- `/opt/swarm`
- `/opt/swarm-tickets`
- `/opt/swarm-api`
- `/var/log`
- `/tmp/swarm`

### Protections
- Bearer token authentication
- Path validation prevents directory traversal
- No shell interpolation in commands
- Helmet.js security headers
- CORS enabled

---

## File Endpoints (Session 1)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (no auth) |
| `/api/files/read` | GET | Read file with line range/tail |
| `/api/files/write` | POST | Write file content |
| `/api/files/info` | GET | File metadata |
| `/api/ls` | GET | List directory |
| `/api/files/search` | GET | Search files (grep + glob) |
| `/api/files` | DELETE | Delete file |

### Examples

```bash
# Read file
GET /api/files/read?path=/opt/swarm/bin/swarm-spawn&tail=50

# Write file
POST /api/files/write
Body: { "path": "/tmp/test.txt", "content": "hello", "createDirs": true }

# List directory
GET /api/ls?path=/opt/swarm&depth=2

# Search
GET /api/files/search?path=/opt/swarm&pattern=execSync&maxResults=20
```

---

## Git Endpoints (Session 2)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/git/status` | GET | Working tree status |
| `/api/git/diff` | GET | Unstaged changes |
| `/api/git/log` | GET | Recent commits |
| `/api/git/branch` | GET | List branches |
| `/api/git/add` | POST | Stage files |
| `/api/git/commit` | POST | Commit with message |
| `/api/git/push` | POST | Push to origin |
| `/api/git/pull` | POST | Pull from origin |
| `/api/git/session-start` | POST | Run swarm-session-start |
| `/api/git/session-end` | POST | Run swarm-session-end |

**Repo whitelist**: swarm, swarm-tickets

---

## Swarm & Ticket Endpoints (Session 3)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/swarm/status` | GET | swarm-status output |
| `/api/swarm/boot` | POST | Boot VMs |
| `/api/swarm/cleanup` | POST | Run swarm-cleanup |
| `/api/tickets` | GET | List tickets |
| `/api/tickets/:id` | GET | Get ticket |
| `/api/tickets` | POST | Create ticket |
| `/api/tickets/:id` | PATCH | Update ticket |
| `/api/tickets/:id` | DELETE | Delete ticket |

**Ticket statuses**: open, in_progress, review, done, blocked

---

## Infrastructure

| Path | Purpose |
|------|---------|
| `/opt/swarm-api/server.js` | Main API server (~962 lines) |
| `/opt/swarm-api/package.json` | Node.js config |
| `/etc/systemd/system/swarm-api.service` | systemd service |
| `/etc/caddy/Caddyfile` | Caddy reverse proxy config |

### Services

| Service | Port | Purpose |
|---------|------|---------|
| swarm-api | 3000 | Node.js API |
| caddy | 80, 443 | HTTPS termination, reverse proxy |

### Commands

```bash
systemctl restart swarm-api    # Restart API
journalctl -u swarm-api -f     # View API logs
systemctl restart caddy        # Restart Caddy
journalctl -u caddy -f         # View Caddy logs
```

---

## Build Log

| Session | Date | Work | Lines |
|---------|------|------|-------|
| 1 | 2025-12-10 01:40 UTC | File ops, systemd, Caddy, HTTPS | ~350 |
| 2 | 2025-12-10 02:15 UTC | 10 Git endpoints | ~296 |
| 3 | 2025-12-10 02:52 UTC | Swarm cmds + Tickets | ~300 |

---

*Migrated to git: December 11, 2025*
