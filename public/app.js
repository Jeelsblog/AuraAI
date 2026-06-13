/**
 * AuraAI — Frontend Application
 * All API keys are server-side only. This file contains NO secrets.
 * DOMPurify is used for all dynamic HTML to prevent XSS.
 */

'use strict';

// ── Constants & State ─────────────────────────────────────────
const API = {
  JOURNAL:  '/api/journal',
  CHAT:     '/api/chat',
  INSIGHTS: '/api/insights',
  HEALTH:   '/api/health',
};

const MOOD_LABELS = {
  1: 'Extremely Anxious', 2: 'Very Anxious', 3: 'Low',
  4: 'Below Average',     5: 'Neutral',      6: 'Okay',
  7: 'Good',              8: 'Great',        9: 'Excellent', 10: 'On Top of the World! 🌟',
};

const MOOD_COLORS = {
  1: '#ef4444', 2: '#ef4444', 3: '#f97316', 4: '#f97316',
  5: '#eab308', 6: '#eab308', 7: '#84cc16', 8: '#84cc16',
  9: '#10b981', 10: '#10b981',
};

let state = {
  user: null,       // { id, name, examType } — from localStorage
  currentMood: 5,
  submitting: false,
  chatOpen: false,
  chatSending: false,
  moodChart: null,
  lastAnalysis: null,
  insightsGenerated: false,  // true once user has explicitly created insights
};

// ── User Identity (localStorage, no server session) ───────────
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function loadUser() {
  try {
    const raw = localStorage.getItem('auraai_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  localStorage.setItem('auraai_user', JSON.stringify(user));
}

// ── API Helpers ───────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const user = state.user;
  const headers = {
    'Content-Type': 'application/json',
    ...(user ? { 'x-user-id': user.id } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ── Safe Text Rendering (XSS prevention) ─────────────────────
function sanitizeText(str) {
  const s = String(str == null ? '' : str);
  // Use DOMPurify if loaded; strip all HTML tags for plain text output
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }
  // Fallback: manual HTML entity encoding (safe for textContent)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function setTextSafe(el, text) {
  if (el) { el.textContent = sanitizeText(text); }
}

// ── Toast Notifications ───────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = sanitizeText(message);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Tab Navigation ────────────────────────────────────────────
function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isActive = panel.id === `tab-${tabName}`;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });

  // Load data on tab switch
  if (tabName === 'dashboard') { loadDashboard(); }
  // Insights: only show landing — never auto-generate
  if (tabName === 'insights' && !state.insightsGenerated) { showInsightsLanding(); }
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(btn.dataset.tab);
      }
    });
  });
}

// ── Onboarding ────────────────────────────────────────────────
function initOnboarding() {
  const overlay     = document.getElementById('onboarding-overlay');
  const form        = document.getElementById('onboarding-form');
  const emailInput  = document.getElementById('onboard-email');
  const nameInput   = document.getElementById('onboard-name');
  const examInput   = document.getElementById('onboard-exam');
  const submitBtn   = document.getElementById('onboard-submit');
  const examBtns    = document.querySelectorAll('.exam-option');

  let selectedExam = '';

  examBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      examBtns.forEach((b) => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
      selectedExam = btn.dataset.exam;
      examInput.value = selectedExam;
      validateOnboarding();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });

  emailInput.addEventListener('input', validateOnboarding);
  nameInput.addEventListener('input', validateOnboarding);

  function validateOnboarding() {
    const validEmail = emailInput.value.trim().length >= 3 && emailInput.value.includes('@');
    const validName = nameInput.value.trim().length >= 1;
    const valid = validEmail && validName && selectedExam;
    submitBtn.disabled = !valid;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const name = sanitizeText(nameInput.value.trim());
    if (!email || !name || !selectedExam) { return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Setting up...';

    try {
      // Create user in backend or fetch existing
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, examType: selectedExam })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to login');

      // The DB ID is now our universal identity token
      const user = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        examType: data.user.examType
      };

      saveUser(user);
      state.user = user;

      overlay.style.display = 'none';
      if (data.isNew) {
        showToast('Welcome to AuraAI! ✨', 'success');
      } else {
        showToast(`Welcome back, ${user.name}! 🌸`, 'success');
      }
      initApp();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Start my wellness journey →';
      showToast(err.message, 'error');
    }
  });

  // Focus first input
  setTimeout(() => emailInput.focus(), 100);
}

