# QuizForge — Free Cloud Deployment Guide (with Persistent Data)

This deploys QuizForge so 5-6 people can use it, with all data (users, quiz
progress, XP, flags) saved permanently in a cloud Postgres database.

Three free services, no credit card:
- **Neon** — Postgres database (data lives here, persists forever)
- **Render** — backend API (Node.js)
- **Netlify** — frontend (React)

Total setup time: about 30 minutes.

---

## Overview of what you'll end up with

| Service | Hosts | URL you'll get |
|---|---|---|
| Neon | Database | a connection string |
| Render | Backend API | https://quizforge-api.onrender.com |
| Netlify | Frontend (share this) | https://your-app.netlify.app |

---

## STEP 1 — Create the Neon database

1. Go to https://neon.tech and sign up (use your GitHub or Google account)
2. Click **Create Project**
3. Name it `quizforge`, pick the region closest to you, click **Create**
4. On the project dashboard you'll see **Connection Details**
5. Copy the connection string. It looks like:
   ```
   postgresql://alex:AbC123@ep-cool-cloud-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
6. **Save this somewhere** — you need it in Step 3.

That's it. Neon creates the tables automatically when the backend first connects.
Neon's free tier does not sleep and gives 0.5 GB — plenty for testing.

---

## STEP 2 — Push your code to GitHub

If you don't have Git installed: https://git-scm.com/download/win (keep defaults).

Open Command Prompt in your project folder:

```cmd
cd Downloads\quizforge
git init
git add .
git commit -m "QuizForge with Postgres"
```

Create a new **private** repo at https://github.com/new named `quizforge`
(don't add a README or any files). Then run the commands GitHub shows you:

```cmd
git remote add origin https://github.com/YOURNAME/quizforge.git
git branch -M main
git push -u origin main
```

---

## STEP 3 — Deploy the backend on Render

1. Go to https://render.com and sign up with GitHub
2. Click **New** → **Web Service**
3. Connect and select your `quizforge` repository
4. Fill in these settings exactly:

   | Field | Value |
   |---|---|
   | Name | `quizforge-api` |
   | Root Directory | `server` |
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `node index.js` |
   | Instance Type | **Free** |

5. Scroll to **Environment Variables**, click **Add Environment Variable** for each:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | *(paste your Neon connection string from Step 1)* |
   | `GEMINI_API_KEY` | *(your Groq key, starts with `gsk_`)* |
   | `JWT_SECRET` | *(any long random text, e.g. `k3j2h4g5f6d7s8a9`)* |
   | `ADMIN_EMAIL` | *(the email you'll use as admin)* |
   | `NODE_VERSION` | `20` |

6. Click **Create Web Service**

Wait 2-3 minutes. When it shows **Live**, copy the URL at the top
(e.g. `https://quizforge-api.onrender.com`). You need it for Step 4.

> Note: Render's free backend sleeps after 15 min idle. The first request after
> sleep takes ~40 seconds to wake. Fine for a test group — just tell testers the
> first load may be slow. Your DATA is on Neon, so sleeping never loses anything.

---

## STEP 4 — Point the frontend at your backend

Back in Command Prompt:

```cmd
cd Downloads\quizforge\client
```

Create a file named `.env.production` in the `client` folder with one line
(replace with your actual Render URL from Step 3):

```
VITE_API_URL=https://quizforge-api.onrender.com/api
```

Easiest way from the command line:

```cmd
echo VITE_API_URL=https://quizforge-api.onrender.com/api > .env.production
```

Commit and push:

```cmd
cd ..
git add .
git commit -m "Add production API URL"
git push
```

---

## STEP 5 — Deploy the frontend on Netlify

1. Go to https://netlify.com and sign up with GitHub
2. Click **Add new site** → **Import an existing project** → **GitHub**
3. Select your `quizforge` repository
4. Netlify auto-detects the `netlify.toml` settings, but confirm:

   | Field | Value |
   |---|---|
   | Base directory | `client` |
   | Build command | `npx vite build` |
   | Publish directory | `client/dist` |

5. Click **Deploy**

After ~1 minute you get a URL like `https://quizforge-abc123.netlify.app`.
You can rename it under **Site settings → Change site name**.

---

## STEP 6 — Connect frontend and backend (CORS)

Tell the backend to accept your Netlify URL:

1. Go to Render → your `quizforge-api` service → **Environment**
2. Add one more variable:

   | Key | Value |
   |---|---|
   | `FRONTEND_URL` | *(your Netlify URL, e.g. `https://quizforge-abc123.netlify.app`)* |

3. Click **Save Changes** — Render redeploys automatically (~1 min).

---

## STEP 7 — Test it

1. Open your Netlify URL
2. Click **Sign up** and register with the email you set as `ADMIN_EMAIL`
   → you become the admin
3. Upload a PDF (the demo refinery PDFs work well)
4. Take a quiz to confirm questions generate
5. Share the Netlify URL with your 5-6 testers — they sign up normally and get
   regular user accounts

Everything they do — signups, XP, streaks, quiz history, flags — is now saved
permanently in Neon and survives every redeploy and restart.

---

## Updating the app later

Any time you change code:

```cmd
cd Downloads\quizforge
git add .
git commit -m "describe your change"
git push
```

Both Render and Netlify auto-redeploy on push. Your Neon data is untouched.

---

## Troubleshooting

**"No documents in the knowledge base"** — the admin hasn't uploaded a PDF yet,
or you're logged in as a non-admin. Log in as the ADMIN_EMAIL account and upload.

**First load is very slow** — Render free tier waking from sleep. Normal. Wait ~40s.

**Questions are generic / mock** — your `GEMINI_API_KEY` isn't set on Render or the
Groq key is invalid. Check Render → Environment.

**CORS error in browser console** — `FRONTEND_URL` on Render doesn't match your
actual Netlify URL. Fix it in Render → Environment.

**Login works but data resets** — this should NOT happen with Neon. If it does,
confirm `DATABASE_URL` on Render points to Neon and not left blank (blank = crash).

---

## Cost

Everything above is free tier:
- Neon: free, 0.5 GB, no sleep
- Render: free, backend sleeps when idle (data unaffected)
- Netlify: free, 100 GB bandwidth/month

No credit card required for any of them. Good for a test group of 5-6 (and well
beyond). If you outgrow it, each has a low-cost paid tier.
