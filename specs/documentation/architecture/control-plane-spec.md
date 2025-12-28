# Control Plane VM Specification

> Remote development environment for piloting Claude Code to build Swarm from mobile devices.

## Problem Statement

Building Swarm requires persistent terminal access with:
- Git push/pull capabilities
- SSH access to host and worker VMs
- Claude Code CLI for agentic development
- Session persistence across connections

**Constraints:**
- iPhone cannot run Desktop Commander (iOS sandboxing)
- Claude Web environment blocks authenticated git operations
- No port forwarding available on firewall

## Solution: Swarm-Native Control Plane

A persistent Firecracker VM running a lightweight desktop environment, accessible via RDP over Tailscale. This approach "dogfoods" Swarm — using Swarm to build Swarm.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DigitalOcean Droplet                          │
│                    146.190.35.235                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Tailscale (secure mesh VPN, no ports exposed)              ││
│  │  - Host gets Tailscale IP                                   ││
│  │  - Forwards RDP to Control VM                               ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Swarm Orchestrator                                         ││
│  │  - Manages VM lifecycle                                     ││
│  │  - Network bridge (swarm-br0)                               ││
│  │  - Control Plane marked as persistent                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│         ┌────────────────────┼────────────────────┐             │
│         ▼                    ▼                    ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Control VM   │    │ Worker VM    │    │ Worker VM    │      │
│  │ (Persistent) │    │ (Ephemeral)  │    │ (Ephemeral)  │      │
│  │              │    │              │    │              │      │
│  │ • XFCE/i3    │    │ • Task A     │    │ • Task B     │      │
│  │ • XRDP       │    │              │    │              │      │
│  │ • Claude Code│    └──────────────┘    └──────────────┘      │
│  │ • SSH client │                                               │
│  │ • Git + keys │                                               │
│  └──────────────┘                                               │
│         │                                                        │
│         │ SSH ───────────────────────────────────────────────── │
│         ▼                                                        │
│  Host filesystem, Swarm API, other VMs                          │
└─────────────────────────────────────────────────────────────────┘
          ▲
          │ RDP over Tailscale
          │
    ┌─────┴─────┐
    │  iPhone   │
    │  - Tailscale app
    │  - Microsoft RD
    └───────────┘
```

## Control Plane VM Specifications

### Base Image

| Property | Value |
|----------|-------|
| Base OS | Ubuntu 22.04 LTS (Jammy) |
| Rootfs Format | ext4 |
| Rootfs Size | 4GB |
| vCPUs | 2 |
| Memory | 4096 MB |
| Persistence | Never auto-terminate |

### Installed Packages

**Desktop Environment**

```
xfce4                    # Lightweight desktop
xfce4-goodies            # Extra utilities
xfce4-terminal           # Terminal emulator
dbus-x11                 # D-Bus for desktop
```

**Remote Access**
```
xrdp                     # RDP server
xorgxrdp                 # Xorg backend for XRDP
```

**Development Tools**
```
git                      # Version control
curl                     # HTTP client
wget                     # Download utility
jq                       # JSON processor
tmux                     # Terminal multiplexer
vim                      # Editor
htop                     # Process monitor
```

**Runtime**
```
nodejs (20.x)            # Node.js LTS
npm                      # Package manager
python3                  # Python runtime
python3-pip              # Python packages
```

**Claude Code**
```
@anthropic-ai/claude-code  # Claude Code CLI (npm)
```

**SSH**
```
openssh-client           # SSH client
```

### Pre-configured Files

**SSH Keys** — `/home/claude/.ssh/`
```
id_ed25519              # Private key for git/host access
id_ed25519.pub          # Public key
config                  # SSH config with host aliases
known_hosts             # Pre-populated with github.com, host
```

**Git Config** — `/home/claude/.gitconfig`
```ini
[user]
    email = swarm@agent.local
    name = Swarm Agent
[credential]
    helper = store
[init]
    defaultBranch = main
```

**Environment** — `/home/claude/.bashrc` additions
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export EDITOR=vim
export PATH="$HOME/.npm-global/bin:$PATH"

# Aliases
alias gs="git status"
alias gc="git commit"
alias gp="git push"
alias gl="git log --oneline -10"
alias h="cd /mnt/host"  # Host filesystem mount
```

**XRDP Config** — `/etc/xrdp/xrdp.ini`
```ini
[Globals]
port=3389
max_bpp=24

[Xorg]
name=Xorg
lib=libxup.so
username=ask
password=ask
```

### User Account

| Property | Value |
|----------|-------|
| Username | `claude` |
| Password | `swarm2025!` |
| Shell | `/bin/bash` |
| Groups | `sudo`, `users` |
| Home | `/home/claude` |

### Network Configuration

