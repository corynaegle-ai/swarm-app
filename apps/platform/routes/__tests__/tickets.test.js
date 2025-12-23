const request = require('supertest');
const express = require('express');
const ticketsRouter = require('../tickets');

// Mock the database pool
jest.mock('pg', () => {
  const mockQuery = jest.fn();
  const mockPool = {
    query: mockQuery
  };
  return {
    Pool: jest.fn(() => mockPool)
  };
});

const { Pool } = require('pg');
const pool = new Pool();

const app = express();
app.use(express.json());
app.use('/api/tickets', ticketsRouter);

describe('POST /api/tickets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create ticket with priority field', async () => {
    const mockTicket = {
      id: 1,
      title: 'Test Ticket',
      description: 'Test Description',
      status: 'open',
      priority: 'high',
      assignee_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    pool.query.mockResolvedValueOnce({ rows: [mockTicket] });

    const response = await request(app)
      .post('/api/tickets')
      .send({
        title: 'Test Ticket',
        description: 'Test Description',
        status: 'open',
        priority: 'high'
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(mockTicket);
    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO tickets (title, description, status, priority, assignee_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
      ['Test Ticket', 'Test Description', 'open', 'high', undefined]
    );
  });

  test('should create ticket without priority field (null priority)', async () => {
    const mockTicket = {
      id: 2,
      title: 'Test Ticket 2',
      description: 'Test Description 2',
      status: 'open',
      priority: null,
      assignee_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    pool.query.mockResolvedValueOnce({ rows: [mockTicket] });

    const response = await request(app)
      .post('/api/tickets')
      .send({
        title: 'Test Ticket 2',
        description: 'Test Description 2'
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(mockTicket);
    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO tickets (title, description, status, priority, assignee_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
      ['Test Ticket 2', 'Test Description 2', 'open', undefined, undefined]
    );
  });

  test('should return 400 for missing required fields', async () => {
    const response = await request(app)
      .post('/api/tickets')
      .send({
        description: 'Test Description'
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Title and description are required' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('should handle database errors', async () => {
    pool.query.mockRejectedValueOnce(new Error('Database connection failed'));

    const response = await request(app)
      .post('/api/tickets')
      .send({
        title: 'Test Ticket',
        description: 'Test Description',
        priority: 'medium'
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});