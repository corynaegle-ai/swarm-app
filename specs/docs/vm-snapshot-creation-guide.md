# Firecracker VM Snapshot Creation Guide

> **Version**: 1.0  
> **Last Updated**: December 17, 2024  
> **Author**: Neural (Master Systems Architect)  
> **Status**: Production Ready

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Key Concepts](#key-concepts)
4. [Network Topology](#network-topology)
5. [The Critical Insight](#the-critical-insight)
6. [Step-by-Step Workflow](#step-by-step-workflow)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Lessons Learned](#lessons-learned)
9. [Quick Reference](#quick-reference)

---

## Overview

This guide documents the process of creating a working Firecracker microVM snapshot with:
- Full network connectivity via bridge topology
- SSH access for remote management
- Pre-baked application files (e.g., FORGE agent)
- Sub-10ms restore times

### What is a Firecracker Snapshot?

A Firecracker snapshot consists of three components:

| File | Size | Purpose |
|------|------|---------|
| `rootfs.ext4` | ~700MB | The VM's root filesystem (ext4 image) |
| `vm.mem` | 512MB | Complete memory state at snapshot time |
| `vm.snapshot` | ~12-16KB | VM configuration and device state |

**Critical**: These three files form an atomic unit. The memory snapshot (`vm.mem`) contains references to specific filesystem state (inodes, buffers). If you modify `rootfs.ext4` after taking a snapshot, the memory references become invalid, causing filesystem corruption.

---

## Prerequisites

### Host System Requirements

```bash
# Verify Firecracker is installed
firecracker --version
# Expected: Firecracker v1.10.1 or higher

# Verify kernel supports required features
uname -r
# Needs: 4.14+ (5.10+ recommended for entropy fixes)

# Check for required tools
which curl jq ip iptables e2fsck
```

### Required Files

```
/opt/swarm/
├── images/
│   └── vmlinux.bin          # Linux kernel (uncompressed)
├── snapshots/
│   └── ubuntu2204-production/
│       ├── rootfs.ext4      # Base filesystem image
│       ├── vm.mem           # Memory snapshot (created)
│       └── vm.snapshot      # VM state (created)
```

### Network Prerequisites

```bash
# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward

# Verify NAT capability
iptables -t nat -L POSTROUTING
```

---

## Key Concepts

### Why Snapshots Matter

| Method | Boot Time | Use Case |
|--------|-----------|----------|
| Cold Boot | 10-60+ seconds | Initial setup, debugging |
| Snapshot Restore | 4-10ms | Production workloads |

Snapshot restore is **1000x faster** than cold boot because it skips:
- Kernel initialization
- systemd service startup
- Entropy pool seeding
- Network configuration

### The Snapshot Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  1. Cold Boot VM (or restore existing snapshot)             │
│     └── Wait for services to stabilize                      │
│                                                             │
│  2. Configure VM State                                      │
│     └── Add files, configure services, etc.                 │
│                                                             │
│  3. Pause VM                                                │
│     └── Freezes all execution                               │
│                                                             │
│  4. Create Snapshot                                         │
│     └── Captures memory + VM state                          │
│                                                             │
│  5. Resume or Terminate                                     │
│     └── VM can continue or be destroyed                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Network Topology

### Why Bridge Networking is Required

Direct TAP attachment fails because the VM expects a Layer 2 broadcast domain. A bridge provides:
- ARP resolution between host and VM
- Proper Ethernet frame handling
- Gateway services (host acts as router)

### Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         HOST                                │
│                                                             │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐              │
│  │  eth0   │     │   br0   │     │  tap0   │              │
│  │ (WAN)   │     │ (bridge)│◄────│  (TAP)  │              │
│  └────┬────┘     └────┬────┘     └────┬────┘              │
│       │               │               │                    │
│       │          10.0.0.1/24          │                    │
│       │               │               │                    │
│       └───────┬───────┘               │                    │
│               │                       │                    │
│          NAT/Masquerade               │                    │
│                                       │                    │
└───────────────────────────────────────┼────────────────────┘
                                        │
                                        │ virtio-net
                                        │
┌───────────────────────────────────────┼────────────────────┐
│                         VM            │                    │
│                                       │                    │
│                              ┌────────┴────────┐           │
│                              │      eth0       │           │
│                              │   10.0.0.2/24   │           │
│                              └─────────────────┘           │
│                                                            │
│                              Gateway: 10.0.0.1             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Bridge Setup Commands

```bash
# Create bridge interface
ip link add br0 type bridge
ip addr add 10.0.0.1/24 dev br0
ip link set br0 up

# Create TAP device and attach to bridge
ip tuntap add tap0 mode tap
ip link set tap0 master br0
ip link set tap0 up

# Enable NAT for internet access
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# Verify setup
ip addr show br0
# Should show: inet 10.0.0.1/24

ip link show tap0
# Should show: master br0 state UP
```

---

## The Critical Insight

### The Snapshot/Rootfs Synchronization Problem

**This is the most important concept in this entire guide.**

When Firecracker creates a snapshot, it captures:
1. **Memory contents** - Including filesystem buffer cache
2. **Inode references** - Kernel's view of filesystem structure
3. **Open file handles** - Any files being accessed

If you modify `rootfs.ext4` after the snapshot:
- Inode numbers may change
- File locations may shift
- Directory structures may differ

**Result**: When you restore the snapshot, the kernel's cached inode references point to non-existent or wrong locations → **EXT4 filesystem corruption**.

### Error Symptoms

```
EXT4-fs error: deleted inode referenced: 24593
EXT4-fs error: structure needs cleaning
e2fsck: Inode bitmap differences
```

### The Solution: Modify BEFORE Snapshotting

```
┌─────────────────────────────────────────────────────────────┐
│                    WRONG APPROACH ❌                        │
│                                                             │
│  1. Create snapshot from running VM                         │
│  2. Modify rootfs.ext4 (add files, change configs)         │
│  3. Restore snapshot                                        │
│  4. CORRUPTION - inode mismatch                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   CORRECT APPROACH ✅                       │
│                                                             │
│  1. Boot VM (cold boot or restore working snapshot)        │
│  2. Modify filesystem while VM is RUNNING (via SSH)        │
│  3. Pause VM                                                │
│  4. Create NEW snapshot (captures current state)           │
│  5. Restore works perfectly - state is synchronized        │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Workflow

### Phase 1: Environment Preparation

```bash
#!/bin/bash
# prepare-environment.sh

# Variables
SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-production"
KERNEL="/opt/swarm/images/vmlinux.bin"

# Full cleanup
pkill -9 firecracker 2>/dev/null || true
sleep 1
ip link del tap0 2>/dev/null || true
ip link del br0 2>/dev/null || true
rm -f /tmp/fc*.sock

# Setup bridge networking
ip link add br0 type bridge
ip addr add 10.0.0.1/24 dev br0
ip link set br0 up

ip tuntap add tap0 mode tap
ip link set tap0 master br0
ip link set tap0 up

# Enable NAT
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || \
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

echo "Environment ready"
```

### Phase 2: Start Base VM

**Option A: Restore Existing Snapshot (Recommended)**

```bash
#!/bin/bash
# restore-snapshot.sh

SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-production"
SOCKET="/tmp/fc-vm.sock"

# Start Firecracker
firecracker --api-sock $SOCKET &
FC_PID=$!
sleep 1

# Restore snapshot
curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/load" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot_path\": \"$SNAP_DIR/vm.snapshot\",
    \"mem_backend\": {
      \"backend_type\": \"File\",
      \"backend_path\": \"$SNAP_DIR/vm.mem\"
    },
    \"enable_diff_snapshots\": false,
    \"resume_vm\": true
  }"

echo "VM restored, PID: $FC_PID"
```

**Option B: Cold Boot (When No Snapshot Exists)**

```bash
#!/bin/bash
# cold-boot.sh

SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-production"
KERNEL="/opt/swarm/images/vmlinux.bin"
SOCKET="/tmp/fc-vm.sock"

# Start Firecracker
firecracker --api-sock $SOCKET &
FC_PID=$!
sleep 1

# Configure kernel
curl -s --unix-socket $SOCKET -X PUT "http://localhost/boot-source" \
  -H "Content-Type: application/json" \
  -d "{
    \"kernel_image_path\": \"$KERNEL\",
    \"boot_args\": \"console=ttyS0 reboot=k panic=1 pci=off random.trust_cpu=on\"
  }"

# Configure root filesystem
curl -s --unix-socket $SOCKET -X PUT "http://localhost/drives/rootfs" \
  -H "Content-Type: application/json" \
  -d "{
    \"drive_id\": \"rootfs\",
    \"path_on_host\": \"$SNAP_DIR/rootfs.ext4\",
    \"is_root_device\": true,
    \"is_read_only\": false
  }"

# Configure network
curl -s --unix-socket $SOCKET -X PUT "http://localhost/network-interfaces/eth0" \
  -H "Content-Type: application/json" \
  -d "{
    \"iface_id\": \"eth0\",
    \"host_dev_name\": \"tap0\",
    \"guest_mac\": \"AA:FC:00:00:00:01\"
  }"

