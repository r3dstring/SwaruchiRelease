# Swaruchi Custom Quiz — Load Testing

Simulates N participants joining a live Custom Quiz session and submitting
answers, exactly as real phones would.

## What this actually tests

Joining and submitting make **zero AI calls** — questions are generated once
when the admin creates the session, then reused by every participant. So this
measures your **server and database** under load, not your Groq rate limits.

Per participant the backend runs 6 database queries (3 on join, 3 on submit).

## Setup

1. Log in as admin, create a Custom Quiz session, and copy its 6-character
   join code. Leave the session **open**.
2. From this folder:

```bash
node loadtest.mjs --url https://YOUR-API.onrender.com --code ABC123 --users 200
```

Requires Node 18+ (uses built-in fetch). No npm install needed.

## Options

| Flag | Default | Meaning |
|---|---|---|
| `--url` | required | Backend base URL |
| `--code` | required | Join code from an open session |
| `--users` | 200 | Participants to simulate |
| `--concurrency` | 50 | How many run at once |
| `--rampup` | 0 | Seconds to spread joins over (0 = all at once) |
| `--think` | 3 | Seconds spent "answering" before submitting |
| `--joinonly` | off | Skip submissions, test joining only |

## Two scenarios worth running

**Realistic** — people filter in over a minute and actually read the questions:
```bash
node loadtest.mjs --url https://YOUR-API.onrender.com --code ABC123 \
  --users 200 --concurrency 50 --rampup 60 --think 45
```

**Harsh** — everyone hits Join at the same instant and answers instantly.
This is deliberately worse than real life:
```bash
node loadtest.mjs --url https://YOUR-API.onrender.com --code ABC123 \
  --users 500 --concurrency 500 --rampup 0 --think 0
```

## Important notes

- **Use a fresh session per run.** Employee IDs are unique per session, so
  re-running against the same session is fine (the script generates unique
  IDs), but your scoreboard will fill with "Load Test User N" entries.
  Delete the session afterward to clean up.
- **Don't run this against a session real people are using.**
- **Render free tier sleeps after 15 min idle.** The first request will take
  ~40s to wake it. Hit the URL once in a browser before starting, or the
  preflight check will look like a failure.
- **Test data stays in your database.** Delete the test session from the
  Custom Quiz admin page when done.

## Reading the results

- `median` — typical participant experience
- `p95` / `p99` — the slowest 5% / 1%; this is what makes people complain
- `failures` — anything non-zero needs investigating

Failure meanings:
- `already completed` — re-ran against a session where that ID already submitted
- `HTTP 502/503` — server overwhelmed or restarted
- `client timeout (30s)` — request queued longer than 30s
