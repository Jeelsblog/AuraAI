'use strict';

const express = require('express');
const router = express.Router();

const { journalSchema, validateUserId } = require('../utils/validators');
const { analyzeJournal } = require('../services/aiService');
const {
  saveJournalEntry,
  getJournalEntries,
  getRecentMoods,
  getPastTriggers,
} = require('../services/journalService');

/**
 * POST /api/journal
 * Submit a journal entry — validates, runs AI analysis, persists to DB.
 */
router.post('/', validateUserId, async (req, res) => {
  const parsed = journalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { name, examType, moodScore, journalText } = parsed.data;
  const { userId } = req;

  try {
    // Fetch context in parallel to speed up response
    const [recentMoods, pastTriggers] = await Promise.all([
      getRecentMoods(userId),
      getPastTriggers(userId),
    ]);

    const avgMood =
      recentMoods.length > 0
        ? (recentMoods.reduce((sum, r) => sum + r.mood_score, 0) / recentMoods.length).toFixed(1)
        : null;

    const aiAnalysis = await analyzeJournal({
      name,
      examType,
      moodScore,
      journalText,
      avgMood,
      pastTriggers,
    });

    const entry = await saveJournalEntry({
      userId,
      examType,
      moodScore,
      journalText,
      aiAnalysis,
    });

    return res.status(201).json({
      entryId: entry.id,
      createdAt: entry.created_at,
      analysis: aiAnalysis,
    });
  } catch (err) {
    console.error('[journalController] POST error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to process journal entry' });
  }
});

/**
 * GET /api/journal
 * Retrieve past journal entries for the authenticated user.
 */
router.get('/', validateUserId, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const entries = await getJournalEntries(req.userId, limit);
    return res.json({ entries });
  } catch (err) {
    console.error('[journalController] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve journal entries' });
  }
});

module.exports = router;