# Configure machine
curl -s --unix-socket $SOCKET -X PUT "http://localhost/machine-config" \
  -H "Content-Type: application/json" \
  -d "{
    \"vcpu_count\": 1,
    \"mem_size_mib\": 512
  }"

# Start VM
curl -s --unix-socket $SOCKET -X PUT "http://localhost/actions" \
  -H "Content-Type: application/json" \
  -d "{\"action_type\": \"InstanceStart\"}"

echo "VM starting, PID: $FC_PID"
echo "NOTE: Cold boot may take 30-60 seconds for SSH to be ready"
```

### Phase 3: Wait for SSH

```bash
#!/bin/bash
# wait-for-ssh.sh

VM_IP="10.0.0.2"
MAX_ATTEMPTS=30

echo "Waiting for SSH..."
for i in $(seq 1 $MAX_ATTEMPTS); do
  if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 \
         -o BatchMode=yes root@$VM_IP "echo SSH_OK" 2>/dev/null; then
    echo "SSH ready after $i attempts"
    exit 0
  fi
  echo "Attempt $i/$MAX_ATTEMPTS..."
  sleep 2
done

echo "SSH failed after $MAX_ATTEMPTS attempts"
exit 1
```

### Phase 4: Configure VM (Add Your Files)

```bash
#!/bin/bash
# configure-vm.sh

