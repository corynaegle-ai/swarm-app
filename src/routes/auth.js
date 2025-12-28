const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Mock user database - in production, this would be a real database
const users = [
  {
    id: 1,
    email: 'user@example.com',
    password: '$2b$10$rQj5QhvZ7qJZvZ8VqZqZ8O.ZqZ8VqZqZ8O.ZqZ8VqZqZ8O.ZqZ8VqZ', // 'password123'
    role: 'user'
  },
  {
    id: 2,
    email: 'admin@example.com',
    password: '$2b$10$rQj5QhvZ7qJZvZ8VqZqZ8O.ZqZ8VqZqZ8O.ZqZ8VqZqZ8O.ZqZ8VqZ', // 'password123'
    role: 'admin'
  }
];

// JWT Secret - in production, this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
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

    // Generate JWT token with 24-hour expiration
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      {
        expiresIn: '24h'
      }
    );

    // Return success response with token
    res.status(200).json({
      success: true,
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