// ── Header ────────────────────────────────────────────────────
function updateHeader() {
  const { name, examType } = state.user;
  setTextSafe(document.getElementById('header-greeting'), `Hey, ${name} 👋`);
  setTextSafe(document.getElementById('header-exam'), examType);
}

// ── Check-In Greeting ─────────────────────────────────────────
function updateCheckinGreeting() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    hour < 21 ? 'Good evening' : 'Studying late?';

  setTextSafe(document.getElementById('checkin-greeting'), `${greeting}, ${state.user.name} ✨`);
  setTextSafe(
    document.getElementById('checkin-date'),
    new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  );
}

// ── Mood Slider ───────────────────────────────────────────────
function initMoodSlider() {
  const slider    = document.getElementById('mood-slider');
  const display   = document.getElementById('mood-score-display');
  const labelText = document.getElementById('mood-label-text');

  function updateMoodUI(value) {
    state.currentMood = parseInt(value, 10);
    const color = MOOD_COLORS[state.currentMood];
    setTextSafe(display, state.currentMood);
    setTextSafe(labelText, MOOD_LABELS[state.currentMood]);
    display.style.color = color;
    slider.setAttribute('aria-valuenow', state.currentMood);
    slider.setAttribute('aria-valuetext', MOOD_LABELS[state.currentMood]);
    updateSubmitBtn();
  }

  slider.addEventListener('input', (e) => updateMoodUI(e.target.value));
  updateMoodUI(slider.value);

  // Emoji shortcuts
  document.querySelectorAll('.mood-emoji-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mood = parseInt(btn.dataset.mood, 10);
      slider.value = mood;
      updateMoodUI(mood);
      document.querySelectorAll('.mood-emoji-item').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });
}

// ── Journal Textarea ──────────────────────────────────────────
function initJournalTextarea() {
  const textarea  = document.getElementById('journal-textarea');
  const counter   = document.getElementById('char-count');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    setTextSafe(counter, `${len} / 5000`);
    counter.style.color = len > 4500 ? 'var(--warning)' : '';
    updateSubmitBtn();
  });
}

function updateSubmitBtn() {
  const textarea  = document.getElementById('journal-textarea');
  const btn       = document.getElementById('submit-journal-btn');
  const hasText   = textarea && textarea.value.trim().length >= 10;
  if (btn) { btn.disabled = !hasText || state.submitting; }
}

// ── Journal Submission ────────────────────────────────────────
async function submitJournal() {
  if (state.submitting) { return; }

  const textarea = document.getElementById('journal-textarea');
  const btn      = document.getElementById('submit-journal-btn');
  const text     = textarea.value.trim();

  if (text.length < 10) {
    showToast('Please write at least 10 characters in your journal', 'error');
    return;
  }

  state.submitting = true;
  btn.disabled  = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = '<span class="loading-spinner"></span> Analyzing...';

  try {
    const data = await apiFetch(API.JOURNAL, {
      method: 'POST',
      body: JSON.stringify({
        name:        state.user.name,
        examType:    state.user.examType,
        moodScore:   state.currentMood,
        journalText: text,
      }),
    });

    state.lastAnalysis = data.analysis;
    renderAnalysis(data.analysis);
    showToast('✨ Analysis complete!', 'success');
    textarea.value = '';
    setTextSafe(document.getElementById('char-count'), '0 / 5000');

  } catch (err) {
    showToast(err.message || 'Could not analyze entry. Please try again.', 'error');
  } finally {
    state.submitting = false;
    btn.setAttribute('aria-busy', 'false');
    btn.innerHTML = 'Analyze with AI ✨';
    updateSubmitBtn();
  }
}

