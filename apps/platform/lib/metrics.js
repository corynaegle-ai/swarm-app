/**
 * Prometheus Metrics Module
 * P2-2: Observability - Metrics and Alerting
 */

const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics

// Ticket state gauge - current tickets by state
const ticketsByState = new client.Gauge({
  name: 'swarm_tickets_total',
  help: 'Current count of tickets by state',
  labelNames: ['state'],
  registers: [register]
});

// Ticket processing counter
const ticketsProcessed = new client.Counter({
  name: 'swarm_tickets_processed_total',
  help: 'Total tickets processed by status',
  labelNames: ['status'],
  registers: [register]
});

// State transition duration histogram
const stateTransitionDuration = new client.Histogram({
  name: 'swarm_state_transition_duration_seconds',
  help: 'Duration of ticket state transitions',
  labelNames: ['from_state', 'to_state'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600],
  registers: [register]
});

// Circuit breaker state gauge
const circuitBreakerState = new client.Gauge({
  name: 'swarm_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['agent', 'project'],
  registers: [register]
});

// Active VMs gauge
const activeVMs = new client.Gauge({
  name: 'swarm_vm_active',
  help: 'Current count of active VMs',
  registers: [register]
});

// Error rate gauge (rolling window)
const errorRate = new client.Gauge({
  name: 'swarm_error_rate',
  help: 'Rolling error rate (5 min window)',
  registers: [register]
});

// API request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'swarm_http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Functions to update metrics

function setTicketsByState(stateCounts) {
  // stateCounts: { pending: 5, ready: 3, in_progress: 2, ... }
  const states = ['pending', 'ready', 'in_progress', 'completed', 'failed', 'on_hold', 'blocked'];
  states.forEach(state => {
    ticketsByState.labels(state).set(stateCounts[state] || 0);
  });
}

function incTicketsProcessed(status) {
  // status: 'success' | 'failed' | 'timeout' | 'rejected'
  ticketsProcessed.labels(status).inc();
}

function observeStateTransition(fromState, toState, durationSec) {
  stateTransitionDuration.labels(fromState, toState).observe(durationSec);
}

function setCircuitBreakerState(agent, project, state) {
  // state: 'CLOSED' = 0, 'HALF_OPEN' = 1, 'OPEN' = 2
  const stateMap = { 'CLOSED': 0, 'HALF_OPEN': 1, 'OPEN': 2 };
  circuitBreakerState.labels(agent, project).set(stateMap[state] || 0);
}

function setActiveVMs(count) {
  activeVMs.set(count);
}

function setErrorRate(rate) {
  errorRate.set(rate);
}

function observeHttpRequest(method, route, statusCode, durationSec) {
  httpRequestDuration.labels(method, route, statusCode.toString()).observe(durationSec);
}

// Middleware for Express request timing
function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationSec = Number(end - start) / 1e9;
    
    // Normalize route (replace IDs with :id)
    let route = req.route?.path || req.path || 'unknown';
    route = route.replace(/\/[0-9a-f-]{36}/gi, '/:id');
    route = route.replace(/\/\d+/g, '/:id');
    
    observeHttpRequest(req.method, route, res.statusCode, durationSec);
  });
  
  next();
}

// Get metrics in Prometheus format
async function getMetrics() {
  return await register.metrics();
}

// Get metrics content type
function getContentType() {
  return register.contentType;
}

module.exports = {
  register,
  setTicketsByState,
  incTicketsProcessed,
  observeStateTransition,
  setCircuitBreakerState,
  setActiveVMs,
  setErrorRate,
  observeHttpRequest,
  metricsMiddleware,
  getMetrics,
  getContentType
};
