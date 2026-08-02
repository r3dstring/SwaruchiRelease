# Feature Expansion Request — Role-Based Access, Non-Repeating Quizzes, Question Flagging

You are modifying an existing full-stack application (QuizForge). **Do not rewrite the existing architecture.** Integrate the following features while preserving all current functionality: authentication, multi-document knowledge base, topic-targeted retrieval, adaptive learning engine, Knowledge Map, Consequence Mode, gamification, and the AI provider abstraction.

---

# 1. Role-Based Access Control

## Goal
One admin user controls the document knowledge base. All other users can only take quizzes — no upload, no delete, no document management visibility beyond a read-only list (or none at all).

## Data model
Add a `role` column to `users`: `'admin' | 'user'`, default `'user'`.

## Admin bootstrapping
The first account ever created becomes admin automatically. Alternatively, support an `ADMIN_EMAIL` environment variable — on signup, if the email matches, assign `role = 'admin'` regardless of signup order. Use whichever the person prefers; env var is safer for a demo since account creation order isn't guaranteed.

## Backend enforcement
- Add a `requireAdmin` middleware, applied after `authMiddleware`, that checks `req.user.role === 'admin'` and returns 403 otherwise.
- Apply it to: `POST /pdf/upload`, `DELETE /pdf/:id`. (`GET /pdf/list` stays open to all authenticated users — everyone needs to see what's in the shared knowledge base, they just can't change it.)
- Apply it to the new flagged-questions review endpoints (Section 3).
- `/auth/me` should return `role` so the frontend can branch UI.

## Frontend changes
- `AuthContext` already carries the user object — surface `user.role`.
- Dashboard: non-admin users see "My Documents" as a **read-only list** (filenames, page counts, indexed status) with no upload dropzone and no delete button. Admins see the existing full upload/delete UI.
- Navbar: show a small "Admin" badge next to the avatar when `role === 'admin'`.
- Admin gets an extra nav link to the Flagged Questions review page (Section 3).

## Edge case to decide
If a non-admin user's account exists in an app with zero documents uploaded yet, quiz generation should return a clear message ("No documents available yet — ask your admin to upload training material") rather than a generic error.

---

# 2. Non-Repeating Quiz Questions

## Problem
Questions regenerate from the same retrieved passages every time, so the AI tends to reproduce near-identical questions across sessions.

## Approach
No vector DB or heavy infra needed. Three layers, applied together:

### 2a. Question history table
```
question_history
- id
- user_id
- topic
- question_text        (normalized: lowercased, trimmed, whitespace-collapsed)
- question_type         (mcq | tf | fitb)
- asked_at
```
Every question generated for a user (not just ones they finish) gets logged here **at generation time**, not at submit time — so abandoned quizzes still count toward repeat avoidance.

### 2b. Prompt-level avoidance
Before generating, fetch the user's last ~20 question texts for that topic:
```sql
SELECT question_text FROM question_history
WHERE user_id = ? AND topic = ?
ORDER BY asked_at DESC LIMIT 20
```
Inject them into the prompt as a "DO NOT repeat these questions" block:
```
PREVIOUSLY ASKED — DO NOT repeat these or near-duplicates:
1. "..."
2. "..."
...
```
This is the primary mechanism — LLMs follow explicit exclusion lists reasonably well.

### 2c. Retrieval-level variety
Currently `retrieveForTopic` always returns the highest-scoring chunks first. If the same top chunks are sent every time, the AI naturally re-derives the same questions even with the exclusion list. Fix: introduce controlled rotation —
- Take the top 2x chunks needed by score, then randomly sample the final set from that pool (weighted toward higher scores, not purely top-N).
- This means each generation call sees a slightly different slice of the same relevant material, which naturally diversifies questions without hurting topical relevance.

### 2d. Post-generation dedup safety net
After the AI returns questions, compare each new question's normalized text against the user's history using simple similarity (e.g., word-overlap / Jaccard similarity on token sets, threshold ~0.8). Drop any that are too similar and backfill with mock questions if needed, rather than showing a near-duplicate. This is a safety net, not the primary mechanism — 2b and 2c should make it rare.

### 2e. History aging
Cap history relevance at the last ~50 questions per user per topic. Once a topic's question pool is naturally exhausted (small document set), older questions can resurface rather than blocking generation entirely — only exclude the most *recent* N, not all-time.

