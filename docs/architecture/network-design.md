# Swarm Network Design

> **Location**: `/opt/swarm-specs/architecture/network-design.md`  
> **Created**: 2025-12-17  
> **Status**: Production

---

## Overview

Swarm uses **Linux network namespaces** to provide complete network isolation for each Firecracker VM. This design allows every VM to have the same internal IP address (10.0.0.2) while maintaining full isolation and internet connectivity.

### Design Goals

| Goal | Solution |
|------|----------|
| VM isolation | Each VM runs in its own network namespace |
| Uniform addressing | All VMs use 10.0.0.2 internally |
| Internet access | NAT masquerading at namespace level |
| Scalability | Supports 1000+ concurrent VMs |
| Fast boot | No network reconfiguration on snapshot restore |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              HOST (Droplet)                                  │
│                                                                              │
│   ┌─────────────┐                                                            │
│   │   eth0      │◄──── Internet (DigitalOcean)                               │
│   │ (public IP) │                                                            │
│   └──────┬──────┘                                                            │
│          │                                                                   │
│          │ iptables MASQUERADE (-o eth0)                                     │
│          │                                                                   │
│   ┌──────┴──────────────────────────────────────────────────────────────┐   │
│   │                        Host Routing Table                            │   │
│   │  10.0.1.0/24 via 10.0.1.1 dev veth-vm1-br                           │   │
│   │  10.0.2.0/24 via 10.0.2.1 dev veth-vm2-br                           │   │
│   │  10.0.N.0/24 via 10.0.N.1 dev veth-vmN-br                           │   │
│   └──────┬──────────────────────────────────────────────────────────────┘   │
│          │                                                                   │
│    ┌─────┴─────┬─────────────┬─────────────┐                                │
│    │           │             │             │                                │
│    ▼           ▼             ▼             ▼                                │
│ veth-vm1-br veth-vm2-br  veth-vm3-br   veth-vmN-br                          │
│ 10.0.1.254  10.0.2.254   10.0.3.254    10.0.N.254                           │
│    │           │             │             │                                │
└────┼───────────┼─────────────┼─────────────┼────────────────────────────────┘
     │           │             │             │
     │ veth      │ veth        │ veth        │ veth
     │ pair      │ pair        │ pair        │ pair
     │           │             │             │
┌────┼───────────┼─────────────┼─────────────┼────────────────────────────────┐
│    ▼           ▼             ▼             ▼                                │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │ ns: vm1  │ │ ns: vm2  │ │ ns: vm3  │ │ ns: vmN  │    Network Namespaces  │
│ │          │ │          │ │          │ │          │                        │
│ │ veth-vm1 │ │ veth-vm2 │ │ veth-vm3 │ │ veth-vmN │                        │
│ │ 10.0.1.1 │ │ 10.0.2.1 │ │ 10.0.3.1 │ │ 10.0.N.1 │                        │
│ │    │     │ │    │     │ │    │     │ │    │     │                        │
│ │    │     │ │    │     │ │    │     │ │    │     │                        │
│ │ ┌──┴───┐ │ │ ┌──┴───┐ │ │ ┌──┴───┐ │ │ ┌──┴───┐ │                        │
│ │ │br-vm │ │ │ │br-vm │ │ │ │br-vm │ │ │ │br-vm │ │   Internal Bridges     │
│ │ │10.0. │ │ │ │10.0. │ │ │ │10.0. │ │ │ │10.0. │ │                        │
│ │ │ 0.1  │ │ │ │ 0.1  │ │ │ │ 0.1  │ │ │ │ 0.1  │ │                        │
│ │ └──┬───┘ │ │ └──┬───┘ │ │ └──┬───┘ │ │ └──┬───┘ │                        │
│ │    │     │ │    │     │ │    │     │ │    │     │                        │
│ │ ┌──┴──┐  │ │ ┌──┴──┐  │ │ ┌──┴──┐  │ │ ┌──┴──┐  │                        │
│ │ │tap0 │  │ │ │tap0 │  │ │ │tap0 │  │ │ │tap0 │  │   TAP Devices          │
│ │ └──┬──┘  │ │ └──┬──┘  │ │ └──┬──┘  │ │ └──┬──┘  │                        │
│ │    │     │ │    │     │ │    │     │ │    │     │                        │
│ │ ┌──┴───┐ │ │ ┌──┴───┐ │ │ ┌──┴───┐ │ │ ┌──┴───┐ │                        │
│ │ │ FC   │ │ │ │ FC   │ │ │ │ FC   │ │ │ │ FC   │ │   Firecracker VMs      │
│ │ │ VM   │ │ │ │ VM   │ │ │ │ VM   │ │ │ │ VM   │ │                        │
│ │ │10.0. │ │ │ │10.0. │ │ │ │10.0. │ │ │ │10.0. │ │                        │
│ │ │ 0.2  │ │ │ │ 0.2  │ │ │ │ 0.2  │ │ │ │ 0.2  │ │                        │
│ │ └──────┘ │ │ └──────┘ │ │ └──────┘ │ │ └──────┘ │                        │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                        │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## IP Addressing Scheme

