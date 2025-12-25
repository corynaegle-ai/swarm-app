import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';

const router = Router();

// Webhook trigger endpoint
router.post('/:flowId', async (req, res) => {
  try {
    const flow = await db.query('SELECT * FROM flows WHERE id = $1 AND active = TRUE', [req.params.flowId]);
    if (flow.rows.length === 0) {
      return res.status(404).json({ error: 'Flow not found or not active' });
    }
    
    const execId = uuidv4();
    const triggerData = {
      source: 'webhook',
      headers: req.headers,
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    };
    
    await db.query(
      `INSERT INTO executions (id, flow_id, status, trigger_data) VALUES ($1, $2, 'pending', $3)`,
      [execId, req.params.flowId, JSON.stringify(triggerData)]
    );
    
    // TODO: Queue execution via BullMQ
    console.log(`[WEBHOOK] Flow ${req.params.flowId} triggered, execution ${execId}`);
    
    res.status(202).json({ 
      executionId: execId, 
      flowId: req.params.flowId,
      status: 'pending' 
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
