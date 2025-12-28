---
description: How to deploy code changes to the Swarm DEV server
---

# Deploy to DEV Workflow

This workflow outlines the mandatory steps for deploying code changes to the Swarm DEV environment. Follow this process strictly to avoid drift or deployment failures.

## 1. Local Commit & Push
Ensure all changes are committed and pushed to the remote repository.

```bash
# Verify status
git status

# Add changes
git add .

# Commit with conventional commit message
git commit -m "fix(component): description of change"

# Push to main
git push origin main
```

## 2. Connect to DEV Server
SSH into the development server using the Swarm key.

```bash
ssh -i ~/.ssh/swarm_key root@134.199.235.140
```

## 3. Pull Changes on Server
Update the code on the server.

```bash
# Navigate to app directory
cd /opt/swarm-app

# Pull latest changes
# NOTE: If you encounter conflicts, DO NOT merge. Reset to origin/main if local changes are dispensable.
git pull origin main
```

## 4. Restart Services
Restart the relevant PM2 services to apply changes.

**Common Services:**
- `swarm-platform-dev` (API/backend)
- `swarm-coder-agent` (Forge)
- `swarm-verifier` (Sentinel)
- `swarm-rag` (RAG Service)
- `swarm-dashboard-dev` (Dashboard UI)

```bash
# Example: Restarting the platform
export PATH=/root/.nvm/versions/node/v22.21.1/bin:$PATH
pm2 restart swarm-platform-dev

# // turbo
# Restart all if unsure which component was affected
# pm2 restart all
```

## 5. Verify Deployment
Check the logs to ensure the service started correctly and is error-free.

```bash
# Check status
pm2 list

# View logs (tail last 50 lines)
pm2 logs swarm-platform-dev --lines 50 --nostream
```
