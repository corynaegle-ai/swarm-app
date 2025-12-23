const request = require('supertest');
const app = require('../app');
const db = require('../database/connection');

describe('GET /api/tickets', () => {
  beforeEach(async () => {
    // Clean up and seed test data
    await db.query('TRUNCATE TABLE tickets RESTART IDENTITY CASCADE');
    
    // Insert test tickets with priority values
    await db.query(`
      INSERT INTO tickets (title, description, status, priority, created_by)
      VALUES 
        ('Test Ticket 1', 'Description 1', 'open', 'high', 'user1'),
        ('Test Ticket 2', 'Description 2', 'in_progress', 'medium', 'user2'),
        ('Test Ticket 3', 'Description 3', 'closed', 'low', 'user3')
    `);
  });

  afterAll(async () => {
    await db.end();
  });

  test('should return tickets with priority field included', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.count).toBe(3);

    // Check that each ticket has priority field
    response.body.data.forEach(ticket => {
      expect(ticket).toHaveProperty('id');
      expect(ticket).toHaveProperty('title');
      expect(ticket).toHaveProperty('description');
      expect(ticket).toHaveProperty('status');
      expect(ticket).toHaveProperty('priority');
      expect(ticket).toHaveProperty('created_at');
      expect(ticket).toHaveProperty('updated_at');
      expect(ticket).toHaveProperty('created_by');
    });
  });

  test('should return correct priority values from database', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .expect(200);

    const tickets = response.body.data;
    
    // Find tickets by title and verify their priorities
    const ticket1 = tickets.find(t => t.title === 'Test Ticket 1');
    const ticket2 = tickets.find(t => t.title === 'Test Ticket 2');
    const ticket3 = tickets.find(t => t.title === 'Test Ticket 3');

    expect(ticket1.priority).toBe('high');
    expect(ticket2.priority).toBe('medium');
    expect(ticket3.priority).toBe('low');
  });

  test('should maintain existing ticket object structure', async () => {
    const response = await request(app)
      .get('/api/tickets')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: expect.any(Array),
      count: expect.any(Number)
    });

    if (response.body.data.length > 0) {
      const ticket = response.body.data[0];
      
      // Verify the ticket structure includes all expected fields
      expect(ticket).toMatchObject({
        id: expect.any(Number),
        title: expect.any(String),
        description: expect.any(String),
        status: expect.any(String),
        priority: expect.any(String),
        created_at: expect.any(String),
        updated_at: expect.any(String),
        created_by: expect.any(String)
      });
    }
  });

  test('should handle empty tickets list', async () => {
    // Clear all tickets
    await db.query('TRUNCATE TABLE tickets RESTART IDENTITY CASCADE');

    const response = await request(app)
      .get('/api/tickets')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual([]);
    expect(response.body.count).toBe(0);
  });

  test('should handle database errors gracefully', async () => {
    // Mock database error
    const originalQuery = db.query;
    db.query = jest.fn().mockRejectedValue(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/tickets')
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Internal server error');

    // Restore original query method
    db.query = originalQuery;
  });
});

describe('GET /api/tickets/:id', () => {
  let testTicketId;

  beforeEach(async () => {
    await db.query('TRUNCATE TABLE tickets RESTART IDENTITY CASCADE');
    
    const result = await db.query(`
      INSERT INTO tickets (title, description, status, priority, created_by)
      VALUES ('Single Ticket', 'Test Description', 'open', 'high', 'testuser')
      RETURNING id
    `);
    
    testTicketId = result.rows[0].id;
  });

  test('should return single ticket with priority field', async () => {
    const response = await request(app)
      .get(`/api/tickets/${testTicketId}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      id: testTicketId,
      title: 'Single Ticket',
      description: 'Test Description',
      status: 'open',
      priority: 'high',
      created_by: 'testuser'
    });
  });
});