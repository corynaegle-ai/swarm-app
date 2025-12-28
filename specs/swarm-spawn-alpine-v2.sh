#!/bin/bash
# swarm-spawn-alpine-v2 - HornetOS Alpine VM spawner with SNAT/DNAT for snapshot clones
# Uses v2 snapshot with known guest IP 192.168.241.2
# Per Firecracker network-for-clones docs: translate clone IP ↔ guest IP
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

SNAPSHOT_DIR="/opt/swarm/snapshots/alpine3.19-hornetos-v2"
SNAPSHOT_MEM="$SNAPSHOT_DIR/vm.mem"
SNAPSHOT_STATE="$SNAPSHOT_DIR/vm.snapshot"
BASE_ROOTFS="/opt/swarm/snapshots/alpine3.19-hornetos/rootfs.ext4"
BRIDGE="br0"
GUEST_IP="192.168.241.2"  # IP configured inside the snapshot
TAP_HOST_IP="192.168.241.1"  # Host side of tap0

log() { echo "[$(date +%H:%M:%S)] $*"; }

COUNT=${1:-1}
START_ID=${2:-0}

log "=== HornetOS Alpine Spawn v2 (SNAT/DNAT) ==="
log "Spawning $COUNT VMs (IDs $START_ID to $((START_ID + COUNT - 1)))"
log "Guest IP: $GUEST_IP, TAP host: $TAP_HOST_IP"

# Verify prerequisites
[ -f "$SNAPSHOT_MEM" ] || { log "ERROR: Snapshot not found: $SNAPSHOT_MEM"; exit 1; }
[ -f "$SNAPSHOT_STATE" ] || { log "ERROR: State not found: $SNAPSHOT_STATE"; exit 1; }
ip link show "$BRIDGE" >/dev/null 2>&1 || { log "ERROR: Bridge $BRIDGE not found"; exit 1; }

START_TIME=$(date +%s%3N)
SUCCESS=0

for i in $(seq 0 $((COUNT - 1))); do
    VM_ID=$((START_ID + i))
    CLONE_IP="10.0.0.$((VM_ID + 2))"  # Clone IP visible to external world
    NS="vm$VM_ID"
    VETH_HOST="veth${VM_ID}h"
    VETH_NS="veth${VM_ID}g"
    OVERLAY="/tmp/alpine-overlay-$VM_ID.ext4"
    SOCKET="/tmp/fc-alpine-$VM_ID.sock"
    SNAP_MEM="/tmp/alpine-mem-$VM_ID.bin"
    
    log "VM $VM_ID: Starting (Clone IP: $CLONE_IP → Guest IP: $GUEST_IP)"
    
    # Cleanup existing resources
    ip link del "$VETH_HOST" 2>/dev/null || true
    ip netns del "$NS" 2>/dev/null || true
    rm -f "$SOCKET" "$OVERLAY" "$SNAP_MEM"
    
    # Create overlay rootfs (copy-on-write)
    cp "$BASE_ROOTFS" "$OVERLAY"
    
    # Create network namespace
    ip netns add "$NS" || { log "VM $VM_ID: Failed to create ns"; continue; }
    
    # Create veth pair for external connectivity
    ip link add "$VETH_HOST" type veth peer name "$VETH_NS" || { log "VM $VM_ID: veth failed"; continue; }
    ip link set "$VETH_NS" netns "$NS"
    ip link set "$VETH_HOST" master "$BRIDGE"
    ip link set "$VETH_HOST" up
    
    # Configure namespace external interface (veth0)
    ip netns exec "$NS" ip link set "$VETH_NS" name veth0
    ip netns exec "$NS" ip addr add "$CLONE_IP/24" dev veth0
    ip netns exec "$NS" ip link set veth0 up
    ip netns exec "$NS" ip link set lo up
    ip netns exec "$NS" ip route add default via 10.0.0.1
    
    # CRITICAL: Create TAP named 'tap0' BEFORE starting Firecracker
    # The snapshot was created with tap0, so restored VM expects tap0 to exist
    ip netns exec "$NS" ip tuntap add dev tap0 mode tap
    ip netns exec "$NS" ip addr add "$TAP_HOST_IP/29" dev tap0
    ip netns exec "$NS" ip link set tap0 up
    
    # SNAT/DNAT rules per Firecracker network-for-clones docs
    # Outbound: Guest (192.168.241.2) → Clone IP (10.0.0.X)
    ip netns exec "$NS" iptables -t nat -A POSTROUTING -o veth0 -s "$GUEST_IP" -j SNAT --to "$CLONE_IP"
    # Inbound: Clone IP (10.0.0.X) → Guest (192.168.241.2)
    ip netns exec "$NS" iptables -t nat -A PREROUTING -i veth0 -d "$CLONE_IP" -j DNAT --to "$GUEST_IP"
    
    # Enable forwarding in namespace
    ip netns exec "$NS" sysctl -w net.ipv4.ip_forward=1 >/dev/null
    
    # Copy snapshot memory (each VM needs its own copy)
    cp "$SNAPSHOT_MEM" "$SNAP_MEM"
    
    # Start Firecracker inside the namespace
    ip netns exec "$NS" firecracker --api-sock "$SOCKET" &
    FC_PID=$!
    sleep 0.3
    
    # Verify socket exists
    if [ ! -S "$SOCKET" ]; then
        log "VM $VM_ID: Socket not created"
        kill $FC_PID 2>/dev/null
        continue
    fi
    
    # Load snapshot
    LOAD_RESULT=$(curl -sf --unix-socket "$SOCKET" -X PUT 'http://localhost/snapshot/load' \
        -H 'Content-Type: application/json' \
        -d "{
            \"snapshot_path\":\"$SNAPSHOT_STATE\",
            \"mem_backend\":{
                \"backend_path\":\"$SNAP_MEM\",
                \"backend_type\":\"File\"
            },
            \"enable_diff_snapshots\":false,
            \"resume_vm\":false
        }" 2>&1)
    
    if [ $? -ne 0 ]; then
        log "VM $VM_ID: Snapshot load failed - $LOAD_RESULT"
        kill $FC_PID 2>/dev/null
        continue
    fi
    
    # Resume the VM
    if curl -sf --unix-socket "$SOCKET" -X PATCH 'http://localhost/vm' \
        -H 'Content-Type: application/json' -d '{"state":"Resumed"}'; then
        log "VM $VM_ID: Running (PID: $FC_PID, NS: $NS, Clone: $CLONE_IP)"
        ((SUCCESS++))
    else
        log "VM $VM_ID: Resume failed"
        kill $FC_PID 2>/dev/null
    fi
done

END_TIME=$(date +%s%3N)
ELAPSED=$((END_TIME - START_TIME))
AVG=$((ELAPSED / COUNT))

log "=== Results ==="
log "Success: $SUCCESS/$COUNT VMs"
log "Total time: ${ELAPSED}ms"
log "Average: ${AVG}ms per VM"
log ""
log "SSH Access (from host):"
for i in $(seq 0 $((COUNT - 1))); do
    VM_ID=$((START_ID + i))
    CLONE_IP="10.0.0.$((VM_ID + 2))"
    log "  VM $VM_ID: ssh root@$CLONE_IP"
done
