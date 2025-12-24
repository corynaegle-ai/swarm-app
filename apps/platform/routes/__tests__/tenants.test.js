const request = require('supertest');
const express = require('express');
const tenantsRouter = require('../tenants');
const db = require('../../db');
const { requireAuth, requireTenant } = require('../../middleware/auth');

// Mock dependencies
jest.mock('../../db');
jest.mock('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/tenants', tenantsRouter);

// Mock middleware to simulate authenticated user with tenant access
requireAuth.mockImplementation((req, res, next) => {
  req.user = { id: 1 };
  next();
});

requireTenant.mockImplementation((req, res, next) => {
  next();
});

describe('PATCH /api/tenants/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update tenant name successfully', async () => {
    const mockTenant = {
      id: 1,
      name: 'Updated Tenant',
      plan: 'pro',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z'
    };

    // Mock existing tenant check
    db.query.mockResolvedValueOnce([{ id: 1 }]);
    // Mock update query
    db.query.mockResolvedValueOnce({ affectedRows: 1 });
    // Mock fetch updated tenant
    db.query.mockResolvedValueOnce([mockTenant]);

    const response = await request(app)
      .patch('/api/tenants/1')
      .send({ name: 'Updated Tenant' })
      .expect(200);

    expect(response.body).toEqual(mockTenant);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('should update tenant plan successfully', async () => {
    const mockTenant = {
      id: 1,
      name: 'Test Tenant',
      plan: 'enterprise',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z'
    };

    db.query.mockResolvedValueOnce([{ id: 1 }]);
    db.query.mockResolvedValueOnce({ affectedRows: 1 });
    db.query.mockResolvedValueOnce([mockTenant]);

    const response = await request(app)
      .patch('/api/tenants/1')
      .send({ plan: 'enterprise' })
      .expect(200);

    expect(response.body).toEqual(mockTenant);
  });

  it('should update both name and plan successfully', async () => {
    const mockTenant = {
      id: 1,
      name: 'Updated Tenant',
      plan: 'enterprise',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z'
    };

    db.query.mockResolvedValueOnce([{ id: 1 }]);
    db.query.mockResolvedValueOnce({ affectedRows: 1 });
    db.query.mockResolvedValueOnce([mockTenant]);

    const response = await request(app)
      .patch('/api/tenants/1')
      .send({ name: 'Updated Tenant', plan: 'enterprise' })
      .expect(200);

    expect(response.body).toEqual(mockTenant);
  });

  it('should return 400 when no fields are provided', async () => {
    const response = await request(app)
      .patch('/api/tenants/1')
      .send({})
      .expect(400);

    expect(response.body.error).toBe('At least one field (name or plan) must be provided for update');
  });

  it('should return 400 for invalid plan value', async () => {
    const response = await request(app)
      .patch('/api/tenants/1')
      .send({ plan: 'invalid' })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details[0].msg).toBe('Plan must be free, pro, or enterprise');
  });

  it('should return 400 for empty name', async () => {
    const response = await request(app)
      .patch('/api/tenants/1')
      .send({ name: '' })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details[0].msg).toBe('Name must be between 1 and 255 characters');
  });

  it('should return 400 for invalid tenant ID', async () => {
    const response = await request(app)
      .patch('/api/tenants/invalid')
      .send({ name: 'Test' })
      .expect(400);

    expect(response.body.error).toBe('Validation failed');
    expect(response.body.details[0].msg).toBe('Invalid tenant ID');
  });

  it('should return 404 when tenant does not exist', async () => {
    db.query.mockResolvedValueOnce([]);

    const response = await request(app)
      .patch('/api/tenants/999')
      .send({ name: 'Test' })
      .expect(404);

    expect(response.body.error).toBe('Tenant not found');
  });

  it('should return 500 on database error', async () => {
    db.query.mockRejectedValueOnce(new Error('Database error'));

    const response = await request(app)
      .patch('/api/tenants/1')
      .send({ name: 'Test' })
      .expect(500);

    expect(response.body.error).toBe('Internal server error');
  });
});