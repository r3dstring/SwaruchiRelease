import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { chunkText } from '../retrieval.js';
import { generateWithFailover } from '../aiProvider.js';

const router = Router();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function generateUniqueJoinCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const existing = await get('SELECT id FROM quiz_sessions WHERE join_code = ?', [code]);
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique join code - try again');
}

// Every route path here that takes :id is validated against this before
// touching the database - an async Postgres type error thrown deep inside a
// route with no try/catch can crash the entire Node process, not just fail
// that one request. Validating up front avoids ever reaching that query.
function parsePositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 && String(n) === String(value).trim() ? n : null;
}

function buildDocumentQuizPrompt({ context, count, difficulty }) {
  const mcqCount = Math.ceil(count * 0.5);
  const tfCount = Math.ceil(count * 0.25);
  const fitbCount = count - mcqCount - tfCount;
  const difficultyGuide = {
    easy: 'Straightforward recall. Basic facts and definitions directly stated in the text.',
    medium: 'Mix of recall and understanding - facts plus relationships and implications.',
    hard: 'Deep analysis, comparison, and inference requiring combined ideas from the text.',
  };
  return `You are creating a fixed assessment quiz from a single training document. Every participant in this session will see the EXACT SAME questions, so accuracy and fairness matter more than variety.

RULES:
1. Every question must test genuine understanding of the CONTENT, PROCEDURES, or CONCEPTS described in the text — never the document's structure or layout.
2. NEVER ask about page numbers, section numbers, headings, "where in the document," "on which page," or any other navigational/structural detail. These are forbidden regardless of whether such details technically appear in the text.
3. Wrong MCQ options must be plausible but clearly incorrect based on the substance of the text.
4. Fill-in-the-blank answers: specific key terms, 1-3 words, never a page or section number.
5. No duplicate or near-duplicate questions.
6. Cover different substantive topics from the document, not just the beginning.
7. Before finalizing each question, check: "Could someone answer this without having read the document, just by knowing it's a document with pages and sections?" If yes, discard it and write a real content question instead.

DIFFICULTY: ${(difficulty || 'medium').toUpperCase()} - ${difficultyGuide[difficulty] || difficultyGuide.medium}

GENERATE EXACTLY ${count} questions:
- ${mcqCount} multiple choice (type:"mcq") with 4 options and correct answer letter (a/b/c/d)
- ${tfCount} true/false (type:"tf") with answer "true" or "false"
- ${fitbCount} fill in the blank (type:"fitb") with a _____ and a short answer

Every question must include an "explanation" field (1-2 sentences).

Return ONLY a valid JSON array, no markdown:
[{"type":"mcq","question":"...","options":["...","...","...","..."],"answer":"a","explanation":"..."},{"type":"tf","question":"...","options":["True","False"],"answer":"true","explanation":"..."},{"type":"fitb","question":"... _____ ...","options":null,"answer":"...","explanation":"..."}]

DOCUMENT TEXT:
${context}`;
}

function mockDocumentQuiz(count, filename) {
  const base = [
    { type:'mcq', question:`Which of the following relates to the content of ${filename}?`, options:['See document for details','Unrelated topic','Historical footnote','Marketing term'], answer:'a', explanation:'Configure an AI provider key for real questions generated from the document.' },
    { type:'tf', question:`${filename} contains information relevant to this assessment.`, options:['True','False'], answer:'true', explanation:'Mock question.' },
    { type:'fitb', question:'The document being assessed is called _____.', answer: filename.replace('.pdf','').toLowerCase(), explanation:'Mock question.' },
  ];
  const out = [];
  while (out.length < count) out.push(base[out.length % base.length]);
  return out.slice(0, count);
}

