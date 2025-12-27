/**
 * Swarm Deploy Agent - Entry Point
 * 
 * Autonomous CI/CD orchestrator with ticket-aware deployment logic.
 * Listens for GitHub webhooks and deploys services to dev environment.
 * 
 * Deployment Decision Logic:
 * - Ad-hoc commits (no ticket): Deploy immediately
 * - Standalone tickets: Deploy immediately
 * - Child tickets: Queue until all siblings complete, then deploy feature
 */

import express from 'express';
import { WebhookReceiver } from './webhook-receiver';
import { Pipeline } from './pipeline';
import { QueueProcessor } from './queue-processor';
import { ManifestLoader } from './manifest-loader';
import { Database } from './db';
import { logger } from './logger';

const PORT = process.env.DEPLOY_AGENT_PORT || 3457;
const MANIFESTS_DIR = process.env.MANIFESTS_DIR || '/opt/swarm-app/apps/agents/deploy/manifests';
const DB_PATH = process.env.DB_PATH || '/opt/swarm-app/apps/agents/deploy/data/deployments.db';

async function main() {
  logger.info('Starting Swarm Deploy Agent...');

  // Initialize database
  const db = new Database(DB_PATH);
  await db.initialize();

  // Load service manifests
  const manifestLoader = new ManifestLoader(MANIFESTS_DIR);
  const manifests = await manifestLoader.loadAll();
  logger.info(`Loaded ${Object.keys(manifests).length} service manifests`);

  // Initialize pipeline
  const pipeline = new Pipeline(db, manifests);

  // Initialize queue processor
  const queueProcessor = new QueueProcessor(db, pipeline);

  // Initialize webhook receiver
  const webhookReceiver = new WebhookReceiver(pipeline, db);

  // Create Express app
  const app = express();
  app.use(express.json());

  // ==================== Health & Info ====================

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'deploy-agent',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // ==================== GitHub Webhooks ====================

  app.post('/api/webhooks/github', webhookReceiver.handle.bind(webhookReceiver));

  // ==================== Manual Deployment ====================

  app.post('/api/deploy/:service', async (req, res) => {
    const { service } = req.params;
    const { commit_sha, triggered_by } = req.body;

    try {
      const deploymentId = await pipeline.trigger({
        service,
        commit_sha: commit_sha || 'HEAD',
        triggered_by: triggered_by || 'manual',
        trigger_type: 'manual'
      });
      res.json({ success: true, deployment_id: deploymentId });
    } catch (error) {
      logger.error('Manual deployment failed', { service, error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== Ticket Callbacks ====================

  // Called by Swarm Ticket API when a ticket status changes
  app.post('/api/callbacks/ticket-complete', async (req, res) => {
    const { ticket_id, status } = req.body;

    if (!ticket_id) {
      return res.status(400).json({ error: 'ticket_id required' });
    }

    if (status !== 'completed' && status !== 'done') {
      return res.json({ processed: false, reason: 'Not a completion event' });
    }

    try {
      const result = await queueProcessor.onTicketComplete(ticket_id);
      res.json({
        processed: true,
        deployed: result.deployed,
        still_waiting: result.stillWaiting
      });
    } catch (error) {
      logger.error('Ticket callback failed', { ticket_id, error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // Force deploy all queued items for a parent ticket (feature)
  app.post('/api/deploy-feature/:parentTicketId', async (req, res) => {
    const { parentTicketId } = req.params;

    try {
      const result = await queueProcessor.deployFeature(parentTicketId);
      res.json({
        success: true,
        deployed: result.deployed,
        failed: result.failed
      });
    } catch (error) {
      logger.error('Feature deployment failed', { parentTicketId, error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== Deployments ====================

  app.get('/api/deployments', (req, res) => {
    const deployments = db.listDeployments(50);
    res.json({ deployments });
  });

  app.get('/api/deployments/:id', (req, res) => {
    const deployment = db.getDeployment(req.params.id);
    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }
    res.json({ deployment });
  });

  // ==================== Queue Management ====================

  app.get('/api/queue', (req, res) => {
    const summary = queueProcessor.getQueueSummary();
    res.json(summary);
  });

  app.get('/api/queue/:id', (req, res) => {
    const item = db.getQueueItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Queue item not found' });
    }
    res.json({ item });
  });

  // ==================== Manifests ====================

  app.get('/api/manifests', (req, res) => {
    res.json({ manifests: Object.keys(manifests) });
  });

  app.get('/api/manifests/:service', (req, res) => {
    const manifest = manifests[req.params.service];
    if (!manifest) {
      return res.status(404).json({ error: 'Manifest not found' });
    }
    res.json({ manifest });
  });

  // ==================== Commit-Ticket Linking ====================

  // Manually link a commit to a ticket (for ad-hoc linking)
  app.post('/api/link-commit', (req, res) => {
    const { commit_sha, ticket_id, repo, pr_number } = req.body;

    if (!commit_sha || !ticket_id || !repo) {
      return res.status(400).json({ error: 'commit_sha, ticket_id, and repo required' });
    }

    try {
      db.mapCommitToTicket(commit_sha, ticket_id, repo, pr_number);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Start Server ====================

  app.listen(PORT, () => {
    logger.info(`Deploy Agent listening on port ${PORT}`);
    logger.info('Endpoints:');
    logger.info('  POST /api/webhooks/github - GitHub webhook receiver');
    logger.info('  POST /api/deploy/:service - Manual deployment');
    logger.info('  POST /api/callbacks/ticket-complete - Ticket completion callback');
    logger.info('  POST /api/deploy-feature/:parentTicketId - Force deploy feature');
    logger.info('  GET  /api/deployments - List deployments');
    logger.info('  GET  /api/queue - View deployment queue');
    logger.info('  GET  /api/manifests - List service manifests');
  });
}

main().catch((error) => {
  logger.error('Failed to start Deploy Agent', { error: error.message });
  process.exit(1);
});