function renderAnalysis(analysis) {
  if (!analysis) { return; }

  const result = document.getElementById('analysis-result');

  // Stress badge
  const badge = document.getElementById('analysis-stress-badge');
  const level = sanitizeText(analysis.stress_level || 'moderate');
  const icons = { low: '✅', moderate: '⚠️', high: '🔴', critical: '🚨' };
  badge.className = `stress-badge stress-${level}`;
  setTextSafe(badge, `${icons[level] || '⚠️'} ${level.charAt(0).toUpperCase() + level.slice(1)} Stress`);

  // Triggers
  const triggersEl = document.getElementById('analysis-triggers');
  triggersEl.innerHTML = '';
  (analysis.hidden_triggers || []).forEach((t) => {
    const tag = document.createElement('span');
    tag.className = 'tag tag-warning';
    setTextSafe(tag, t);
    triggersEl.appendChild(tag);
  });

  // Patterns
  const patternsEl = document.getElementById('analysis-patterns');
  patternsEl.innerHTML = '';
  (analysis.emotional_patterns || []).forEach((p) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    setTextSafe(tag, p);
    patternsEl.appendChild(tag);
  });

  // Strategies
  const strategiesEl = document.getElementById('analysis-strategies');
  strategiesEl.innerHTML = '';
  (analysis.personalized_strategies || []).forEach((s) => {
    const item = document.createElement('div');
    item.className = 'strategy-item';

    const title = document.createElement('div');
    title.className = 'strategy-title';
    setTextSafe(title, s.title);

    const desc = document.createElement('div');
    desc.className = 'strategy-desc';
    setTextSafe(desc, s.description);

    const dur = document.createElement('div');
    dur.className = 'strategy-duration';
    setTextSafe(dur, `⏱ ${s.duration}`);

    item.appendChild(title);
    item.appendChild(desc);
    item.appendChild(dur);
    strategiesEl.appendChild(item);
  });

  // Mindfulness
  const ex = analysis.mindfulness_exercise;
  if (ex) {
    setTextSafe(document.getElementById('mindfulness-name'), ex.name);
    setTextSafe(document.getElementById('mindfulness-duration'), ex.duration);
    const stepsList = document.getElementById('mindfulness-steps');
    stepsList.innerHTML = '';
    (ex.steps || []).forEach((step) => {
      const li = document.createElement('li');
      setTextSafe(li, step);
      stepsList.appendChild(li);
    });
  }

  // Motivational message
  setTextSafe(document.getElementById('motivation-message'), `"${analysis.motivational_message}"`);

  result.classList.add('visible');
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Dashboard ─────────────────────────────────────────────────
async function loadDashboard() {
  const entriesEl = document.getElementById('entries-list');

  try {
    const { entries } = await apiFetch(API.JOURNAL);
    renderEntries(entries, entriesEl);

    // Mood chart
    const moodData = entries
      .slice(0, 7)
      .reverse()
      .map((e) => ({
        x: new Date(e.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        y: e.mood_score,
      }));

    renderMoodChart(moodData);

    // Weekly summary from entries
    renderWeeklySummary(entries);

  } catch (err) {
    showToast('Could not load dashboard: ' + err.message, 'error');
  }
}

function renderEntries(entries, container) {
  if (!entries || entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">📔</div>
        <h3>No entries yet</h3>
        <p>Start your first daily check-in to begin your wellness journey</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();
  
  entries.slice(0, 15).forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'entry-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Journal entry from ${new Date(entry.created_at).toLocaleDateString()}`);

    const header = document.createElement('div');
    header.className = 'entry-header';

    const date = document.createElement('span');
    date.className = 'entry-date';
    setTextSafe(date, new Date(entry.created_at).toLocaleDateString('en-IN', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }));

    const dot = document.createElement('div');
    dot.className = 'entry-mood-dot';
    dot.style.background = MOOD_COLORS[entry.mood_score] || '#94a3b8';
    dot.setAttribute('aria-label', `Mood: ${entry.mood_score}/10`);

    const moodLabel = document.createElement('span');
    moodLabel.className = 'text-sm';
    setTextSafe(moodLabel, `${entry.mood_score}/10`);

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2';
    right.appendChild(dot);
    right.appendChild(moodLabel);

    header.appendChild(date);
    header.appendChild(right);

    const preview = document.createElement('p');
    preview.className = 'entry-preview clamped';
    setTextSafe(preview, entry.journal_text);

    card.appendChild(header);
    card.appendChild(preview);

    // Toggle expand on click/enter
    card.addEventListener('click', () => preview.classList.toggle('clamped'));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); preview.classList.toggle('clamped'); }
    });

    fragment.appendChild(card);
  });
  
  container.appendChild(fragment);
}

