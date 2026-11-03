import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { getAllProviders } from './aiProvider.js';
import authRoutes from './routes/auth.js';
import pdfRoutes from './routes/pdf.js';
import quizRoutes from './routes/quiz.js';
import topicsRoutes from './routes/topics.js';
import sessionsRoutes from './routes/sessions.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: strict allowlist. The previous version had a permissive fallback
// (cb(null, true) for ANY origin) left over from early testing, meaning any
// website could make authenticated API calls against a stolen token. Given
// HRRL's data-exposure requirements, there is no good reason for this API to
// accept requests from an arbitrary origin, so the fallback is now a hard
// rejection instead of a silent allow.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);
// Comma-separated list for supporting a second live host (e.g. during a
// Netlify-to-Cloudflare migration) without code changes.
if (process.env.ADDITIONAL_ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ADDITIONAL_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean));
}

app.use(cors({
  origin: (origin, cb) => {
    // Requests with no Origin header (curl, server-to-server, the load test
    // tool) are allowed — they can't carry a browser-stolen cookie/token the
    // way a cross-site browser request could, so this isn't the exposure.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Any *.netlify.app or *.pages.dev subdomain — covers preview deploys on
    // either host without hardcoding a specific project URL.
    try {
      const host = new URL(origin).hostname;
      if (/\.netlify\.app$/.test(host) || /\.pages\.dev$/.test(host)) return cb(null, true);
    } catch { /* malformed origin header — fall through to reject */ }
    console.warn('CORS rejected origin:', origin);
    const err = new Error('Not allowed by CORS');
    err.status = 403;
    cb(err);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/topics', topicsRoutes);
app.use('/api/sessions', sessionsRoutes);

// Reuses the actual provider list from aiProvider.js rather than maintaining
// a second copy of the same detection logic — the previous duplicate here had
// already drifted out of sync with the real chain (it showed a single "Groq"
// entry even after Groq became a 4-model cascade with independent quotas).
function detectProviders() {
  return getAllProviders().map(p => p.name);
}

app.get('/api/health', (_, res) => res.json({ status: 'ok', providers: detectProviders() }));

// 404 for any unmatched /api route — JSON instead of falling through
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No route: ${req.method} ${req.originalUrl}` });
});

// Global error handler — MUST be defined last, with 4 args, so Express
// routes uncaught errors here instead of its default HTML error page.
// This is what was causing "Unexpected token '<'" on the frontend.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', req.method, req.originalUrl, '-', err);
  if (res.headersSent) return next(err);

  // Don't leak internal details (Postgres messages, stack traces, column
  // names) to the client. Database errors carry a `code` property; those get
  // a generic message. Errors we raised deliberately with a status are safe
  // to surface as-is.
  const isDbError = typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);
  const status = err.status || 500;
  const safeMessage = (!isDbError && err.status && err.message)
    ? err.message
    : (status === 400 ? 'Invalid request' : 'Something went wrong. Please try again.');

  res.status(status).json({ error: safeMessage });
});

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      const providers = detectProviders();
      console.log(`\n  Swaruchi API (HRRL) running on port ${PORT}`);
      console.log(`  AI providers (failover order): ${providers.length ? providers.join(' -> ') : 'NONE (mock questions)'}`);
      const withheld = ['GEMINI_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY']
        .filter(k => process.env[k] && !(k === 'GEMINI_API_KEY' && process.env[k].startsWith('gsk_')))
        .filter(() => process.env.ALLOW_TRAINING_DATA_PROVIDERS !== 'true');
      if (withheld.length) {
        console.log(`  NOTE: ${withheld.join(', ')} ${withheld.length > 1 ? 'are' : 'is'} configured but withheld — these providers train on submitted data on their free tier. Set ALLOW_TRAINING_DATA_PROVIDERS=true after InfoSec sign-off to enable.`);
      }
      console.log(`  Admin: ${process.env.ADMIN_EMAIL || 'first signup becomes admin'}`);
      if (!providers.length) console.log(`  Set an AI key env var to enable real questions\n`);
      else console.log('');
    });
  } catch (e) {
    console.error('Failed to start:', e.message);
    process.exit(1);
  }
})();
