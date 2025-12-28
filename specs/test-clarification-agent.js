#!/usr/bin/env node
/**
 * Clarification Agent Test Script
 * Demonstrates the full HITL clarification flow with a real scenario
 */

const API_BASE = 'http://146.190.35.235:8080/api';

// ANSI colors for pretty output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

function log(label, data) {
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bold}${label}${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  if (typeof data === 'object') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  return response.json();
}

// Simulated user responses for our test scenario
const userResponses = [
  // Initial project description
  `I want to build a neighborhood tool lending library app. 
   People in my community could list tools they own (like drills, saws, pressure washers) 
   and neighbors can request to borrow them. Think of it like a hyper-local sharing economy.`,
  
  // Response about users
  `The main users would be:
   1. Tool Owners - people who have tools and want to share them
   2. Borrowers - neighbors who need to borrow tools
   3. Maybe an admin for the neighborhood association
   People would sign up with their address to verify they live in the neighborhood.`,
  
  // Response about features
  `Core features I'm thinking:
   - Tool listings with photos, condition, and availability
   - Request/approval workflow for borrowing
   - Calendar to see when tools are available
   - Messaging between owner and borrower
   - Rating system so people can build trust
   - Damage reporting in case something breaks`,
  
  // Response about technical requirements
  `I'm flexible on tech stack but I'd prefer a mobile-first web app.
   React Native or Flutter could work. Need a database for users and tools.
   Maybe push notifications when someone requests your tool.
   Should work offline for viewing your own tools at least.`,
  
  // Response about constraints
  `Timeline is about 3 months for an MVP. 
   Budget is limited - this is a community project so ideally low cost hosting.
   Should handle maybe 500 users in our neighborhood to start.
   Needs to be dead simple - many users won't be tech savvy.`
];

async function runTest() {
  console.log(`\n${colors.magenta}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║     🤖 CLARIFICATION AGENT TEST - Tool Lending Library       ║${colors.reset}`);
  console.log(`${colors.magenta}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);

  // Step 1: Create a new HITL session
  log('📝 STEP 1: Creating HITL Session', {
    project_name: 'Neighborhood Tool Lending Library',
    description: 'A community app for sharing tools between neighbors',
    tenant_id: 'default'
  });

  const createResult = await apiCall('POST', '/hitl', {
    project_name: 'Neighborhood Tool Lending Library',
    description: 'A community app for sharing tools between neighbors',
    tenant_id: 'default'
  });

  log('✅ Session Created', createResult);
  const sessionId = createResult.id;

  // Step 2: Iterate through user responses
  for (let i = 0; i < userResponses.length; i++) {
    const userMessage = userResponses[i];
    
    console.log(`\n${colors.yellow}┌────────────────────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.yellow}│ 👤 USER INPUT ${i + 1}/${userResponses.length}${colors.reset}`);
    console.log(`${colors.yellow}└────────────────────────────────────────────────────────────────┘${colors.reset}`);
    console.log(`${colors.dim}${userMessage}${colors.reset}`);

    // Send user response
    const response = await apiCall('POST', `/hitl/${sessionId}/respond`, {
      message: userMessage
    });

    console.log(`\n${colors.green}┌────────────────────────────────────────────────────────────────┐${colors.reset}`);
    console.log(`${colors.green}│ 🤖 AI AGENT RESPONSE${colors.reset}`);
    console.log(`${colors.green}└────────────────────────────────────────────────────────────────┘${colors.reset}`);
    
    if (response.error) {
      console.log(`${colors.yellow}Error: ${response.error}${colors.reset}`);
      if (response.details) console.log(`Details: ${response.details}`);
      break;
    }

    console.log(`${colors.bold}Message:${colors.reset} ${response.message || 'N/A'}`);
    console.log(`${colors.bold}Progress:${colors.reset} ${response.progress || 0}%`);
    console.log(`${colors.bold}Ready for Spec:${colors.reset} ${response.readyForSpec ? '✅ YES' : '❌ Not yet'}`);
    
    if (response.gathered) {
      console.log(`\n${colors.bold}📊 Information Gathered:${colors.reset}`);
      for (const [category, info] of Object.entries(response.gathered)) {
        const score = info?.score || 0;
        const bar = '█'.repeat(Math.floor(score / 10)) + '░'.repeat(10 - Math.floor(score / 10));
        console.log(`   ${category}: ${bar} ${score}%`);
      }
    }

    if (response.readyForSpec) {
      console.log(`\n${colors.green}✨ Agent has gathered enough information to create a spec!${colors.reset}`);
      break;
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  // Step 3: Get final session state
  log('📋 FINAL SESSION STATE', `Fetching session ${sessionId}...`);
  const finalSession = await apiCall('GET', `/hitl/${sessionId}`);
  
  console.log(`\n${colors.bold}Session ID:${colors.reset} ${finalSession.session?.id}`);
  console.log(`${colors.bold}State:${colors.reset} ${finalSession.session?.state}`);
  console.log(`${colors.bold}Progress:${colors.reset} ${finalSession.session?.progress_percent}%`);
  console.log(`${colors.bold}Messages Count:${colors.reset} ${finalSession.messages?.length || 0}`);

  // Show message history
  if (finalSession.messages?.length > 0) {
    console.log(`\n${colors.cyan}━━━ Message History ━━━${colors.reset}`);
    for (const msg of finalSession.messages.slice(-6)) {
      const icon = msg.role === 'user' ? '👤' : '🤖';
      const preview = msg.content.substring(0, 80).replace(/\n/g, ' ');
      console.log(`${icon} ${preview}${msg.content.length > 80 ? '...' : ''}`);
    }
  }

  console.log(`\n${colors.magenta}════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.magenta}                    TEST COMPLETE                               ${colors.reset}`);
  console.log(`${colors.magenta}════════════════════════════════════════════════════════════════${colors.reset}\n`);
}

runTest().catch(console.error);