function renderMoodChart(moodData) {
  const canvas = document.getElementById('mood-chart');
  if (!canvas) { return; }

  if (state.moodChart) {
    state.moodChart.destroy();
    state.moodChart = null;
  }

  if (!moodData || moodData.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet — start journaling!', canvas.width / 2, canvas.height / 2);
    return;
  }

  state.moodChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: moodData.map((d) => d.x),
      datasets: [{
        label: 'Mood Score',
        data: moodData.map((d) => d.y),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        pointBackgroundColor: moodData.map((d) => MOOD_COLORS[d.y]),
        pointBorderColor: '#fff',
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 2.5,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22, 24, 42, 0.95)',
          titleColor: '#f0f4ff',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y}/10 — ${MOOD_LABELS[ctx.parsed.y] || ''}`,
          },
        },
      },
      scales: {
        y: {
          min: 1, max: 10,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#64748b', stepSize: 2 },
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#64748b' },
        },
      },
    },
  });
}

function renderWeeklySummary(entries) {
  const card = document.getElementById('weekly-summary-card');
  if (!entries || entries.length === 0) { return; }

  const avg = (entries.reduce((s, e) => s + e.mood_score, 0) / entries.length).toFixed(1);
  const trend = avg >= 7 ? 'improving' : avg >= 5 ? 'stable' : 'declining';
  const trendConfig = {
    improving: { icon: '📈', color: 'var(--success)', label: 'Improving' },
    stable:    { icon: '➡️', color: 'var(--warning)', label: 'Stable' },
    declining: { icon: '📉', color: 'var(--danger)',  label: 'Needs Attention' },
  };
  const t = trendConfig[trend];

  card.innerHTML = `<h2 class="mb-4">This Week</h2>`;

  const trendEl = document.createElement('div');
  trendEl.className = 'weekly-trend';
  trendEl.innerHTML = `
    <span class="trend-icon" aria-hidden="true">${sanitizeText(t.icon)}</span>
    <div>
      <div class="trend-value" style="color:${t.color}">${sanitizeText(t.label)}</div>
      <div class="trend-label">Average mood: <strong>${sanitizeText(avg)}/10</strong></div>
    </div>`;
  card.appendChild(trendEl);

  const statsEl = document.createElement('div');
  statsEl.innerHTML = `
    <p class="text-sm text-muted" style="margin-bottom: 8px;">
      <strong style="color:var(--text-primary)">${sanitizeText(String(entries.length))}</strong> entries this period
    </p>`;
  card.appendChild(statsEl);
}

// ── Insights Panel ────────────────────────────────────────────

/** Shows the "Create Insights" landing — no AI call made yet */
function showInsightsLanding() {
  const content     = document.getElementById('insights-content');
  const refreshBtn  = document.getElementById('refresh-insights-btn');
  if (refreshBtn) { refreshBtn.style.display = 'none'; }

  content.innerHTML = '';

  const landing = document.createElement('div');
  landing.className = 'insights-landing';
  landing.setAttribute('aria-label', 'Generate weekly insights');

  const icon = document.createElement('div');
  icon.className = 'insights-landing-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔍';

  const title = document.createElement('h2');
  title.className = 'insights-landing-title';
  setTextSafe(title, 'Your Weekly Insights');

  const desc = document.createElement('p');
  desc.className = 'insights-landing-desc';
  setTextSafe(desc, 'Get AI-powered pattern analysis from your journal entries — stress triggers, emotional trends, and personalized guidance for your ' + state.user.examType + ' journey.');

  const features = document.createElement('div');
  features.className = 'insights-features';
  [
    { icon: '🎯', label: 'Hidden stress triggers' },
    { icon: '📈', label: 'Weekly mood trend' },
    { icon: '💪', label: 'Strengths & focus areas' },
    { icon: '💌', label: 'Personalized message' },
  ].forEach(({ icon: fi, label }) => {
    const chip = document.createElement('div');
    chip.className = 'insights-feature-chip';
    const chipIcon = document.createElement('span');
    chipIcon.setAttribute('aria-hidden', 'true');
    chipIcon.textContent = fi;
    const chipLabel = document.createElement('span');
    setTextSafe(chipLabel, label);
    chip.appendChild(chipIcon);
    chip.appendChild(chipLabel);
    features.appendChild(chip);
  });

  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-create-insights';
  btn.id = 'create-insights-btn';
  btn.setAttribute('aria-label', 'Generate weekly insights');
  btn.innerHTML = '<span aria-hidden="true">✨</span> Create Insights';

  btn.addEventListener('click', () => loadInsights());

  landing.appendChild(icon);
  landing.appendChild(title);
  landing.appendChild(desc);
  landing.appendChild(features);
  landing.appendChild(btn);
  content.appendChild(landing);
}

/** Fetches and renders insights — called by Create or Refresh */
async function loadInsights() {
  const content    = document.getElementById('insights-content');
  const refreshBtn = document.getElementById('refresh-insights-btn');

  // Show loading state
  content.innerHTML = `
    <div class="empty-state insights-placeholder">
      <div class="loading-spinner" style="width:40px;height:40px;margin:0 auto 16px;" aria-hidden="true"></div>
      <p>Generating your weekly insights...</p>
    </div>`;

  // Show refresh button, hide create button if it exists
  if (refreshBtn) { refreshBtn.style.display = ''; }

  try {
    const params = new URLSearchParams({
      name: state.user.name,
      examType: state.user.examType,
    });
    const { insights, moodHistory } = await apiFetch(`${API.INSIGHTS}?${params}`);
    state.insightsGenerated = true;
    renderInsights(insights, moodHistory);
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⚠️</div>
        <p style="color:var(--danger);margin-bottom:16px">${sanitizeText(err.message)}</p>
        <button class="btn btn-secondary" onclick="loadInsights()">Try Again</button>
      </div>`;
  }
}

