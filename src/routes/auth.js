const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Mock user database - replace with actual database integration
const users = [
  {
    id: 1,
    email: 'user@example.com',
    password: '$2b$10$K7L1OJ45/4Y2nIvL5lmdIuKj8OU5JO3YX8PwrQvL0ZBQP1JlPQ8Ge', // 'password123'
    role: 'user'
  },
  {
    id: 2,
    email: 'admin@example.com',
    password: '$2b$10$K7L1OJ45/4Y2nIvL5lmdIuKj8OU5JO3YX8PwrQvL0ZBQP1JlPQ8Ge', // 'password123'
    role: 'admin'
  }
];

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token with 24-hour expiration
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      {
        expiresIn: '24h'
      }
    );

    // Return success response with token
    res.status(200).json({
      success: true,
      message: 'Login successful',
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
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;