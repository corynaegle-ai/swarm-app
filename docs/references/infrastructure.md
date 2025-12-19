# Infrastructure Reference

> **Moved to Git**: https://github.com/corynaegle-ai/swarm-specs/blob/main/references/infrastructure.md

Current production configuration for Project Swarm. This is what's deployed NOW.

---

## Droplet Configuration

| Item | Value |
|------|-------|
| Provider | DigitalOcean |
| IP Address | 146.190.35.235 |
| vCPU | 4 |
| RAM | 16GB |
| OS | Ubuntu 24.04 LTS |
| Max VMs tested | 100 (sequential boot) |

## VM Configuration

| Item | Value |
|------|-------|
| Kernel | vmlinux-5.10.225 |
| Boot param | random.trust_cpu=on (entropy fix) |
| Rootfs | Ubuntu 22.04, 584MB |
| VM RAM | 512MB virtual, ~115MB actual |
| Node.js | v20 |
| Claude Code | 2.0.59 |
| jq | v1.6 |

## Network Configuration

| Item | Value |
|------|-------|
| Bridge | br0 |
| Host IP | 10.0.0.1 |
| VM IP range | 10.0.0.2 - 10.0.0.254 |
| DNS | 8.8.8.8 (baked into rootfs) |
| NAT | Masquerading enabled |

**IP Formula**: VM N gets IP 10.0.0.(N+2) (VM 0 = 10.0.0.2)

## File Locations - Droplet

/opt/swarm-tickets/
├── api-server.js          # HTTP API (11.7KB)
├── package.json           # express + better-sqlite3
├── node_modules/          # Installed
├── data/swarm.db          # SQLite database
├── design-agent/          # 3-phase pipeline
│   ├── design-agent.js
│   ├── phase1-skeleton.js
│   ├── phase2-expansion.js
│   └── phase3-validation.js
└── src/
    ├── db.js              # Schema definition
    ├── store.js           # TicketStore class
    └── cli.js             # CLI interface

/usr/local/bin/
├── swarm-api              # API control
├── swarm-agent-v2         # Pull-based agent
├── swarm-spawn            # Parallel VM spawner
├── swarm-cleanup          # VM cleanup
├── swarm-boot-vm          # Single VM boot
└── swarm-orchestrate-tickets

/var/lib/firecracker/
├── rootfs/ubuntu2204-rootfs.ext4
├── kernel/vmlinux-5.10.225
└── snapshots/

## Key Commands

SSH to Droplet:
  ssh -i ~/.ssh/swarm_key root@146.190.35.235
  export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin

VM Management:
  swarm-cleanup                    # Kill all VMs
  swarm-boot-vm 0                  # Boot single VM
  swarm-spawn 5                    # Boot 5 VMs parallel

SSH to VM:
  ssh -o StrictHostKeyChecking=no root@10.0.0.2

API Management:
  swarm-api start|stop|status|health|stats|tickets

## GitHub Configuration

| Item | Value |
|------|-------|
| Key Type | ssh-ed25519 |
| Key Location (droplet) | /root/.ssh/swarm_github |
| Key Location (VM) | /root/.ssh/swarm_github |
| Git User | Swarm Agent <swarm@agent.local> |
| Repo | corynaegle-ai/project-swarm (private) |

**Important**: Must use SSH URLs (git@github.com:) not HTTPS for private repos.

## Services

| Service | Port | Status |
|---------|------|--------|
| swarm-api | 8080 | Running (systemd) |
| sshd (VM) | 22 | Running via sshd-simple.service |
