'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('./index');

/**
 * Runs all SQL migrations idempotently.
 * Safe to call on every server start — uses IF NOT EXISTS throughout.
 */
async function migrate() {
  const sqlPath = path.join(__dirname, '../migrations/001_initial.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Database migrations applied successfully');
  } catch (err) {
    console.error('❌ Database migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrate };
