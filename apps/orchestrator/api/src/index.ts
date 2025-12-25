import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './db/connection.js';
import flowsRouter from './routes/flows.js';
import executionsRouter from './routes/executions.js';
import webhooksRouter from './routes/webhooks.js';

const app = express();
const PORT = process.env.PORT || 3501;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'swarm-orchestrator-api', db: 'postgresql', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/flows', flowsRouter);
app.use('/api/runs', executionsRouter);
app.use('/api/webhooks', webhooksRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

// Initialize and start
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`[API] Swarm Orchestrator API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start:', err);
    process.exit(1);
  }
}

start();
