const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Mock user database - in real app, this would be a database connection
const users = [
  {
    id: 1,
    email: 'admin@example.com',
    password: '$2b$10$rOOjXkgvQvn4vZ8yF7Kz9ONhL1lGvTCqJ8xz4vJ5Q1cQ5vYrZ8XYm', // 'password123'
    role: 'admin'
  },
  {
    id: 2,
    email: 'user@example.com',
    password: '$2b$10$rOOjXkgvQvn4vZ8yF7Kz9ONhL1lGvTCqJ8xz4vJ5Q1cQ5vYrZ8XYm', // 'password123'
    role: 'user'
  }
];

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ 
        error: 'Email and password must be strings' 
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Find user by email
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }

    // Generate JWT token with 24-hour expiration
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || 'fallback-secret-key',
      { 
        expiresIn: '24h',
        issuer: 'swarm-app',
        audience: 'swarm-app-users'
      }
    );

    // Return success response with token
    res.status(200).json({
      success: true,
      token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      expiresIn: '24h'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

module.exports = router;