**Inside VM**
- IP: `172.16.0.100` (static, reserved for control plane)
- Gateway: `172.16.0.1` (host bridge)
- DNS: `8.8.8.8`, `1.1.1.1`

**Host Forwarding**
```bash
# Forward Tailscale RDP to Control VM
iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport 3389 \
    -j DNAT --to-destination 172.16.0.100:3389
iptables -A FORWARD -i tailscale0 -o swarm-br0 -p tcp --dport 3389 -j ACCEPT
```

### Filesystem Mounts

| Mount Point | Source | Purpose |
|-------------|--------|---------|
| `/mnt/host` | 9p virtio | Access host filesystem |
| `/mnt/repos` | 9p virtio | Shared git repos |

## Build Process

### Phase 1: Create Base Rootfs

```bash
#!/bin/bash
# build-control-rootfs.sh

set -e

ROOTFS_DIR="/tmp/control-rootfs"
ROOTFS_IMG="/var/lib/swarm/images/control-rootfs.ext4"
SIZE="4G"

# Bootstrap Ubuntu
sudo debootstrap --include=systemd,dbus,sudo jammy "$ROOTFS_DIR" http://archive.ubuntu.com/ubuntu

# Chroot and configure
sudo chroot "$ROOTFS_DIR" /bin/bash <<'CHROOT_SCRIPT'
set -e

# Basic system config
echo "control-plane" > /etc/hostname
echo "127.0.0.1 localhost control-plane" > /etc/hosts

# Add universe repo
apt-get update
apt-get install -y software-properties-common
add-apt-repository universe
apt-get update

# Install packages
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    xfce4 xfce4-goodies xfce4-terminal \
    xrdp xorgxrdp \
    dbus-x11 \
    git curl wget jq tmux vim htop \
    openssh-client \
    python3 python3-pip \
    ca-certificates gnupg

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Create user
useradd -m -s /bin/bash -G sudo claude
echo "claude:swarm2025!" | chpasswd

# Configure XRDP
systemctl enable xrdp
echo "xfce4-session" > /home/claude/.xsession
chown claude:claude /home/claude/.xsession

# Configure sudo without password for claude
echo "claude ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/claude

# Clean up
apt-get clean
rm -rf /var/lib/apt/lists/*

CHROOT_SCRIPT

# Create ext4 image
truncate -s "$SIZE" "$ROOTFS_IMG"
mkfs.ext4 "$ROOTFS_IMG"
sudo mount "$ROOTFS_IMG" /mnt
sudo cp -a "$ROOTFS_DIR"/* /mnt/
sudo umount /mnt

# Cleanup
sudo rm -rf "$ROOTFS_DIR"

echo "Control plane rootfs created: $ROOTFS_IMG"
```


### Phase 2: Configure Credentials

```bash
#!/bin/bash
# configure-control-credentials.sh

ROOTFS_IMG="/var/lib/swarm/images/control-rootfs.ext4"
MOUNT_POINT="/tmp/control-mount"

mkdir -p "$MOUNT_POINT"
sudo mount "$ROOTFS_IMG" "$MOUNT_POINT"

CLAUDE_HOME="$MOUNT_POINT/home/claude"

# SSH directory
sudo mkdir -p "$CLAUDE_HOME/.ssh"
sudo chmod 700 "$CLAUDE_HOME/.ssh"

# Copy SSH keys (from host)
sudo cp /root/.ssh/swarm_github "$CLAUDE_HOME/.ssh/id_ed25519"
sudo cp /root/.ssh/swarm_github.pub "$CLAUDE_HOME/.ssh/id_ed25519.pub"
sudo chmod 600 "$CLAUDE_HOME/.ssh/id_ed25519"
sudo chmod 644 "$CLAUDE_HOME/.ssh/id_ed25519.pub"

# SSH config
sudo tee "$CLAUDE_HOME/.ssh/config" > /dev/null <<'EOF'
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519

Host host
    HostName 172.16.0.1
    User root
    IdentityFile ~/.ssh/id_ed25519
EOF
sudo chmod 600 "$CLAUDE_HOME/.ssh/config"

# Git config
sudo tee "$CLAUDE_HOME/.gitconfig" > /dev/null <<'EOF'
[user]
    email = swarm@agent.local
    name = Swarm Agent
[credential]
    helper = store
[init]
    defaultBranch = main
[core]
    editor = vim
EOF

# Bashrc additions
sudo tee -a "$CLAUDE_HOME/.bashrc" > /dev/null <<'EOF'

# Swarm Control Plane Config
export ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
export EDITOR=vim
export PATH="$HOME/.npm-global/bin:$PATH"

# Aliases
alias gs="git status"
alias gc="git commit"
alias gp="git push"
alias gpl="git pull"
alias gl="git log --oneline -10"
alias h="cd /mnt/host"
alias repos="cd /home/claude/repos"

# Welcome message
echo "🐝 Swarm Control Plane"
echo "   Host: ssh host"
echo "   Repos: ~/repos"
echo "   Claude: claude"
EOF

# Fix ownership
sudo chown -R 1000:1000 "$CLAUDE_HOME"

sudo umount "$MOUNT_POINT"
rmdir "$MOUNT_POINT"

echo "Credentials configured"
```

