  async executeGenerateTickets(session, context) {
    const db = getDb();
    
    // Get the spec card
    const specCard = session.spec_card ? JSON.parse(session.spec_card) : null;
    if (!specCard) {
      return { type: 'tickets', tickets: [], status: 'error', message: 'No spec card found. Generate spec first.' };
    }

    const systemPrompt = `You are a technical project manager. Decompose a software specification into actionable development tickets.

## Rules
1. Each ticket should be completable by ONE developer in 1-4 hours
2. Include clear acceptance criteria
3. Order tickets by dependency (foundational work first)
4. Use ticket types: setup, backend, frontend, integration, testing, documentation
5. Assign estimated_scope: small (1-2hr), medium (2-4hr), large (4-8hr)

## Output Format
Return JSON:
{
  "tickets": [
    {
      "title": "Short descriptive title",
      "type": "setup|backend|frontend|integration|testing|documentation",
      "description": "Detailed description of what needs to be built",
      "acceptanceCriteria": ["criterion 1", "criterion 2"],
      "estimatedScope": "small|medium|large",
      "dependencies": ["title of dependent ticket if any"],
      "feature": "Which spec feature this implements"
    }
  ],
  "phases": [
    {
      "name": "Phase name",
      "description": "Phase goal",
      "ticketTitles": ["tickets in this phase"]
    }
  ],
  "totalTickets": number,
  "estimatedDays": number,
  "message": "Summary of the decomposition"
}`;

    const response = await chat({
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Decompose this specification into development tickets:\n\n${JSON.stringify(specCard, null, 2)}`
      }],
      maxTokens: 8192
    });

    if (!response.success) {
      return { type: 'tickets', tickets: [], status: 'error', message: 'Failed to generate tickets.', error: response.error };
    }

    const parsed = parseJsonResponse(response.content);
    
    if (parsed?.tickets) {
      // Create or get a project for these tickets
      const { randomUUID } = require('crypto');
      
      // Check if project exists for this session
      let projectId = db.prepare(`SELECT id FROM projects WHERE name = ?`).get(specCard.title)?.id;
      
      if (!projectId) {
        projectId = randomUUID();
        const repoUrl = `https://github.com/placeholder/${specCard.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        db.prepare(`
          INSERT INTO projects (id, tenant_id, name, repo_url, description, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).run(projectId, session.tenant_id || 'default', specCard.title, repoUrl, specCard.summary);
      }

      // Store tickets in the database
      const insertStmt = db.prepare(`
        INSERT INTO tickets (id, project_id, title, description, acceptance_criteria, state, estimated_scope, design_session, created_at)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'))
      `);

      const createdTickets = [];
      for (const ticket of parsed.tickets) {
        const ticketId = randomUUID();
        const acceptanceCriteria = JSON.stringify(ticket.acceptanceCriteria || []);
        
        insertStmt.run(
          ticketId,
          projectId,
          ticket.title,
          `[${ticket.type}] ${ticket.description}\n\nFeature: ${ticket.feature}\nDependencies: ${(ticket.dependencies || []).join(', ') || 'None'}`,
          acceptanceCriteria,
          ticket.estimatedScope || 'medium',
          session.id
        );
        
        createdTickets.push({
          id: ticketId,
          ...ticket
        });
      }

      // Update session state to building
      db.prepare(`
        UPDATE hitl_sessions 
        SET state = 'building', updated_at = datetime('now')
        WHERE id = ?
      `).run(session.id);

      return {
        type: 'tickets',
        tickets: createdTickets,
        phases: parsed.phases,
        projectId,
        totalTickets: parsed.totalTickets || createdTickets.length,
        estimatedDays: parsed.estimatedDays,
        status: 'generated',
        message: parsed.message || `Generated ${createdTickets.length} tickets.`
      };
    }

    return { type: 'tickets', tickets: [], status: 'parse_error', message: 'Could not parse tickets.', raw: response.content };
  }
