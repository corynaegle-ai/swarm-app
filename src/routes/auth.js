const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming User model exists
const router = express.Router();

// JWT Secret - in production this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * POST /api/auth/login
 * Authenticates user and returns JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
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
    const tokenPayload = {
      userId: user._id,
      email: user.email,
      role: user.role || 'user' // Include user role in token
    };

    const token = jwt.sign(
      tokenPayload,
      JWT_SECRET,
      { 
        expiresIn: '24h', // Token expires after 24 hours
        issuer: 'swarm-app',
        audience: 'swarm-app-users'
      }
    );

    // Return successful response with token
    res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role || 'user'
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