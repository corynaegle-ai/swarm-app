/**
 * Swarm VM API Routes - Dashboard Integration
 * Provides /api/swarm/* endpoints for VM management dashboard
 */

const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');

// Script paths
const SPAWN_SCRIPT = '/usr/local/bin/swarm-spawn-cow';
const CLEANUP_SCRIPT = '/usr/local/bin/swarm-cleanup-cow';

// Helper: Get running Firecracker processes
function getRunningVMs() {
  try {
    const output = execSync('pgrep -a firecracker 2>/dev/null || true').toString().trim();
    if (!output) return [];
    return output.split('\n').filter(Boolean).map(line => {
      const parts = line.split(/\s+/);
      const pid = parts[0];
      const command = parts.slice(1).join(' ');
      return { pid: parseInt(pid), command };
    });
  } catch (e) {
    return [];
  }
}

// GET /api/swarm/status - VM fleet status (Dashboard main endpoint)
router.get('/status', (req, res) => {
  try {
    const vms = getRunningVMs();
    res.json({ 
      count: vms.length, 
      vms,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: Find next available VM ID
function getNextVmId() {
  try {
    // Check existing namespace dirs to find highest ID
    const output = execSync('ls -d /var/run/netns/vm* 2>/dev/null || true').toString().trim();
    if (!output) return 1;
    const ids = output.split('\n').map(p => {
      const match = p.match(/vm(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    return Math.max(...ids, 0) + 1;
  } catch (e) {
    return 1;
  }
}

// POST /api/swarm/boot - Boot new VMs
router.post('/boot', (req, res) => {
  const { count = 1 } = req.body;
  const beforeVMs = getRunningVMs();
  let nextId = getNextVmId();
  
  try {
    // Spawn VMs using the namespace script with VM IDs
    for (let i = 0; i < count; i++) {
      try {
        execSync(`${SPAWN_SCRIPT} ${nextId} 2>&1`, { timeout: 90000, env: { ...process.env, PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' } });
        nextId++;
      } catch (e) {
        console.error(`Failed to spawn VM ${nextId}:`, e.message);
      }
    }
    
    const afterVMs = getRunningVMs();
    res.json({
      success: true,
      requested: count,
      spawned: afterVMs.length - beforeVMs.length,
      totalRunning: afterVMs.length
    });
  } catch (e) {
    res.status(500).json({ error: 'Boot failed', details: e.message });
  }
});

// POST /api/swarm/cleanup - Cleanup all VMs
router.post('/cleanup', (req, res) => {
  const before = getRunningVMs().length;
  
  try {
    execSync(`${CLEANUP_SCRIPT} --all 2>&1 || true`, { timeout: 90000, env: { ...process.env, PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" } });
    const after = getRunningVMs().length;
    
    res.json({
      success: true,
      before,
      after,
      cleaned: before - after
    });
  } catch (e) {
    res.status(500).json({ error: 'Cleanup failed', details: e.message });
  }
});

// DELETE /api/swarm/vm/:pid - Kill specific VM by PID
router.delete('/vm/:pid', (req, res) => {
  const { pid } = req.params;
  
  try {
    // Verify it's actually a firecracker process first
    const vms = getRunningVMs();
    const vm = vms.find(v => v.pid === parseInt(pid));
    
    if (!vm) {
      return res.status(404).json({ error: 'VM not found or not a firecracker process' });
    }
    
    execSync(`kill ${pid} 2>/dev/null || true`);
    res.json({ success: true, killed: parseInt(pid) });
  } catch (e) {
    res.status(500).json({ error: 'Kill failed', details: e.message });
  }
});

// GET /api/swarm/vm/:pid/health - Health check specific VM
router.get('/vm/:pid/health', (req, res) => {
  const { pid } = req.params;
  const vms = getRunningVMs();
  const vm = vms.find(v => v.pid === parseInt(pid));
  
  res.json({
    pid: parseInt(pid),
    healthy: !!vm,
    found: !!vm
  });
});

module.exports = router;
