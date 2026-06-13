# 🧠 AuraAI — Mental Wellness Tracker

> **GenAI-powered mental wellness companion for students preparing for NEET, JEE, CUET, CAT, GATE & UPSC**

Built for **PromptWars @ Google for Developers × H2S** — *Mental Wellness Tracker Challenge*

---

## ✨ Features

| Feature | Description |
|---|---|
| **Daily Mood Logging** | Emoji selector + 1-10 slider with visual mood feedback |
| **Open-Ended Journaling** | Free-form journal entries analyzed by GenAI |
| **AI Deep Analysis** | Uncovers hidden stress triggers & emotional patterns specific to your exam |
| **Personalized Strategies** | Coping strategies tailored to your exam type and current state |
| **Adaptive Mindfulness** | AI-generated mindfulness exercises matching your stress type |
| **Chat Companion (Aura)** | Always-available empathetic AI companion in a floating widget |
| **7-Day Mood Chart** | Visual trend dashboard using Chart.js |
| **Weekly AI Insights** | Pattern analysis across your past week of entries |
| **Dual AI Provider** | Gemini primary → OpenRouter fallback for maximum uptime |

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <repo-url>
cd auraai-mental-wellness-tracker
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DATABASE_URL=postgresql://user:password@host:5432/auraai_db

GEMINI_API_KEY=your_gemini_api_key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/

OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

DEFAULT_AI_MODEL=gemini-2.0-flash
BACKUP_AI_MODEL=openai/gpt-4o-mini

PORT=3000
```

### 3. Run
```bash
npm start          # Production
npm run dev        # Development with auto-reload
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Run Tests
```bash
npm test
```

---

## 🏗️ Architecture

```
AuraAI/
├── server.js                    ← Express entry point
├── controllers/                 ← Route handlers (thin layer)
│   ├── journalController.js
│   ├── chatController.js
│   └── insightsController.js
├── services/                    ← Business logic
│   ├── aiService.js             ← Gemini + OpenRouter with fallback
│   └── journalService.js        ← PostgreSQL queries
├── utils/
│   └── validators.js            ← Zod schemas + middleware
├── db/
│   ├── index.js                 ← pg Pool singleton
│   └── migrate.js               ← Auto-migration on startup
├── migrations/
│   └── 001_initial.sql
├── public/                      ← Frontend (served by Express)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── tests/
    └── api.test.js
```

---

## 🔐 Security

- **Helmet.js** — All HTTP security headers (CSP, HSTS, XSS protection)
- **Rate Limiting** — 100 req/15min general + 10 req/min on AI endpoints
- **Zod Validation** — All API inputs validated server-side
- **Parameterized SQL** — Zero raw string interpolation
- **DOMPurify** — All AI output sanitized before rendering
- **Environment Variables** — Zero secrets in source code
- **No Session Tracking** — User identity stays in localStorage only

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/health` | Health check |
| `POST` | `/api/journal` | Submit journal entry + AI analysis |
| `GET`  | `/api/journal` | Get past journal entries |
| `POST` | `/api/chat` | Send message to Aura |
| `GET`  | `/api/chat/history` | Get conversation history |
| `GET`  | `/api/insights` | Weekly AI pattern analysis |

All protected endpoints require `x-user-id: <UUID>` header.

---

## 🎯 Supported Exams

NEET · JEE · CUET · CAT · GATE · UPSC

---

## 📄 License

MIT
