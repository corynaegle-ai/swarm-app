# HornetOS / Wasp Archive

**Archived**: December 17, 2025
**Status**: Experimental - Shelved
**Reason**: Reverting to Ubuntu-based VMs to prioritize platform completion

## Overview

HornetOS was an experimental Alpine Linux-based VM image designed for ultra-fast snapshot restore in the Swarm agent system. "Wasp" was the codename for the orchestration scripts.

### Key Innovation: SNAT/DNAT Clone Networking

The primary technical contribution was implementing Firecracker's "network-for-clones" pattern, which solves a fundamental problem: all VMs restored from the same snapshot have identical internal IPs.

**Solution**: Per-namespace NAT rules translate between clone-specific IPs (10.0.0.X) and the shared guest IP (192.168.241.2).

```
┌─────────────────────────────────────────────────────────┐
│                     HOST (Droplet)                      │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ vm0 NS   │    │ vm1 NS   │    │ vm2 NS   │          │
│  │ veth0    │    │ veth0    │    │ veth0    │          │
│  │ 10.0.0.2 │    │ 10.0.0.3 │    │ 10.0.0.4 │          │
│  │    ↕     │    │    ↕     │    │    ↕     │          │
│  │ SNAT/DNAT│    │ SNAT/DNAT│    │ SNAT/DNAT│          │
│  │    ↕     │    │    ↕     │    │    ↕     │          │
│  │ tap0     │    │ tap0     │    │ tap0     │          │
│  │192.168.  │    │192.168.  │    │192.168.  │          │
│  │ 241.1    │    │ 241.1    │    │ 241.1    │          │
│  │    ↕     │    │    ↕     │    │    ↕     │          │
│  │┌────────┐│    │┌────────┐│    │┌────────┐│          │
│  ││ Alpine ││    ││ Alpine ││    ││ Alpine ││          │
│  ││ Guest  ││    ││ Guest  ││    ││ Guest  ││          │
│  ││192.168.││    ││192.168.││    ││192.168.││          │
│  ││ 241.2  ││    ││ 241.2  ││    ││ 241.2  ││          │
│  │└────────┘│    │└────────┘│    │└────────┘│          │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘          │
│       └───────────────┼───────────────┘                 │
│                   ┌───┴───┐                             │
│                   │  br0  │ 10.0.0.1                    │
│                   └───────┘                             │
└─────────────────────────────────────────────────────────┘
```

## Performance Results

| Metric | Value |
|--------|-------|
| VMs tested | 3 |
| Total spawn time | 3152ms |
| Average per VM | 1050ms |
| Memory per VM | 256MB |
| SSH access | ✅ All VMs |

## Technical Details

### Guest IP Configuration
- Guest IP: `192.168.241.2` (configured via kernel boot args)
- TAP host IP: `192.168.241.1/29`
- Clone IPs: `10.0.0.{N+2}` (external-facing)

### NAT Rules (per namespace)
```bash
# Outbound: Guest → Clone IP
iptables -t nat -A POSTROUTING -o veth0 -s 192.168.241.2 -j SNAT --to $CLONE_IP

# Inbound: Clone IP → Guest  
iptables -t nat -A PREROUTING -i veth0 -d $CLONE_IP -j DNAT --to 192.168.241.2
```

### Known Issues at Archive Time

1. **Environment injection timing**: Agent starts from snapshot before env vars are injected
2. **ANTHROPIC_API_KEY not sourced**: OpenRC service doesn't read /etc/swarm-env properly
3. **Agent ID shows hostname instead of vm ID**: Environment not propagating

## Files Archived

### Snapshot Directories (on DEV droplet /opt/swarm/snapshots/)
- `alpine3.19-hornetos/`
- `alpine3.19-hornetos-v2/`
- `hornetos-agent-v3/`
- `hornetos-with-agent/`
- `hornetos-with-agent-v2/`

### Scripts (on DEV droplet /opt/swarm/)
- `swarm-spawn-hornetos-v3.sh` - Full spawn with env injection
- `swarm-spawn-alpine-v2.sh` - SNAT/DNAT implementation
- `swarm-spawn-alpine-fixed.sh` - Original TAP fix
- `swarm-spawn-alpine.sh` - Initial Alpine spawner
- `swarm-boot-hornetos-v3.sh` - Boot script for snapshotting
- `swarm-boot-alpine-v2.sh` - Alpine v2 boot script
- `swarm-boot-fresh-alpine.sh` - Fresh Alpine boot
- `boot-hornetos-v3.sh` - Alternate boot script

