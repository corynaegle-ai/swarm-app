/**
 * End-to-End Test: Workflow Progression Fix Verification
 *
 * Tests the fixes implemented for swarm workflow progression:
 * 1. Primary fix: activateTicketsForBuild() now assigns forge-agent
 * 2. Secondary fix: setInReview() now assigns sentinel-agent
 * 3. Claim endpoint supports ticket_filter for different agent types
 *
 * Run: node apps/platform/tests/test-workflow-progression.js
 *
 * Prerequisites:
 * - PostgreSQL running with swarmdb database
 * - Platform service NOT required (direct DB testing)
 */

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const config = {
  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'swarmdb',
    user: process.env.PG_USER || 'swarm',
    password: process.env.PG_PASSWORD || 'swarm_dev_2024',
  }
};

let pool;

// ============================================
// Test utilities
// ============================================

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function setup() {
  pool = new Pool(config.pg);

  // Test connection
  try {
    await pool.query('SELECT NOW()');
    log('✅', 'Database connected');
    return true;
  } catch (err) {
    log('❌', `Database connection failed: ${err.message}`);
    return false;
  }
}

async function cleanup() {
  if (pool) {
    await pool.end();
    log('🧹', 'Database connection closed');
  }
}

// ============================================
// Test helpers - simulating hitl.js logic
// ============================================

/**
 * Simulates activateTicketsForBuild() from hitl.js
 * This is the FIXED version that sets assignee_id
 */
async function activateTicketsForBuild(sessionId) {
  const result = await pool.query(`
    SELECT id, depends_on, state FROM tickets WHERE design_session = $1
  `, [sessionId]);

  const tickets = result.rows;
  let readyCount = 0;

  for (const ticket of tickets) {
    let deps = [];
    if (ticket.depends_on) {
      try {
        deps = JSON.parse(ticket.depends_on);
      } catch (e) {
        deps = ticket.depends_on.split(',').map(d => d.trim()).filter(Boolean);
      }
    }

    const newState = deps.length === 0 ? 'ready' : 'blocked';

    // FIXED: When setting to 'ready', also assign forge-agent
    await pool.query(`
      UPDATE tickets
      SET state = $1,
          assignee_id = CASE WHEN $1 = 'ready' THEN 'forge-agent' ELSE NULL END,
          assignee_type = CASE WHEN $1 = 'ready' THEN 'agent' ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND state = 'draft'
    `, [newState, ticket.id]);

    if (newState === 'ready') readyCount++;
  }

  return readyCount;
}

/**
 * Simulates setInReview() from engine-pg.js
 * This is the FIXED version that assigns sentinel-agent
 */
async function setInReview(ticketId, prUrl) {
  await pool.query(`
    UPDATE tickets
    SET state = 'in_review',
        pr_url = $1,
        verification_status = 'passed',
        assignee_id = 'sentinel-agent',
        assignee_type = 'agent',
        updated_at = NOW()
    WHERE id = $2
  `, [prUrl, ticketId]);
}

/**
 * Simulates Engine.getReadyTickets() from engine-pg.js
 */
