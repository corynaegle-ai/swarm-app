# Control Plane VM Implementation - Session Notes

## Goal
Deploy persistent Firecracker VM with XFCE desktop for remote dev from iPhone via RDP over Tailscale.

## Current Status: Step 5 BLOCKED - SSH Service Not Starting

**Completed:**
- ✅ Step 1-3: Scripts uploaded, rootfs built, VM boots
- ✅ Step 4: Network FIXED - patched swarm-control to connect veth-ctrl to br-ctrl

**Verified working:**
- Ping to 10.0.0.100: ✅ 0% packet loss
- RDP port 3389: ✅ Open
- SSH port 22: ❌ Connection refused

**Remaining:**
- 🔴 Step 5: Fix SSH service inside VM
- ⏳ Step 6: Add SSH key to GitHub
- ⏳ Step 7: Configure Tailscale
- ⏳ Step 8: Test RDP from iPhone

## Network Fix Applied (Session Dec 13)

Patched `/opt/swarm/bin/swarm-control` line ~64:
```bash
# Added: Connect veth to bridge (was orphaned)
ip netns exec "$CONTROL_NS" ip link set "$CONTROL_VETH_NS" master br-ctrl
```

Backup at: `/opt/swarm/bin/swarm-control.bak`

## SSH Issue Analysis

VM boots with network working (RDP responds) but SSH refuses. Likely causes:
1. SSH host keys not generated during rootfs build
2. sshd_config missing `PermitRootLogin yes`
3. SSH service failed to start (check via serial console or RDP)

## Debug Commands

```bash
ssh root@146.190.35.235
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/swarm/bin

# Verify VM running and network
ping -c 2 10.0.0.100
nc -zv 10.0.0.100 22    # SSH - currently refuses
nc -zv 10.0.0.100 3389  # RDP - works

# Check boot log for SSH errors
grep -i ssh /var/log/control-plane.log
tail -50 /var/log/control-plane.log

# VM management
swarm-control status
swarm-control stop
swarm-control start
```

## Files Reference

- Script: `/opt/swarm/bin/swarm-control`
- Rootfs: `/opt/swarm/images/control-rootfs.ext4`
- Boot log: `/var/log/control-plane.log`
- Local scripts: `/Users/cory.naegle/swarm-control-plane/`

## Next Action

Fix SSH inside VM - either RDP in to debug, or modify rootfs to ensure SSH host keys generated and root login permitted.
