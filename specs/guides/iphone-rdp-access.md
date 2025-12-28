# Accessing Control Plane VM from iPhone

## Prerequisites

1. **RD Client app** - Download "Remote Desktop Mobile" by Microsoft from App Store
2. **SSH tunnel app** - Download "Termius" or "Blink Shell" from App Store

## Method 1: SSH Tunnel + RDP (Recommended)

### Step 1: Create SSH Tunnel in Termius

1. Open Termius
2. Add new host:
   - Alias: `Swarm Droplet`
   - Hostname: `146.190.35.235`
   - Username: `root`
   - Key: Import `swarm_key` from your Mac via AirDrop/iCloud

3. Add port forwarding rule:
   - Local port: `3389`
   - Remote host: `10.0.0.100`
   - Remote port: `3389`

4. Connect to establish tunnel

### Step 2: Connect via RD Client

1. Open RD Client
2. Tap `+` → Add PC
3. PC Name: `localhost`
4. User Account: Add new
   - Username: `root`
   - Password: `swarm123`
5. Save and connect

## Method 2: Direct SSH Access

For command-line only access (no desktop):

1. Open Termius
2. Connect to Swarm Droplet
3. Run: `ssh root@10.0.0.100`
4. Password: `swarm123`

## Connection Details

| Setting | Value |
|---------|-------|
| Droplet IP | 146.190.35.235 |
| Control VM IP | 10.0.0.100 |
| SSH Port | 22 |
| RDP Port | 3389 |
| Username | root |
| Password | swarm123 |

## Troubleshooting

**RDP connection fails:**
- Ensure SSH tunnel is active in Termius
- Check tunnel shows "Connected" status
- Verify local port 3389 in tunnel config

**Black screen after RDP connect:**
- Wait 10-15 seconds for XFCE to initialize
- If persists, disconnect and reconnect

**SSH key not working:**
- Export key from Mac: `cat ~/.ssh/swarm_key | pbcopy`
- In Termius: Keychain → Add Key → Paste

## Quick Reference

```
Tunnel: localhost:3389 → 10.0.0.100:3389 (via 146.190.35.235)
Login: root / swarm123
Desktop: XFCE4
```
