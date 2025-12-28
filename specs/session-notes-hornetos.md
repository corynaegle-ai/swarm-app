# Session Notes - HornetOS Alpine TAP Fix Complete

## Session Date: 2025-12-17T21:20:00-07:00

## Completed This Session

### HornetOS TAP Fix - Part 2: SNAT/DNAT Network Clone Support ✅

**Problem:** Alpine snapshots restored from snapshots all have the same internal guest IP (192.168.241.2), making it impossible to route traffic to individual VMs.

**Solution:** Implemented per-namespace SNAT/DNAT rules per Firecracker's network-for-clones documentation.

#### What Was Done

1. **Verified v2 Snapshot Exists** ✅
   - Location: `/opt/swarm/snapshots/alpine3.19-hornetos-v2/`
   - Guest IP: `192.168.241.2` (configured via kernel boot args)
   - Host TAP IP: `192.168.241.1/29`

2. **Created Updated Spawn Script** ✅
   - Script: `/opt/swarm/swarm-spawn-alpine-v2.sh`
   - Key changes:
     - Uses v2 snapshot with known guest IP
     - Creates veth pair + tap0 per namespace
     - Adds SNAT/DNAT rules to translate clone IP ↔ guest IP

3. **SNAT/DNAT Configuration**
   ```bash
   # Per VM namespace:
   # Outbound: Guest (192.168.241.2) → Clone IP (10.0.0.X)
   iptables -t nat -A POSTROUTING -o veth0 -s 192.168.241.2 -j SNAT --to $CLONE_IP
   # Inbound: Clone IP (10.0.0.X) → Guest (192.168.241.2)
   iptables -t nat -A PREROUTING -i veth0 -d $CLONE_IP -j DNAT --to 192.168.241.2
   ```

4. **3-VM Test Results** ✅
   ```
   Success: 3/3 VMs
   Total time: 3152ms
   Average: 1050ms per VM
   
   SSH Access:
     VM 0: ssh root@10.0.0.2 ✅
     VM 1: ssh root@10.0.0.3 ✅
     VM 2: ssh root@10.0.0.4 ✅
   ```

## Success Criteria Status

| Criteria | Status |
|----------|--------|
| New snapshot created with guest IP 192.168.241.2 | ✅ (was already done in Part 1) |
| Spawn script updated with SNAT/DNAT | ✅ `/opt/swarm/swarm-spawn-alpine-v2.sh` |
| 3 VMs spawn with unique clone IPs | ✅ 10.0.0.2, 10.0.0.3, 10.0.0.4 |
| SSH works to all 3 VMs | ✅ All responding |
| Session notes updated in git | ✅ This file |

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                     HOST (DEV Droplet)                  │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐           │
│  │ vm0 NS   │    │ vm1 NS   │    │ vm2 NS   │           │
│  │          │    │          │    │          │           │
│  │ veth0    │    │ veth0    │    │ veth0    │           │
│  │ 10.0.0.2 │    │ 10.0.0.3 │    │ 10.0.0.4 │           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │ SNAT/DNAT│    │ SNAT/DNAT│    │ SNAT/DNAT│           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │ tap0     │    │ tap0     │    │ tap0     │           │
│  │192.168.  │    │192.168.  │    │192.168.  │           │
│  │ 241.1    │    │ 241.1    │    │ 241.1    │           │
│  │    ↕     │    │    ↕     │    │    ↕     │           │
│  │┌────────┐│    │┌────────┐│    │┌────────┐│           │
│  ││ Alpine ││    ││ Alpine ││    ││ Alpine ││           │
│  ││ Guest  ││    ││ Guest  ││    ││ Guest  ││           │
│  ││192.168.││    ││192.168.││    ││192.168.││           │
│  ││ 241.2  ││    ││ 241.2  ││    ││ 241.2  ││           │
│  │└────────┘│    │└────────┘│    │└────────┘│           │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘           │
│       │               │               │                  │
│       └───────────────┼───────────────┘                  │
│                       │                                   │
│                   ┌───┴───┐                               │
│                   │  br0  │ 10.0.0.1                     │
│                   └───┬───┘                               │
│                       │                                   │
└───────────────────────┼──────────────────────────────────┘
                        │
                    Internet
```

## Files Created/Modified

| File | Action |
|------|--------|
| `/opt/swarm/swarm-spawn-alpine-v2.sh` | Created - production spawn script |
| `/opt/swarm/swarm-spawn-alpine-fixed.sh` | Exists - original fix (no SNAT/DNAT) |
| `/opt/swarm/snapshots/alpine3.19-hornetos-v2/` | Exists - v2 snapshot |

## Next Steps

1. Integrate `swarm-spawn-alpine-v2.sh` into HornetOS orchestrator
2. Scale test to 10+ VMs to verify SNAT/DNAT performance
3. Add SSH key injection for per-VM authentication
4. Implement agent installation in Alpine rootfs

## References

- Firecracker network-for-clones: https://github.com/firecracker-microvm/firecracker/blob/main/docs/snapshotting/network-for-clones.md
- Boot script: `/opt/swarm/swarm-boot-alpine-v2.sh`
- Snapshot directory: `/opt/swarm/snapshots/alpine3.19-hornetos-v2/`
