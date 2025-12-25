import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { registry } from '../steps/registry.js';
import type { FlowDefinition, FlowNode, FlowEdge, ExecutionContext, StepExecuteResult } from '../types/index.js';

export async function executeFlow(executionId: string, flowId: string): Promise<void> {
  // Load flow definition
  const flowResult = await db.query('SELECT definition FROM flows WHERE id = $1', [flowId]);
  if (flowResult.rows.length === 0) throw new Error('Flow not found');
  
  const definition: FlowDefinition = flowResult.rows[0].definition;
  const { nodes, edges } = definition;

  // Load trigger data
  const execResult = await db.query('SELECT trigger_data FROM executions WHERE id = $1', [executionId]);
  const triggerData = execResult.rows[0]?.trigger_data || {};

  // Build execution context
  const context: ExecutionContext = {
    executionId,
    flowId,
    variables: { triggerData },
    previousOutputs: {}
  };

  // Find start node (node with no incoming edges)
  const targetNodeIds = new Set(edges.map(e => e.target));
  const startNode = nodes.find(n => !targetNodeIds.has(n.id));
  if (!startNode) throw new Error('No start node found');

  // Execute nodes in topological order
  const executed = new Set<string>();
  const nodeQueue = [startNode];

  while (nodeQueue.length > 0) {
    const node = nodeQueue.shift()!;
    if (executed.has(node.id)) continue;

    // Check if all dependencies are satisfied
    const incomingEdges = edges.filter(e => e.target === node.id);
    const allDepsExecuted = incomingEdges.every(e => executed.has(e.source));
    if (!allDepsExecuted) {
      nodeQueue.push(node);
      continue;
    }

    // Update current node
    await db.query(`UPDATE executions SET current_node_id = $1 WHERE id = $2`, [node.id, executionId]);

    // Execute step
    const result = await executeStep(node, context, executionId);
    
    if (!result.success) {
      await db.query(
        `UPDATE executions SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
        [result.error || 'Step failed', executionId]
      );
      return;
    }

    if (result.suspend) {
      await db.query(`UPDATE executions SET status = 'suspended' WHERE id = $1`, [executionId]);
      return;
    }

    // Store outputs for next steps
    context.previousOutputs[node.id] = result.outputs;
    executed.add(node.id);

    // Queue next nodes
    const outgoingEdges = edges.filter(e => e.source === node.id);
    for (const edge of outgoingEdges) {
      const nextNode = nodes.find(n => n.id === edge.target);
      if (nextNode && !executed.has(nextNode.id)) {
        nodeQueue.push(nextNode);
      }
    }
  }

  // Mark complete
  await db.query(
    `UPDATE executions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
    [executionId]
  );
  console.log(`[EXECUTOR] Flow ${flowId} execution ${executionId} completed`);
}

async function executeStep(node: FlowNode, context: ExecutionContext, executionId: string): Promise<StepExecuteResult> {
  const stepType = node.data.label; // Using label as step type for now
  const step = registry.get(stepType);
  
  const resultId = uuidv4();
  const startedAt = new Date();

  // Log step start
  await db.query(
    `INSERT INTO step_results (id, execution_id, node_id, step_type, inputs, status, started_at) 
     VALUES ($1, $2, $3, $4, $5, 'running', $6)`,
    [resultId, executionId, node.id, stepType, JSON.stringify(node.data.config || {}), startedAt]
  );

  try {
    let result: StepExecuteResult;
    
    if (step) {
      result = await step.execute(node.data.config || {}, context);
    } else {
      // Unknown step type - pass through
      result = { success: true, outputs: { passthrough: true } };
      console.warn(`[EXECUTOR] Unknown step type: ${stepType}, passing through`);
    }

    // Log step complete
    await db.query(
      `UPDATE step_results SET status = $1, outputs = $2, completed_at = NOW(), error = $3 WHERE id = $4`,
      [result.success ? 'completed' : 'failed', JSON.stringify(result.outputs), result.error || null, resultId]
    );

    return result;
  } catch (e) {
    const error = (e as Error).message;
    await db.query(
      `UPDATE step_results SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
      [error, resultId]
    );
    return { success: false, outputs: {}, error };
  }
}
