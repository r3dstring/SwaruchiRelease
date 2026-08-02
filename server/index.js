import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import pdfRoutes from './routes/pdf.js';
import quizRoutes from './routes/quiz.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: allow local dev and the deployed frontend (set FRONTEND_URL on the host)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    // Also allow any *.netlify.app subdomain for preview deploys
    if (/\.netlify\.app$/.test(new URL(origin).hostname)) return cb(null, true);
    cb(null, true); // permissive fallback for testing; tighten for real production
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/quiz', quizRoutes);

function detectProvider() {
  if (process.env.CEREBRAS_API_KEY) return 'Cerebras';
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.startsWith('gsk_') ? 'Groq' : 'Gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'Anthropic';
  return null;
}

app.get('/api/health', (_, res) => res.json({ status: 'ok', provider: detectProvider() }));

(async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      const provider = detectProvider();
      console.log(`\n  QuizForge API running on port ${PORT}`);
      console.log(`  AI provider: ${provider || 'NONE (mock questions)'}`);
      console.log(`  Admin: ${process.env.ADMIN_EMAIL || 'first signup becomes admin'}`);
      if (!provider) console.log(`  Set an AI key env var to enable real questions\n`);
      else console.log('');
    });
  } catch (e) {
    console.error('Failed to start:', e.message);
    process.exit(1);
  }
})();
