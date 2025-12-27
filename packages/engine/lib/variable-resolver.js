/**
 * Swarm Variable Resolver
 * Resolves ${...} variables in workflow definitions
 * Supports: trigger.*, config.*, secrets.*, steps.*.outputs.*, variables.*
 */

/**
 * Get a nested value from an object using dot notation
 * @param {object} obj - Object to traverse
 * @param {string} path - Dot-separated path (e.g., "steps.step1.outputs.result")
 * @returns {*} The value at the path, or undefined
 */
export function getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        current = current[part];
    }
    
    return current;
}

/**
 * Resolve all ${...} variables in a template
 * @param {*} template - String, object, or array containing variables
 * @param {object} context - Context object with trigger, steps, variables, etc.
 * @returns {*} Template with variables resolved
 */
export function resolveVariables(template, context) {
    if (typeof template === 'string') {
        // Handle full variable replacement (entire string is a variable)
        const fullMatch = template.match(/^\$\{([^}]+)\}$/);
        if (fullMatch) {
            const value = getNestedValue(context, fullMatch[1].trim());
            // Return the actual value (preserves type for objects/arrays)
            return value !== undefined ? value : template;
        }
        
        // Handle embedded variables (variables within a string)
        return template.replace(/\$\{([^}]+)\}/g, (match, path) => {
            const value = getNestedValue(context, path.trim());
            if (value === undefined) return match;
            // Convert objects/arrays to JSON string when embedded
            if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            return String(value);
        });
    }
    
    if (Array.isArray(template)) {
        return template.map(item => resolveVariables(item, context));
    }
    
    if (typeof template === 'object' && template !== null) {
        const resolved = {};
        for (const [key, value] of Object.entries(template)) {
            resolved[key] = resolveVariables(value, context);
        }
        return resolved;
    }
    
    // Return primitives as-is
    return template;
}

/**
 * Evaluate a condition expression
 * Supports simple comparisons and boolean logic
 * @param {string} condition - Condition expression (e.g., "${steps.step1.status} == 'completed'")
 * @param {object} context - Context object
 * @returns {boolean} Result of evaluation
 */
export function evaluateCondition(condition, context) {
    if (!condition) return true;
    
    // First resolve any variables in the condition
    let resolved = resolveVariables(condition, context);
    
    // If it resolved to a boolean, return it
    if (typeof resolved === 'boolean') return resolved;
    
    // Simple truthy check
    if (typeof resolved !== 'string') return Boolean(resolved);
    
    // Parse simple comparison operators
    const comparisons = [
        { op: '===', fn: (a, b) => a === b },
        { op: '!==', fn: (a, b) => a !== b },
        { op: '==', fn: (a, b) => a == b },
        { op: '!=', fn: (a, b) => a != b },
        { op: '>=', fn: (a, b) => parseFloat(a) >= parseFloat(b) },
        { op: '<=', fn: (a, b) => parseFloat(a) <= parseFloat(b) },
        { op: '>', fn: (a, b) => parseFloat(a) > parseFloat(b) },
        { op: '<', fn: (a, b) => parseFloat(a) < parseFloat(b) },
    ];
    
    for (const { op, fn } of comparisons) {
        if (resolved.includes(op)) {
            const [left, right] = resolved.split(op).map(s => s.trim().replace(/^['"]|['"]$/g, ''));
            return fn(left, right);
        }
    }
    
    // Boolean keywords
    if (resolved.toLowerCase() === 'true') return true;
    if (resolved.toLowerCase() === 'false') return false;
    
    // Truthy string evaluation
    return Boolean(resolved && resolved !== '0' && resolved !== 'null' && resolved !== 'undefined');
}

/**
 * Build execution context for variable resolution
 * @param {object} options - Context building options
 * @returns {object} Execution context
 */
export function buildContext(options = {}) {
    const {
        trigger = {},
        variables = {},
        steps = {},
        config = {},
        secrets = {},
        env = {},
        run = {}
    } = options;
    
    return {
        trigger,
        variables,
        steps,
        config,
        secrets,
        env: { ...process.env, ...env },
        run,
        // Convenience aliases
        input: trigger,
        outputs: steps
    };
}

export default {
    resolveVariables,
    evaluateCondition,
    getNestedValue,
    buildContext
};
