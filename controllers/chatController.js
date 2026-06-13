'use strict';

const express = require('express');
const router = express.Router();

const { chatSchema, validateUserId } = require('../utils/validators');
const { chatWithAura } = require('../services/aiService');
const {
  saveChatMessage,
  getChatHistory,
  getRecentMoods,
  getPastTriggers,
} = require('../services/journalService');

/**
 * POST /api/chat
 * Send a message to Aura (AI companion). Persists conversation + returns response.
 */
router.post('/', validateUserId, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid input',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { message, name, examType } = parsed.data;
  const { userId } = req;

  try {
    // Gather all context in parallel
    const [chatHistory, recentMoods, triggers] = await Promise.all([
      getChatHistory(userId, 10),
      getRecentMoods(userId),
      getPastTriggers(userId),
    ]);

    const recentMoodScores = recentMoods.map((m) => m.mood_score);

    // Persist user message before calling AI
    await saveChatMessage({ userId, role: 'user', content: message });

    const aiResponse = await chatWithAura({
      name,
      examType,
      userMessage: message,
      chatHistory,
      recentMoods: recentMoodScores,
      triggers,
    });

    // Persist AI response
    await saveChatMessage({ userId, role: 'assistant', content: aiResponse });

    return res.json({ response: aiResponse });
  } catch (err) {
    console.error('[chatController] POST error:', err.message);
    return res.status(500).json({ error: err.message || 'Chat service unavailable' });
  }
});

/**
 * GET /api/chat/history
 * Retrieve the last 20 messages for the authenticated user.
 */
router.get('/history', validateUserId, async (req, res) => {
  try {
    const history = await getChatHistory(req.userId, 20);
    return res.json({ history });
  } catch (err) {
    console.error('[chatController] GET history error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});

module.exports = router;