async function getPdfChunks(pdf) {
  let chunks = null;
  if (pdf.chunks_gz) {
    try { const zlib = await import('zlib'); chunks = JSON.parse(zlib.gunzipSync(pdf.chunks_gz).toString('utf8')); } catch { /* fall through */ }
  }
  if (!chunks && pdf.chunks) { try { chunks = JSON.parse(pdf.chunks); } catch { /* fall through */ } }
  if (!chunks && pdf.text_gz) { try { const zlib = await import('zlib'); chunks = chunkText(zlib.gunzipSync(pdf.text_gz).toString('utf8')); } catch { /* fall through */ } }
  if (!chunks) chunks = chunkText(pdf.text_content || '');
  return chunks;
}

// Admin: create a session from a single document
router.post('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { session_name, pdf_id, count = 10, difficulty = 'medium' } = req.body;
    const pdfId = parsePositiveInt(pdf_id);
    if (!session_name?.trim() || !pdfId) return res.status(400).json({ error: 'session_name and a valid pdf_id are required' });

    const pdf = await get('SELECT * FROM pdfs WHERE id = ?', [pdfId]);
    if (!pdf) return res.status(404).json({ error: 'Document not found' });

    const qCount = Math.min(Math.max(parseInt(count) || 10, 5), 20);
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

    const chunks = await getPdfChunks(pdf);
    const context = chunks.join('\n\n').slice(0, 7000);
    const prompt = buildDocumentQuizPrompt({ context, count: qCount, difficulty: diff });

    let questions = await generateWithFailover(prompt, { count: qCount });
    if (questions) {
      questions = questions.filter(q => q.type && q.question && q.answer && (q.type === 'fitb' || (Array.isArray(q.options) && q.options.length >= 2))).slice(0, qCount);
    }
    if (!questions || questions.length === 0) {
      console.log('Session quiz generation failed - using mock questions');
      questions = mockDocumentQuiz(qCount, pdf.filename);
    }

    const joinCode = await generateUniqueJoinCode();
    const result = await run(
      'INSERT INTO quiz_sessions (admin_id, session_name, pdf_id, join_code, count, difficulty, questions) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, session_name.trim(), pdfId, joinCode, qCount, diff, JSON.stringify(questions)]
    );

    res.json({ id: result.lastInsertRowid, session_name: session_name.trim(), join_code: joinCode, count: questions.length, difficulty: diff, pdf_filename: pdf.filename, status: 'open' });
  } catch (e) {
    console.error('Session create error:', e);
    res.status(500).json({ error: 'Failed to create session: ' + e.message });
  }
});