function renderInsights(insights, moodHistory) {
  const content = document.getElementById('insights-content');

  if (!insights || !insights.hasData) {
    content.innerHTML = `
      <div class="empty-state insights-placeholder">
        <div class="empty-icon" aria-hidden="true">📝</div>
        <h3>Not enough data yet</h3>
        <p>${sanitizeText(insights?.message || 'Journal for a few days to unlock weekly insights')}</p>
      </div>`;
    return;
  }

  const trendColor = insights.weekly_trend === 'improving' ? 'var(--success)' : insights.weekly_trend === 'declining' ? 'var(--danger)' : 'var(--warning)';

  content.innerHTML = '';

  // Summary grid
  const grid = document.createElement('div');
  grid.className = 'analysis-grid';

  // Top triggers
  const triggersCard = document.createElement('div');
  triggersCard.className = 'glass-card analysis-section';
  const triggersTitle = document.createElement('h3');
  setTextSafe(triggersTitle, 'Top Stress Triggers This Week');
  triggersCard.appendChild(triggersTitle);
  const tagList = document.createElement('div');
  tagList.className = 'tag-list';
  (insights.top_triggers || []).forEach((t) => {
    const tag = document.createElement('span');
    tag.className = 'tag tag-warning';
    setTextSafe(tag, t);
    tagList.appendChild(tag);
  });
  triggersCard.appendChild(tagList);
  grid.appendChild(triggersCard);

  // Strengths
  const strengthsCard = document.createElement('div');
  strengthsCard.className = 'glass-card analysis-section';
  const strengthsTitle = document.createElement('h3');
  setTextSafe(strengthsTitle, 'Strengths Observed');
  strengthsCard.appendChild(strengthsTitle);
  const strengthList = document.createElement('div');
  strengthList.className = 'tag-list';
  (insights.strengths_observed || []).forEach((s) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    setTextSafe(tag, s);
    strengthList.appendChild(tag);
  });
  strengthsCard.appendChild(strengthList);
  grid.appendChild(strengthsCard);

  content.appendChild(grid);

  // Trend + avg
  const summaryCard = document.createElement('div');
  summaryCard.className = 'glass-card analysis-section mt-4';
  const summaryTitle = document.createElement('h3');
  setTextSafe(summaryTitle, 'Weekly Overview');
  summaryCard.appendChild(summaryTitle);

  const overviewEl = document.createElement('div');
  overviewEl.className = 'weekly-trend';
  const trendText = insights.weekly_trend?.charAt(0).toUpperCase() + insights.weekly_trend?.slice(1);
  overviewEl.innerHTML = `
    <div>
      <div class="trend-value" style="color:${trendColor}">${sanitizeText(trendText || '—')}</div>
      <div class="trend-label">Average mood: <strong>${sanitizeText(String(insights.average_mood || '—'))}/10</strong></div>
      ${insights.peak_stress_day ? `<div class="trend-label">Peak stress day: <strong>${sanitizeText(insights.peak_stress_day)}</strong></div>` : ''}
    </div>`;
  summaryCard.appendChild(overviewEl);
  content.appendChild(summaryCard);

  // Focus areas
  if (insights.focus_areas?.length) {
    const focusCard = document.createElement('div');
    focusCard.className = 'glass-card analysis-section mt-4';
    const focusTitle = document.createElement('h3');
    setTextSafe(focusTitle, 'Areas to Focus On');
    focusCard.appendChild(focusTitle);
    const focusList = document.createElement('div');
    focusList.className = 'tag-list';
    insights.focus_areas.forEach((f) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      setTextSafe(tag, f);
      focusList.appendChild(tag);
    });
    focusCard.appendChild(focusList);
    content.appendChild(focusCard);
  }

  // Weekly message
  if (insights.weekly_message) {
    const msgCard = document.createElement('div');
    msgCard.className = 'motivation-card glass-card mt-4';
    const msgText = document.createElement('p');
    msgText.className = 'motivation-text';
    setTextSafe(msgText, `"${insights.weekly_message}"`);
    msgCard.appendChild(msgText);
    content.appendChild(msgCard);
  }
}

