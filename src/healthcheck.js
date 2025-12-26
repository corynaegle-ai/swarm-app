const express = require('express');
const router = express.Router();

// Healthcheck endpoint
router.get('/health', (req, res) => {
  try {
    console.log('Healthcheck called');
    
    // Basic health status
    const healthStatus = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
    
    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Healthcheck error:', error);
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
