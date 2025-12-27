/**
 * Swarm Execution Engine
 * Main orchestration loop that connects VM spawning, agent registry,
 * workflow definitions, and ticket system into a functioning system.
 */
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { VMPool } from './vm-pool.js';
import { ArtifactStore, ARTIFACT_TYPE } from './artifact-store.js';
import { StepSequencer, STEP_STATE } from './sequencer.js';

// Engine states
const ENGINE_STATE = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
};

// Ticket states (mirror from ticket store)
const TICKET_STATE = {
  READY: 'ready',
  BLOCKED: 'blocked',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  DONE: 'done'
};

export class SwarmEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      maxConcurrentVMs: config.maxVMs || 10,
      pollIntervalMs: config.pollInterval || 5000,
      stepTimeoutMs: config.stepTimeout || 300000,   // 5 min default
      vmBootTimeoutMs: config.vmBootTimeout || 30000, // 30s
      backoffMultiplier: config.backoffMultiplier || 1.5,
      maxBackoffMs: config.maxBackoff || 60000,
      registryDb: config.registryDb || '/opt/swarm-registry/registry.db',
      ticketDb: config.ticketDb || '/opt/swarm-tickets/data/swarm.db',
      logFile: config.logFile || '/var/log/swarm/engine.log',
      ...config
    };

    // State tracking
    this.state = ENGINE_STATE.STOPPED;
    this.currentBackoff = this.config.pollIntervalMs;
    this.activeExecutions = new Map();
    this.stats = {
      ticketsProcessed: 0,
      ticketsSucceeded: 0,
      ticketsFailed: 0,
      totalVmTime: 0,
      startedAt: null
    };
    
    // Components
    this.registryDb = null;
    this.ticketDb = null;
    this.vmPool = null;
    this.artifactStore = null;
    this.sequencer = null;
    
    // Control
    this.pollTimer = null;
    this.shuttingDown = false;
  }

  /**
   * Initialize engine components
   */
  async init() {
    this.log('info', 'Initializing Swarm Engine...');
    
    // Initialize databases
    this.registryDb = new Database(this.config.registryDb, { readonly: false });
    this.registryDb.pragma('journal_mode = WAL');
    
    this.ticketDb = new Database(this.config.ticketDb, { readonly: false });
    this.ticketDb.pragma('journal_mode = WAL');
    
    // Initialize VM Pool
    this.vmPool = new VMPool({
      maxVMs: this.config.maxConcurrentVMs,
      vmTimeout: this.config.vmBootTimeoutMs
    });
    await this.vmPool.init();
    
    // Initialize Artifact Store
    this.artifactStore = new ArtifactStore();
    this.artifactStore.init();
    
    // Initialize Sequencer
    this.sequencer = new StepSequencer({
      defaultTimeout: this.config.stepTimeoutMs
    });
    
    // Ensure schema additions
    this.ensureSchema();
    
    this.log('info', 'Engine initialized');
    this.emit('init');
  }
