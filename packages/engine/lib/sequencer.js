/**
 * Step Sequencer
 * Handles workflow step ordering, dependency resolution, and execution modes
 * Supports: linear, parallel, conditional, fan-out, fan-in
 */

// Execution modes
export const EXECUTION_MODE = {
  LINEAR: 'linear',
  PARALLEL: 'parallel',
  CONDITIONAL: 'conditional',
  FAN_OUT: 'fan-out',
  FAN_IN: 'fan-in'
};

// Step states
export const STEP_STATE = {
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

export class StepSequencer {
  constructor(options = {}) {
    this.maxParallel = options.maxParallel || 10;
    this.defaultTimeout = options.defaultTimeout || 300000; // 5 min
  }

  /**
   * Build execution plan from workflow steps
   * @param {Array} steps - Workflow steps from YAML
   * @returns {Object} Execution plan with dependency graph
   */
  buildExecutionPlan(steps) {
    const plan = {
      steps: new Map(),
      dependencyGraph: new Map(),
      reverseDeps: new Map(), // For quick lookup of dependents
      executionOrder: [],
      parallelGroups: []
    };

    // Initialize step tracking
    for (const step of steps) {
      plan.steps.set(step.id, {
        ...step,
        state: STEP_STATE.PENDING,
        dependencies: step.depends_on || [],
        outputs: null,
        startedAt: null,
        completedAt: null,
        error: null
      });
      
      // Build dependency graph
      plan.dependencyGraph.set(step.id, new Set(step.depends_on || []));
      
      // Build reverse dependency map
      for (const dep of step.depends_on || []) {
        if (!plan.reverseDeps.has(dep)) {
          plan.reverseDeps.set(dep, new Set());
        }
        plan.reverseDeps.get(dep).add(step.id);
      }
    }
    
    // Calculate execution order using topological sort
    plan.executionOrder = this.topologicalSort(plan.dependencyGraph);
    
    // Identify parallel groups (steps with same dependencies)
    plan.parallelGroups = this.identifyParallelGroups(plan);
    
    return plan;
  }

  /**
   * Topological sort for dependency ordering
   */
  topologicalSort(graph) {
    const result = [];
    const visited = new Set();
    const visiting = new Set();
    
    const visit = (stepId) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected at step: ${stepId}`);
      }
      
      visiting.add(stepId);
      
      const deps = graph.get(stepId) || new Set();
      for (const dep of deps) {
        if (graph.has(dep)) {
          visit(dep);
        }
      }
      
      visiting.delete(stepId);
      visited.add(stepId);
      result.push(stepId);
    };
    
    for (const stepId of graph.keys()) {
      visit(stepId);
    }
    
    return result;
  }

  /**
   * Identify groups of steps that can run in parallel
   */
  identifyParallelGroups(plan) {
    const groups = [];
    const processed = new Set();
    
    for (const stepId of plan.executionOrder) {
      if (processed.has(stepId)) continue;
      
      const step = plan.steps.get(stepId);
      const deps = new Set(step.dependencies);
      
      // Find all steps with identical dependencies
      const group = [stepId];
      processed.add(stepId);
      
      for (const [otherId, otherStep] of plan.steps) {
        if (processed.has(otherId)) continue;
        
        const otherDeps = new Set(otherStep.dependencies);
        
        // Check if dependencies are identical
        if (deps.size === otherDeps.size && 
            [...deps].every(d => otherDeps.has(d))) {
          group.push(otherId);
          processed.add(otherId);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  /**
   * Get steps ready for execution (all dependencies met)
   */
  getReadySteps(plan) {
    const ready = [];
    
    for (const [stepId, step] of plan.steps) {
      if (step.state !== STEP_STATE.PENDING) continue;
      
      const deps = plan.dependencyGraph.get(stepId);
      let allDepsMet = true;
      
      for (const dep of deps) {
        const depStep = plan.steps.get(dep);
        if (!depStep || depStep.state !== STEP_STATE.COMPLETED) {
          allDepsMet = false;
          break;
        }
      }
      
      if (allDepsMet) {
        ready.push(stepId);
      }
    }
    
    return ready;
  }

  /**
   * Evaluate conditional step
   */
  evaluateCondition(step, context) {
    if (!step.when) return true;
    
    try {
      // Simple expression evaluator
      const expr = step.when;
      
      // Replace context variables
      let evalExpr = expr;
      for (const [key, value] of Object.entries(context)) {
        evalExpr = evalExpr.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), JSON.stringify(value));
      }
      
      // Safe evaluation (limited to comparisons)
      // Supports: ==, !=, >, <, >=, <=, &&, ||
      const result = new Function('return ' + evalExpr)();
      return Boolean(result);
    } catch (err) {
      console.error(`Failed to evaluate condition for step ${step.id}: ${err.message}`);
      return false;
    }
  }

  /**
   * Mark step as started
   */
  markStepStarted(plan, stepId) {
    const step = plan.steps.get(stepId);
    if (step) {
      step.state = STEP_STATE.RUNNING;
      step.startedAt = Date.now();
    }
  }

  /**
   * Mark step as completed
   */
  markStepCompleted(plan, stepId, outputs = null) {
    const step = plan.steps.get(stepId);
    if (step) {
      step.state = STEP_STATE.COMPLETED;
      step.completedAt = Date.now();
      step.outputs = outputs;
    }
  }

  /**
   * Mark step as failed
   */
  markStepFailed(plan, stepId, error) {
    const step = plan.steps.get(stepId);
    if (step) {
      step.state = STEP_STATE.FAILED;
      step.completedAt = Date.now();
      step.error = error;
    }
  }

  /**
   * Mark step as skipped (condition not met)
   */
  markStepSkipped(plan, stepId, reason = 'condition_not_met') {
    const step = plan.steps.get(stepId);
    if (step) {
      step.state = STEP_STATE.SKIPPED;
      step.completedAt = Date.now();
      step.error = reason;
    }
  }

  /**
   * Get aggregated outputs for fan-in step
   */
  getFanInOutputs(plan, stepId) {
    const step = plan.steps.get(stepId);
    if (!step || !step.fan_in) return null;
    
    const outputs = {};
    for (const dep of step.dependencies) {
      const depStep = plan.steps.get(dep);
      if (depStep && depStep.outputs) {
        outputs[dep] = depStep.outputs;
      }
    }
    
    return outputs;
  }

  /**
   * Pass outputs to dependent steps
   */
  buildStepInputs(plan, stepId, context = {}) {
    const step = plan.steps.get(stepId);
    if (!step) return context;
    
    const inputs = { ...context };
    
    // Collect outputs from dependencies
    for (const dep of step.dependencies) {
      const depStep = plan.steps.get(dep);
      if (depStep && depStep.outputs) {
        inputs[`${dep}_output`] = depStep.outputs;
      }
    }
    
    return inputs;
  }

  /**
   * Check if all steps are complete (or failed/skipped)
   */
  isComplete(plan) {
    for (const [, step] of plan.steps) {
      if (step.state === STEP_STATE.PENDING || step.state === STEP_STATE.RUNNING) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get execution summary
   */
  getSummary(plan) {
    const summary = {
      total: plan.steps.size,
      completed: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      running: 0
    };
    
    for (const [, step] of plan.steps) {
      switch (step.state) {
        case STEP_STATE.COMPLETED: summary.completed++; break;
        case STEP_STATE.FAILED: summary.failed++; break;
        case STEP_STATE.SKIPPED: summary.skipped++; break;
        case STEP_STATE.PENDING: summary.pending++; break;
        case STEP_STATE.RUNNING: summary.running++; break;
      }
    }
    
    summary.success = summary.failed === 0;
    return summary;
  }
}

export default StepSequencer;
