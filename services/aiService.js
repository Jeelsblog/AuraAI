'use strict';

const OpenAI = require('openai');
const logger = require('../utils/logger');

// ─── Client Setup ─────────────────────────────────────────────────────────────

const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || 'placeholder',
  baseURL:
    process.env.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const openRouterClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || 'placeholder',
  baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://aura-ai-wellness.app',
    'X-Title': 'AuraAI Mental Wellness Tracker',
  },
});

const DEFAULT_MODEL = process.env.DEFAULT_AI_MODEL || 'gemini-2.0-flash';
const BACKUP_MODEL  = process.env.BACKUP_AI_MODEL  || 'openai/gpt-4o-mini';

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

/**
 * Robustly extracts a JSON object from an AI response.
 * Handles: raw JSON, markdown code fences (```json ... ```), extra prose.
 */
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty response from AI');
  }

  // 1. Strip markdown code fences
  let cleaned = raw
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/im, '')
    .trim();

  // 2. Direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) { /* continue */ }

  // 3. Extract first { ... } block (handles prose before/after)
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (_) { /* continue */ }
  }

  // Log first 800 chars of bad response so devs can see what went wrong
  logger.error('aiService', 'JSON extraction failed — raw response excerpt', {
    excerpt: raw.substring(0, 800),
    length: raw.length,
  });
  throw new Error('AI returned malformed JSON. Please try again.');
}

// ─── Core AI Caller with Fallback ────────────────────────────────────────────

/**
 * Calls the primary AI (Gemini). Falls back to OpenRouter on error.
 * @param {Array}  messages  - OpenAI-format messages array
 * @param {Object} options   - { temperature, maxTokens, label }
 * @returns {Promise<string>} Raw text response
 */
async function callAI(messages, options = {}) {
  const { temperature = 0.7, maxTokens = 2500, label = 'call' } = options;

  const baseParams = { messages, temperature, max_tokens: maxTokens };

  // ── Primary: Gemini ──────────────────────────────────────────
  logger.ai('aiService', `[${label}] Calling primary model`, {
    model: DEFAULT_MODEL,
    messages: messages.length,
    maxTokens,
  });

  const t0 = Date.now();
  try {
    const res = await geminiClient.chat.completions.create({
      ...baseParams,
      model: DEFAULT_MODEL,
    });
    const content   = res.choices[0].message.content;
    const usage     = res.usage || {};
    const elapsed   = Date.now() - t0;

    logger.ai('aiService', `[${label}] Primary model responded`, {
      model:         DEFAULT_MODEL,
      promptTokens:  usage.prompt_tokens,
      outputTokens:  usage.completion_tokens,
      totalTokens:   usage.total_tokens,
      responseChars: content?.length,
      elapsedMs:     elapsed,
    });

    return content;
  } catch (primaryErr) {
    logger.warn('aiService', `[${label}] Primary AI failed — switching to backup`, {
      model:   DEFAULT_MODEL,
      error:   primaryErr.message,
      elapsed: Date.now() - t0,
    });
  }

  // ── Fallback: OpenRouter ─────────────────────────────────────
  logger.ai('aiService', `[${label}] Calling backup model`, {
    model: BACKUP_MODEL,
    maxTokens,
  });

  const t1 = Date.now();
  try {
    const res = await openRouterClient.chat.completions.create({
      ...baseParams,
      model: BACKUP_MODEL,
    });
    const content = res.choices[0].message.content;
    const usage   = res.usage || {};
    const elapsed = Date.now() - t1;

    logger.ai('aiService', `[${label}] Backup model responded`, {
      model:         BACKUP_MODEL,
      promptTokens:  usage.prompt_tokens,
      outputTokens:  usage.completion_tokens,
      totalTokens:   usage.total_tokens,
      responseChars: content?.length,
      elapsedMs:     elapsed,
    });

    return content;
  } catch (backupErr) {
    logger.error('aiService', `[${label}] Both AI providers failed`, {
      backup: BACKUP_MODEL,
      error:  backupErr.message,
    });
    throw new Error('AI service temporarily unavailable. Please try again.');
  }
}