### Per-Namespace Addressing

Each VM namespace (vmN) uses a unique /24 subnet for host communication:

| Component | IP Address | Purpose |
|-----------|------------|---------|
| Host veth endpoint | 10.0.N.254/24 | Host side of veth pair |
| Namespace veth endpoint | 10.0.N.1/24 | Namespace side of veth pair |
| Namespace bridge (br-vm) | 10.0.0.1/24 | Gateway for VM |
| VM eth0 | 10.0.0.2/24 | VM's internal address |

### Address Calculation

```
VM_ID = N (1, 2, 3, ... 999)

Host veth:      10.0.N.254
Namespace veth: 10.0.N.1
Bridge:         10.0.0.1   (same for all namespaces)
VM:             10.0.0.2   (same for all VMs)
```

### Why Same Internal IP?

Since each VM runs in an isolated network namespace, they can all use 10.0.0.2 without conflict. Benefits:

1. **Snapshot compatibility** - Rootfs doesn't need IP modification on restore
2. **Simplified agent code** - Agents always connect to 10.0.0.1 gateway
3. **Uniform configuration** - DNS, routes baked into snapshot once

---

## Network Stack Layers

### Layer 1: Host ↔ Namespace (veth pair)

```bash
# Created by swarm-spawn-ns
ip link add veth-vm${VM_ID}-br type veth peer name veth-vm${VM_ID}
ip link set veth-vm${VM_ID} netns vm${VM_ID}

# Host side
ip addr add 10.0.${VM_ID}.254/24 dev veth-vm${VM_ID}-br
ip link set veth-vm${VM_ID}-br up

# Namespace side
ip netns exec vm${VM_ID} ip addr add 10.0.${VM_ID}.1/24 dev veth-vm${VM_ID}
ip netns exec vm${VM_ID} ip link set veth-vm${VM_ID} up
```

### Layer 2: Namespace Bridge (br-vm)

Each namespace has an internal bridge connecting the veth to the TAP device:

```bash
ip netns exec vm${VM_ID} ip link add br-vm type bridge
ip netns exec vm${VM_ID} ip addr add 10.0.0.1/24 dev br-vm
ip netns exec vm${VM_ID} ip link set br-vm up
```

### Layer 3: TAP Device

The TAP device connects Firecracker to the namespace bridge:

```bash
ip netns exec vm${VM_ID} ip tuntap add tap0 mode tap
ip netns exec vm${VM_ID} ip link set tap0 master br-vm
ip netns exec vm${VM_ID} ip link set tap0 up
```

### Layer 4: Firecracker VM

Firecracker attaches to tap0, giving the VM network access:

```json
{
  "network-interfaces": [{
    "iface_id": "eth0",
    "guest_mac": "02:FC:00:00:00:XX",
    "host_dev_name": "tap0"
  }]
}
```

---

## Routing

### Host Routing Table

The host needs routes to reach each namespace's VM subnet:

```bash
# Added automatically by swarm-spawn-ns
ip route add 10.0.0.0/24 via 10.0.${VM_ID}.1 dev veth-vm${VM_ID}-br
```

Note: This creates overlapping routes for 10.0.0.0/24, but traffic is routed based on the specific veth interface.

### Namespace Routing

Each namespace has a default route back to the host:

```bash
ip netns exec vm${VM_ID} ip route add default via 10.0.${VM_ID}.254 dev veth-vm${VM_ID}
```

### VM Routing (inside Firecracker)

The VM has a simple default route to the bridge:

```
default via 10.0.0.1 dev eth0
```

---

## NAT Configuration

### Namespace-Level NAT

Each namespace performs NAT for its VM's outbound traffic:

```bash
ip netns exec vm${VM_ID} iptables -t nat -A POSTROUTING \
  -s 10.0.0.0/24 -o veth-vm${VM_ID} -j MASQUERADE
```

### Host-Level NAT

The host performs NAT for traffic leaving to the internet:

