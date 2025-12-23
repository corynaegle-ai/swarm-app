const request = require('supertest');
const app = require('../src/app');
const { Comment, Ticket, User, Tenant } = require('../src/models');
const jwt = require('jsonwebtoken');

describe('Comment API Endpoints', () => {
  let authToken;
  let testUser;
  let testTenant;
  let testTicket;

  beforeAll(async () => {
    // Create test tenant
    testTenant = await Tenant.create({
      name: 'Test Tenant',
      domain: 'test.example.com'
    });

    // Create test user
    testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword',
      tenantId: testTenant.id
    });

    // Create test ticket
    testTicket = await Ticket.create({
      title: 'Test Ticket',
      description: 'Test Description',
      status: 'open',
      priority: 'medium',
      tenantId: testTenant.id,
      userId: testUser.id
    });

    // Generate auth token
    authToken = jwt.sign(
      { 
        userId: testUser.id,
        tenantId: testTenant.id,
        permissions: ['comments:create', 'comments:read']
      },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  afterAll(async () => {
    // Clean up test data
    await Comment.destroy({ where: {} });
    await Ticket.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Tenant.destroy({ where: {} });
  });

  describe('POST /api/tickets/:ticketId/comments', () => {
    it('should create a new comment with valid data', async () => {
      const commentData = {
        text: 'This is a test comment'
      };

      const response = await request(app)
        .post(`/api/tickets/${testTicket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.text).toBe(commentData.text);
      expect(response.body.data.ticketId).toBe(testTicket.id);
      expect(response.body.data.userId).toBe(testUser.id);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.name).toBe(testUser.name);
    });

    it('should return 400 for empty comment text', async () => {
      const commentData = {
        text: ''
      };

      const response = await request(app)
        .post(`/api/tickets/${testTicket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should return 400 for comment text exceeding max length', async () => {
      const commentData = {
        text: 'a'.repeat(5001) // Exceeds 5000 character limit
      };

      const response = await request(app)
        .post(`/api/tickets/${testTicket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent ticket', async () => {
      const commentData = {
        text: 'This is a test comment'
      };

      const response = await request(app)
        .post('/api/tickets/00000000-0000-0000-0000-000000000000/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .send(commentData)
        .expect(404);

      expect(response.body.error).toBe('Ticket not found');
    });

    it('should return 401 without authentication', async () => {
      const commentData = {
        text: 'This is a test comment'
      };

      await request(app)
        .post(`/api/tickets/${testTicket.id}/comments`)
        .send(commentData)
        .expect(401);
    });
  });

  describe('GET /api/tickets/:ticketId/comments', () => {
    beforeEach(async () => {
      // Create test comments
      await Comment.bulkCreate([
        {
          text: 'First comment',
          ticketId: testTicket.id,
          userId: testUser.id,
          tenantId: testTenant.id,
          createdAt: new Date('2023-01-01')
        },
        {
          text: 'Second comment',
          ticketId: testTicket.id,
          userId: testUser.id,
          tenantId: testTenant.id,
          createdAt: new Date('2023-01-02')
        },
        {
          text: 'Third comment',
          ticketId: testTicket.id,
          userId: testUser.id,
          tenantId: testTenant.id,
          createdAt: new Date('2023-01-03')
        }
      ]);
    });

    afterEach(async () => {
      await Comment.destroy({ where: {} });
    });

    it('should retrieve comments sorted by created_at DESC', async () => {
      const response = await request(app)
        .get(`/api/tickets/${testTicket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.count).toBe(3);
      
      // Verify sorting (newest first)
      expect(response.body.data[0].text).toBe('Third comment');
      expect(response.body.data[1].text).toBe('Second comment');
      expect(response.body.data[2].text).toBe('First comment');
      
      // Verify user data is included
      response.body.data.forEach(comment => {
        expect(comment.user).toBeDefined();
        expect(comment.user.name).toBe(testUser.name);
      });
    });

    it('should return empty array for ticket with no comments', async () => {
      await Comment.destroy({ where: {} });

      const response = await request(app)
        .get(`/api/tickets/${testTicket.id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });

    it('should return 404 for non-existent ticket', async () => {
      const response = await request(app)
        .get('/api/tickets/00000000-0000-0000-0000-000000000000/comments')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Ticket not found');
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get(`/api/tickets/${testTicket.id}/comments`)
        .expect(401);
    });
  });
});