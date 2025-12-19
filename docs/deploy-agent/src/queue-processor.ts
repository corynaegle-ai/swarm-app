/**
 * Queue Processor - Handles Queued Deployments When Features Complete
 * 
 * When a ticket completes, checks if any queued deployments are now ready
 * to deploy (all siblings complete).
 */

import { Database } from './db';
import { Pipeline } from './pipeline';
import { ticketApi } from './ticket-api';
import { logger } from './logger';

export class QueueProcessor {
  private db: Database;
  private pipeline: Pipeline;
  
  constructor(db: Database, pipeline: Pipeline) {
    this.db = db;
    this.pipeline = pipeline;
  }
  
  /**
   * Called when a ticket status changes to 'completed' or 'done'
   * Checks if any queued deployments are now ready to deploy
   */
  async onTicketComplete(ticketId: string): Promise<{ deployed: number; stillWaiting: number }> {
    logger.info('Processing ticket completion', { ticketId });
    
    // Find queued deployments that were waiting on this ticket
    const waitingItems = this.db.getQueuedWaitingFor(ticketId);
    
    if (waitingItems.length === 0) {
      logger.debug('No queued deployments waiting for this ticket', { ticketId });
      return { deployed: 0, stillWaiting: 0 };
    }
    
    let deployed = 0;
    let stillWaiting = 0;
    
    for (const item of waitingItems) {
      const isReady = await this.checkIfReady(item);
      
      if (isReady) {
        await this.deployQueuedItem(item);
        deployed++;
      } else {
        stillWaiting++;
      }
    }
    
    logger.info('Queue processing complete', { ticketId, deployed, stillWaiting });
    return { deployed, stillWaiting };
  }
  
  /**
   * Check if a queued deployment is ready (all siblings complete)
   */
  private async checkIfReady(queueItem: any): Promise<boolean> {
    if (!queueItem.parent_ticket_id) {
      // No parent means standalone, should have deployed immediately
      // But if it's queued, deploy it now
      return true;
    }
    
    // Get all siblings of this ticket
    const siblings = await ticketApi.getChildren(queueItem.parent_ticket_id);
    
    // Check if all siblings are complete
    const allComplete = siblings.every(s => 
      s.status === 'completed' || s.status === 'done'
    );
    
    if (allComplete) {
      logger.info('Feature complete, all siblings done', { 
        parentTicketId: queueItem.parent_ticket_id,
        siblingCount: siblings.length
      });
    } else {
      const incomplete = siblings.filter(s => 
        s.status !== 'completed' && s.status !== 'done'
      );
      logger.debug('Feature not yet complete', {
        parentTicketId: queueItem.parent_ticket_id,
        incompleteCount: incomplete.length,
        incompleteIds: incomplete.map(s => s.id)
      });
    }
    
    return allComplete;
  }
  
  /**
   * Deploy a queued item
   */
  private async deployQueuedItem(queueItem: any): Promise<void> {
    logger.info('Deploying queued item', { 
      queueId: queueItem.id,
      service: queueItem.service,
      ticketId: queueItem.ticket_id
    });
    
    try {
      await this.pipeline.trigger({
        service: queueItem.service,
        commit_sha: queueItem.commit_sha,
        triggered_by: 'queue_processor',
        trigger_type: 'feature_complete'
      });
      
      this.db.updateQueueStatus(queueItem.id, 'deployed');
      
    } catch (error) {
      logger.error('Failed to deploy queued item', { 
        queueId: queueItem.id, 
        error: error.message 
      });
      this.db.updateQueueStatus(queueItem.id, 'failed');
    }
  }
  
  /**
   * Manually trigger deployment of all ready items for a parent ticket
   * Useful when we want to force-deploy a feature
   */
  async deployFeature(parentTicketId: string): Promise<{ deployed: number; failed: number }> {
    logger.info('Force deploying feature', { parentTicketId });
    
    const queuedItems = this.db.getQueuedByParent(parentTicketId);
    
    let deployed = 0;
    let failed = 0;
    
    for (const item of queuedItems) {
      try {
        await this.deployQueuedItem(item);
        deployed++;
      } catch (error) {
        failed++;
      }
    }
    
    return { deployed, failed };
  }
  
  /**
   * Get queue status summary
   */
  getQueueSummary(): { waiting: number; deployed: number; failed: number; items: any[] } {
    const all = this.db.listQueue();
    
    return {
      waiting: all.filter(i => i.status === 'waiting').length,
      deployed: all.filter(i => i.status === 'deployed').length,
      failed: all.filter(i => i.status === 'failed').length,
      items: all
    };
  }
}
