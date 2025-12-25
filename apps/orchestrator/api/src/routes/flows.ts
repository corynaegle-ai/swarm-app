import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';

const router = Router();

// List all flows
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, description, active, created_at, updated_at 
      FROM flows ORDER BY updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get single flow
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM flows WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Flow not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create flow
router.post('/', async (req, res) => {
  try {
    const { name, description, definition } = req.body;
    if (!name || !definition) {
      return res.status(400).json({ error: 'name and definition required' });
    }
    const id = uuidv4();
    await db.query(
      `INSERT INTO flows (id, name, description, definition, active) VALUES ($1, $2, $3, $4, FALSE)`,
      [id, name, description || null, JSON.stringify(definition)]
    );
    res.status(201).json({ id, name, description, active: false });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update flow
router.put('/:id', async (req, res) => {
  try {
    const { name, description, definition, active } = req.body;
    const check = await db.query('SELECT id FROM flows WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Flow not found' });

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    
    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (definition !== undefined) { updates.push(`definition = $${idx++}`); params.push(JSON.stringify(definition)); }
    if (active !== undefined) { updates.push(`active = $${idx++}`); params.push(active); }
    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    await db.query(`UPDATE flows SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete flow
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query('DELETE FROM flows WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Flow not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Trigger execution
router.post('/:id/execute', async (req, res) => {
  try {
    const flow = await db.query('SELECT * FROM flows WHERE id = $1', [req.params.id]);
    if (flow.rows.length === 0) return res.status(404).json({ error: 'Flow not found' });
    
    const execId = uuidv4();
    await db.query(
      `INSERT INTO executions (id, flow_id, status, trigger_data) VALUES ($1, $2, 'pending', $3)`,
      [execId, req.params.id, JSON.stringify(req.body.triggerData || {})]
    );
    
    // TODO: Queue execution via BullMQ
    res.status(202).json({ executionId: execId, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// List flow executions
router.get('/:id/runs', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, status, started_at, completed_at, error 
      FROM executions WHERE flow_id = $1 ORDER BY started_at DESC LIMIT 50
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
