# Swarm Dev Server Context

## Overview
Development environment for Swarm - distributed AI agent coordination system.
Architecture: 1 Ticket = 1 Agent = 1 VM = 1 Branch = 1 PR

## Key Directories on this server
- /opt/swarm-platform - Main platform code
- /opt/swarm-dashboard - React SPA frontend
- /opt/swarm-app/docs - Documentation & session notes

## Production Server
- IP: 146.190.35.235 (swarm-prod)
- Has Firecracker VMs and full infrastructure

## Session Notes
ALWAYS read /opt/swarm-app/docs/session-notes/current.md before starting work.
ALWAYS update and git push session notes after completing work.

## Git Workflow
- Commit message format: "session: <brief description>"
- Push after each session checkpoint
