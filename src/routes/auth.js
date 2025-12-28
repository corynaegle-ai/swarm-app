const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Mock user database - in production, use actual database
const users = [
  {
    id: 1,
    email: 'user@example.com',
    password: '$2b$10$K7L/VxwuP2lioN7nkwlqjOr8P5D1P5JjP6kJ1Q5P6kJ1Q5P6kJ1Q5', // 'password123'
    role: 'user'
  },
  {
    id: 2,
    email: 'admin@example.com', 
    password: '$2b$10$K7L/VxwuP2lioN7nkwlqjOr8P5D1P5JjP6kJ1Q5P6kJ1Q5P6kJ1Q5', // 'password123'
    role: 'admin'
  }
];

// POST /api/auth/login endpoint
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

    // Validate password
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
      process.env.JWT_SECRET || 'your-secret-key',
      {
        expiresIn: '24h'
      }
    );

    // Return successful response with token
    res.status(200).json({
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