### Phase 3: Swarm Integration

Add to `/opt/swarm/lib/control_plane.py`:

```python
"""
Control Plane VM management for Swarm.

The Control Plane is a persistent VM for human-in-the-loop development.
Unlike worker VMs, it:
- Never auto-terminates
- Has a desktop environment (XFCE + XRDP)
- Has pre-configured git credentials and SSH keys
- Uses a fixed IP (172.16.0.100)
"""

import subprocess
import os
from pathlib import Path

CONTROL_PLANE_CONFIG = {
    "vm_id": "control-plane",
    "rootfs": "/var/lib/swarm/images/control-rootfs.ext4",
    "kernel": "/var/lib/swarm/kernels/vmlinux-5.10.225",
    "vcpus": 2,
    "memory_mb": 4096,
    "ip": "172.16.0.100",
    "gateway": "172.16.0.1",
    "tap": "tap-control",
    "socket": "/tmp/firecracker-control.sock",
    "persistent": True,
}


def spawn_control_plane():
    """Spawn the control plane VM if not already running."""
    
    if is_control_plane_running():
        print("Control plane already running")
        return get_control_plane_status()
    
    cfg = CONTROL_PLANE_CONFIG
    
    # Create TAP device
    subprocess.run([
        "ip", "tuntap", "add", cfg["tap"], "mode", "tap"
    ], check=True)
    subprocess.run([
        "ip", "link", "set", cfg["tap"], "master", "swarm-br0", "up"
    ], check=True)
    
    # Firecracker config
    fc_config = {
        "boot-source": {
            "kernel_image_path": cfg["kernel"],
            "boot_args": f"console=ttyS0 reboot=k panic=1 pci=off ip={cfg['ip']}:::{cfg['gateway']}:255.255.255.0::eth0:off"
        },
        "drives": [{
            "drive_id": "rootfs",
            "path_on_host": cfg["rootfs"],
            "is_root_device": True,
            "is_read_only": False
        }],
        "network-interfaces": [{
            "iface_id": "eth0",
            "guest_mac": "AA:FC:00:00:00:01",
            "host_dev_name": cfg["tap"]
        }],
        "machine-config": {
            "vcpu_count": cfg["vcpus"],
            "mem_size_mib": cfg["memory_mb"]
        }
    }
    
    # Write config and start
    config_path = "/tmp/control-plane-config.json"
    with open(config_path, "w") as f:
        import json
        json.dump(fc_config, f)
    
    # Start Firecracker
    subprocess.Popen([
        "firecracker",
        "--api-sock", cfg["socket"],
        "--config-file", config_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    print(f"Control plane started at {cfg['ip']}")
    return {"status": "running", "ip": cfg["ip"], "rdp_port": 3389}


def stop_control_plane():
    """Stop the control plane VM."""
    cfg = CONTROL_PLANE_CONFIG
    
    # Kill Firecracker process
    subprocess.run(["pkill", "-f", f"--api-sock {cfg['socket']}"], check=False)
    
    # Clean up TAP
    subprocess.run(["ip", "link", "del", cfg["tap"]], check=False)
    
    # Remove socket
    Path(cfg["socket"]).unlink(missing_ok=True)
    
    print("Control plane stopped")


def is_control_plane_running():
    """Check if control plane is running."""
    cfg = CONTROL_PLANE_CONFIG
    return Path(cfg["socket"]).exists()


def get_control_plane_status():
    """Get control plane status."""
    cfg = CONTROL_PLANE_CONFIG
    
    if is_control_plane_running():
        return {
            "status": "running",
            "ip": cfg["ip"],
            "rdp_port": 3389,
            "ssh": f"ssh claude@{cfg['ip']}",
        }
    else:
        return {"status": "stopped"}
```


### Phase 4: CLI Integration

Add to swarm CLI:

```bash
# /opt/swarm/bin/swarm-control

#!/bin/bash
# Manage the Swarm Control Plane VM

case "$1" in
    start)
        python3 -c "from lib.control_plane import spawn_control_plane; spawn_control_plane()"
        ;;
    stop)
        python3 -c "from lib.control_plane import stop_control_plane; stop_control_plane()"
        ;;
    status)
        python3 -c "from lib.control_plane import get_control_plane_status; import json; print(json.dumps(get_control_plane_status(), indent=2))"
        ;;
    ssh)
        ssh claude@172.16.0.100
        ;;
    *)
        echo "Usage: swarm-control {start|stop|status|ssh}"
        exit 1
        ;;
esac
```

