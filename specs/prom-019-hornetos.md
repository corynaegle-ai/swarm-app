

## PROM-019: HornetOS Alpine VM Infrastructure with SNAT/DNAT

**Created:** 2025-12-17  
**Status:** 🟡 READY FOR PROMOTION  
**Repos:** swarm (infrastructure)  
**Commits:** 605973f (swarm-spawn-alpine-v2.sh)

### Overview

Complete HornetOS Alpine VM infrastructure with Firecracker snapshot restoration and SNAT/DNAT networking for clone isolation. Enables spawning multiple VMs from a single snapshot where each VM gets a unique external IP while internally sharing the same guest IP.

### Components to Deploy

| Component | DEV Location | Purpose |
|-----------|--------------|---------|
| Alpine rootfs | `/opt/swarm/snapshots/alpine3.19-hornetos/rootfs.ext4` | Base Alpine 3.19 filesystem |
| v2 Snapshot | `/opt/swarm/snapshots/alpine3.19-hornetos-v2/` | Snapshot with guest IP 192.168.241.2 |
| Spawn script | `/opt/swarm/swarm-spawn-alpine-v2.sh` | Production spawn with SNAT/DNAT |
| Boot script | `/opt/swarm/swarm-boot-alpine-v2.sh` | Creates fresh snapshots |

### Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     HOST (Droplet)                       │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ vm0 NS   │    │ vm1 NS   │    │ vm2 NS   │           │
│  │ veth0    │    │ veth0    │    │ veth0    │           │
│  │ 10.0.0.2 │    │ 10.0.0.3 │    │ 10.0.0.4 │           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │ SNAT/DNAT│    │ SNAT/DNAT│    │ SNAT/DNAT│           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │ tap0     │    │ tap0     │    │ tap0     │           │
│  │192.168.  │    │192.168.  │    │192.168.  │           │
│  │ 241.1/29 │    │ 241.1/29 │    │ 241.1/29 │           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │┌────────┐│    │┌────────┐│    │┌────────┐│           │
│  ││ Alpine ││    ││ Alpine ││    ││ Alpine ││           │
│  ││192.168.││    ││192.168.││    ││192.168.││           │
│  ││ 241.2  ││    ││ 241.2  ││    ││ 241.2  ││           │
│  │└────────┘│    │└────────┘│    │└────────┘│           │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘           │
│       └───────────────┼───────────────┘                  │
│                   ┌───┴───┐                               │
│                   │  br0  │ 10.0.0.1                     │
│                   └───────┘                               │
└──────────────────────────────────────────────────────────┘
```

### Key Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Guest IP | 192.168.241.2 | Static IP inside all VM clones |
| TAP Host IP | 192.168.241.1/29 | Host side of tap0 in each namespace |
| Clone IPs | 10.0.0.X | External IPs on br0 bridge |
| Kernel | `/opt/swarm/images/vmlinux.bin` | Shared kernel |

### SNAT/DNAT Rules (per namespace)

```bash
# Outbound: Guest → Clone IP
iptables -t nat -A POSTROUTING -o veth0 -s 192.168.241.2 -j SNAT --to $CLONE_IP
# Inbound: Clone IP → Guest
iptables -t nat -A PREROUTING -i veth0 -d $CLONE_IP -j DNAT --to 192.168.241.2
```

### Testing Completed on DEV
- [x] 3 VMs spawn successfully (3152ms total, ~1050ms avg)
- [x] SSH works to all 3 VMs via clone IPs
- [x] SNAT/DNAT translates traffic correctly
- [x] VMs resume from snapshot in <10ms

### Promotion Commands

```bash
# 1. SSH to PROD
ssh -i ~/.ssh/swarm_key root@146.190.35.235

# 2. Ensure br0 bridge exists (should already)
ip link show br0

# 3. Create snapshot directories
mkdir -p /opt/swarm/snapshots/alpine3.19-hornetos
mkdir -p /opt/swarm/snapshots/alpine3.19-hornetos-v2

# 4. Copy rootfs from DEV
scp root@134.199.235.140:/opt/swarm/snapshots/alpine3.19-hornetos/rootfs.ext4 \
    /opt/swarm/snapshots/alpine3.19-hornetos/

# 5. Copy v2 snapshot from DEV
scp root@134.199.235.140:/opt/swarm/snapshots/alpine3.19-hornetos-v2/* \
    /opt/swarm/snapshots/alpine3.19-hornetos-v2/

# 6. Pull spawn script (already in git)
cd /opt/swarm
git pull origin main

# 7. Make executable
chmod +x /opt/swarm/swarm-spawn-alpine-v2.sh

# 8. Test spawn 3 VMs
/opt/swarm/swarm-spawn-alpine-v2.sh 3 0

# 9. Test SSH to each
ssh -o StrictHostKeyChecking=no root@10.0.0.2 hostname
ssh -o StrictHostKeyChecking=no root@10.0.0.3 hostname
ssh -o StrictHostKeyChecking=no root@10.0.0.4 hostname

# 10. Cleanup test VMs
pkill firecracker
for ns in vm0 vm1 vm2; do ip netns del $ns 2>/dev/null; done
rm -f /tmp/alpine-* /tmp/fc-alpine-*
```

### Prerequisites on PROD
- [ ] Firecracker installed (`/usr/bin/firecracker`)
- [ ] br0 bridge configured with IP 10.0.0.1/24
- [ ] Kernel at `/opt/swarm/images/vmlinux.bin`
- [ ] IP forwarding enabled (`sysctl net.ipv4.ip_forward=1`)

### Rollback

```bash
# Stop any running Alpine VMs
pkill -f "fc-alpine"
# Remove namespaces
for ns in $(ip netns list | grep ^vm); do ip netns del $ns; done
# Remove snapshots (optional - doesn't affect other services)
rm -rf /opt/swarm/snapshots/alpine3.19-hornetos*
```

### References
- Firecracker network-for-clones: https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/network-for-clones.md
- Session notes: `/opt/swarm-specs/session-notes/current.md`

---
