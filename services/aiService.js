'use strict';

const OpenAI = require('openai');

// ─── Client Setup ────────────────────────────────────────────────────────────

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
const BACKUP_MODEL = process.env.BACKUP_AI_MODEL || 'openai/gpt-4o-mini';

// ─── Core AI Caller with Fallback ────────────────────────────────────────────

/**
 * Calls the primary AI (Gemini). Falls back to OpenRouter on error.
 * @param {Array} messages - OpenAI-format messages array
 * @param {Object} options - { jsonMode, temperature, maxTokens }
 * @returns {Promise<string>} Raw text response
 */
async function callAI(messages, options = {}) {
  const { jsonMode = false, temperature = 0.7, maxTokens = 1200 } = options;

  const baseParams = {
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  // Try primary (Gemini)
  try {
    const res = await geminiClient.chat.completions.create({
      ...baseParams,
      model: DEFAULT_MODEL,
    });
    return res.choices[0].message.content;
  } catch (primaryErr) {
    console.warn(`⚠️  Primary AI (${DEFAULT_MODEL}) failed: ${primaryErr.message}`);
  }

  // Fallback (OpenRouter)
  try {
    const res = await openRouterClient.chat.completions.create({
      ...baseParams,
      model: BACKUP_MODEL,
    });
    return res.choices[0].message.content;
  } catch (backupErr) {
    console.error(`❌ Backup AI (${BACKUP_MODEL}) also failed: ${backupErr.message}`);
    throw new Error('AI service temporarily unavailable. Please try again.');
  }
}

// ─── Prompt 1: Journal Analysis ──────────────────────────────────────────────

/**
 * Deeply analyzes a student's journal entry using exam-specific context.
 * Returns a structured JSON object with triggers, patterns, and strategies.
 */
async function analyzeJournal({ name, examType, moodScore, journalText, avgMood, pastTriggers }) {
  const triggersContext =
    pastTriggers && pastTriggers.length > 0
      ? `Previously identified stress triggers: ${pastTriggers.join(', ')}`
      : 'No previous triggers on record yet.';

  const moodContext =
    avgMood !== null ? `7-day mood average: ${avgMood}/10` : 'First entry — no historical mood data.';

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

  const raw = await callAI(messages, { jsonMode: true, temperature: 0.5 });

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('AI returned malformed analysis. Please try again.');
  }
}

// ─── Prompt 2: Chat Companion ─────────────────────────────────────────────────

/**
 * Conversational AI companion — warm, empathetic, exam-aware.
 * Never generic. Uses student's actual context from DB.
 */
async function chatWithAura({
  name,
  examType,
  userMessage,
  chatHistory,
  recentMoods,
  triggers,
}) {
  const moodSummary =
    recentMoods && recentMoods.length > 0
      ? `Recent moods (past week): ${recentMoods.join(', ')} out of 10`
      : 'New user — no mood history yet';

  const triggerSummary =
    triggers && triggers.length > 0
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

  return await callAI(messages, { temperature: 0.75, maxTokens: 500 });
}

// ─── Prompt 3: Weekly Insights ────────────────────────────────────────────────

/**
 * Generates a weekly pattern analysis across all journal entries.
 */
async function generateWeeklyInsights({ name, examType, entries }) {
  if (!entries || entries.length === 0) {
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

  const raw = await callAI(messages, { jsonMode: true, temperature: 0.5 });

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Failed to parse weekly insights. Please try again.');
  }
}

module.exports = { analyzeJournal, chatWithAura, generateWeeklyInsights };
