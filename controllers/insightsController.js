'use strict';

const express = require('express');
const router  = express.Router();

const { validateUserId, EXAM_TYPES } = require('../utils/validators');
const { generateWeeklyInsights }     = require('../services/aiService');
const { getJournalEntries, getRecentMoods } = require('../services/journalService');
const logger = require('../utils/logger');

/**
 * GET /api/insights
 * Returns AI-generated weekly pattern analysis + mood history for the chart.
 */
router.get('/', validateUserId, async (req, res) => {
  const { userId } = req;
  const name     = String(req.query.name     || 'Student').substring(0, 100);
  const examType = EXAM_TYPES.includes(req.query.examType) ? req.query.examType : 'JEE';

  logger.info('insightsController', 'GET /api/insights', { userId, name, examType });

  try {
    logger.db('insightsController', 'Fetching entries + mood history', { userId });
    const [entries, moodHistory] = await Promise.all([
      getJournalEntries(userId, 7),
      getRecentMoods(userId, 7),
    ]);

    logger.info('insightsController', 'Data fetched — generating insights', {
      entriesFound:      entries.length,
      moodDataPoints:    moodHistory.length,
    });

    const insights = await generateWeeklyInsights({ name, examType, entries });

    logger.info('insightsController', 'GET /api/insights — success', {
      hasData:     insights.hasData,
      weeklyTrend: insights.weekly_trend,
    });

    return res.json({ insights, moodHistory });

  } catch (err) {
    logger.error('insightsController', 'GET /api/insights — error', {
      userId, error: err.message,
    });
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
});

module.exports = router;
