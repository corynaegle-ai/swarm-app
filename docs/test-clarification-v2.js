#!/usr/bin/env node
/**
 * Clarification Agent Test v2 - Full Response Display
 */

const API_BASE = 'http://146.190.35.235:8080/api/hitl';

async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  return response.json();
}

const userResponses = [
  `I want to build a neighborhood tool lending library app. People in my community could list tools they own (like drills, saws, pressure washers) and neighbors can request to borrow them.`,
  
  `The main users would be: Tool Owners who share tools, Borrowers who need to borrow, and maybe an admin for the neighborhood association. Sign up with address to verify they live in the area.`,
  
  `Core features: Tool listings with photos and availability, request/approval workflow, calendar, messaging, rating system for trust, damage reporting.`,
  
  `Mobile-first web app, flexible on React Native or Flutter. Database for users and tools. Push notifications when someone requests. Should work offline for viewing your own tools.`,
  
  `Timeline: 3 months for MVP. Budget: limited community project. Scale: 500 users to start. Must be dead simple - many users won't be tech savvy.`
];

async function runTest() {
  console.log('\n\x1b[35m═══════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[35m  🤖 CLARIFICATION AGENT TEST - Tool Lending Library\x1b[0m');
  console.log('\x1b[35m═══════════════════════════════════════════════════════════════\x1b[0m');

  // Create session
  console.log('\n\x1b[36m📝 Creating HITL Session...\x1b[0m');
  const createResult = await apiCall('POST', '', {
    project_name: 'Neighborhood Tool Lending Library',
    description: 'A community app for sharing tools between neighbors',
    tenant_id: 'default'
  });
  
  console.log('\x1b[32m✅ Session Created:\x1b[0m', JSON.stringify(createResult, null, 2));
  
  if (!createResult.id) {
    console.log('\x1b[31m❌ Failed to create session\x1b[0m');
    return;
  }
  
  const sessionId = createResult.id;

  // Process each user response
  for (let i = 0; i < userResponses.length; i++) {
    const userMsg = userResponses[i];
    
    console.log('\n\x1b[33m┌─────────────────────────────────────────────────────────────────┐\x1b[0m');
    console.log(`\x1b[33m│ 👤 USER INPUT ${i + 1}/${userResponses.length}\x1b[0m`);
    console.log('\x1b[33m└─────────────────────────────────────────────────────────────────┘\x1b[0m');
    console.log(`\x1b[2m${userMsg}\x1b[0m`);

    const response = await apiCall('POST', `/${sessionId}/respond`, { message: userMsg });

    console.log('\n\x1b[32m┌─────────────────────────────────────────────────────────────────┐\x1b[0m');
    console.log('\x1b[32m│ 🤖 AGENT RESPONSE\x1b[0m');
    console.log('\x1b[32m└─────────────────────────────────────────────────────────────────┘\x1b[0m');
    
    // Pretty print the full response
    console.log('\x1b[1mRaw Response:\x1b[0m');
    console.log(JSON.stringify(response, null, 2));
    
    // Extract key fields
    if (response.result) {
      const r = response.result;
      console.log('\n\x1b[36m─── Extracted Fields ───\x1b[0m');
      console.log(`\x1b[1mMessage:\x1b[0m ${r.message || 'N/A'}`);
      console.log(`\x1b[1mProgress:\x1b[0m ${r.progress || 0}%`);
      console.log(`\x1b[1mReady for Spec:\x1b[0m ${r.readyForSpec ? '✅' : '❌'}`);
      
      if (r.gathered) {
        console.log('\x1b[1mGathered Info:\x1b[0m');
        for (const [cat, info] of Object.entries(r.gathered)) {
          const score = info?.score || 0;
          const bar = '█'.repeat(Math.floor(score/10)) + '░'.repeat(10 - Math.floor(score/10));
          console.log(`  ${cat}: ${bar} ${score}%`);
        }
      }
      
      if (r.readyForSpec) {
        console.log('\n\x1b[32m✨ Ready to generate specification!\x1b[0m');
        break;
      }
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  // Get final state
  console.log('\n\x1b[36m📋 Final Session State\x1b[0m');
  const final = await apiCall('GET', `/${sessionId}`);
  console.log(`State: ${final.session?.state}`);
  console.log(`Progress: ${final.session?.progress_percent}%`);
  console.log(`Messages: ${final.messages?.length}`);
  
  if (final.messages?.length > 0) {
    console.log('\n\x1b[36m─── Last 4 Messages ───\x1b[0m');
    for (const m of final.messages.slice(-4)) {
      const icon = m.role === 'user' ? '👤' : '🤖';
      const preview = (m.content || '').substring(0, 100).replace(/\n/g, ' ');
      console.log(`${icon} ${preview}...`);
    }
  }

  console.log('\n\x1b[35m═══════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[35m  TEST COMPLETE\x1b[0m');
  console.log('\x1b[35m═══════════════════════════════════════════════════════════════\x1b[0m\n');
}

runTest().catch(console.error);