// ─── Prompt 1: Journal Analysis ───────────────────────────────────────────────

/**
 * Deeply analyzes a student's journal entry using exam-specific context.
 * Returns a structured JSON object with triggers, patterns, and strategies.
 */
async function analyzeJournal({ name, examType, moodScore, journalText, avgMood, pastTriggers }) {
  logger.info('aiService', 'analyzeJournal — start', {
    name, examType, moodScore,
    journalLength: journalText?.length,
    hasHistory: !!avgMood,
    pastTriggerCount: pastTriggers?.length ?? 0,
  });

  const triggersContext = pastTriggers && pastTriggers.length > 0
    ? `Previously identified stress triggers: ${pastTriggers.join(', ')}`
    : 'No previous triggers on record yet.';

  const moodContext = avgMood !== null
    ? `7-day mood average: ${avgMood}/10`
    : 'First entry — no historical mood data.';

  const messages = [
    {
      role: 'system',
      content: `You are an expert clinical psychologist specializing in student mental wellness for Indian competitive exams (NEET, JEE, CUET, CAT, GATE, UPSC).
You deeply understand the unique pressures: long study hours, parental expectations, peer comparison, fear of failure, and social isolation.
Your role is to analyze journal entries and identify HIDDEN, SPECIFIC triggers — not generic platitudes.
You MUST respond with ONLY valid JSON. No preamble, no explanation outside JSON.`,
    },
    {
      role: 'user',
      content: `Student: ${name}
Exam preparing for: ${examType}
Today's mood: ${moodScore}/10
${moodContext}
${triggersContext}

Journal Entry:
"${journalText}"

Analyze this entry deeply. Return EXACTLY this JSON structure (no extra fields):
{
  "stress_level": "low|moderate|high|critical",
  "hidden_triggers": [
    "Specific trigger unique to their situation (not generic)"
  ],
  "emotional_patterns": [
    "Specific pattern observed in their language and context"
  ],
  "personalized_strategies": [
    {
      "title": "Strategy name",
      "description": "Actionable, specific to ${examType} preparation context",
      "duration": "X minutes"
    }
  ],
  "mindfulness_exercise": {
    "name": "Exercise name relevant to their stress type",
    "duration": "X minutes",
    "steps": ["Concrete step 1", "Concrete step 2", "Concrete step 3", "Concrete step 4"]
  },
  "motivational_message": "Personal, specific message referencing their ${examType} journey — not generic",
  "crisis_flag": false
}`,
    },
  ];

  const raw = await callAI(messages, {
    temperature: 0.5,
    maxTokens: 2500,   // ← increased: detailed JSON with strategies needs room
    label: 'analyzeJournal',
  });

  try {
    const result = extractJSON(raw);
    logger.info('aiService', 'analyzeJournal — success', {
      stressLevel: result.stress_level,
      triggerCount: result.hidden_triggers?.length,
      strategyCount: result.personalized_strategies?.length,
      crisisFlag: result.crisis_flag,
    });
    return result;
  } catch (err) {
    logger.error('aiService', 'analyzeJournal — JSON parse failed', {
      error: err.message,
      rawLength: raw?.length,
    });
    throw new Error(err.message || 'AI returned malformed analysis. Please try again.');
  }
}

// ─── Prompt 2: Chat Companion ─────────────────────────────────────────────────

/**
 * Conversational AI companion — warm, empathetic, exam-aware.
 */