VM_IP="10.0.0.2"

echo "Creating directory structure..."
ssh -o StrictHostKeyChecking=no root@$VM_IP "
  mkdir -p /opt/forge/persona /opt/forge/agent /opt/forge/logs
"

echo "Writing persona file..."
ssh -o StrictHostKeyChecking=no root@$VM_IP "cat > /opt/forge/persona/default.md << 'EOF'
# FORGE Agent Persona

You are a FORGE coding agent running inside a Firecracker microVM.
Your purpose is to complete software development tasks autonomously.

## Core Capabilities
- Read and write files in your workspace
- Execute shell commands
- Make git commits and push changes
- Create pull requests via GitHub CLI

## Environment
- Workspace: /workspace
- Logs: /opt/forge/logs
EOF
"

echo "Writing agent script..."
ssh -o StrictHostKeyChecking=no root@$VM_IP "cat > /opt/forge/agent/main.sh << 'EOF'
#!/bin/bash
# FORGE Agent Entrypoint
PERSONA_PATH=\"\${PERSONA_PATH:-/opt/forge/persona/default.md}\"
ORCHESTRATOR_URL=\"\${ORCHESTRATOR_URL:-http://10.0.0.1:8080}\"

echo \"FORGE Agent starting...\"
echo \"Persona: \$PERSONA_PATH\"

# Main loop placeholder
while true; do
  echo \"Polling for tickets...\"
  sleep 10
done
EOF
chmod +x /opt/forge/agent/main.sh
"

echo "Verifying files..."
ssh -o StrictHostKeyChecking=no root@$VM_IP "
  find /opt/forge -type f -exec ls -la {} \;
"
```

### Phase 5: Create Snapshot

```bash
#!/bin/bash
# create-snapshot.sh

SOCKET="/tmp/fc-vm.sock"
SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-production"

echo "Pausing VM..."
curl -s --unix-socket $SOCKET -X PATCH "http://localhost/vm" \
  -H "Content-Type: application/json" \
  -d '{"state": "Paused"}'

sleep 1

echo "Creating snapshot..."
curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot_path\": \"$SNAP_DIR/vm.snapshot\",
    \"mem_file_path\": \"$SNAP_DIR/vm.mem\",
    \"snapshot_type\": \"Full\"
  }"

echo "Snapshot created:"
ls -lh $SNAP_DIR/vm.snapshot $SNAP_DIR/vm.mem
```

### Phase 6: Test Restore

```bash
#!/bin/bash
# test-restore.sh

SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-production"
SOCKET="/tmp/fc-test.sock"

# Cleanup previous instance
pkill -9 firecracker 2>/dev/null || true
sleep 1
rm -f /tmp/fc*.sock

