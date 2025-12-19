/**
 * Test: Clarification Agent
 * 
 * Simulates a real conversation with the clarification agent
 * for a Restaurant Reservation System project.
 * 
 * Run: node test-clarification-agent.js
 */

const Anthropic = require('@anthropic-ai/sdk');

// Copy of the system prompt from clarification-agent.js
const SYSTEM_PROMPT = `You are a senior technical requirements analyst at a software development firm. Your role is to gather enough information through conversation to create a comprehensive spec card for a software project.

## Your Personality
- Professional but warm and approachable
- Ask clarifying questions when answers are vague
- Acknowledge what you've learned before moving on
- Never overwhelm - ONE focused question at a time

## Information Categories to Gather

1. **Project Type** (Required)
   - What: One-sentence description of the product
   - Why: Problem being solved / value proposition  
   - Who: Primary users/personas
   - Platform: Web, Mobile (iOS/Android), API, CLI, Desktop

2. **Tech Stack** (Required)
   - Frontend: Framework preference (React, Vue, Angular, etc.)
   - Backend: Language/framework (Node, Python, Go, etc.)
   - Database: SQL vs NoSQL, specific preferences
   - Hosting: Cloud provider preferences, serverless vs traditional

3. **Scale** (Required)
   - Users: Expected concurrent users (10s, 100s, 1000s, millions)
   - Data Volume: Expected data size and growth
   - Performance: Latency requirements, SLAs

4. **Features** (Required)
   - Core Features: Essential functionality for MVP
   - MVP Scope: What's in vs out for first release

5. **Constraints** (Optional but helpful)
   - Timeline: Deadlines or time constraints
   - Budget: Cost considerations
   - Compliance: Security, regulatory requirements (HIPAA, GDPR, etc.)

## Conversation Rules

1. Start by acknowledging their initial description
2. Ask ONE question at a time - never multiple questions
3. After each response, briefly acknowledge what you learned
4. Track which categories have sufficient information
5. Skip questions if user already provided that info
6. When ~80% complete, ask if they're ready to generate the spec card
7. Be smart about inferring information (e.g., "e-commerce" implies certain features)

## Output Format

You MUST respond with valid JSON in this exact structure:
\`\`\`json
{
  "message": "Your conversational response to the user",
  "gathered": {
    "project_type": { "what": "...", "why": "...", "who": "...", "platform": "..." },
    "tech_stack": { "frontend": "...", "backend": "...", "database": "...", "hosting": "..." },
    "scale": { "users": "...", "data_volume": "...", "performance": "..." },
    "features": { "core_features": ["..."], "mvp_scope": "..." },
    "constraints": { "timeline": "...", "budget": "...", "compliance": "..." }
  },
  "progress": 0-100,
  "ready_for_spec": false,
  "next_category": "category_name or null if ready"
}
\`\`\`

Only include fields in "gathered" that you have actual information for. Omit empty/unknown fields.
Calculate "progress" based on how complete each category is (weighted average).
Set "ready_for_spec" to true only when progress >= 80 AND you've confirmed with the user.`;

// Simulated user responses for a Restaurant Reservation System
const SIMULATED_CONVERSATION = [
  // Initial description
  "I want to build a restaurant reservation system for my chain of 12 Italian restaurants in the Chicago area. Customers should be able to book tables online.",
  
  // Response to tech stack question
  "I'm thinking React for the frontend since my team knows it. We'd like Node.js for the backend. PostgreSQL for the database since we need relational data for reservations, customers, and restaurant locations.",

  // Response to scale question
  "We serve about 500 customers per day across all locations. Peak times are Friday and Saturday evenings. I'd say maybe 50-100 concurrent users during peak dinner booking times.",

  // Response to features question
  "Core features: real-time availability checking, table selection with floor plan, email/SMS confirmations, waitlist for full nights. For MVP, we just need booking and confirmation - waitlist can come later.",

  // Response to constraints/timeline question
  "We want to launch before Valentine's Day - so about 8 weeks. Budget is around $50k. We're not HIPAA but we do need PCI compliance for taking deposits on large party bookings."
];

class ClarificationAgentTest {
  constructor() {
    this.claude = new Anthropic();
    this.conversationHistory = [];
    this.gatheredContext = {};
  }

  async runConversation() {
    console.log('\n' + '='.repeat(80));
    console.log('CLARIFICATION AGENT TEST - Restaurant Reservation System');
    console.log('='.repeat(80) + '\n');

    for (let i = 0; i < SIMULATED_CONVERSATION.length; i++) {
      const userMessage = SIMULATED_CONVERSATION[i];
      
      console.log('\n' + '-'.repeat(80));
      console.log(`TURN ${i + 1}`);
      console.log('-'.repeat(80));
      
      console.log('\n📝 USER INPUT:');
      console.log(userMessage);
      
      const response = await this.sendMessage(userMessage);
      
      console.log('\n🤖 AGENT RESPONSE:');
      console.log(JSON.stringify(response, null, 2));
      
      // Check if ready
      if (response.ready_for_spec) {
        console.log('\n✅ AGENT INDICATES READY FOR SPEC GENERATION');
        break;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('FINAL GATHERED CONTEXT:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(this.gatheredContext, null, 2));
  }

  async sendMessage(userMessage) {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Call Claude
    const response = await this.claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: this.conversationHistory
    });

    const rawText = response.content[0].text;
    
    // Parse JSON from response
    const parsed = this.parseResponse(rawText);
    
    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: rawText
    });

    // Merge gathered context
    if (parsed.gathered) {
      this.gatheredContext = this.mergeContext(this.gatheredContext, parsed.gathered);
    }

    return parsed;
  }

  parseResponse(text) {
    try {
      // Extract JSON from markdown code blocks
      const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      // Try parsing entire response as JSON
      return JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse response:', e.message);
      return { message: text, gathered: {}, progress: 0, ready_for_spec: false };
    }
  }

  mergeContext(existing, incoming) {
    const merged = { ...existing };
    for (const [category, values] of Object.entries(incoming || {})) {
      if (typeof values === 'object' && values !== null) {
        merged[category] = { ...(merged[category] || {}), ...values };
      } else {
        merged[category] = values;
      }
    }
    return merged;
  }
}

// Run the test
const test = new ClarificationAgentTest();
test.runConversation().catch(console.error);
