/**
 * VM Pool Manager
 * Handles VM lifecycle: acquire, release, spawn, cleanup
 * Uses atomic locking to prevent race conditions
 */
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

// VM States
const VM_STATE = {
  AVAILABLE: 'available',
  ACQUIRED: 'acquired',
  BUSY: 'busy',
  ERROR: 'error',
  CLEANUP: 'cleanup'
};

export class VMPool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      maxVMs: options.maxVMs || 10,
      spawnScript: options.spawnScript || 'swarm-spawn-ns',
      cleanupScript: options.cleanupScript || 'swarm-cleanup-ns',
      restoreScript: options.restoreScript || 'swarm-restore-prod',
      vmTimeout: options.vmTimeout || 30000,      // 30s boot timeout
      sshTimeout: options.sshTimeout || 60000,    // 60s SSH command timeout
      lockDir: options.lockDir || '/tmp/swarm-vm-locks',
      baseIP: options.baseIP || '10.0.0',
      ipOffset: options.ipOffset || 2,
      ...options
    };

    // VM state tracking
    this.vms = new Map();
    this.locks = new Map();
    this.acquiredCount = 0;
  }

  /**
   * Initialize the VM pool
   */
  async init() {
    // Ensure lock directory exists
    try {
      execSync(`mkdir -p ${this.config.lockDir}`);
    } catch (err) {
      throw new Error(`Failed to create lock directory: ${err.message}`);
    }
    
    // Clean up any stale locks on startup
    await this.cleanStaleLocks();
    
    this.emit('init', { maxVMs: this.config.maxVMs });
  }

  /**
   * Get IP address for a VM ID
   */
  getVMIP(vmId) {
    return `${this.config.baseIP}.${vmId + this.config.ipOffset}`;
  }

  /**
   * Acquire a VM with atomic locking
   * @returns {Object} VM info including id, ip, namespace
   */
  async acquireVM() {
    // Find available VM ID
    for (let vmId = 0; vmId < this.config.maxVMs; vmId++) {
      const lockPath = `${this.config.lockDir}/vm-${vmId}.lock`;
      
      if (await this.tryLock(vmId, lockPath)) {
        try {
          // Spawn VM in namespace
          const vm = await this.spawnVM(vmId);
          
          this.vms.set(vmId, {
            ...vm,
            state: VM_STATE.ACQUIRED,
            acquiredAt: Date.now()
          });
          
          this.acquiredCount++;
          this.emit('acquired', vm);
          
          return vm;
        } catch (err) {
          // Release lock on spawn failure
          await this.releaseLock(vmId, lockPath);
          throw err;
        }
      }
    }
    
    throw new Error(`No VMs available (max: ${this.config.maxVMs})`);
  }

  /**
   * Atomic lock acquisition
   */
  async tryLock(vmId, lockPath) {
    try {
      // Use O_EXCL for atomic creation
      if (existsSync(lockPath)) {
        // Check if lock is stale (process died)
        const content = readFileSync(lockPath, 'utf-8').trim();
        const [pid, timestamp] = content.split(':');
        
        // Check if process is still running
        try {
          process.kill(parseInt(pid), 0);
          return false; // Process alive, lock valid
        } catch {
          // Process dead, remove stale lock
          unlinkSync(lockPath);
        }
      }
      
      // Create lock with PID and timestamp
      writeFileSync(lockPath, `${process.pid}:${Date.now()}`, { flag: 'wx' });
      this.locks.set(vmId, lockPath);
      return true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        return false; // Lock already held
      }
      throw err;
    }
  }

  /**
   * Release VM lock
   */
  async releaseLock(vmId, lockPath) {
    try {
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
      }
      this.locks.delete(vmId);
    } catch (err) {
      console.error(`Failed to release lock for VM ${vmId}: ${err.message}`);
    }
  }

  /**
   * Spawn a VM using the spawn script
   */
  async spawnVM(vmId) {
    const startTime = Date.now();
    
    try {
      // Use swarm-spawn-ns or swarm-restore-prod based on config
      const cmd = `${this.config.spawnScript} ${vmId}`;
      
      await execAsync(cmd, { timeout: this.config.vmTimeout });
      
      const bootTime = Date.now() - startTime;
      const ip = this.getVMIP(vmId);
      
      // Wait for VM to be SSH-ready
      await this.waitForSSH(vmId, ip);
      
      return {
        id: vmId,
        ip,
        namespace: `vm${vmId}`,
        bootTime,
        spawnedAt: Date.now()
      };
    } catch (err) {
      throw new Error(`Failed to spawn VM ${vmId}: ${err.message}`);
    }
  }

  /**
   * Wait for VM to be SSH-ready
   */
  async waitForSSH(vmId, ip, timeout = 30000) {
    const startTime = Date.now();
    const interval = 100; // Check every 100ms
    
    while (Date.now() - startTime < timeout) {
      try {
        const cmd = `ip netns exec vm${vmId} ssh -o ConnectTimeout=1 -o StrictHostKeyChecking=no root@${ip} 'echo ready'`;
        await execAsync(cmd, { timeout: 2000 });
        return true;
      } catch {
        await new Promise(r => setTimeout(r, interval));
      }
    }
    
    throw new Error(`VM ${vmId} not SSH-ready after ${timeout}ms`);
  }

  /**
   * Execute command on VM
   */
  async execOnVM(vmId, command, options = {}) {
    const vm = this.vms.get(vmId);
    if (!vm) {
      throw new Error(`VM ${vmId} not found in pool`);
    }
    
    const timeout = options.timeout || this.config.sshTimeout;
    const ip = vm.ip;
    
    // Escape command for shell
    const escapedCmd = command.replace(/'/g, "'\\''");
    const sshCmd = `ip netns exec vm${vmId} ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@${ip} '${escapedCmd}'`;
    
    try {
      const { stdout, stderr } = await execAsync(sshCmd, { 
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      return { stdout, stderr, exitCode: 0 };
    } catch (err) {
      return {
        stdout: err.stdout || '',
        stderr: err.stderr || err.message,
        exitCode: err.code || 1
      };
    }
  }

  /**
   * Release a VM back to the pool
   */
  async releaseVM(vmId) {
    const vm = this.vms.get(vmId);
    if (!vm) {
      console.warn(`VM ${vmId} not found in pool during release`);
      return;
    }
    
    const lockPath = `${this.config.lockDir}/vm-${vmId}.lock`;
    
    try {
      // Cleanup VM
      const cleanupCmd = `${this.config.cleanupScript} ${vmId}`;
      await execAsync(cleanupCmd, { timeout: 10000 });
    } catch (err) {
      console.error(`Failed to cleanup VM ${vmId}: ${err.message}`);
    }
    
    // Release lock
    await this.releaseLock(vmId, lockPath);
    
    // Remove from tracking
    this.vms.delete(vmId);
    this.acquiredCount--;
    
    this.emit('released', { vmId });
  }

  /**
   * Clean stale locks on startup
   */
  async cleanStaleLocks() {
    try {
      const { stdout } = await execAsync(`ls ${this.config.lockDir}/*.lock 2>/dev/null || true`);
      const lockFiles = stdout.trim().split('\n').filter(Boolean);
      
      for (const lockPath of lockFiles) {
        try {
          const content = readFileSync(lockPath, 'utf-8').trim();
          const [pid] = content.split(':');
          
          // Check if process is still running
          try {
            process.kill(parseInt(pid), 0);
          } catch {
            // Process dead, remove stale lock
            unlinkSync(lockPath);
            console.log(`Cleaned stale lock: ${lockPath}`);
          }
        } catch (err) {
          // Ignore read errors
        }
      }
    } catch (err) {
      // Ignore if lock directory doesn't exist yet
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      maxVMs: this.config.maxVMs,
      acquiredCount: this.acquiredCount,
      availableCount: this.config.maxVMs - this.acquiredCount,
      vms: Array.from(this.vms.values()).map(vm => ({
        id: vm.id,
        ip: vm.ip,
        state: vm.state,
        uptime: Date.now() - vm.spawnedAt
      }))
    };
  }

  /**
   * Cleanup all VMs (shutdown)
   */
  async cleanup() {
    const vmIds = Array.from(this.vms.keys());
    
    for (const vmId of vmIds) {
      try {
        await this.releaseVM(vmId);
      } catch (err) {
        console.error(`Failed to release VM ${vmId} during cleanup: ${err.message}`);
      }
    }
    
    this.emit('cleanup', { count: vmIds.length });
  }
}

export default VMPool;