## Why not embeddings/dedup hashing alone
Exact-text dedup (hashing) only catches literal repeats. LLMs regenerate the same *concept* with reworded phrasing, which hashing misses. The prompt-exclusion + retrieval-rotation combination addresses the actual cause (same source material, same salient facts) rather than just symptom-matching after the fact.

---

# 3. Flag Question as Wrong / Not Helpful

## Goal
Any user can flag a question they just answered as incorrect, confusing, or irrelevant. Admin gets a review queue.

## Data model
```
flagged_questions
- id
- user_id
- topic
- question_text
- question_type
- options              (JSON, nullable)
- correct_answer
- explanation
- reason               ('wrong_answer' | 'confusing' | 'not_relevant' | 'other')
- comment              (optional free text)
- status               ('open' | 'reviewed' | 'dismissed')  default 'open'
- flagged_at
- reviewed_at           (nullable)
```

## When flagging is available
Immediately after a question is answered (once the explanation is showing), a small "🚩 Report issue" link appears next to the feedback banner. Also available per-question on the Results review screen, since a user may only realize a question was wrong after seeing the full quiz in hindsight.

## Flagging flow
1. User clicks "Report issue" → small inline panel (not a full modal, keep it lightweight) with a reason dropdown and optional comment.
2. Submit → `POST /quiz/flag` with `{ topic, question, reason, comment }`.
3. Toast confirmation ("Thanks — sent to review"), panel collapses. No XP or score impact either way — flagging is independent of scoring.

## Admin review endpoints
- `GET /admin/flags?status=open` — list flagged questions, most recent first, with topic and reason visible at a glance.
- `PATCH /admin/flags/:id` — update status to `reviewed` or `dismissed`.
- Both routes behind `requireAdmin`.

## Admin review page (frontend)
New page reachable only to admins: table/list of flagged questions grouped by topic, showing question text, reason, comment, flagged date, and the user who flagged it (username only, not email). Actions: mark reviewed, dismiss. A small summary strip at the top: total open flags, most-flagged topic (this doubles as a content-quality signal — if one topic gets flagged repeatedly, it usually means the underlying document coverage for that topic is thin or ambiguous, which is useful admin insight beyond just the individual flags).

## Edge case
Don't let flagging be anonymous-only — store `user_id` so an admin can follow up if a flag needs clarification, but never expose the flagging user's identity to other regular users.

---

# Database Changes Summary
```
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

CREATE TABLE question_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  asked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE flagged_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  topic TEXT,
  question_text TEXT NOT NULL,
  question_type TEXT,
  options TEXT,
  correct_answer TEXT,
  explanation TEXT,
  reason TEXT NOT NULL,
  comment TEXT,
  status TEXT DEFAULT 'open',
  flagged_at TEXT DEFAULT (datetime('now')),
  reviewed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```
All existing DBs must auto-migrate on server start, matching the existing migration pattern already used for `topic_progress`, `chunks`, etc.

---

# API Changes Summary
| Route | Change |
|---|---|
| `POST /pdf/upload` | now requires `requireAdmin` |
| `DELETE /pdf/:id` | now requires `requireAdmin` |
| `GET /auth/me` | now returns `role` |
| `POST /quiz/generate` | now logs generated questions to `question_history`; injects recent-questions exclusion list into prompt; applies retrieval rotation |
| `POST /quiz/flag` | **new** — any authenticated user |
| `GET /admin/flags` | **new** — admin only |
| `PATCH /admin/flags/:id` | **new** — admin only |

---

# UI Changes Summary
- Dashboard: conditional upload/delete UI based on `role`
- Navbar: Admin badge + Flagged Questions link (admin only)
- Quiz screen: "Report issue" link after each answered question
- Results screen: "Report issue" available per question in the review list
- New page: Flagged Questions (admin only)

Maintain the existing Duolingo-inspired visual language throughout — no redesign, only extension, consistent with prior feature additions.

---

# Expected Outcome
- Document control is centralized with one admin, preventing an uncontrolled or inconsistent knowledge base as more users are added.
- Quiz questions genuinely vary across sessions instead of recycling the same AI outputs, making repeated practice on a topic feel fresh.
- Users have a lightweight way to surface bad questions, and the admin gets a concrete feedback loop to improve document coverage or catch AI generation issues — without needing to manually audit every quiz.
