# QuizForge — Adaptive AI Learning Platform

Upload refinery training PDFs, learn through adaptive AI-generated quizzes with
role-based admin control, non-repeating questions, and question flagging.

## Database

This version uses **Postgres** (via the `pg` library) for persistent data.
- For cloud hosting (recommended): use a free Neon database — see DEPLOYMENT.md
- For local development: you need a local Postgres, or just point DATABASE_URL
  at your Neon database and develop against the cloud DB directly.

There is no SQLite fallback in this version — data now persists properly in Postgres.

## Local Setup

```bash
cd server && npm install
cd ../client && npm install
```

Set environment variables (see server/.env.example). The minimum to run:

```bash
export DATABASE_URL="postgresql://...your neon or local postgres..."
export GEMINI_API_KEY="gsk_your_groq_key"
export ADMIN_EMAIL="you@example.com"
```

On Windows use `setx` instead of `export` (then reopen the terminal).

## Run locally

Terminal 1: `cd server && node index.js`
Terminal 2: `cd client && npx vite`
Open http://localhost:5173

## Deploy for free (with persistent data)

See **DEPLOYMENT.md** — full step-by-step for Neon + Render + Netlify.

## Features

- Role-based access: one admin manages documents, everyone else takes quizzes
- Multi-document knowledge base with keyword-scored retrieval
- Adaptive learning: question difficulty adapts to per-topic performance
- Non-repeating questions: history tracking + prompt exclusion + retrieval rotation
- Knowledge Map: mastery heatmap across the refinery topic tree
- Consequence Mode: scenario-based operational decision questions
- Question flagging: users report bad questions, admin reviews them
- Gamification: XP, levels, streaks, leaderboard
- Multi-provider AI: Cerebras / Groq / Gemini / Anthropic (auto-detected)

## AI provider

Set one of these env vars (priority order):
`CEREBRAS_API_KEY`, `GEMINI_API_KEY` (Groq keys starting `gsk_` also work here),
`ANTHROPIC_API_KEY`. Without a key, mock questions are used.