// ── Chat Widget ───────────────────────────────────────────────
function initChat() {
  const panel      = document.getElementById('chat-panel');
  const toggle     = document.getElementById('chat-toggle');
  const closeBtn   = document.getElementById('chat-close-btn');
  const input      = document.getElementById('chat-input');
  const sendBtn    = document.getElementById('chat-send');
  const messages   = document.getElementById('chat-messages');

  function openChat() {
    state.chatOpen = true;
    panel.classList.add('open');
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close chat');
    document.getElementById('chat-badge').style.display = 'none';
    input.focus();

    if (messages.children.length === 0) {
      appendAuraMessage(`Hi ${state.user.name}! 🌸 I'm Aura, your wellness companion. How are you doing today with your ${state.user.examType} prep?`);
      loadChatHistory();
    }
  }

  function closeChat() {
    state.chatOpen = false;
    panel.classList.remove('open');
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open chat with Aura');
    toggle.focus();
  }

  toggle.addEventListener('click', () => state.chatOpen ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);

  // Close on Escape
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeChat(); } });

  input.addEventListener('input', () => {
    sendBtn.disabled = input.value.trim().length === 0 || state.chatSending;
    // Auto-resize textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  sendBtn.addEventListener('click', sendChat);
}

function appendUserMessage(text) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-message user';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  setTextSafe(bubble, text);
  const time = document.createElement('div');
  time.className = 'message-time';
  setTextSafe(time, new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  div.appendChild(bubble);
  div.appendChild(time);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function appendAuraMessage(text) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-message assistant';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  setTextSafe(bubble, text);
  const time = document.createElement('div');
  time.className = 'message-time';
  setTextSafe(time, new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
  div.appendChild(bubble);
  div.appendChild(time);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function showTypingIndicator() {
  const messages = document.getElementById('chat-messages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator';
  indicator.setAttribute('aria-label', 'Aura is typing');
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('div');
    dot.className = 'typing-dot';
    indicator.appendChild(dot);
  }
  messages.appendChild(indicator);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) { indicator.remove(); }
}

async function sendChat() {
  if (state.chatSending) { return; }
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const text = input.value.trim();
  if (!text) { return; }

  appendUserMessage(text);
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;
  state.chatSending = true;
  showTypingIndicator();

  try {
    const data = await apiFetch(API.CHAT, {
      method: 'POST',
      body: JSON.stringify({
        message: text,
        name: state.user.name,
        examType: state.user.examType,
      }),
    });
    removeTypingIndicator();
    appendAuraMessage(data.response);
  } catch (err) {
    removeTypingIndicator();
    appendAuraMessage('I\'m having a moment — please try again in a few seconds 🙏');
    showToast(err.message, 'error');
  } finally {
    state.chatSending = false;
  }
}

async function loadChatHistory() {
  try {
    const { history } = await apiFetch('/api/chat/history');
    if (!history || history.length === 0) { return; }

    const messages = document.getElementById('chat-messages');
    // Clear greeting temporarily if we have real history
    messages.innerHTML = '';
    
    const fragment = document.createDocumentFragment();

    history.forEach((msg) => {
      const div = document.createElement('div');
      div.className = `chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`;
      
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      setTextSafe(bubble, msg.content);
      
      const time = document.createElement('div');
      time.className = 'message-time';
      setTextSafe(time, new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
      
      div.appendChild(bubble);
      div.appendChild(time);
      fragment.appendChild(div);
    });
    
    messages.appendChild(fragment);
    messages.scrollTop = messages.scrollHeight;
  } catch {
    // Silently fail — history is optional
  }
}

// ── App Bootstrap ─────────────────────────────────────────────
function initApp() {
  const appEl = document.getElementById('app');
  appEl.hidden = false;

  updateHeader();
  updateCheckinGreeting();
  initTabs();
  initMoodSlider();
  initJournalTextarea();
  initChat();

  // Journal submit button
  document.getElementById('submit-journal-btn').addEventListener('click', submitJournal);

  // Insights refresh
  document.getElementById('refresh-insights-btn').addEventListener('click', loadInsights);

  // Focus management for accessibility
  document.getElementById('tab-checkin-btn').focus();
}

// ── Entry Point ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const existingUser = loadUser();

  if (existingUser && existingUser.id && existingUser.name && existingUser.examType) {
    state.user = existingUser;
    document.getElementById('onboarding-overlay').style.display = 'none';
    initApp();
  } else {
    initOnboarding();
  }
});
