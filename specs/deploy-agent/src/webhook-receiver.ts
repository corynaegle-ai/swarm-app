/**
 * Webhook Receiver - GitHub Webhook Handler with Ticket-Aware Deployment
 * 
 * Determines whether to deploy immediately or queue based on ticket relationships:
 * - Ad-hoc commits (no ticket): Deploy immediately
 * - Standalone tickets (no parent): Deploy immediately  
 * - Child tickets: Wait until all siblings complete, then deploy feature
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Pipeline } from './pipeline';
import { Database } from './db';
import { ticketApi, Ticket } from './ticket-api';
import { logger } from './logger';

// Map GitHub repo names to our service names
const REPO_TO_SERVICE: Record<string, string> = {
  'swarm-dashboard': 'swarm-dashboard',
  'swarm-platform': 'swarm-platform',
  'swarm-mcp-factory': 'swarm-mcp-factory',
  'swarm-verifier': 'swarm-verifier',
  'swarm-tickets': 'swarm-platform',
};

export interface DeployDecision {
  shouldDeploy: boolean;
  reason: string;
  ticket?: Ticket;
  queueId?: string;
  waitingFor?: string[];
}

export class WebhookReceiver {
  private pipeline: Pipeline;
  private db: Database;
  
  constructor(pipeline: Pipeline, db: Database) {
    this.pipeline = pipeline;
    this.db = db;
  }
  
  async handle(req: Request, res: Response): Promise<void> {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body;
    
    logger.info('Received GitHub webhook', { event, repo: payload.repository?.name });
    
    try {
      let shouldProcess = false;
      let commitSha = '';
      let triggeredBy = '';
      let repoName = '';
      let prNumber: number | undefined;
      let prTitle = '';
      
      if (event === 'push' && payload.ref === `refs/heads/${payload.repository?.default_branch || 'main'}`) {
        shouldProcess = true;
        commitSha = payload.after;
        triggeredBy = payload.pusher?.name || 'unknown';
        repoName = payload.repository?.name;
        
      } else if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request?.merged) {
        shouldProcess = true;
        commitSha = payload.pull_request?.merge_commit_sha;
        triggeredBy = payload.pull_request?.merged_by?.login || 'unknown';
        repoName = payload.repository?.name;
        prNumber = payload.pull_request?.number;
        prTitle = payload.pull_request?.title || '';
      }
      
      if (!shouldProcess || !repoName) {
        res.json({ accepted: false, reason: 'Event type not handled' });
        return;
      }
      
      const service = REPO_TO_SERVICE[repoName];
      if (!service) {
        logger.warn('No service mapping for repository', { repoName });
        res.json({ accepted: false, reason: 'No service mapping' });
        return;
      }
      
      // Make ticket-aware deployment decision
      const decision = await this.makeDeployDecision(commitSha, repoName, prNumber, prTitle);
      
      logger.info('Deploy decision', { 
        commitSha: commitSha.slice(0, 7), 
        decision: decision.shouldDeploy ? 'DEPLOY_NOW' : 'QUEUED',
        reason: decision.reason 
      });
      
      if (decision.shouldDeploy) {
        const deploymentId = await this.pipeline.trigger({
          service,
          commit_sha: commitSha,
          triggered_by: triggeredBy,
          trigger_type: decision.ticket ? 'ticket_complete' : 'webhook'
        });
        
        res.json({ 
          accepted: true, 
          action: 'deploying',
          deployment_id: deploymentId,
          reason: decision.reason
        });
        
      } else {
        // Queue for later deployment
        const queueId = uuidv4();
        this.db.addToQueue({
          id: queueId,
          ticket_id: decision.ticket!.id,
          parent_ticket_id: decision.ticket!.parent_id,
          commit_sha: commitSha,
          repo: repoName,
          service,
          pr_number: prNumber,
          waiting_for: decision.waitingFor || []
        });
        
        res.json({ 
          accepted: true, 
          action: 'queued',
          queue_id: queueId,
          reason: decision.reason,
          waiting_for: decision.waitingFor
        });
      }
      
    } catch (error) {
      logger.error('Webhook processing failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Determine whether to deploy immediately or queue based on ticket status
   */
  private async makeDeployDecision(
    commitSha: string, 
    repoName: string, 
    prNumber?: number,
    prTitle?: string
  ): Promise<DeployDecision> {
    
    // Try to find linked ticket
    let ticket: Ticket | null = null;
    
    // Method 1: Check PR title for ticket ID (e.g., "[TICKET-123] Fix bug")
    if (prTitle) {
      const ticketIdMatch = prTitle.match(/\[([A-Z]+-\d+|[a-f0-9-]{36})\]/i);
      if (ticketIdMatch) {
        ticket = await ticketApi.getTicket(ticketIdMatch[1]);
      }
    }
    
    // Method 2: Look up by commit SHA
    if (!ticket) {
      ticket = await ticketApi.findByCommit(commitSha);
    }
    
    // Method 3: Look up by PR number
    if (!ticket && prNumber) {
      ticket = await ticketApi.findByPR(repoName, prNumber);
    }
    
    // Method 4: Check our local commit-ticket map
    if (!ticket) {
      const mapping = this.db.getTicketForCommit(commitSha);
      if (mapping) {
        ticket = await ticketApi.getTicket(mapping.ticket_id);
      }
    }
    
    // CASE 1: No ticket linked - ad-hoc change, deploy immediately
    if (!ticket) {
      return {
        shouldDeploy: true,
        reason: 'Ad-hoc change (no ticket linked) - deploying immediately'
      };
    }
    
    // CASE 2: Ticket has no parent - standalone task, deploy immediately
    if (!ticket.parent_id) {
      return {
        shouldDeploy: true,
        reason: `Standalone ticket ${ticket.id} - deploying immediately`,
        ticket
      };
    }
    
    // CASE 3: Ticket has parent - check if all siblings are complete
    const relationship = await ticketApi.getRelationship(ticket.id);
    
    if (!relationship) {
      // Couldn't fetch relationship, default to deploy
      logger.warn('Could not fetch ticket relationship, defaulting to deploy', { ticketId: ticket.id });
      return {
        shouldDeploy: true,
        reason: 'Could not verify ticket relationships - deploying immediately',
        ticket
      };
    }
    
    if (relationship.isFeatureComplete) {
      return {
        shouldDeploy: true,
        reason: `Feature complete! All ${relationship.siblings.length} sibling tickets done - deploying feature`,
        ticket
      };
    }
    
    // Feature not complete - queue this deployment
    const waitingFor = relationship.incompleteSiblings.map(s => s.id);
    return {
      shouldDeploy: false,
      reason: `Waiting for ${waitingFor.length} sibling ticket(s) to complete`,
      ticket,
      waitingFor
    };
  }
}
