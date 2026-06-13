'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const { migrate }      = require('./db/migrate');
const journalRoutes    = require('./controllers/journalController');
const chatRoutes       = require('./controllers/chatController');
const insightsRoutes   = require('./controllers/insightsController');
const logger           = require('./utils/logger');

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // needed for inline app.js event handlers
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// ─── Rate Limiting (disabled in test env to prevent 429s in CI) ─
const isTest = process.env.NODE_ENV === 'test';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a few minutes.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 1000 : 10,
  message: { error: 'AI request limit reached — please wait a moment.' },
});

app.use('/api/', apiLimiter);
app.use('/api/journal', aiLimiter);
app.use('/api/chat', aiLimiter);
app.use('/api/insights', aiLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ─── HTTP Request Logger ───────────────────────────────────────────────
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test' && req.path.startsWith('/api/')) {
    logger.http('server', `${req.method} ${req.path}`, {
      ip:          req.ip,
      userAgent:   req.headers['user-agent']?.substring(0, 60),
      userId:      req.headers['x-user-id']?.substring(0, 8) + '...',
    });
  }
  next();
});

// ─── Static Files (Frontend) ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/journal', journalRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/insights', insightsRoutes);

// Health check — used by tests and deployment platforms
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'AuraAI' });
});

// ─── 404 for unknown /api/* routes (must come before SPA fallback) ─
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ─── SPA Fallback (non-API routes serve the frontend) ────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error('server', 'Unhandled Express error', {
    path:  req.path,
    error: err.message,
    stack: err.stack?.split('\n')[1]?.trim(),
  });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
  await migrate();
  app.listen(PORT, () => {
    logger.info('server', '====================================');
    logger.info('server', '🧠  AuraAI Mental Wellness Tracker');
    logger.info('server', `🚀  http://localhost:${PORT}`);
    logger.info('server', `🤖  Primary AI : ${process.env.DEFAULT_AI_MODEL || 'gemini-2.0-flash'}`);
    logger.info('server', `🔄  Backup AI  : ${process.env.BACKUP_AI_MODEL  || 'openai/gpt-4o-mini'}`);
    logger.info('server', `🌍  Env        : ${process.env.NODE_ENV || 'development'}`);
    logger.info('server', '====================================');
  });
}

// Only start listening when run directly (not during tests)
if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}

module.exports = app;
