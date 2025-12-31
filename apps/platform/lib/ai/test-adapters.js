import { AdapterFactory } from './AdapterFactory.js';

async function testAdapter(providerId, apiKey, model) {
  console.log(`\n=== Testing ${providerId} ===`);
  
  const adapter = AdapterFactory.create(providerId, { apiKey, model });
  
  // Test validation
  const validation = await adapter.validateKey();
  console.log('Key validation:', validation);
  
  if (!validation.valid) return;
  
  // Test completion
  const result = await adapter.complete({
    messages: [{ role: 'user', content: 'Say "Hello from ' + providerId + '" in exactly 5 words.' }],
  });
  console.log('Response:', result.content);
  console.log('Usage:', result.usage);
}

// Run with: node test-adapters.js
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (ANTHROPIC_KEY) {
  testAdapter('anthropic', ANTHROPIC_KEY, 'claude-3-5-haiku-20241022');
}
