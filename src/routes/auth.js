const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Mock user database - in production this would be a real database
const users = [
  {
    id: 1,
    email: 'admin@example.com',
    password: '$2a$10$K7L8vl9QX5Q5Z5Z5Z5Z5ZuK7L8vl9QX5Q5Z5Z5Z5ZuK7L8vl9QX5Q5', // 'password123'
    role: 'admin'
  },
  {
    id: 2,
    email: 'user@example.com',
    password: '$2a$10$M7L8vl9QX5Q5Z5Z5Z5Z5ZuM7L8vl9QX5Q5Z5Z5Z5ZuM7L8vl9QX5Q5', // 'userpass'
    role: 'user'
  }
];

/**
 * POST /api/auth/login
 * Authenticates user and returns JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token with 24 hour expiration
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'default-secret-for-dev',
      {
        expiresIn: '24h'
      }
    );

    // Return successful response
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;