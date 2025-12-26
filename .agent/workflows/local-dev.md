---
description: Start the local development environment for Swarm
---

This workflow starts the database tunnel, platform backend, and dashboard frontend.

1. Start the SSH tunnel to the DEV database
   - Command: `./scripts/tunnel-dev-db.sh`
   - Note: This must run in the background.

2. Start the Platform (Backend)
   - Directory: `apps/platform`
   - Command: `pnpm dev`
   - Note: Requires the tunnel to be running. If DB auth fails, suspect `swarm` user password mismatch on remote.

3. Start the Dashboard (Frontend)
   - Directory: `apps/dashboard`
   - Command: `pnpm dev`

// turbo
4. Notify the user that the environment is ready.