# Recreate network (if needed)
ip link show br0 >/dev/null 2>&1 || {
  ip link add br0 type bridge
  ip addr add 10.0.0.1/24 dev br0
  ip link set br0 up
  ip tuntap add tap0 mode tap
  ip link set tap0 master br0
  ip link set tap0 up
}

# Restore
firecracker --api-sock $SOCKET &
sleep 1

curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/load" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot_path\": \"$SNAP_DIR/vm.snapshot\",
    \"mem_backend\": {
      \"backend_type\": \"File\",
      \"backend_path\": \"$SNAP_DIR/vm.mem\"
    },
    \"enable_diff_snapshots\": false,
    \"resume_vm\": true
  }"

# Verify
sleep 1
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@10.0.0.2 "
  hostname
  ls -la /opt/forge/
  echo 'RESTORE_SUCCESS'
"
```

---

## Troubleshooting Guide

### Problem: "No route to host" on SSH

**Cause**: Missing bridge networking

**Solution**:
```bash
# Verify bridge exists
ip addr show br0

# If missing, create it
ip link add br0 type bridge
ip addr add 10.0.0.1/24 dev br0
ip link set br0 up
ip link set tap0 master br0
```

### Problem: Cold boot hangs on "Load/Save Random Seed"

**Cause**: Kernel entropy starvation in Firecracker's minimal environment

**Symptoms**:
```
A start job is running for Load/Save Random Seed (56s / 10min)
```

**Solutions**:
1. Use snapshot restore instead of cold boot (recommended)
2. Add `random.trust_cpu=on` to kernel boot args
3. Pre-seed `/var/lib/systemd/random-seed` in rootfs
4. Use kernel 5.10.225+ with improved entropy handling

### Problem: EXT4 corruption after restore

**Cause**: Rootfs modified after snapshot was taken

**Symptoms**:
```
EXT4-fs error: deleted inode referenced
Structure needs cleaning
```

**Solution**:
1. Never modify rootfs.ext4 after creating a snapshot
2. To add files: restore snapshot → add files via SSH → create NEW snapshot
3. If corrupted, restore from backup rootfs and re-snapshot

### Problem: SSH connection refused

**Cause**: SSHD not running or network misconfiguration

**Diagnosis**:
```bash
# Check if VM is running
pgrep firecracker

# Check network interface
ip addr show tap0

# Check if port is listening (from VM console if available)
ss -tlnp | grep 22
```

### Problem: Snapshot restore fails

**Cause**: CPU vendor mismatch or corrupted files

**Symptoms**:
```
Snapshot CPU vendor ID mismatch
```

**Solution**: Snapshots can only be restored on same CPU vendor (AMD→AMD, Intel→Intel)

---

## Lessons Learned

### 1. Snapshot/Rootfs Atomic Relationship

> **The memory snapshot and rootfs are married at creation time.**

Any modification to one without updating the other breaks the relationship. This took multiple debugging sessions to fully understand.

### 2. Bridge Networking is Non-Negotiable

Direct TAP-to-VM attachment seems simpler but fails. The VM expects:
- ARP resolution
- Layer 2 broadcast domain
- Gateway at a known IP

A bridge provides all of these. Don't skip this step.

### 3. Cold Boot is a Last Resort

Cold boot issues encountered:
- Entropy starvation (30-60+ second delays)
- Race conditions with service startup
- Non-deterministic behavior

**Always prefer snapshot restore** for production workloads.

### 4. File Baking Strategy

Two approaches for pre-loading files:

| Approach | Pros | Cons |
|----------|------|------|
| Bake into rootfs + snapshot | Fast restore, guaranteed state | Must re-snapshot to update |
| Runtime injection | Flexible, easy updates | Slower startup, more complexity |

**Recommendation**: Bake defaults, support runtime override via environment variables.

### 5. Cleanup Before Operations

Always run cleanup before any VM operation:
```bash
pkill -9 firecracker 2>/dev/null || true
ip link del tap0 2>/dev/null || true
ip link del br0 2>/dev/null || true
rm -f /tmp/fc*.sock
```

Leftover state causes mysterious failures.

---

## Quick Reference

### Essential Commands

```bash
# Cleanup
pkill -9 firecracker; ip link del tap0; ip link del br0; rm -f /tmp/fc*.sock

# Setup networking
ip link add br0 type bridge && ip addr add 10.0.0.1/24 dev br0 && ip link set br0 up
ip tuntap add tap0 mode tap && ip link set tap0 master br0 && ip link set tap0 up