async function chatWithAura({ name, examType, userMessage, chatHistory, recentMoods, triggers }) {
  logger.info('aiService', 'chatWithAura — start', {
    name, examType,
    messageLength: userMessage?.length,
    historyLength: chatHistory?.length,
    moodDataPoints: recentMoods?.length,
    knownTriggers: triggers?.length,
  });

  const moodSummary = recentMoods && recentMoods.length > 0
    ? `Recent moods (past week): ${recentMoods.join(', ')} out of 10`
    : 'New user — no mood history yet';

  const triggerSummary = triggers && triggers.length > 0
    ? `Known stress triggers: ${triggers.join(', ')}`
    : 'No triggers identified yet';

  const systemPrompt = `You are Aura, a warm and deeply empathetic AI wellness companion for ${name}, who is preparing for ${examType}.

You understand the unique struggle of Indian competitive exam preparation:
- The pressure of syllabus overload and time constraints
- Parental sacrifices and expectations
- Seeing peers succeed while feeling left behind
- Sleep deprivation and physical burnout
- Self-doubt during mock test seasons

What you know about ${name} right now:
- ${moodSummary}
- ${triggerSummary}

Your communication style:
- Warm but grounded — like a caring senior who has been through it
- Responses are 2-4 sentences UNLESS they need more
- Always specific to their exam context — NEVER generic wellness advice
- Acknowledge their feelings before offering any advice
- If you detect extreme distress, crisis signals, or self-harm ideation, ALWAYS include: "Please reach out to VANDREVALA FOUNDATION: 1860-2662-345 (free, 24/7 in Hindi & English)"
- You are NOT a therapist — you are a supportive companion`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(chatHistory || []).slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const response = await callAI(messages, {
    temperature: 0.75,
    maxTokens: 600,
    label: 'chatWithAura',
  });

  logger.info('aiService', 'chatWithAura — success', {
    responseLength: response?.length,
  });

  return response;
}

// ─── Prompt 3: Weekly Insights ────────────────────────────────────────────────

/**
 * Generates a weekly pattern analysis across all journal entries.
 */
async function generateWeeklyInsights({ name, examType, entries }) {
  logger.info('aiService', 'generateWeeklyInsights — start', {
    name, examType, entryCount: entries?.length,
  });

  if (!entries || entries.length === 0) {
    logger.info('aiService', 'generateWeeklyInsights — skipped (no data)');
    return {
      hasData: false,
      message: 'Keep journaling daily — your first weekly insight will appear after a few entries!',
    };
  }

  const summary = entries
    .map(
      (e) =>
        `[${new Date(e.created_at).toLocaleDateString('en-IN', { weekday: 'short' })}] Mood: ${e.mood_score}/10 — "${e.journal_text.substring(0, 120).replace(/\n/g, ' ')}..."`
    )
    .join('\n');

  const messages = [
    {
      role: 'system',
      content: `You are a mental wellness analyst. Analyze multiple journal entries and return ONLY valid JSON. Be specific and empathetic.`,
    },
    {
      role: 'user',
      content: `Analyze these ${entries.length} entries for ${name} (${examType} aspirant):

${summary}

Return EXACTLY this JSON:
{
  "hasData": true,
  "weekly_trend": "improving|stable|declining",
  "average_mood": 7.2,
  "peak_stress_day": "Monday|Tuesday|...|Sunday or null",
  "top_triggers": ["Specific trigger 1", "Specific trigger 2"],
  "strengths_observed": ["Resilience pattern 1"],
  "focus_areas": ["Area needing attention"],
  "weekly_message": "Warm, specific encouragement for the week ahead in ${examType} prep"
}`,
    },
  ];

  const raw = await callAI(messages, {
    temperature: 0.5,
    maxTokens: 1500,
    label: 'generateWeeklyInsights',
  });

  try {
    const result = extractJSON(raw);
    logger.info('aiService', 'generateWeeklyInsights — success', {
      weeklyTrend: result.weekly_trend,
      averageMood: result.average_mood,
      triggerCount: result.top_triggers?.length,
    });
    return result;
  } catch (err) {
    logger.error('aiService', 'generateWeeklyInsights — JSON parse failed', {
      error: err.message,
      rawLength: raw?.length,
    });
    throw new Error(err.message || 'Failed to parse weekly insights. Please try again.');
  }
}

module.exports = { analyzeJournal, chatWithAura, generateWeeklyInsights };
