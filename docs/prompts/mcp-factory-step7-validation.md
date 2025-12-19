# MCP Factory - Step 7: E2E Validation & Deployment

## Context

MCP Factory core pipeline is complete at .

**Completed Steps 1-6:**
- parser.js: NL → JSON spec via Claude
- generator.js: Spec → TypeScript MCP server
- validator.js: TypeScript/Protocol/Deps checks
- packager.js: Build & .tgz creation
- registry.js: SQLite CRUD
- api.js: Express API on port 3456

**Remaining:** E2E validation and production deployment

---

## Step 7A: E2E Pipeline Test

### Prerequisites
Welcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-88-generic x86_64)

 * Documentation:  https://help.ubuntu.com
 * Management:     https://landscape.canonical.com
 * Support:        https://ubuntu.com/pro

 System information as of Mon Dec 15 17:09:27 UTC 2025

  System load:  0.0                 Processes:             158
  Usage of /:   30.8% of 192.69GB   Users logged in:       0
  Memory usage: 5%                  IPv4 address for eth0: 146.190.35.235
  Swap usage:   0%                  IPv4 address for eth0: 10.48.0.5

Expanded Security Maintenance for Applications is not enabled.

56 updates can be applied immediately.
To see these additional updates run: apt list --upgradable

1 additional security update can be applied with ESM Apps.
Learn more about enabling ESM Apps service at https://ubuntu.com/esm

### Test 1: Simple Calculator Server


### Test 2: Verify Generated Server


### Test 3: Claude Desktop Config


---

## Step 7B: PM2 Deployment

### Install PM2 Service


### Verify


---

## Step 7C: Optional Enhancements

| Enhancement | Description |
|-------------|-------------|
| Rate limiting | Add express-rate-limit to /api/generate |
| API key auth | Protect endpoints with Bearer token |
| Cleanup job | Cron to delete old output/ dirs |
| Health check | GET /health endpoint |

---

## Success Criteria

- [ ] /api/generate produces working MCP server from NL description
- [ ] Generated server passes TypeScript compilation
- [ ] claude_config snippet is valid JSON
- [ ] PM2 keeps service running after reboot
- [ ] Generation completes in < 60 seconds

---

## Deliverables

1. Successful E2E test output (job_id, generated files)
2. PM2 ecosystem.config.js committed to repo
3. Session notes updated with validation results
