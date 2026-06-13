'use strict';

const pool = require('../db');
const logger = require('../utils/logger');

/**
 * Finds a user by email, or creates one if they don't exist.
 * This acts as a frictionless login/signup.
 */
async function findOrCreateUser({ email, name, examType }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Try to find existing user
    const selectRes = await client.query(
      'SELECT id, email, name, exam_type AS "examType" FROM users WHERE email = $1',
      [email]
    );

    if (selectRes.rows.length > 0) {
      logger.db('userService', 'Found existing user', { email });
      await client.query('COMMIT');
      return { user: selectRes.rows[0], isNew: false };
    }

    // 2. Create new user if not found
    const insertRes = await client.query(
      `INSERT INTO users (email, name, exam_type)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, exam_type AS "examType"`,
      [email, name, examType]
    );

    logger.db('userService', 'Created new user', { email, userId: insertRes.rows[0].id });
    await client.query('COMMIT');
    return { user: insertRes.rows[0], isNew: true };

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('userService', 'Failed to find/create user', { email, error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { findOrCreateUser };
