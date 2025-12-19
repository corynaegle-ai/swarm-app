# HornetOS Build Guide

> **Document**: `/opt/swarm-specs/docs/swarm-hornet-os-build-guide.md`
> **Version**: 1.0
> **Created**: December 17, 2024
> **Author**: Neural (Master Systems Architect)
> **Status**: Definitive SOP

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Goals](#design-goals)
3. [The Golden Rule](#the-golden-rule)
4. [Network Topology](#network-topology)
5. [HornetOS Tiers](#hornetos-tiers)
6. [Phase 1: Quick Wins](#phase-1-quick-wins)
7. [Phase 2: Alpine Migration](#phase-2-alpine-migration)
8. [Phase 3: Custom Kernel](#phase-3-custom-kernel)
9. [Phase 4: Production Hardening](#phase-4-production-hardening)
10. [Standard Operating Procedures](#standard-operating-procedures)
11. [Troubleshooting](#troubleshooting)
12. [Quick Reference](#quick-reference)

---

## Executive Summary

**HornetOS** is a purpose-built minimal Linux distribution optimized for Firecracker microVMs in the Swarm agent orchestration system. Named for its speed and efficiency, HornetOS achieves:

- Sub-10ms snapshot restore for instant VM deployment
- 150MB rootfs (vs 700MB Ubuntu baseline)
- 128-256MB RAM per VM (vs 512MB baseline)
- 60-120 VMs per 16GB host (vs 30 baseline)

This guide is the **definitive Standard Operating Procedure** for building, modifying, and maintaining HornetOS images.

---

## Design Goals

### Target Metrics

| Metric | Ubuntu Baseline | HornetOS Target | Improvement |
|--------|-----------------|-----------------|-------------|
| Rootfs Size | 700 MB | 150 MB | 4.7x smaller |
| Kernel Size | 21 MB | 8 MB | 2.6x smaller |
| RAM per VM | 512 MB | 128-256 MB | 2-4x less |
| VMs per 16GB | ~30 | 60-120 | 2-4x more |
| Cold Boot | 2-3 seconds | under 500ms | 4-6x faster |
| Snapshot Restore | ~8ms | ~5ms | 1.6x faster |

### Required Capabilities

Every HornetOS image MUST include:

| Component | Purpose | Required |
|-----------|---------|----------|
| Node.js 20.x | Agent runtime | YES |
| Git | Repository operations | YES |
| SSH Server | Remote access | YES |
| Claude Code CLI | AI code generation | YES |
| curl/wget | HTTP operations | YES |
| bash | Shell scripting | YES |
| Network stack | Internet connectivity | YES |

### What We Remove

| Component | Size | Reason |
|-----------|------|--------|
| Python | ~30 MB | Not needed for Node.js agents |
| Perl | ~25 MB | Not needed |
| systemd (full) | ~10 MB | Replace with minimal init |
| Documentation | ~10 MB | man pages, info, docs |
| Locales | ~5 MB | English only needed |
| APT cache | ~25 MB | Regenerated on demand |
| X11/GUI libs | ~10 MB | Headless operation |

---

## The Golden Rule

### CRITICAL: The Snapshot/Rootfs Atomic Relationship

**This is the most important concept in this entire guide.**

NEVER modify rootfs.ext4 after creating a snapshot.
ALWAYS modify the filesystem from INSIDE a running VM, then create a NEW snapshot.

### Why This Matters

When Firecracker creates a snapshot, it captures:

1. **Memory contents** - Including filesystem buffer cache
2. **Inode references** - Kernel's view of filesystem structure
3. **Open file handles** - Any files being accessed

If you modify rootfs.ext4 externally after the snapshot:
- Inode numbers change
- File locations shift
- Directory structures differ

**Result**: Restored VM has corrupted filesystem references leading to EXT4 CORRUPTION

### Error Symptoms of Violation

```
EXT4-fs error: deleted inode referenced: 24593
EXT4-fs error: structure needs cleaning
e2fsck: Inode bitmap differences
Free inodes count wrong for group #N
```

### Correct Workflow

**WRONG APPROACH:**
1. Have existing snapshot
2. Mount rootfs.ext4 on host
3. Add/remove files directly
4. Unmount rootfs.ext4
5. Restore original snapshot
6. CORRUPTION - memory has stale inode references

**CORRECT APPROACH:**
1. Restore existing snapshot (VM boots)
2. SSH into running VM
3. Make changes inside VM (rm, cp, apt, etc.)
4. Pause VM via Firecracker API
5. Create NEW snapshot (captures synchronized state)
6. New snapshot has consistent rootfs + memory

---

## Network Topology

### Design Philosophy

HornetOS uses **network namespace isolation** so every VM can have the identical internal IP address (10.0.0.2) while maintaining complete isolation. This enables:

- Snapshot portability (no per-VM IP configuration)
- Simplified agent code (always connect to 10.0.0.1)
- True multi-tenancy isolation

### Network Architecture

```
                              HOST (Droplet)

     eth0 (public IP) <---- Internet (DigitalOcean)
          |
          | iptables MASQUERADE (-o eth0)
          |
    Host Routing Table
    10.0.1.0/24 via 10.0.1.1 dev veth-vm1-br
    10.0.2.0/24 via 10.0.2.1 dev veth-vm2-br
    10.0.N.0/24 via 10.0.N.1 dev veth-vmN-br
          |
    +-----+-----+-------------+-------------+
    |           |             |             |
    v           v             v             v
veth-vm1-br veth-vm2-br  veth-vm3-br   veth-vmN-br  (Host veth)
10.0.1.254  10.0.2.254   10.0.3.254    10.0.N.254
    |           |             |             |
    | veth pair | veth pair   | veth pair   | veth pair
    v           v             v             v

                    NETWORK NAMESPACES

  ns: vm1       ns: vm2       ns: vm3       ns: vmN

  veth-vm1      veth-vm2      veth-vm3      veth-vmN
  10.0.1.1      10.0.2.1      10.0.3.1      10.0.N.1
      |             |             |             |
   br-vm         br-vm         br-vm         br-vm
  10.0.0.1      10.0.0.1      10.0.0.1      10.0.0.1
      |             |             |             |
    tap0          tap0          tap0          tap0
      |             |             |             |
   FC VM         FC VM         FC VM         FC VM
  10.0.0.2      10.0.0.2      10.0.0.2      10.0.0.2
```

### VM Internal Network Configuration

Every HornetOS VM has identical network configuration baked in.

For Ubuntu-based (netplan):

```yaml
# /etc/netplan/01-netcfg.yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      addresses:
        - 10.0.0.2/24
      routes:
        - to: default
          via: 10.0.0.1
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
```

For Alpine-based:

```
# /etc/network/interfaces
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet static
    address 10.0.0.2
    netmask 255.255.255.0
    gateway 10.0.0.1
```

DNS configuration:

```
# /etc/resolv.conf
nameserver 8.8.8.8
nameserver 1.1.1.1
```

### IP Addressing Scheme

| Component | IP Address | Purpose |
|-----------|------------|---------|
| Host veth (per NS) | 10.0.N.254/24 | Host side of veth pair |
| Namespace veth | 10.0.N.1/24 | Namespace side |
| Internal bridge | 10.0.0.1/24 | VM gateway (same all NSes) |
| VM eth0 | 10.0.0.2/24 | VM address (same all VMs) |

**Formula**: VM_ID N uses subnet 10.0.N.0/24 for host-namespace communication.

---

## HornetOS Tiers

### Tier 1: HornetOS Micro (50-80MB)

Maximum VM density, minimal features:

| Component | Size | Notes |
|-----------|------|-------|
| Custom Kernel | 5 MB | Stripped 5.10.225 |
| Tini init | 28 KB | PID 1 supervisor |
| BusyBox | 1.5 MB | ash, coreutils |
| Dropbear SSH | 400 KB | Minimal SSH server |
| Node.js (Alpine) | 45 MB | Statically linked |
| Git (minimal) | 15 MB | Core operations only |
| LibreSSL | 4 MB | TLS support |
| Swarm Agent | 10 MB | Agent + anthropic SDK |
| **TOTAL** | **~80 MB** | |

**Use case**: Maximum scale deployments (1000+ VMs)

### Tier 2: HornetOS Standard (100-150MB) - RECOMMENDED

Balanced size and usability:

| Component | Size | Notes |
|-----------|------|-------|
| Alpine Kernel | 8 MB | Optimized 5.10.x |
| OpenRC init | 1.2 MB | Fast, simple init |
| BusyBox + bash | 3 MB | Full shell support |
| OpenSSH | 2 MB | Standard SSH |
| Node.js 20 | 55 MB | Full runtime |
| Git | 25 MB | Full features |
| OpenSSL | 3 MB | Standard TLS |
| curl, wget | 2 MB | HTTP tools |
| Claude Code | 50 MB | AI coding CLI |
| **TOTAL** | **~150 MB** | |

**Use case**: Production workloads, standard agents

### Tier 3: HornetOS Dev (200-250MB)

Development and debugging:

| Component | Size | Notes |
|-----------|------|-------|
| All Standard components | 150 MB | Base |
| vim/nano | 5 MB | Editors |
| htop, strace | 2 MB | Debugging |
| Python 3 (minimal) | 40 MB | Scripting |
| Build tools | 30 MB | gcc, make |
| **TOTAL** | **~250 MB** | |

**Use case**: Development, debugging, testing

---

## Phase 1: Quick Wins

**Goal**: Reduce existing Ubuntu rootfs from 700MB to ~400MB with minimal risk.
**Time estimate**: 1-2 hours
**Risk level**: Low (reversible, tools preserved)

### Prerequisites

Verify backup exists:

```bash
ls -la /opt/swarm/snapshots/ubuntu2204-original-backup/
# Should show: rootfs.ext4 (700MB), vm.mem (512MB), vm.snapshot (12KB)
```

### Step 1: Environment Setup

```bash
# Full cleanup
pkill -9 firecracker 2>/dev/null || true
sleep 1
ip link del tap0 2>/dev/null || true
ip link del br0 2>/dev/null || true
rm -f /tmp/fc*.sock

# Setup bridge networking (for single-VM testing)
ip link add br0 type bridge
ip addr add 10.0.0.1/24 dev br0
ip link set br0 up

ip tuntap add tap0 mode tap
ip link set tap0 master br0
ip link set tap0 up

# Enable NAT
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

echo "Environment ready"
```

### Step 2: Restore Base Snapshot

```bash
SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-original-backup"
SOCKET="/tmp/fc-phase1.sock"

firecracker --api-sock $SOCKET &
sleep 2

curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/load" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_path": "'$SNAP_DIR'/vm.snapshot",
    "mem_backend": {
      "backend_type": "File",
      "backend_path": "'$SNAP_DIR'/vm.mem"
    },
    "enable_diff_snapshots": false,
    "resume_vm": true
  }'

echo "Snapshot restored. Waiting for SSH..."
sleep 2
```

### Step 3: Optimize Inside Running VM

```bash
VM_IP="10.0.0.2"

echo "BEFORE:"
ssh -o StrictHostKeyChecking=no root@$VM_IP "df -h /"

ssh -o StrictHostKeyChecking=no root@$VM_IP '
# Remove Python
rm -rf /usr/lib/python3* /usr/bin/python3* /usr/lib/python3

# Remove Perl
rm -rf /usr/bin/perl* /usr/share/perl* /usr/lib/x86_64-linux-gnu/perl*

# Remove documentation
rm -rf /usr/share/doc /usr/share/man /usr/share/info /usr/share/locale

# Remove APT cache
rm -rf /var/cache/apt/* /var/lib/apt/lists/*

# Remove npm cache and logs
rm -rf /root/.npm /var/log/*

# Remove GUI/X11 cruft
rm -rf /usr/share/X11 /usr/share/mime /usr/share/bash-completion /usr/share/gitweb

# Sync filesystem
sync
'

echo "AFTER:"
ssh -o StrictHostKeyChecking=no root@$VM_IP "df -h /"
```

### Step 4: Verify Tools Still Work

```bash
ssh -o StrictHostKeyChecking=no root@$VM_IP '
echo "Node.js: $(node --version)"
echo "Git: $(git --version)"
echo "SSH: $(which ssh)"
echo "Curl: $(curl --version | head -1)"
echo "Bash: $(bash --version | head -1)"
echo "Claude: $(claude --version 2>&1 | head -1)"

# Test network
echo ""
echo "Network test:"
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://api.github.com
'
```

### Step 5: Create Optimized Snapshot

```bash
SOCKET="/tmp/fc-phase1.sock"
OUTPUT_DIR="/opt/swarm/snapshots/hornetos-phase1"

mkdir -p $OUTPUT_DIR

# Pause VM
curl -s --unix-socket $SOCKET -X PATCH "http://localhost/vm" \
  -H "Content-Type: application/json" \
  -d '{"state": "Paused"}'

sleep 2

# Create snapshot
curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/create" \
  -H "Content-Type: application/json" \
  -d '{
    "snapshot_path": "'$OUTPUT_DIR'/vm.snapshot",
    "mem_file_path": "'$OUTPUT_DIR'/vm.mem",
    "snapshot_type": "Full"
  }'

# Copy the rootfs (it was modified by the running VM)
cp /opt/swarm/snapshots/ubuntu2204-original-backup/rootfs.ext4 $OUTPUT_DIR/

echo "Phase 1 snapshot created:"
ls -lah $OUTPUT_DIR/
```

### Expected Results

| Metric | Before | After Phase 1 |
|--------|--------|---------------|
| Disk Used | 516 MB | ~380 MB |
| Available | 106 MB | ~240 MB |
| Savings | - | ~136 MB (26%) |

---

## Phase 2: Alpine Migration

**Goal**: Replace Ubuntu with Alpine Linux for ~150MB rootfs.
**Time estimate**: 4-8 hours
**Risk level**: Medium (new base, thorough testing required)

### Why Alpine?

| Feature | Ubuntu | Alpine |
|---------|--------|--------|
| Base size | 200+ MB | 5 MB |
| Package manager | apt (slow) | apk (fast) |
| Init system | systemd (heavy) | OpenRC (light) |
| C library | glibc | musl |
| Philosophy | General purpose | Minimal, secure |

### Build Script

```bash
#!/bin/bash
set -e

VERSION="3.19"
ROOTFS_SIZE="200M"
OUTPUT="/opt/swarm/build/hornetos-alpine"
ROOTFS="$OUTPUT/rootfs.ext4"

echo "=== Building HornetOS Alpine v$VERSION ==="

# Create build directory
mkdir -p $OUTPUT
rm -f $ROOTFS

# Create ext4 image
dd if=/dev/zero of=$ROOTFS bs=1M count=200
mkfs.ext4 -F $ROOTFS

# Mount
MOUNT_POINT="/mnt/hornetos-build"
mkdir -p $MOUNT_POINT
mount -o loop $ROOTFS $MOUNT_POINT

# Bootstrap Alpine
apk -X https://dl-cdn.alpinelinux.org/alpine/v$VERSION/main \
    -U --allow-untrusted --root $MOUNT_POINT --initdb add alpine-base

# Add essential packages
apk --root $MOUNT_POINT add \
    nodejs npm \
    git openssh-client openssh-server \
    curl wget ca-certificates \
    bash \
    openrc \
    e2fsprogs

# Install Claude Code
chroot $MOUNT_POINT npm install -g @anthropic-ai/claude-code

# Configure network (see Network Topology section)
cat > $MOUNT_POINT/etc/network/interfaces << 'EOF'
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet static
    address 10.0.0.2
    netmask 255.255.255.0
    gateway 10.0.0.1
EOF

# Configure DNS
cat > $MOUNT_POINT/etc/resolv.conf << 'EOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
EOF

# Configure SSH
mkdir -p $MOUNT_POINT/root/.ssh
chmod 700 $MOUNT_POINT/root/.ssh
cp /root/.ssh/authorized_keys $MOUNT_POINT/root/.ssh/ 2>/dev/null || true

# Enable SSH service
chroot $MOUNT_POINT rc-update add sshd default

# Configure OpenRC for VM environment
sed -i 's/^#rc_sys=""/rc_sys="lxc"/' $MOUNT_POINT/etc/rc.conf

# Cleanup
rm -rf $MOUNT_POINT/var/cache/apk/*
rm -rf $MOUNT_POINT/root/.npm/_cacache

# Unmount
sync
umount $MOUNT_POINT

echo "=== HornetOS Alpine build complete ==="
du -sh $ROOTFS
```

### Expected Results

| Metric | Phase 1 (Ubuntu) | Phase 2 (Alpine) |
|--------|------------------|------------------|
| Rootfs Used | ~380 MB | ~150 MB |
| Cold Boot | 2-3 seconds | ~500ms |
| Memory | 512 MB | 256 MB |

---

## Phase 3: Custom Kernel

**Goal**: Reduce kernel from 21MB to 8MB, improve boot time.
**Time estimate**: 1-2 days
**Risk level**: Medium-High (kernel changes can break boot)

### Required Kernel Features

```
# REQUIRED: Virtio (Firecracker uses these)
CONFIG_VIRTIO=y
CONFIG_VIRTIO_PCI=y
CONFIG_VIRTIO_BLK=y
CONFIG_VIRTIO_NET=y
CONFIG_VIRTIO_MMIO=y
CONFIG_VIRTIO_BALLOON=y

# REQUIRED: Filesystems
CONFIG_EXT4_FS=y
CONFIG_TMPFS=y
CONFIG_PROC_FS=y
CONFIG_SYSFS=y
CONFIG_DEVTMPFS=y
CONFIG_DEVTMPFS_MOUNT=y

# REQUIRED: Networking
CONFIG_NET=y
CONFIG_INET=y
CONFIG_TUN=y
CONFIG_BRIDGE=y
CONFIG_NETFILTER=y
CONFIG_IP_NF_IPTABLES=y
CONFIG_IP_NF_NAT=y
CONFIG_IP_NF_FILTER=y
CONFIG_NF_CONNTRACK=y

# REQUIRED: Security/Isolation
CONFIG_SECCOMP=y
CONFIG_CGROUPS=y
CONFIG_NAMESPACES=y
CONFIG_USER_NS=y
CONFIG_PID_NS=y
CONFIG_NET_NS=y
CONFIG_IPC_NS=y

# REQUIRED: Entropy (Critical for SSH)
CONFIG_HW_RANDOM=y
CONFIG_HW_RANDOM_VIRTIO=y
CONFIG_RANDOM_TRUST_BOOTLOADER=y
CONFIG_RANDOM_TRUST_CPU=y

# REQUIRED: Serial Console
CONFIG_SERIAL_8250=y
CONFIG_SERIAL_8250_CONSOLE=y

# REMOVE: Not needed
# CONFIG_DRM is not set
# CONFIG_FB is not set
# CONFIG_VGA_CONSOLE is not set
# CONFIG_USB_SUPPORT is not set
# CONFIG_SOUND is not set
# CONFIG_WIRELESS is not set
# CONFIG_WLAN is not set
# CONFIG_INPUT is not set
# CONFIG_SERIO is not set
# CONFIG_DEBUG_KERNEL is not set
# CONFIG_MODULES is not set
```

### Kernel Build Process

```bash
KERNEL_VERSION="5.10.225"
BUILD_DIR="/opt/swarm/build/kernel"

mkdir -p $BUILD_DIR
cd $BUILD_DIR

# Download kernel source
wget https://cdn.kernel.org/pub/linux/kernel/v5.x/linux-$KERNEL_VERSION.tar.xz
tar xf linux-$KERNEL_VERSION.tar.xz
cd linux-$KERNEL_VERSION

# Apply HornetOS config
cp /opt/swarm/build/hornetos-kernel.config .config

# Build
make olddefconfig
make -j$(nproc) vmlinux

# Copy output
cp vmlinux /opt/swarm/images/hornetos-vmlinux.bin

echo "Kernel built:"
ls -lah /opt/swarm/images/hornetos-vmlinux.bin
```

### Expected Results

| Metric | Stock Kernel | HornetOS Kernel |
|--------|--------------|-----------------|
| Size | 21 MB | ~8 MB |
| Boot time | 2-3 seconds | ~200ms |
| Features | Many unused | Minimal required |

---

## Phase 4: Production Hardening

**Goal**: Security hardening and operational excellence.
**Time estimate**: 1-2 weeks
**Risk level**: Low (additive security measures)

### Read-Only Rootfs

```bash
# Mount rootfs read-only, use tmpfs overlay for writes
mount -o ro /dev/root /

# Create tmpfs overlay for /var and /tmp
mount -t tmpfs tmpfs /var
mount -t tmpfs tmpfs /tmp
```

### Runtime Secrets Injection

Never bake secrets into rootfs. Inject at runtime:

```bash
# In VM boot script
SECRETS_URL="http://10.0.0.1:8080/secrets/$VM_ID"
curl -s $SECRETS_URL | jq -r 'to_entries[] | "export \(.key)=\(.value)"' > /tmp/secrets.env
source /tmp/secrets.env
rm /tmp/secrets.env
```

### Health Checks

```bash
#!/bin/bash
# /opt/hornetos/healthcheck.sh

check_ssh() {
  pgrep -x sshd > /dev/null
}

check_network() {
  ping -c 1 -W 1 10.0.0.1 > /dev/null 2>&1
}

check_disk() {
  local usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
  [ $usage -lt 90 ]
}

if check_ssh && check_network && check_disk; then
  echo "HEALTHY"
  exit 0
else
  echo "UNHEALTHY"
  exit 1
fi
```

---

## Standard Operating Procedures

### SOP 1: Creating a New HornetOS Version

```bash
VERSION="v1.1"
BASE_SNAPSHOT="/opt/swarm/snapshots/hornetos-v1.0"
NEW_SNAPSHOT="/opt/swarm/snapshots/hornetos-$VERSION"

# 1. Restore base snapshot
firecracker --api-sock /tmp/fc.sock &
sleep 2
curl --unix-socket /tmp/fc.sock -X PUT "http://localhost/snapshot/load" \
  -d '{"snapshot_path":"'$BASE_SNAPSHOT'/vm.snapshot","mem_backend":{"backend_type":"File","backend_path":"'$BASE_SNAPSHOT'/vm.mem"},"resume_vm":true}'

# 2. Wait for SSH
sleep 3

# 3. Make changes via SSH
ssh root@10.0.0.2 "
  # Your modifications here
  apk update && apk upgrade
  npm update -g
"

# 4. Pause and snapshot
mkdir -p $NEW_SNAPSHOT
curl --unix-socket /tmp/fc.sock -X PATCH "http://localhost/vm" -d '{"state":"Paused"}'
sleep 2
curl --unix-socket /tmp/fc.sock -X PUT "http://localhost/snapshot/create" \
  -d '{"snapshot_path":"'$NEW_SNAPSHOT'/vm.snapshot","mem_file_path":"'$NEW_SNAPSHOT'/vm.mem","snapshot_type":"Full"}'

# 5. Copy rootfs
cp $BASE_SNAPSHOT/rootfs.ext4 $NEW_SNAPSHOT/

echo "HornetOS $VERSION created at $NEW_SNAPSHOT"
```

### SOP 2: Validating a HornetOS Build

```bash
SNAPSHOT_DIR=$1

echo "=== HornetOS Validation ==="

# 1. Check files exist
echo "[1/5] Checking snapshot files..."
for f in rootfs.ext4 vm.mem vm.snapshot; do
  [ -f "$SNAPSHOT_DIR/$f" ] || { echo "FAIL: Missing $f"; exit 1; }
done
echo "PASS: All snapshot files present"

# 2. Check rootfs integrity
echo "[2/5] Checking filesystem integrity..."
e2fsck -n $SNAPSHOT_DIR/rootfs.ext4 || { echo "FAIL: Filesystem errors"; exit 1; }
echo "PASS: Filesystem OK"

# 3. Restore and test SSH (assumes network setup done)
echo "[3/5] Testing snapshot restore and SSH..."
# ... restore and SSH test code ...

# 4. Verify tools
echo "[4/5] Verifying required tools..."
ssh root@10.0.0.2 "node --version && git --version && claude --version" || exit 1
echo "PASS: Tools verified"

# 5. Test network
echo "[5/5] Testing network connectivity..."
ssh root@10.0.0.2 "curl -s https://api.github.com > /dev/null" || exit 1
echo "PASS: Network OK"

echo "=== VALIDATION COMPLETE ==="
```

### SOP 3: Emergency Rollback

```bash
echo "=== Emergency Rollback ==="

# Kill all VMs
pkill -9 firecracker

# Restore from backup
cp -r /opt/swarm/snapshots/ubuntu2204-original-backup/* \
      /opt/swarm/snapshots/hornetos-production/

echo "Rollback complete. Production restored to original Ubuntu image."
```

---

## Troubleshooting

### Problem: VM boots but SSH fails

**Symptoms**: Firecracker starts, but ssh root@10.0.0.2 times out

**Diagnosis**:
```bash
# Check bridge networking
ip addr show br0
ip link show tap0

# Check namespace (if using namespaces)
ip netns list
ip netns exec vm1 ip addr show

# Check Firecracker logs
tail -100 /tmp/fc.log | grep -i error
```

**Common fixes**:
1. Verify bridge has IP 10.0.0.1/24
2. Verify tap0 is attached to bridge
3. Verify NAT rules: iptables -t nat -L -n
4. Check VM console for SSH startup errors

### Problem: EXT4 corruption after restore

**Symptoms**: Filesystem errors, files missing, strange behavior

**Cause**: Rootfs modified after snapshot was taken

**Fix**: Never modify rootfs.ext4 directly. Always:
1. Restore snapshot
2. Make changes via SSH
3. Create new snapshot

### Problem: Cold boot hangs on entropy

**Symptoms**: Boot stalls at "Load/Save Random Seed" for 60+ seconds

**Fix**: Use snapshot restore instead of cold boot, or add to kernel boot args:
```
random.trust_cpu=on
```

### Problem: Out of disk space in VM

**Symptoms**: No space left on device errors

**Fix**: Check what is consuming space:
```bash
ssh root@10.0.0.2 "du -sh /* | sort -h"
```
Usually: logs, npm cache, or apt cache. Clean and re-snapshot.

---

## Quick Reference

### Essential Commands

```bash
# Cleanup
pkill -9 firecracker
ip link del tap0 2>/dev/null
ip link del br0 2>/dev/null
rm -f /tmp/fc*.sock

# Setup Bridge (single VM testing)
ip link add br0 type bridge
ip addr add 10.0.0.1/24 dev br0
ip link set br0 up
ip tuntap add tap0 mode tap
ip link set tap0 master br0
ip link set tap0 up
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# Restore Snapshot
firecracker --api-sock /tmp/fc.sock &
curl --unix-socket /tmp/fc.sock -X PUT "http://localhost/snapshot/load" \
  -d '{"snapshot_path":"PATH/vm.snapshot","mem_backend":{"backend_type":"File","backend_path":"PATH/vm.mem"},"resume_vm":true}'

# Pause VM
curl --unix-socket /tmp/fc.sock -X PATCH "http://localhost/vm" -d '{"state":"Paused"}'

# Create Snapshot
curl --unix-socket /tmp/fc.sock -X PUT "http://localhost/snapshot/create" \
  -d '{"snapshot_path":"PATH/vm.snapshot","mem_file_path":"PATH/vm.mem","snapshot_type":"Full"}'

# SSH to VM
ssh -o StrictHostKeyChecking=no root@10.0.0.2
```

### Directory Structure

```
/opt/swarm/
  images/
    vmlinux.bin              # Stock kernel (21MB)
    hornetos-vmlinux.bin     # Custom kernel (8MB)
  snapshots/
    ubuntu2204-original-backup/   # Original fallback
    hornetos-phase1/              # Ubuntu optimized
    hornetos-v1.0/                # Alpine production
    hornetos-dev/                 # Development
  build/
    kernel/                       # Kernel build artifacts
    hornetos-alpine/              # Alpine rootfs build
```

### Version History

| Version | Base | Size | Status |
|---------|------|------|--------|
| ubuntu2204-original | Ubuntu 22.04 | 700MB | Backup |
| hornetos-phase1 | Ubuntu 22.04 | ~400MB | Tested |
| hornetos-v1.0 | Alpine 3.19 | ~150MB | Target |

---

## Snapshot Anatomy

A HornetOS deployment consists of three atomic files:

```
/opt/swarm/snapshots/hornetos-v1.0/
  rootfs.ext4      # Root filesystem (ext4 image)
  vm.mem           # Memory snapshot (512MB currently)
  vm.snapshot      # VM configuration state (~12KB)
```

### File Relationships

The three files form an atomic unit:

- **rootfs.ext4**: Contains the filesystem (binaries, configs, data)
- **vm.mem**: Memory dump including filesystem buffer cache with inode references
- **vm.snapshot**: CPU state and device configuration

CRITICAL: The memory snapshot contains references to specific filesystem state.
If you modify rootfs.ext4 after taking a snapshot, the memory references become
invalid, causing filesystem corruption on restore.

---

*Document maintained at /opt/swarm-specs/docs/swarm-hornet-os-build-guide.md*
*Last updated: December 17, 2024*
