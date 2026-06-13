'use strict';

/**
 * Lightweight structured logger.
 * Outputs timestamped, levelled, emoji-prefixed lines to stdout/stderr.
 * No external dependencies — keeps the bundle lean.
 */

const LEVELS = {
  debug: { label: 'DEBUG', emoji: '🔍', stream: 'stdout', color: '\x1b[36m' },
  info:  { label: 'INFO ', emoji: '✅', stream: 'stdout', color: '\x1b[32m' },
  warn:  { label: 'WARN ', emoji: '⚠️ ', stream: 'stderr', color: '\x1b[33m' },
  error: { label: 'ERROR', emoji: '❌', stream: 'stderr', color: '\x1b[31m' },
  ai:    { label: 'AI   ', emoji: '🤖', stream: 'stdout', color: '\x1b[35m' },
  db:    { label: 'DB   ', emoji: '🗄️ ', stream: 'stdout', color: '\x1b[34m' },
  http:  { label: 'HTTP ', emoji: '🌐', stream: 'stdout', color: '\x1b[37m' },
};

const RESET = '\x1b[0m';
const isTest = process.env.NODE_ENV === 'test';

function format(level, component, message, meta) {
  const { label, emoji, color } = LEVELS[level] || LEVELS.info;
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0
    ? ' ' + JSON.stringify(meta)
    : '';
  return `${color}${emoji} [${ts}] ${label} [${component}]${RESET} ${message}${metaStr}`;
}

function log(level, component, message, meta) {
  if (isTest) { return; } // Silence logs during tests
  const { stream } = LEVELS[level] || LEVELS.info;
  const line = format(level, component, message, meta);
  if (stream === 'stderr') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

const logger = {
  debug: (component, message, meta) => log('debug', component, message, meta),
  info:  (component, message, meta) => log('info',  component, message, meta),
  warn:  (component, message, meta) => log('warn',  component, message, meta),
  error: (component, message, meta) => log('error', component, message, meta),
  ai:    (component, message, meta) => log('ai',    component, message, meta),
  db:    (component, message, meta) => log('db',    component, message, meta),
  http:  (component, message, meta) => log('http',  component, message, meta),
};

module.exports = logger;
