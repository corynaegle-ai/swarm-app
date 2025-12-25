import { Queue, Worker, type Job } from 'bullmq';
import { db } from '../db/connection.js';
import { executeFlow } from './executor.js';

const connection = { host: 'localhost', port: 6379 };

export const flowQueue = new Queue('flow-executions', { connection });

export function startWorker(): void {
  const worker = new Worker('flow-executions', async (job: Job) => {
    const { executionId, flowId } = job.data as { executionId: string; flowId: string };
    console.log(`[WORKER] Processing execution ${executionId} for flow ${flowId}`);
    
    try {
      await db.query(`UPDATE executions SET status = 'running' WHERE id = $1`, [executionId]);
      await executeFlow(executionId, flowId);
    } catch (e) {
      console.error(`[WORKER] Execution ${executionId} failed:`, e);
      await db.query(
        `UPDATE executions SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
        [(e as Error).message, executionId]
      );
      throw e;
    }
  }, { connection, concurrency: 5 });

  worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job?.id} failed:`, err.message);
  });

  console.log('[WORKER] Flow execution worker started');
}

export async function queueExecution(executionId: string, flowId: string): Promise<void> {
  await flowQueue.add('execute', { executionId, flowId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  });
  console.log(`[QUEUE] Queued execution ${executionId}`);
}
