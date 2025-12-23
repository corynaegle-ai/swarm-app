const request = require('supertest');
const app = require('../src/app');

describe('Healthcheck Endpoint', () => {
  test('GET /api/health should return 200 and health status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('memory');
  });

  test('Healthcheck should log when called', async () => {
    // Mock console.log to capture the log output
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    await request(app)
      .get('/api/health')
      .expect(200);

    expect(consoleSpy).toHaveBeenCalledWith('Healthcheck called');
    
    consoleSpy.mockRestore();
  });
});
