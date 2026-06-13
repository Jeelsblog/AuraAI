'use strict';

const express = require('express');
const router  = express.Router();

const { journalSchema, validateUserId } = require('../utils/validators');
const { analyzeJournal }                = require('../services/aiService');
const {
  saveJournalEntry,
  getJournalEntries,
  getRecentMoods,
  getPastTriggers,
} = require('../services/journalService');
const logger = require('../utils/logger');

/**
 * POST /api/journal
 * Validates → fetches context → runs AI analysis → persists to DB.
 */
router.post('/', validateUserId, async (req, res) => {
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('journalController', 'POST /api/journal — validation failed', {
      errors: parsed.error.flatten().fieldErrors,
    });
    return res.status(400).json({
      error:   'Invalid input',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { name, examType, moodScore, journalText } = parsed.data;
  const { userId } = req;

  logger.info('journalController', 'POST /api/journal — processing', {
    userId, examType, moodScore, journalLength: journalText.length,
  });

  try {
    // Fetch historical context in parallel
    logger.db('journalController', 'Fetching mood history + past triggers', { userId });
    const [recentMoods, pastTriggers] = await Promise.all([
      getRecentMoods(userId),
      getPastTriggers(userId),
    ]);

    const avgMood = recentMoods.length > 0
      ? (recentMoods.reduce((s, r) => s + r.mood_score, 0) / recentMoods.length).toFixed(1)
      : null;

    logger.info('journalController', 'Context loaded — calling AI', {
      recentEntries: recentMoods.length,
      avgMood,
      pastTriggers: pastTriggers.length,
    });

    const aiAnalysis = await analyzeJournal({
      name, examType, moodScore, journalText, avgMood, pastTriggers,
    });

    logger.db('journalController', 'Saving journal entry to DB', { userId, examType });
    const entry = await saveJournalEntry({
      userId, examType, moodScore, journalText, aiAnalysis,
    });

    logger.info('journalController', 'POST /api/journal — success', {
      entryId: entry.id,
      stressLevel: aiAnalysis.stress_level,
    });

    return res.status(201).json({
      entryId:   entry.id,
      createdAt: entry.created_at,
      analysis:  aiAnalysis,
    });

  } catch (err) {
    logger.error('journalController', 'POST /api/journal — error', {
      userId,
      error: err.message,
      stack: err.stack?.split('\n')[1]?.trim(),
    });
    return res.status(500).json({ error: err.message || 'Failed to process journal entry' });
  }
});

/**
 * GET /api/journal
 * Returns past journal entries for the authenticated user.
 */
router.get('/', validateUserId, async (req, res) => {
  const { userId } = req;
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  logger.info('journalController', 'GET /api/journal', { userId, limit });

  try {
    const entries = await getJournalEntries(userId, limit);
    logger.db('journalController', 'Entries fetched', { userId, count: entries.length });
    return res.json({ entries });
  } catch (err) {
    logger.error('journalController', 'GET /api/journal — error', { userId, error: err.message });
    return res.status(500).json({ error: 'Failed to retrieve journal entries' });
  }
});

module.exports = router;