# Restore snapshot
firecracker --api-sock /tmp/fc.sock &
curl --unix-socket /tmp/fc.sock -X PUT "http://localhost/snapshot/load" \
  -d '{"snapshot_path":"PATH/vm.snapshot","mem_backend":{"backend_type":"File","backend_path":"PATH/vm.mem"},"resume_vm":true}'

# Pause VM
curl --unix-socket /tmp/fc.sock -X PATCH "http://localhost/vm" -d '{"state":"Paused"}'

# Create snapshot
curl --unix-socket /tmp/fc.sock -X PUT "http://localhost/snapshot/create" \
  -d '{"snapshot_path":"PATH/vm.snapshot","mem_file_path":"PATH/vm.mem","snapshot_type":"Full"}'

# SSH to VM
ssh -o StrictHostKeyChecking=no root@10.0.0.2
```

### File Locations

| File | Path | Purpose |
|------|------|---------|
| Kernel | `/opt/swarm/images/vmlinux.bin` | Linux kernel |
| Rootfs | `/opt/swarm/snapshots/*/rootfs.ext4` | VM filesystem |
| Snapshot | `/opt/swarm/snapshots/*/vm.snapshot` | VM state |
| Memory | `/opt/swarm/snapshots/*/vm.mem` | Memory dump |

### Network Addresses

| Interface | IP | Purpose |
|-----------|-----|---------|
| br0 (host) | 10.0.0.1/24 | Bridge/Gateway |
| eth0 (VM) | 10.0.0.2/24 | VM interface |

---

## Appendix: Complete Working Script

```bash
#!/bin/bash
# full-snapshot-workflow.sh
# Creates a new snapshot with custom files baked in

set -e

SNAP_DIR="/opt/swarm/snapshots/ubuntu2204-production"
SOCKET="/tmp/fc-workflow.sock"
VM_IP="10.0.0.2"

echo "=== Phase 1: Cleanup ==="
pkill -9 firecracker 2>/dev/null || true
sleep 1
ip link del tap0 2>/dev/null || true
ip link del br0 2>/dev/null || true
rm -f /tmp/fc*.sock

echo "=== Phase 2: Setup Networking ==="
ip link add br0 type bridge
ip addr add 10.0.0.1/24 dev br0
ip link set br0 up
ip tuntap add tap0 mode tap
ip link set tap0 master br0
ip link set tap0 up
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || \
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

echo "=== Phase 3: Restore Base Snapshot ==="
firecracker --api-sock $SOCKET &
FC_PID=$!
sleep 1

curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/load" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot_path\": \"$SNAP_DIR/vm.snapshot\",
    \"mem_backend\": {\"backend_type\": \"File\", \"backend_path\": \"$SNAP_DIR/vm.mem\"},
    \"enable_diff_snapshots\": false,
    \"resume_vm\": true
  }"

echo "=== Phase 4: Wait for SSH ==="
for i in $(seq 1 15); do
  ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 root@$VM_IP "echo ready" 2>/dev/null && break
  sleep 1
done

echo "=== Phase 5: Add Custom Files ==="
ssh -o StrictHostKeyChecking=no root@$VM_IP "
  mkdir -p /opt/myapp/config /opt/myapp/logs
  echo 'MY_CONFIG=value' > /opt/myapp/config/settings.env
"

echo "=== Phase 6: Create New Snapshot ==="
# Backup existing
mv $SNAP_DIR/vm.snapshot $SNAP_DIR/vm.snapshot.bak 2>/dev/null || true
mv $SNAP_DIR/vm.mem $SNAP_DIR/vm.mem.bak 2>/dev/null || true

curl -s --unix-socket $SOCKET -X PATCH "http://localhost/vm" \
  -H "Content-Type: application/json" -d '{"state": "Paused"}'
sleep 1

curl -s --unix-socket $SOCKET -X PUT "http://localhost/snapshot/create" \
  -H "Content-Type: application/json" \
  -d "{
    \"snapshot_path\": \"$SNAP_DIR/vm.snapshot\",
    \"mem_file_path\": \"$SNAP_DIR/vm.mem\",
    \"snapshot_type\": \"Full\"
  }"

echo "=== Complete ==="
ls -lh $SNAP_DIR/vm.snapshot $SNAP_DIR/vm.mem

# Cleanup
kill $FC_PID 2>/dev/null || true
```

---

*Document maintained in `/opt/swarm-specs/docs/vm-snapshot-creation-guide.md`*
