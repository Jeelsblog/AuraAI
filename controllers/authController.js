'use strict';

const express = require('express');
const router  = express.Router();

const { authSchema } = require('../utils/validators');
const { findOrCreateUser } = require('../services/userService');
const logger = require('../utils/logger');

/**
 * GET /api/auth/check-email?email=...
 * Returns whether the email exists in the database.
 */
router.get('/check-email', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }
  try {
    const { findOrCreateUser } = require('../services/userService');
    // Peek — just look up, don't create
    const pool = require('../db');
    const result = await pool.query(
      'SELECT id, email, name, exam_type AS "examType" FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length > 0) {
      logger.info('authController', 'GET /api/auth/check-email — existing user', { email });
      return res.json({ exists: true, user: result.rows[0] });
    }
    logger.info('authController', 'GET /api/auth/check-email — new user', { email });
    return res.json({ exists: false });
  } catch (err) {
    logger.error('authController', 'GET /api/auth/check-email — error', { error: err.message });
    return res.status(500).json({ error: 'Failed to check email' });
  }
});

/**
 * POST /api/auth/login
 * Frictionless login/signup: Returns a persistent database user ID for a given email.
 */
router.post('/login', async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('authController', 'POST /api/auth/login — validation failed', {
      errors: parsed.error.flatten().fieldErrors,
    });
    return res.status(400).json({
      error: 'Invalid input',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { email, name, examType } = parsed.data;

  try {
    const { user, isNew } = await findOrCreateUser({ email, name, examType });
    
    logger.info('authController', 'POST /api/auth/login — success', {
      userId: user.id,
      email: user.email,
      isNew,
    });

    return res.json({ user, isNew });
  } catch (err) {
    logger.error('authController', 'POST /api/auth/login — error', { error: err.message });
    return res.status(500).json({ error: 'Failed to process login' });
  }
});

module.exports = router;
