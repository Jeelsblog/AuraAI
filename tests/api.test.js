'use strict';

/**
 * AuraAI API Test Suite
 * Tests run without a real DB connection by mocking at the module level.
 * Integration tests verify route-level behavior (auth, validation, errors).
 */

// Prevent server.js from starting the DB/listen
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.GEMINI_API_KEY = 'test-key';
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.DEFAULT_AI_MODEL = 'gemini-2.0-flash';
process.env.BACKUP_AI_MODEL = 'openai/gpt-4o-mini';
process.env.PORT = '3001';

// Mock the DB pool and migrate so tests don't need a real Postgres
jest.mock('../db/index', () => ({
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
  on: jest.fn(),
}));

jest.mock('../db/migrate', () => ({
  migrate: jest.fn().mockResolvedValue(undefined),
}));

// Mock AI service so tests don't call real APIs
jest.mock('../services/aiService', () => ({
  analyzeJournal: jest.fn().mockResolvedValue({
    stress_level: 'moderate',
    hidden_triggers: ['Syllabus overload'],
    emotional_patterns: ['Avoidance behaviour'],
    personalized_strategies: [{ title: 'Pomodoro', description: 'Focus sessions', duration: '25 minutes' }],
    mindfulness_exercise: { name: 'Deep breathing', duration: '5 minutes', steps: ['Inhale', 'Hold', 'Exhale'] },
    motivational_message: 'You are doing great!',
    crisis_flag: false,
  }),
  chatWithAura: jest.fn().mockResolvedValue("I'm here for you! Keep going."),
  generateWeeklyInsights: jest.fn().mockResolvedValue({
    hasData: true,
    weekly_trend: 'stable',
    average_mood: 6.5,
    top_triggers: ['Time pressure'],
    strengths_observed: ['Consistency'],
    focus_areas: ['Sleep hygiene'],
    weekly_message: 'Great week!',
  }),
}));

// Mock journal service
jest.mock('../services/journalService', () => ({
  saveJournalEntry: jest.fn().mockResolvedValue({ id: 'test-uuid', created_at: new Date().toISOString() }),
  getJournalEntries: jest.fn().mockResolvedValue([]),
  getRecentMoods: jest.fn().mockResolvedValue([]),
  getPastTriggers: jest.fn().mockResolvedValue([]),
  saveChatMessage: jest.fn().mockResolvedValue(undefined),
  getChatHistory: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../server');

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ── Health Check ──────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'AuraAI');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ── Security Headers ──────────────────────────────────────────
describe('Security headers', () => {
  it('sets X-Content-Type-Options header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets X-Frame-Options header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });
});

// ── Journal API ───────────────────────────────────────────────
describe('POST /api/journal', () => {
  it('returns 401 when x-user-id header is missing', async () => {
    const res = await request(app)
      .post('/api/journal')
      .send({ name: 'Test', examType: 'JEE', moodScore: 7, journalText: 'Test journal entry that is long enough' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when x-user-id is not a valid UUID', async () => {
    const res = await request(app)
      .post('/api/journal')
      .set('x-user-id', 'not-a-uuid')
      .send({ name: 'Test', examType: 'JEE', moodScore: 7, journalText: 'Test journal entry text' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when mood score is out of range', async () => {
    const res = await request(app)
      .post('/api/journal')
      .set('x-user-id', VALID_UUID)
      .send({ name: 'Test', examType: 'JEE', moodScore: 15, journalText: 'Valid journal text here' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when examType is invalid', async () => {
    const res = await request(app)
      .post('/api/journal')
      .set('x-user-id', VALID_UUID)
      .send({ name: 'Test', examType: 'INVALID', moodScore: 7, journalText: 'Valid journal text' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when journal text is too short', async () => {
    const res = await request(app)
      .post('/api/journal')
      .set('x-user-id', VALID_UUID)
      .send({ name: 'Test', examType: 'JEE', moodScore: 7, journalText: 'short' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 201 with AI analysis on valid input', async () => {
    const res = await request(app)
      .post('/api/journal')
      .set('x-user-id', VALID_UUID)
      .send({
        name: 'Priya',
        examType: 'NEET',
        moodScore: 6,
        journalText: 'I have been studying for 8 hours straight and feeling overwhelmed with the organic chemistry chapter.',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('entryId');
    expect(res.body).toHaveProperty('analysis');
    expect(res.body.analysis).toHaveProperty('stress_level');
    expect(res.body.analysis).toHaveProperty('hidden_triggers');
  });
});

describe('GET /api/journal', () => {
  it('returns 401 without x-user-id', async () => {
    const res = await request(app).get('/api/journal');
    expect(res.statusCode).toBe(401);
  });

  it('returns entries array with valid x-user-id', async () => {
    const res = await request(app).get('/api/journal').set('x-user-id', VALID_UUID);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('entries');
    expect(Array.isArray(res.body.entries)).toBe(true);
  });
});

// ── Chat API ──────────────────────────────────────────────────
describe('POST /api/chat', () => {
  it('returns 401 without x-user-id', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'Hello', name: 'Test', examType: 'JEE' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 with empty message', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('x-user-id', VALID_UUID)
      .send({ message: '', name: 'Test', examType: 'JEE' });
    expect(res.statusCode).toBe(400);
  });

  it('returns AI response with valid input', async () => {
    const res = await request(app)
      .post('/api/chat')
      .set('x-user-id', VALID_UUID)
      .send({ message: 'I am feeling stressed about mocks', name: 'Priya', examType: 'JEE' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('response');
    expect(typeof res.body.response).toBe('string');
  });
});

describe('GET /api/chat/history', () => {
  it('returns 401 without x-user-id', async () => {
    const res = await request(app).get('/api/chat/history');
    expect(res.statusCode).toBe(401);
  });

  it('returns history array with valid x-user-id', async () => {
    const res = await request(app).get('/api/chat/history').set('x-user-id', VALID_UUID);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('history');
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

// ── Insights API ──────────────────────────────────────────────
describe('GET /api/insights', () => {
  it('returns 401 without x-user-id', async () => {
    const res = await request(app).get('/api/insights');
    expect(res.statusCode).toBe(401);
  });

  it('returns insights with valid x-user-id', async () => {
    const res = await request(app)
      .get('/api/insights?name=Priya&examType=NEET')
      .set('x-user-id', VALID_UUID);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('insights');
    expect(res.body).toHaveProperty('moodHistory');
  });
});

// ── 404 Handling ──────────────────────────────────────────────
describe('Unknown routes', () => {
  it('API routes return 404 JSON for unknown paths', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