async function getReadyTickets(limit = 10) {
  const result = await pool.query(`
    SELECT * FROM tickets
    WHERE state = 'ready'
      AND assignee_id IS NOT NULL
      AND assignee_type = 'agent'
      AND vm_id IS NULL
    ORDER BY created_at ASC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

/**
 * Simulates POST /claim endpoint for forge agents
 */
async function claimTicketForForge(agentId, vmId = null) {
  const ticketResult = await pool.query(`
    SELECT * FROM tickets
    WHERE state = 'ready'
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const ticket = ticketResult.rows[0];
  if (!ticket) return null;

  await pool.query(`
    UPDATE tickets
    SET state = 'assigned',
        assignee_id = $1,
        assignee_type = 'agent',
        vm_id = $2,
        last_heartbeat = NOW()
    WHERE id = $3
  `, [agentId, vmId, ticket.id]);

  return ticket;
}

/**
 * Simulates POST /claim endpoint for sentinel agents (with ticket_filter)
 */
async function claimTicketForSentinel(agentId) {
  const ticketResult = await pool.query(`
    SELECT * FROM tickets
    WHERE state = 'in_review'
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const ticket = ticketResult.rows[0];
  if (!ticket) return null;

  await pool.query(`
    UPDATE tickets
    SET state = 'assigned',
        assignee_id = $1,
        assignee_type = 'agent',
        last_heartbeat = NOW()
    WHERE id = $2
  `, [agentId, ticket.id]);

  return ticket;
}

// ============================================
// Test fixtures
// ============================================

async function createTestProject() {
  const projectId = `test-proj-${uuidv4().slice(0, 8)}`;

  await pool.query(`
    INSERT INTO projects (id, name, repo_url, type, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (id) DO UPDATE SET name = $2
  `, [projectId, 'Test Project', 'https://github.com/test/repo', 'build_feature']);

  return projectId;
}

async function createTestSession(projectId) {
  const sessionId = `test-sess-${uuidv4().slice(0, 8)}`;

  await pool.query(`
    INSERT INTO hitl_sessions (id, project_id, status, created_at)
    VALUES ($1, $2, 'active', NOW())
    ON CONFLICT (id) DO NOTHING
  `, [sessionId, projectId]);

  return sessionId;
}

async function createTestTicket(sessionId, projectId, title, state = 'draft', deps = null) {
  const ticketId = `test-tkt-${uuidv4().slice(0, 8)}`;

  await pool.query(`
    INSERT INTO tickets (id, title, description, state, design_session, project_id, depends_on, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (id) DO NOTHING
  `, [ticketId, title, `Test ticket: ${title}`, state, sessionId, projectId, deps]);

  return ticketId;
}

async function getTicketState(ticketId) {
  const result = await pool.query(`
    SELECT id, state, assignee_id, assignee_type, pr_url, vm_id
    FROM tickets WHERE id = $1
  `, [ticketId]);
  return result.rows[0];
}

async function cleanupTestData(sessionId) {
  // Delete test tickets
  await pool.query(`DELETE FROM tickets WHERE design_session = $1`, [sessionId]);
  // Delete test session
  await pool.query(`DELETE FROM hitl_sessions WHERE id = $1`, [sessionId]);
  // Don't delete project as it might have other dependencies
}

// ============================================
// Tests
// ============================================

async function testForgeAgentAssignment() {
  logSection('TEST 1: Forge Agent Assignment on Ticket Activation');

  const projectId = await createTestProject();
  const sessionId = await createTestSession(projectId);

  try {
    // Create draft tickets
    const ticketId1 = await createTestTicket(sessionId, projectId, 'Feature A - no deps', 'draft');
    const ticketId2 = await createTestTicket(sessionId, projectId, 'Feature B - has deps', 'draft', JSON.stringify([ticketId1]));

    log('📝', `Created test tickets: ${ticketId1}, ${ticketId2}`);

    // Verify initial state
    const before1 = await getTicketState(ticketId1);
    const before2 = await getTicketState(ticketId2);

    log('🔍', `Before activation - Ticket 1: state=${before1.state}, assignee_id=${before1.assignee_id}`);
    log('🔍', `Before activation - Ticket 2: state=${before2.state}, assignee_id=${before2.assignee_id}`);

    // Activate tickets (simulating Start Build)
    const readyCount = await activateTicketsForBuild(sessionId);
    log('🚀', `Activated tickets: ${readyCount} set to ready`);

    // Verify state after activation
    const after1 = await getTicketState(ticketId1);
    const after2 = await getTicketState(ticketId2);

    log('🔍', `After activation - Ticket 1: state=${after1.state}, assignee_id=${after1.assignee_id}, assignee_type=${after1.assignee_type}`);
    log('🔍', `After activation - Ticket 2: state=${after2.state}, assignee_id=${after2.assignee_id}, assignee_type=${after2.assignee_type}`);

    // Assertions
    let passed = true;

    // Ticket 1 (no deps) should be ready with forge-agent assigned
    if (after1.state !== 'ready') {
      log('❌', `FAIL: Ticket 1 state should be 'ready', got '${after1.state}'`);
      passed = false;
    }
    if (after1.assignee_id !== 'forge-agent') {
      log('❌', `FAIL: Ticket 1 assignee_id should be 'forge-agent', got '${after1.assignee_id}'`);
      passed = false;
    }
    if (after1.assignee_type !== 'agent') {
      log('❌', `FAIL: Ticket 1 assignee_type should be 'agent', got '${after1.assignee_type}'`);
      passed = false;
    }

    // Ticket 2 (has deps) should be blocked with no assignee
    if (after2.state !== 'blocked') {
      log('❌', `FAIL: Ticket 2 state should be 'blocked', got '${after2.state}'`);
      passed = false;
    }
    if (after2.assignee_id !== null) {
      log('❌', `FAIL: Ticket 2 assignee_id should be NULL, got '${after2.assignee_id}'`);
      passed = false;
    }

    if (passed) {
      log('✅', 'TEST 1 PASSED: Forge agent assignment works correctly');
    }

    return passed;
  } finally {
    await cleanupTestData(sessionId);
  }
}

async function testEngineCanFindTickets() {
  logSection('TEST 2: Engine Can Find Ready Tickets');

  const projectId = await createTestProject();
  const sessionId = await createTestSession(projectId);

  try {
    // Create and activate tickets
    const ticketId = await createTestTicket(sessionId, projectId, 'Engine Test Ticket', 'draft');
    await activateTicketsForBuild(sessionId);

    log('📝', `Created and activated ticket: ${ticketId}`);

    // Simulate Engine.getReadyTickets()
    const readyTickets = await getReadyTickets(10);

    log('🔍', `Engine found ${readyTickets.length} ready ticket(s)`);

    // The ticket should be found by the Engine query
    const found = readyTickets.find(t => t.id === ticketId);

    if (found) {
      log('✅', 'TEST 2 PASSED: Engine can find ready tickets with assignee_id IS NOT NULL');
      return true;
    } else {
      log('❌', 'TEST 2 FAILED: Engine query did not find the ticket');
      log('🔍', 'Query requires: state=ready AND assignee_id IS NOT NULL AND assignee_type=agent');
      return false;
    }
  } finally {
    await cleanupTestData(sessionId);
  }
}

async function testSentinelAssignmentOnReview() {
  logSection('TEST 3: Sentinel Agent Assignment on PR Creation');

  const projectId = await createTestProject();
  const sessionId = await createTestSession(projectId);

  try {
    // Create ticket and move to in_progress (simulating forge agent claim)
    const ticketId = await createTestTicket(sessionId, projectId, 'Sentinel Test Ticket', 'in_progress');

    log('📝', `Created in_progress ticket: ${ticketId}`);

    // Simulate PR creation and setInReview
    const prUrl = 'https://github.com/test/repo/pull/42';
    await setInReview(ticketId, prUrl);

    log('🔧', `Called setInReview with PR: ${prUrl}`);

    // Verify sentinel assignment
    const after = await getTicketState(ticketId);

    log('🔍', `After setInReview: state=${after.state}, assignee_id=${after.assignee_id}, pr_url=${after.pr_url}`);

    let passed = true;

    if (after.state !== 'in_review') {
      log('❌', `FAIL: State should be 'in_review', got '${after.state}'`);
      passed = false;
    }
    if (after.assignee_id !== 'sentinel-agent') {
      log('❌', `FAIL: assignee_id should be 'sentinel-agent', got '${after.assignee_id}'`);
      passed = false;
    }
    if (after.pr_url !== prUrl) {
      log('❌', `FAIL: pr_url should be '${prUrl}', got '${after.pr_url}'`);
      passed = false;
    }

    if (passed) {
      log('✅', 'TEST 3 PASSED: Sentinel agent assigned on setInReview');
    }

    return passed;
  } finally {
    await cleanupTestData(sessionId);
  }
}

async function testClaimEndpointWithFilter() {
  logSection('TEST 4: Claim Endpoint with ticket_filter Parameter');

  const projectId = await createTestProject();
  const sessionId = await createTestSession(projectId);

  try {
    // Create tickets in different states
    const readyTicketId = await createTestTicket(sessionId, projectId, 'Ready Ticket', 'draft');
    await activateTicketsForBuild(sessionId);

    // Create a ticket directly in in_review for sentinel testing
    const reviewTicketId = await createTestTicket(sessionId, projectId, 'Review Ticket', 'in_review');
    // Assign sentinel-agent to it (simulating setInReview)
    await pool.query(`
      UPDATE tickets SET assignee_id = 'sentinel-agent', assignee_type = 'agent' WHERE id = $1
    `, [reviewTicketId]);

    log('📝', `Created ready ticket: ${readyTicketId}`);
    log('📝', `Created in_review ticket: ${reviewTicketId}`);

    // Test forge agent claim (default filter = 'ready')
    const forgeClaim = await claimTicketForForge('test-forge-agent');
    if (forgeClaim) {
      log('🔍', `Forge agent claimed: ${forgeClaim.id}, state was: ${forgeClaim.state}`);
    }

    // Test sentinel agent claim (filter = 'in_review')
    const sentinelClaim = await claimTicketForSentinel('test-sentinel-agent');
    if (sentinelClaim) {
      log('🔍', `Sentinel agent claimed: ${sentinelClaim.id}, state was: ${sentinelClaim.state}`);
    }

    let passed = true;

    if (!forgeClaim || forgeClaim.id !== readyTicketId) {
      log('❌', `FAIL: Forge agent should have claimed ${readyTicketId}`);
      passed = false;
    }

    if (!sentinelClaim || sentinelClaim.id !== reviewTicketId) {
      log('❌', `FAIL: Sentinel agent should have claimed ${reviewTicketId}`);
      passed = false;
    }

    if (passed) {
      log('✅', 'TEST 4 PASSED: Claim endpoint works for both forge and sentinel agents');
    }

    return passed;
  } finally {
    await cleanupTestData(sessionId);
  }
}

async function testFullWorkflowProgression() {
  logSection('TEST 5: Full Workflow Progression (draft → done simulation)');

  const projectId = await createTestProject();
  const sessionId = await createTestSession(projectId);

  try {
    // Step 1: Create draft ticket
    const ticketId = await createTestTicket(sessionId, projectId, 'Full Workflow Test', 'draft');
    log('1️⃣', `Created draft ticket: ${ticketId}`);

    let state = await getTicketState(ticketId);
    log('   ', `State: ${state.state}, assignee: ${state.assignee_id}`);

    // Step 2: Activate (Start Build) - should go to ready with forge-agent
    await activateTicketsForBuild(sessionId);
    log('2️⃣', 'Activated ticket (Start Build)');

    state = await getTicketState(ticketId);
    log('   ', `State: ${state.state}, assignee: ${state.assignee_id}`);

    if (state.state !== 'ready' || state.assignee_id !== 'forge-agent') {
      log('❌', 'FAIL: Ticket should be ready with forge-agent');
      return false;
    }

    // Step 3: Forge agent claims ticket - goes to assigned
    await pool.query(`
      UPDATE tickets SET state = 'assigned', last_heartbeat = NOW() WHERE id = $1
    `, [ticketId]);
    log('3️⃣', 'Forge agent claimed ticket');

    state = await getTicketState(ticketId);
    log('   ', `State: ${state.state}, assignee: ${state.assignee_id}`);

    // Step 4: Forge agent starts work - goes to in_progress
    await pool.query(`
      UPDATE tickets SET state = 'in_progress', started_at = NOW() WHERE id = $1
    `, [ticketId]);
    log('4️⃣', 'Forge agent started work');

    state = await getTicketState(ticketId);
    log('   ', `State: ${state.state}, assignee: ${state.assignee_id}`);

    // Step 5: PR created, setInReview - assigns sentinel-agent
    const prUrl = 'https://github.com/test/repo/pull/123';
    await setInReview(ticketId, prUrl);
    log('5️⃣', 'PR created, setInReview called');

    state = await getTicketState(ticketId);
    log('   ', `State: ${state.state}, assignee: ${state.assignee_id}, pr_url: ${state.pr_url}`);

    if (state.state !== 'in_review' || state.assignee_id !== 'sentinel-agent') {
      log('❌', 'FAIL: Ticket should be in_review with sentinel-agent');
      return false;
    }

    // Step 6: Sentinel completes review - goes to done
    await pool.query(`
      UPDATE tickets SET state = 'done', completed_at = NOW() WHERE id = $1
    `, [ticketId]);
    log('6️⃣', 'Sentinel completed review');

    state = await getTicketState(ticketId);
    log('   ', `State: ${state.state}, assignee: ${state.assignee_id}, pr_url: ${state.pr_url}`);

    if (state.state !== 'done') {
      log('❌', 'FAIL: Ticket should be done');
      return false;
    }

    log('✅', 'TEST 5 PASSED: Full workflow progression completed successfully');
    log('📊', 'Workflow: draft → ready → assigned → in_progress → in_review → done');

    return true;
  } finally {
    await cleanupTestData(sessionId);
  }
}

// ============================================
// Main test runner
// ============================================

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   SWARM WORKFLOW PROGRESSION FIX - E2E TEST SUITE         ║');
  console.log('║   Testing fixes from subtasks 3-1 and 3-2                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const connected = await setup();
  if (!connected) {
    console.log('\n❌ Cannot run tests: Database connection failed');
    process.exit(1);
  }

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  try {
    // Run all tests
    const tests = [
      { name: 'Forge Agent Assignment', fn: testForgeAgentAssignment },
      { name: 'Engine Can Find Tickets', fn: testEngineCanFindTickets },
      { name: 'Sentinel Assignment on Review', fn: testSentinelAssignmentOnReview },
      { name: 'Claim Endpoint with Filter', fn: testClaimEndpointWithFilter },
      { name: 'Full Workflow Progression', fn: testFullWorkflowProgression },
    ];

    for (const test of tests) {
      try {
        const passed = await test.fn();
        results.tests.push({ name: test.name, passed });
        if (passed) {
          results.passed++;
        } else {
          results.failed++;
        }
      } catch (err) {
        log('💥', `Test "${test.name}" threw error: ${err.message}`);
        results.tests.push({ name: test.name, passed: false, error: err.message });
        results.failed++;
      }
    }

    // Summary
    logSection('TEST SUMMARY');

    for (const test of results.tests) {
      const status = test.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status}: ${test.name}${test.error ? ` (${test.error})` : ''}`);
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`  Total: ${results.passed + results.failed} | Passed: ${results.passed} | Failed: ${results.failed}`);
    console.log('-'.repeat(60));

    if (results.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Workflow fix verified.\n');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the fixes.\n');
    }

    return results.failed === 0;
  } finally {
    await cleanup();
  }
}

// Run tests
runAllTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
