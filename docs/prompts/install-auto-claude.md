# Install Auto-Claude for Swarm Development

## Objective
Fork, install, and configure Auto-Claude on my MacBook to work with the Swarm project repositories.

## Steps

### 1. Fork Auto-Claude to corynaegle-ai org
```bash
gh repo fork AndyMik90/Auto-Claude --org corynaegle-ai --clone=false
```

### 2. Clone the fork locally
```bash
cd ~/Projects  # or appropriate directory
git clone https://github.com/corynaegle-ai/Auto-Claude.git
cd Auto-Claude
```

### 3. Install Python backend
```bash
cd auto-claude
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Install Desktop UI
```bash
cd ../auto-claude-ui
npm install  # or pnpm install
npm run build
```

### 5. Start Memory Layer (Docker)
```bash
cd ..
docker-compose up -d falkordb
```

### 6. Configure for Swarm repositories

Add these Swarm repos as projects in Auto-Claude:

| Repository | Local Path | Purpose |
|------------|------------|---------|
| swarm-specs | ~/swarm-specs-local | Specifications and prompts |
| swarm-platform | Clone from droplet or GitHub | Main platform code |
| swarm-dashboard | Clone if exists | React dashboard UI |

### 7. Configure environment variables

Create `auto-claude/.env`:
```bash
CLAUDE_CODE_OAUTH_TOKEN=<get from claude setup-token>
AUTO_BUILD_MODEL=claude-sonnet-4-20250514
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=<your key>
```

### 8. Launch Auto-Claude
```bash
cd auto-claude-ui
npm run start
```

## Swarm Context

- **DEV Droplet**: 134.199.235.140
- **PROD Droplet**: 146.190.35.235
- **GitHub Org**: corynaegle-ai
- **Key Repos**: swarm-specs, swarm-platform, swarm-dashboard, swarm-tickets

## Prerequisites Checklist
- [ ] Node.js 18+ installed
- [ ] Python 3.9+ installed
- [ ] Docker Desktop running
- [ ] Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- [ ] GitHub CLI authenticated (`gh auth status`)

## References
- Analysis doc: `specs/ticket-creation-phases.md`
- Auto-Claude repo: https://github.com/AndyMik90/Auto-Claude
