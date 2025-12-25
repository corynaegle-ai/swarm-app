import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/connection.js';
import { startWorker } from './engine/queue.js';
import flowsRouter from './routes/flows.js';
import executionsRouter from './routes/executions.js';
import webhooksRouter from './routes/webhooks.js';

// Register all steps
import './steps/triggers/manual.js';
import './steps/triggers/webhook.js';
import './steps/integrations/http-request.js';
import './steps/logic/delay.js';

const app = express();
const PORT = process.env.PORT || 3501;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'swarm-orchestrator-api', db: 'postgresql', timestamp: new Date().toISOString() });
});

app.use('/api/flows', flowsRouter);
app.use('/api/runs', executionsRouter);
app.use('/api/webhooks', webhooksRouter);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

async function start() {
  try {
    await initializeDatabase();
    startWorker();
    app.listen(PORT, () => {
      console.log(`[API] Swarm Orchestrator API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start:', err);
    process.exit(1);
  }
}

start();
