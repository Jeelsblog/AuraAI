'use strict';

const express = require('express');
const router  = express.Router();

const { chatSchema, validateUserId } = require('../utils/validators');
const { chatWithAura }               = require('../services/aiService');
const {
  saveChatMessage,
  getChatHistory,
  getRecentMoods,
  getPastTriggers,
} = require('../services/journalService');
const logger = require('../utils/logger');

/**
 * POST /api/chat
 * Sends a message to Aura, persists conversation, returns AI response.
 */
router.post('/', validateUserId, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn('chatController', 'POST /api/chat — validation failed', {
      errors: parsed.error.flatten().fieldErrors,
    });
    return res.status(400).json({
      error:   'Invalid input',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { message, name, examType } = parsed.data;
  const { userId } = req;

  logger.info('chatController', 'POST /api/chat — incoming message', {
    userId, examType, messageLength: message.length,
  });

  try {
    logger.db('chatController', 'Fetching chat context in parallel', { userId });
    const [chatHistory, recentMoods, triggers] = await Promise.all([
      getChatHistory(userId, 10),
      getRecentMoods(userId),
      getPastTriggers(userId),
    ]);

    logger.info('chatController', 'Context loaded — calling Aura', {
      historyMessages: chatHistory.length,
      moodDataPoints:  recentMoods.length,
      knownTriggers:   triggers.length,
    });

    await saveChatMessage({ userId, role: 'user', content: message });
    logger.db('chatController', 'User message persisted', { userId });

    const aiResponse = await chatWithAura({
      name, examType, userMessage: message,
      chatHistory,
      recentMoods: recentMoods.map((m) => m.mood_score),
      triggers,
    });

    await saveChatMessage({ userId, role: 'assistant', content: aiResponse });
    logger.db('chatController', 'Assistant response persisted', { userId });

    logger.info('chatController', 'POST /api/chat — success', {
      userId, responseLength: aiResponse.length,
    });

    return res.json({ response: aiResponse });

  } catch (err) {
    logger.error('chatController', 'POST /api/chat — error', {
      userId, error: err.message,
    });
    return res.status(500).json({ error: err.message || 'Chat service unavailable' });
  }
});

/**
 * GET /api/chat/history
 * Returns the last 20 messages for the user.
 */
router.get('/history', validateUserId, async (req, res) => {
  const { userId } = req;
  logger.info('chatController', 'GET /api/chat/history', { userId });

  try {
    const history = await getChatHistory(userId, 20);
    logger.db('chatController', 'History fetched', { userId, messages: history.length });
    return res.json({ history });
  } catch (err) {
    logger.error('chatController', 'GET /api/chat/history — error', { userId, error: err.message });
    return res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});

module.exports = router;
