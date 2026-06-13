'use strict';

const { z } = require('zod');

const EXAM_TYPES = ['NEET', 'JEE', 'CUET', 'CAT', 'GATE', 'UPSC'];

/** Schema for submitting a journal entry */
const journalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).trim(),
  examType: z.enum(EXAM_TYPES, { errorMap: () => ({ message: 'Invalid exam type' }) }),
  moodScore: z.number().int().min(1).max(10),
  journalText: z.string().min(10, 'Journal must be at least 10 characters').max(5000).trim(),
});

/** Schema for chat messages */
const chatSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000).trim(),
  name: z.string().min(1).max(100).trim(),
  examType: z.enum(EXAM_TYPES),
});

/** UUID validator for x-user-id header */
const uuidSchema = z.string().uuid('x-user-id must be a valid UUID');

/**
 * Express middleware — validates the x-user-id header.
 * Attaches req.userId on success, returns 401 on failure.
 */
function validateUserId(req, res, next) {
  const result = uuidSchema.safeParse(req.headers['x-user-id']);
  if (!result.success) {
    return res.status(401).json({ error: 'Valid x-user-id header (UUID) is required' });
  }
  req.userId = result.data;
  next();
}

module.exports = { journalSchema, chatSchema, validateUserId, EXAM_TYPES };