## Host Configuration

### Tailscale Setup

```bash
# Install Tailscale on host
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Note the Tailscale IP (e.g., 100.x.x.x)
tailscale ip -4
```

### IPTables Forwarding

```bash
#!/bin/bash
# /opt/swarm/scripts/setup-control-forwarding.sh
# Forward RDP from Tailscale to Control Plane VM

CONTROL_IP="172.16.0.100"
RDP_PORT="3389"

# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward

# Forward RDP from Tailscale interface to Control VM
iptables -t nat -A PREROUTING -i tailscale0 -p tcp --dport $RDP_PORT \
    -j DNAT --to-destination $CONTROL_IP:$RDP_PORT

iptables -A FORWARD -i tailscale0 -o swarm-br0 -p tcp --dport $RDP_PORT \
    -m state --state NEW,ESTABLISHED,RELATED -j ACCEPT

iptables -A FORWARD -i swarm-br0 -o tailscale0 -p tcp --sport $RDP_PORT \
    -m state --state ESTABLISHED,RELATED -j ACCEPT

# Masquerade for return traffic
iptables -t nat -A POSTROUTING -o swarm-br0 -j MASQUERADE

echo "RDP forwarding configured: Tailscale:3389 -> $CONTROL_IP:3389"
```

## iPhone Client Setup

### Required Apps

1. **Tailscale** (free)
   - App Store: https://apps.apple.com/app/tailscale/id1470499037
   - Sign in with same account as droplet

2. **Microsoft Remote Desktop** (free)
   - App Store: https://apps.apple.com/app/remote-desktop-mobile/id714464092
   - Or **Jump Desktop** (paid, better experience)

### Connection Setup

1. Open Tailscale, ensure connected
2. Note the droplet's Tailscale IP (e.g., `100.64.0.1`)
3. Open RD Client, add new PC:
   - PC Name: `100.x.x.x` (Tailscale IP)
   - User Account: `claude` / `swarm2025!`
   - Friendly Name: `Swarm Control Plane`
4. Connect

## Usage Workflow

### Daily Development Session

```bash
# From iPhone terminal (Termius) or host:
swarm-control start

# Wait 10-15 seconds for boot + XRDP

# Connect via RD Client on iPhone
# Username: claude
# Password: swarm2025!

# In the desktop, open terminal:
cd ~/repos/swarm
claude  # Start Claude Code

# Tell Claude what to build
# Watch it work in real-time
# Intervene as needed
```

### Session Persistence

The control plane VM persists until explicitly stopped. To preserve state:

```bash
# Snapshot current state (from host)
swarm-control stop
cp /var/lib/swarm/images/control-rootfs.ext4 \
   /var/lib/swarm/images/control-rootfs-backup-$(date +%Y%m%d).ext4
swarm-control start
```

### Emergency Access

If RDP is unresponsive:

```bash
# SSH directly to control plane (from host)
ssh claude@172.16.0.100

# Or use serial console
screen /tmp/firecracker-control.sock
```

## Alternative: Lean Mode (No GUI)

For maximum efficiency, skip the desktop entirely:

```bash
# From iPhone using Termius
ssh root@<tailscale-ip>    # SSH to host
swarm-control ssh          # SSH to control VM
tmux new -s swarm          # Create persistent session
claude                     # Run Claude Code

# Detach: Ctrl+B, D
# Reattach: tmux attach -t swarm
```

This uses less resources and works great with a bluetooth keyboard.

## Security Considerations

1. **Tailscale ACLs**: Restrict which devices can reach the droplet
2. **Credential Storage**: API keys in VM are exposed if rootfs is compromised
3. **RDP Encryption**: XRDP uses TLS by default
4. **No Public Ports**: All access through Tailscale mesh

## Future Enhancements

1. **Tailscale in VM**: Give control plane its own Tailscale identity
2. **VS Code Server**: Browser-based IDE alternative to RDP
3. **Snapshot Scheduling**: Auto-backup control plane state
4. **Multi-user**: Separate control planes per developer
5. **GPU Passthrough**: For local model inference

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start control plane | `swarm-control start` |
| Stop control plane | `swarm-control stop` |
| Check status | `swarm-control status` |
| SSH to control plane | `swarm-control ssh` |
| RDP connection | `100.x.x.x:3389` (Tailscale IP) |
| Control plane user | `claude` / `swarm2025!` |
| Control plane IP | `172.16.0.100` |

---

*Document: control-plane-spec.md*  
*Location: /opt/swarm-specs/architecture/*  
*Version: 1.0*  
*Created: 2025-12-13*
