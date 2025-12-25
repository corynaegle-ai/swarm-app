import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

// Get execution details
router.get('/:id', async (req, res) => {
  try {
    const execution = await db.query('SELECT * FROM executions WHERE id = $1', [req.params.id]);
    if (execution.rows.length === 0) return res.status(404).json({ error: 'Execution not found' });
    
    const stepResults = await db.query(`
      SELECT * FROM step_results WHERE execution_id = $1 ORDER BY started_at ASC
    `, [req.params.id]);
    
    res.json({
      ...execution.rows[0],
      steps: stepResults.rows
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Resume suspended execution
router.post('/:id/resume', async (req, res) => {
  try {
    const execution = await db.query('SELECT * FROM executions WHERE id = $1', [req.params.id]);
    if (execution.rows.length === 0) return res.status(404).json({ error: 'Execution not found' });
    if (execution.rows[0].status !== 'suspended') {
      return res.status(400).json({ error: 'Execution is not suspended' });
    }
    
    await db.query(`UPDATE executions SET status = 'running' WHERE id = $1`, [req.params.id]);
    // TODO: Queue resumed execution via BullMQ with resumeData
    res.json({ success: true, status: 'running' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Cancel execution
router.post('/:id/cancel', async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE executions SET status = 'failed', error = 'Cancelled by user', completed_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'running', 'suspended')
    `, [req.params.id]);
    
    if (result.rowCount === 0) return res.status(400).json({ error: 'Cannot cancel execution' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
