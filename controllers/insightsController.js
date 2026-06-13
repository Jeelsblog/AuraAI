'use strict';

const express = require('express');
const router = express.Router();

const { validateUserId, EXAM_TYPES } = require('../utils/validators');
const { generateWeeklyInsights } = require('../services/aiService');
const { getJournalEntries, getRecentMoods } = require('../services/journalService');

/**
 * GET /api/insights
 * Returns AI-generated weekly pattern analysis + mood history for the chart.
 * name and examType come from query params (sourced from localStorage on frontend).
 */
router.get('/', validateUserId, async (req, res) => {
  const { userId } = req;
  const name = String(req.query.name || 'Student').substring(0, 100);
  const examType = EXAM_TYPES.includes(req.query.examType) ? req.query.examType : 'JEE';

  try {
    const [entries, moodHistory] = await Promise.all([
      getJournalEntries(userId, 7),
      getRecentMoods(userId, 7),
    ]);

    const insights = await generateWeeklyInsights({ name, examType, entries });

    return res.json({ insights, moodHistory });
  } catch (err) {
    console.error('[insightsController] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
});

module.exports = router;