```bash
# Pre-configured on droplet
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### Traffic Flow (VM → Internet)

```
1. VM (10.0.0.2) → br-vm (10.0.0.1)
2. br-vm → veth-vmN (10.0.N.1) [NAT: src becomes 10.0.N.1]
3. veth-vmN → veth-vmN-br (10.0.N.254)
4. Host routing → eth0 [NAT: src becomes public IP]
5. Internet
```

---

## DNS Configuration

DNS is baked into the VM rootfs snapshot:

```
# /etc/resolv.conf (inside VM)
nameserver 8.8.8.8
nameserver 1.1.1.1
```

No per-namespace DNS configuration is required since DNS queries follow the standard routing path.

---

## Key Scripts

### swarm-spawn-ns

Location: `/usr/local/bin/swarm-spawn-ns`

Creates a new VM with full network isolation:

```bash
swarm-spawn-ns <vm_id>   # vm_id >= 1
```

**Actions performed:**
1. Clean up any existing VM with same ID
2. Create network namespace `vm${VM_ID}`
3. Create veth pair and configure IPs
4. Create internal bridge and TAP device
5. Configure NAT rules
6. Start Firecracker with snapshot restore
7. Verify SSH connectivity

### swarm-cleanup

Location: `/usr/local/bin/swarm-cleanup`

Tears down all VMs and network resources:

```bash
swarm-cleanup           # Interactive cleanup
swarm-cleanup --force   # Force cleanup without prompts
```

---

## Accessing VMs

### From Host (via namespace)

```bash
# SSH to VM in namespace vm5
ip netns exec vm5 ssh -o StrictHostKeyChecking=no root@10.0.0.2

# Or use the shorthand (if configured)
ssh-vm 5
```

### From Another VM

VMs cannot directly communicate with each other (by design). Each VM only sees its isolated 10.0.0.0/24 network.

### From Host API Server

The Swarm API server runs on the host and communicates with VMs via SSH through their respective namespaces.

---

## Troubleshooting

### Check Namespace Exists

```bash
ip netns list | grep vm5
```

### Check Veth Pair

```bash
# Host side
ip link show veth-vm5-br
ip addr show veth-vm5-br

# Namespace side
ip netns exec vm5 ip link show veth-vm5
ip netns exec vm5 ip addr show veth-vm5
```

### Check Bridge and TAP

```bash
ip netns exec vm5 ip link show br-vm
ip netns exec vm5 ip link show tap0
ip netns exec vm5 bridge link
```

### Check Routes

```bash
# Host routes
ip route | grep "10.0"

# Namespace routes
ip netns exec vm5 ip route
```

### Check NAT Rules

```bash
ip netns exec vm5 iptables -t nat -L -n -v
```

### Test Connectivity

```bash
# Host → Namespace veth
ping -c 1 10.0.5.1

# Namespace → VM
ip netns exec vm5 ping -c 1 10.0.0.2

# VM → Internet (from inside VM)
ip netns exec vm5 ssh root@10.0.0.2 "curl -s ifconfig.me"
```

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| SSH timeout to VM | Firecracker not running | Check `ps aux \| grep firecracker` |
| No route to host | Missing host route | `ip route add 10.0.0.0/24 via 10.0.N.1 dev veth-vmN-br` |
| DNS failure | Missing resolv.conf | Rebuild rootfs with DNS config |
| Connection refused | SSH not started in VM | Check VM console log |
| Namespace missing | Cleanup ran | Re-run `swarm-spawn-ns N` |

---

## Performance Considerations

### Boot Time Impact

Network setup adds ~50-100ms to VM boot time:
- Namespace creation: ~10ms
- Veth pair setup: ~20ms
- Bridge/TAP setup: ~20ms
- NAT rules: ~10ms
- Verification ping: ~50ms

### Memory Overhead

Each namespace adds minimal memory overhead:
- Namespace structures: ~4KB
- iptables rules: ~2KB per VM
- Route entries: ~100 bytes per VM

### Scaling Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max namespaces | 4096 | Kernel default |
| Max veth pairs | 65535 | Per network namespace |
| IP range | 1-999 | Current addressing scheme |

For >999 VMs, extend addressing to 10.X.Y.Z scheme.

---

## Security

### Isolation Guarantees

- VMs cannot see each other's traffic
- VMs cannot access host network directly
- VMs can only reach internet via NAT
- No VM-to-VM communication possible

### Attack Surface

- VMs share kernel with host (Firecracker provides VMM isolation)
- NAT rules prevent inbound connections to VMs
- Host services not exposed to VM network

---

## References

- Firecracker networking: https://github.com/firecracker-microvm/firecracker/blob/main/docs/network-setup.md
- Linux namespaces: `man ip-netns`
- Bridge networking: `man bridge`