// Admin: list all sessions
router.get('/', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const sessions = await all(`
      SELECT s.id, s.session_name, s.join_code, s.count, s.difficulty, s.status, s.created_at, p.filename as pdf_filename,
        (SELECT COUNT(*)::int FROM session_participants sp WHERE sp.session_id = s.id) as participant_count,
        (SELECT COUNT(*)::int FROM session_participants sp WHERE sp.session_id = s.id AND sp.completed_at IS NOT NULL) as completed_count
      FROM quiz_sessions s JOIN pdfs p ON s.pdf_id = p.id
      WHERE s.admin_id = ? ORDER BY s.created_at DESC
    `, [req.user.id]);
    res.json(sessions);
  } catch (e) {
    console.error('Session list error:', e);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// Admin: session detail + scoreboard
router.get('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid session id' });

    const session = await get(`
      SELECT s.id, s.session_name, s.join_code, s.count, s.difficulty, s.status, s.created_at, p.filename as pdf_filename
      FROM quiz_sessions s JOIN pdfs p ON s.pdf_id = p.id WHERE s.id = ? AND s.admin_id = ?
    `, [id, req.user.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const participants = await all(`
      SELECT id, name, employee_id, grade, score, total, joined_at, completed_at
      FROM session_participants WHERE session_id = ?
      ORDER BY (score IS NULL), score DESC, completed_at ASC
    `, [id]);

    res.json({ ...session, participants });
  } catch (e) {
    console.error('Session detail error:', e);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

// Admin: close/reopen a session
router.patch('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid session id' });
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'status must be open or closed' });

    const session = await get('SELECT id FROM quiz_sessions WHERE id = ? AND admin_id = ?', [id, req.user.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await run('UPDATE quiz_sessions SET status = ? WHERE id = ?', [status, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Session update error:', e);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Admin: delete a session
router.delete('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid session id' });

    const session = await get('SELECT id FROM quiz_sessions WHERE id = ? AND admin_id = ?', [id, req.user.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await run('DELETE FROM quiz_sessions WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Session delete error:', e);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// PUBLIC endpoints below - no login required. Participants are identified
// by Name / Employee ID / Grade, not by an app account.

router.get('/public/lookup/:code', async (req, res) => {
  try {
    const code = (req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'A quiz code is required' });

    const session = await get('SELECT id, session_name, count, difficulty, status FROM quiz_sessions WHERE join_code = ?', [code]);
    if (!session) return res.status(404).json({ error: 'Invalid quiz code' });
    if (session.status === 'closed') return res.status(403).json({ error: 'This quiz session has been closed by the admin' });
    res.json(session);
  } catch (e) {
    console.error('Session lookup error:', e);
    res.status(500).json({ error: 'Failed to look up quiz code' });
  }
});

router.post('/public/join', async (req, res) => {
  try {
    const { join_code, name, employee_id, grade } = req.body;
    if (!join_code || !name?.trim() || !employee_id?.trim() || !grade?.trim()) {
      return res.status(400).json({ error: 'Name, Employee ID, and Grade are all required' });
    }
    const code = join_code.trim().toUpperCase();
    const session = await get('SELECT * FROM quiz_sessions WHERE join_code = ?', [code]);
    if (!session) return res.status(404).json({ error: 'Invalid quiz code' });
    if (session.status === 'closed') return res.status(403).json({ error: 'This quiz session has been closed by the admin' });

    const existing = await get('SELECT * FROM session_participants WHERE session_id = ? AND employee_id = ?', [session.id, employee_id.trim()]);
    if (existing && existing.completed_at) {
      return res.status(409).json({ error: 'This Employee ID has already completed this quiz' });
    }

    let participantId;
    if (existing) {
      participantId = existing.id;
    } else {
      const result = await run('INSERT INTO session_participants (session_id, name, employee_id, grade) VALUES (?, ?, ?, ?)',
        [session.id, name.trim(), employee_id.trim(), grade.trim()]);
      participantId = result.lastInsertRowid;
    }

    const questions = JSON.parse(session.questions);
    const questionsForParticipant = questions.map(({ answer, explanation, ...q }) => q);

    res.json({ participant_id: participantId, session_name: session.session_name, questions: questionsForParticipant });
  } catch (e) {
    console.error('Session join error:', e);
    res.status(500).json({ error: 'Failed to join quiz' });
  }
});

router.post('/public/submit', async (req, res) => {
  try {
    const participantId = parsePositiveInt(req.body.participant_id);
    const { answers } = req.body;
    if (!participantId || !Array.isArray(answers)) return res.status(400).json({ error: 'participant_id and answers are required' });

    const participant = await get('SELECT * FROM session_participants WHERE id = ?', [participantId]);
    if (!participant) return res.status(404).json({ error: 'Participant not found' });
    if (participant.completed_at) return res.status(409).json({ error: 'This quiz has already been submitted' });

    const session = await get('SELECT * FROM quiz_sessions WHERE id = ?', [participant.session_id]);
    const questions = JSON.parse(session.questions);

    let score = 0;
    const total = questions.length;
    const results = questions.map((q, i) => {
      const userAnswer = (answers[i] || '').toString().toLowerCase().trim();
      const correctAnswer = (q.answer || '').toString().toLowerCase().trim();
      const isCorrect = userAnswer === correctAnswer;
      if (isCorrect) score++;
      return { question: q.question, type: q.type, userAnswer: answers[i], correctAnswer: q.answer, explanation: q.explanation, isCorrect };
    });

    await run('UPDATE session_participants SET score = ?, total = ?, results = ?, completed_at = ? WHERE id = ?',
      [score, total, JSON.stringify(results), new Date().toISOString(), participantId]);

    res.json({ score, total, results });
  } catch (e) {
    console.error('Session submit error:', e);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

export default router;
