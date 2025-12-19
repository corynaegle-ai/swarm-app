/**
 * VM management routes
 * From swarm-tickets api-server-dashboard.js
 * Updated: RBAC protection added
 */

const express = require('express');
const router = express.Router();
const { execSync, spawn } = require('child_process');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');

// VM registry path
const REGISTRY_PATH = '/opt/swarm/vm-registry.json';

// Helper to read registry
function readRegistry() {
  try {
    return JSON.parse(require('fs').readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { vms: [] };
  }
}

// GET /api/vms - List all VMs
router.get('/', requireAuth, requirePermission('view_vms'), (req, res) => {
  const registry = readRegistry();
  res.json({ vms: registry.vms || [] });
});

// GET /api/vms/:id - Get specific VM
router.get('/:id', requireAuth, requirePermission('view_vms'), (req, res) => {
  const registry = readRegistry();
  const vm = registry.vms?.find(v => v.id === parseInt(req.params.id));
  if (!vm) return res.status(404).json({ error: 'VM not found' });
  res.json({ vm });
});

// GET /api/vms/:id/health - Check VM health
router.get('/:id/health', requireAuth, requirePermission('view_vms'), (req, res) => {
  try {
    const vmId = parseInt(req.params.id);
    const ip = `10.0.0.${vmId + 2}`;
    const result = execSync(`ping -c 1 -W 1 ${ip} 2>/dev/null && echo "up" || echo "down"`, { encoding: 'utf8' });
    res.json({ vm_id: vmId, status: result.trim() === 'up' ? 'healthy' : 'unreachable' });
  } catch (e) {
    res.json({ vm_id: req.params.id, status: 'unreachable', error: e.message });
  }
});

// POST /api/vms/health-check - Batch health check
router.post('/health-check', requireAuth, requirePermission('view_vms'), (req, res) => {
  const registry = readRegistry();
  const results = (registry.vms || []).map(vm => {
    try {
      const ip = `10.0.0.${vm.id + 2}`;
      execSync(`ping -c 1 -W 1 ${ip}`, { encoding: 'utf8' });
      return { ...vm, status: 'healthy' };
    } catch {
      return { ...vm, status: 'unreachable' };
    }
  });
  res.json({ vms: results });
});

// GET /api/vms/registry/stats - Registry statistics
router.get('/registry/stats', requireAuth, requirePermission('view_vms'), (req, res) => {
  const registry = readRegistry();
  const vms = registry.vms || [];
  res.json({
    total: vms.length,
    byStatus: vms.reduce((acc, vm) => {
      acc[vm.status] = (acc[vm.status] || 0) + 1;
      return acc;
    }, {})
  });
});

// POST /api/vms/spawn - Spawn new VM (requires manage permission)
router.post('/spawn', requireAuth, requirePermission('manage_vms'), async (req, res) => {
  try {
    const { count = 1 } = req.body;
    const result = execSync(`/opt/swarm/spawn-vm.sh ${count}`, { encoding: 'utf8' });
    res.json({ success: true, output: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/vms/cleanup - Cleanup VMs (requires manage permission)
router.post('/cleanup', requireAuth, requirePermission('manage_vms'), (req, res) => {
  try {
    const result = execSync('/opt/swarm/swarm-cleanup', { encoding: 'utf8' });
    res.json({ success: true, output: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/vms/:id - Terminate specific VM (requires manage permission)
router.delete('/:id', requireAuth, requirePermission('manage_vms'), (req, res) => {
  try {
    const result = execSync(`/opt/swarm/terminate-vm.sh ${req.params.id}`, { encoding: 'utf8' });
    res.json({ success: true, output: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/vms - Terminate all VMs (requires manage permission)
router.delete('/', requireAuth, requirePermission('manage_vms'), (req, res) => {
  try {
    const result = execSync('/opt/swarm/swarm-cleanup', { encoding: 'utf8' });
    res.json({ success: true, output: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
