'use strict';

const pool = require('../db/index');

// ─── Journal ────────────────────────────────────────────────────────────────

/**
 * Persist a new journal entry with its AI analysis.
 */
async function saveJournalEntry({ userId, examType, moodScore, journalText, aiAnalysis }) {
  const result = await pool.query(
    `INSERT INTO journal_entries (user_id, exam_type, mood_score, journal_text, ai_analysis)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [userId, examType, moodScore, journalText, JSON.stringify(aiAnalysis)]
  );
  return result.rows[0];
}

/**
 * Retrieve the most recent journal entries for a user.
 */
async function getJournalEntries(userId, limit = 30) {
  const result = await pool.query(
    `SELECT id, exam_type, mood_score, journal_text, ai_analysis, created_at
     FROM journal_entries
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * Get mood scores for the past N days — used for trend chart and AI context.
 */
async function getRecentMoods(userId, days = 7) {
  const result = await pool.query(
    `SELECT mood_score, created_at
     FROM journal_entries
     WHERE user_id = $1
       AND created_at >= NOW() - ($2 || ' days')::INTERVAL
     ORDER BY created_at ASC`,
    [userId, days]
  );
  return result.rows;
}

/**
 * Extract all unique triggers from recent AI analyses — feeds into next analysis.
 */
async function getPastTriggers(userId) {
  const result = await pool.query(
    `SELECT ai_analysis -> 'hidden_triggers' AS triggers
     FROM journal_entries
     WHERE user_id = $1
       AND ai_analysis IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 7`,
    [userId]
  );
  const all = result.rows.flatMap((row) => row.triggers || []);
  return [...new Set(all)].slice(0, 10);
}

// ─── Chat ────────────────────────────────────────────────────────────────────

/**
 * Persist a single chat message (user or assistant).
 */
async function saveChatMessage({ userId, role, content }) {
  await pool.query(
    `INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)`,
    [userId, role, content]
  );
}

/**
 * Retrieve recent chat history for a user (oldest first for context).
 */
async function getChatHistory(userId, limit = 20) {
  const result = await pool.query(
    `SELECT role, content, created_at
     FROM (
       SELECT role, content, created_at
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) sub
     ORDER BY created_at ASC`,
    [userId, limit]
  );
  return result.rows;
}

module.exports = {
  saveJournalEntry,
  getJournalEntries,
  getRecentMoods,
  getPastTriggers,
  saveChatMessage,
  getChatHistory,
};