## Future Considerations

If revisiting HornetOS/Wasp:

1. **Fix env injection**: Write /etc/swarm-env BEFORE taking snapshot (with placeholder values), then overwrite at spawn time
2. **Use systemd override**: Instead of OpenRC, use systemd drop-in for environment
3. **Consider cloud-init**: Alpine supports cloud-init for VM customization
4. **Evaluate gVisor**: For even lighter isolation without full VM overhead

## Related Documentation

- Firecracker network-for-clones: https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/network-for-clones.md
- Alpine Linux Wiki: https://wiki.alpinelinux.org/

---

# Appendix: Script Archives

## swarm-spawn-hornetos-v3.sh

```bash
#!/bin/bash
# Spawn HornetOS VMs with agent and env injection
# Based on Alpine v2 SNAT/DNAT approach

set -e
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SNAPSHOT_DIR="/opt/swarm/snapshots/hornetos-agent-v3"
KERNEL="/opt/swarm/images/vmlinux.bin"
RUNTIME_DIR="/opt/swarm/runtime"
NUM_VMS=${1:-3}

# Secrets - REPLACE THESE or inject via environment
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
API_URL="${API_URL:-http://10.0.0.1:8080}"

echo "[INFO] Spawning $NUM_VMS HornetOS VMs with agent"

# Full cleanup
pkill -9 firecracker 2>/dev/null || true
for ns in $(ip netns list 2>/dev/null | awk '{print $1}'); do
    ip netns del "$ns" 2>/dev/null || true
done
rm -rf $RUNTIME_DIR/*
sleep 1

START_TIME=$(date +%s%3N)

for i in $(seq 0 $((NUM_VMS - 1))); do
    VM_DIR="$RUNTIME_DIR/vm$i"
    mkdir -p "$VM_DIR"
    
    # Clone IP for external access
    CLONE_IP="10.0.0.$((i + 2))"
    NS="vm$i"
    VETH_HOST="veth${i}h"
    VETH_NS="veth0"
    
    echo "[VM$i] Creating namespace and network..."
    
    # Create namespace
    ip netns add $NS
    
    # Create veth pair
    ip link add $VETH_HOST type veth peer name $VETH_NS
    ip link set $VETH_NS netns $NS
    
    # Configure host side - attach to bridge
    ip link set $VETH_HOST master br0
    ip link set $VETH_HOST up
    
    # Configure namespace side
    ip netns exec $NS ip addr add $CLONE_IP/24 dev $VETH_NS
    ip netns exec $NS ip link set $VETH_NS up
    ip netns exec $NS ip link set lo up
    ip netns exec $NS ip route add default via 10.0.0.1
    
    # Create TAP inside namespace
    ip netns exec $NS ip tuntap add dev tap0 mode tap
    ip netns exec $NS ip addr add 192.168.241.1/29 dev tap0
    ip netns exec $NS ip link set tap0 up
    
    # SNAT/DNAT rules inside namespace
    ip netns exec $NS iptables -t nat -A POSTROUTING -o $VETH_NS -s 192.168.241.2 -j SNAT --to $CLONE_IP
    ip netns exec $NS iptables -t nat -A PREROUTING -i $VETH_NS -d $CLONE_IP -j DNAT --to 192.168.241.2
    ip netns exec $NS iptables -A FORWARD -i tap0 -o $VETH_NS -j ACCEPT
    ip netns exec $NS iptables -A FORWARD -i $VETH_NS -o tap0 -j ACCEPT
    ip netns exec $NS sysctl -w net.ipv4.ip_forward=1 >/dev/null
    
    # Copy snapshot files
    cp "$SNAPSHOT_DIR/vm.snapshot" "$VM_DIR/"
    cp "$SNAPSHOT_DIR/vm.mem" "$VM_DIR/"
    cp "$SNAPSHOT_DIR/rootfs.ext4" "$VM_DIR/"
    
    # Create Firecracker config
    cat > "$VM_DIR/config.json" << EOF
{
    "boot-source": {
        "kernel_image_path": "$KERNEL",
        "boot_args": "console=ttyS0 reboot=k panic=1 pci=off"
    },
    "drives": [{
        "drive_id": "rootfs",
        "path_on_host": "$VM_DIR/rootfs.ext4",
        "is_root_device": true,
        "is_read_only": false
    }],
    "network-interfaces": [{
        "iface_id": "eth0",
        "guest_mac": "AA:FC:00:00:00:$(printf '%02x' $((i + 1)))",
        "host_dev_name": "tap0"
    }],
    "machine-config": {
        "vcpu_count": 1,
        "mem_size_mib": 256
    }
}
EOF

    echo "[VM$i] Starting Firecracker in namespace..."
    
    ip netns exec $NS firecracker \
        --api-sock "$VM_DIR/firecracker.sock" \
        --config-file "$VM_DIR/config.json" \
        > "$VM_DIR/console.log" 2>&1 &
    
    sleep 0.3
    
    curl -sf --unix-socket "$VM_DIR/firecracker.sock" -X PUT 'http://localhost/snapshot/load' \
        -H 'Content-Type: application/json' \
        -d "{
            \"snapshot_path\": \"$VM_DIR/vm.snapshot\",
            \"mem_backend\": {
                \"backend_path\": \"$VM_DIR/vm.mem\",
                \"backend_type\": \"File\"
            },
            \"enable_diff_snapshots\": false,
            \"resume_vm\": true
        }" || { echo "[VM$i] Snapshot restore failed"; continue; }
    
    echo "[VM$i] Spawned at $CLONE_IP"
done

END_TIME=$(date +%s%3N)
TOTAL_MS=$((END_TIME - START_TIME))

echo ""
echo "[SUCCESS] Spawned $NUM_VMS VMs in ${TOTAL_MS}ms"
echo ""

# Verify SSH and inject env
echo "[INFO] Verifying SSH and injecting environment..."
sleep 2

for i in $(seq 0 $((NUM_VMS - 1))); do
    CLONE_IP="10.0.0.$((i + 2))"
    VM_DIR="$RUNTIME_DIR/vm$i"
    
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@$CLONE_IP 'true' 2>/dev/null; then
        echo "[VM$i] SSH OK - injecting env..."
        
        ssh -o StrictHostKeyChecking=no root@$CLONE_IP "cat > /etc/swarm-env << 'ENVEOF'
export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'
export GITHUB_TOKEN='$GITHUB_TOKEN'
export API_URL='$API_URL'
export AGENT_ID='vm$i'
export POLL_INTERVAL=10
ENVEOF"
        
        ssh -o StrictHostKeyChecking=no root@$CLONE_IP 'pkill -f "node.*agent.js" 2>/dev/null; sleep 1; rc-service swarm-agent restart' 2>/dev/null
        
        echo "[VM$i] Agent restarted with ID=vm$i"
    else
        echo "[VM$i] SSH FAILED at $CLONE_IP"
    fi
done

echo ""
echo "[DONE] All VMs spawned and configured"
```

## swarm-spawn-alpine-v2.sh

```bash
#!/bin/bash
# swarm-spawn-alpine-v2 - HornetOS Alpine VM spawner with SNAT/DNAT for snapshot clones
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SNAPSHOT_DIR="/opt/swarm/snapshots/alpine3.19-hornetos-v2"
SNAPSHOT_MEM="$SNAPSHOT_DIR/vm.mem"
SNAPSHOT_STATE="$SNAPSHOT_DIR/vm.snapshot"
BASE_ROOTFS="/opt/swarm/snapshots/alpine3.19-hornetos/rootfs.ext4"
BRIDGE="br0"
GUEST_IP="192.168.241.2"
TAP_HOST_IP="192.168.241.1"

log() { echo "[$(date +%H:%M:%S)] $*"; }

COUNT=${1:-1}
START_ID=${2:-0}

log "=== HornetOS Alpine Spawn v2 (SNAT/DNAT) ==="
log "Spawning $COUNT VMs (IDs $START_ID to $((START_ID + COUNT - 1)))"

[ -f "$SNAPSHOT_MEM" ] || { log "ERROR: Snapshot not found"; exit 1; }
[ -f "$SNAPSHOT_STATE" ] || { log "ERROR: State not found"; exit 1; }
ip link show "$BRIDGE" >/dev/null 2>&1 || { log "ERROR: Bridge not found"; exit 1; }

START_TIME=$(date +%s%3N)
SUCCESS=0

for i in $(seq 0 $((COUNT - 1))); do
    VM_ID=$((START_ID + i))
    CLONE_IP="10.0.0.$((VM_ID + 2))"
    NS="vm$VM_ID"
    VETH_HOST="veth${VM_ID}h"
    VETH_NS="veth${VM_ID}g"
    OVERLAY="/tmp/alpine-overlay-$VM_ID.ext4"
    SOCKET="/tmp/fc-alpine-$VM_ID.sock"
    SNAP_MEM="/tmp/alpine-mem-$VM_ID.bin"
    
    log "VM $VM_ID: Starting (Clone IP: $CLONE_IP → Guest IP: $GUEST_IP)"
    
    ip link del "$VETH_HOST" 2>/dev/null || true
    ip netns del "$NS" 2>/dev/null || true
    rm -f "$SOCKET" "$OVERLAY" "$SNAP_MEM"
    
    cp "$BASE_ROOTFS" "$OVERLAY"
    ip netns add "$NS" || { log "VM $VM_ID: Failed to create ns"; continue; }
    
    ip link add "$VETH_HOST" type veth peer name "$VETH_NS"
    ip link set "$VETH_NS" netns "$NS"
    ip link set "$VETH_HOST" master "$BRIDGE"
    ip link set "$VETH_HOST" up
    
    ip netns exec "$NS" ip link set "$VETH_NS" name veth0
    ip netns exec "$NS" ip addr add "$CLONE_IP/24" dev veth0
    ip netns exec "$NS" ip link set veth0 up
    ip netns exec "$NS" ip link set lo up
    ip netns exec "$NS" ip route add default via 10.0.0.1
    
    ip netns exec "$NS" ip tuntap add dev tap0 mode tap
    ip netns exec "$NS" ip addr add "$TAP_HOST_IP/29" dev tap0
    ip netns exec "$NS" ip link set tap0 up
    
    ip netns exec "$NS" iptables -t nat -A POSTROUTING -o veth0 -s "$GUEST_IP" -j SNAT --to "$CLONE_IP"
    ip netns exec "$NS" iptables -t nat -A PREROUTING -i veth0 -d "$CLONE_IP" -j DNAT --to "$GUEST_IP"
    ip netns exec "$NS" sysctl -w net.ipv4.ip_forward=1 >/dev/null
    
    cp "$SNAPSHOT_MEM" "$SNAP_MEM"
    
    ip netns exec "$NS" firecracker --api-sock "$SOCKET" &
    FC_PID=$!
    sleep 0.3
    
    [ ! -S "$SOCKET" ] && { log "VM $VM_ID: Socket not created"; kill $FC_PID 2>/dev/null; continue; }
    
    curl -sf --unix-socket "$SOCKET" -X PUT 'http://localhost/snapshot/load' \
        -H 'Content-Type: application/json' \
        -d "{
            \"snapshot_path\":\"$SNAPSHOT_STATE\",
            \"mem_backend\":{\"backend_path\":\"$SNAP_MEM\",\"backend_type\":\"File\"},
            \"enable_diff_snapshots\":false,
            \"resume_vm\":false
        }" 2>&1 || { log "VM $VM_ID: Snapshot load failed"; kill $FC_PID 2>/dev/null; continue; }
    
    if curl -sf --unix-socket "$SOCKET" -X PATCH 'http://localhost/vm' \
        -H 'Content-Type: application/json' -d '{"state":"Resumed"}'; then
        log "VM $VM_ID: Running (PID: $FC_PID)"
        ((SUCCESS++))
    else
        log "VM $VM_ID: Resume failed"
        kill $FC_PID 2>/dev/null
    fi
done

END_TIME=$(date +%s%3N)
log "Success: $SUCCESS/$COUNT VMs in $((END_TIME - START_TIME))ms"
```
