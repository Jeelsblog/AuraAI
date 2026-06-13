-- AuraAI Mental Wellness Tracker — Initial Schema
-- User identity (UUID + name + examType) lives in localStorage only.
-- Postgres stores content data ONLY — no session tracking.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table for email-based identity
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  exam_type   VARCHAR(20) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Journal entries: mood logs + open-ended journal + AI analysis
CREATE TABLE IF NOT EXISTS journal_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  exam_type     VARCHAR(20) NOT NULL CHECK (exam_type IN ('NEET', 'JEE', 'CUET', 'CAT', 'GATE', 'UPSC')),
  mood_score    SMALLINT    NOT NULL CHECK (mood_score BETWEEN 1 AND 10),
  journal_text  TEXT        NOT NULL,
  ai_analysis   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat messages: conversational AI companion history
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast per-user queries
CREATE INDEX IF NOT EXISTS idx_journal_user_created ON journal_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_user_created    ON chat_messages   (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_exam_type    ON journal_entries (exam_type);
