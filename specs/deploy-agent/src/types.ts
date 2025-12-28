/**
 * Type Definitions for Deploy Agent
 */

export interface ServiceManifest {
  service: {
    name: string;
    description: string;
    pm2_name: string;
    port: number;
  };
  repository: {
    path: string;
    github: string;
    branch: string;
  };
  environment: {
    target: 'dev' | 'prod';
    droplet_ip: string;
  };
  build: {
    pre_checks?: string[];
    commands: string[];
    timeout: number;
    working_dir?: string;
  };
  deploy: {
    strategy: 'rolling' | 'replace';
    commands: string[];
    timeout: number;
  };
  health_check: {
    endpoint: string;
    method: string;
    expected_status: number;
    timeout: number;
    retries: number;
    retry_delay: number;
  };
  rollback: {
    enabled: boolean;
    strategy: string;
    commands: string[];
  };
  dependencies?: {
    services: string[];
    env_vars: string[];
  };
  notifications?: {
    on_success: boolean;
    on_failure: boolean;
    create_ticket: boolean;
  };
}

export interface DeploymentTrigger {
  service: string;
  commit_sha: string;
  triggered_by: string;
  trigger_type: 'webhook' | 'manual' | 'ticket_complete' | 'feature_complete';
}

export type DeploymentStatus = 
  | 'pending'
  | 'preparing'
  | 'building' 
  | 'deploying'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'rolled_back';

export type QueueStatus = 'waiting' | 'ready' | 'deployed' | 'failed';

export interface QueueItem {
  id: string;
  ticket_id: string;
  parent_ticket_id: string | null;
  commit_sha: string;
  repo: string;
  service: string;
  pr_number?: number;
  status: QueueStatus;
  waiting_for: string[];  // Ticket IDs we're waiting on
  queued_at: string;
  deployed_at?: string;
}

export interface DeployDecision {
  shouldDeploy: boolean;
  reason: string;
  ticket?: {
    id: string;
    title: string;
    status: string;
    parent_id: string | null;
  };
  queueId?: string;
  waitingFor?: string[];
}

export interface TicketCompletionPayload {
  ticket_id: string;
  status: string;
  completed_at?: string;
  parent_id?: string;
}
