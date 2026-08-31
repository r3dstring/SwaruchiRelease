import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { retrieveForTopic } from '../retrieval.js';
import { getAllProviders, callLLM } from '../aiProvider.js';

const router = Router();
const XP_PER_CORRECT = 10;
const XP_BONUS_PERFECT = 25;
const HISTORY_EXCLUSION_LIMIT = 12; // trimmed from 20 — less prompt bulk per call, stays effective at avoiding repeats
const HISTORY_CAP = 50;

function calcLevel(xp) {
  let level = 1, threshold = 100, remaining = xp;
  while (remaining >= threshold) { remaining -= threshold; level++; threshold += 50 * level; }
  return level;
}

async function updateStreak(userId) {
  const user = await get('SELECT last_quiz_date, streak FROM users WHERE id = ?', [userId]);
  const today = new Date().toISOString().slice(0, 10);
  if (!user || user.last_quiz_date === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = user.last_quiz_date === yesterday ? user.streak + 1 : 1;
  await run('UPDATE users SET streak = ?, last_quiz_date = ? WHERE id = ?', [newStreak, today, userId]);
}

function normalizeQ(text) { return (text || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

async function getRecentQuestions(userId, topic) {
  const rows = await all('SELECT question_text FROM question_history WHERE user_id = ? AND topic = ? ORDER BY asked_at DESC LIMIT ?', [userId, topic || '', HISTORY_EXCLUSION_LIMIT]);
  return rows.map(r => r.question_text);
}

async function logQuestionsToHistory(userId, topic, questions) {
  if (!questions?.length) return;
  const existing = await all('SELECT id FROM question_history WHERE user_id = ? AND topic = ? ORDER BY asked_at DESC', [userId, topic || '']);
  if (existing.length >= HISTORY_CAP) {
    const toDelete = existing.slice(HISTORY_CAP - questions.length);
    for (const r of toDelete) await run('DELETE FROM question_history WHERE id = ?', [r.id]);
  }
  for (const q of questions) {
    await run('INSERT INTO question_history (user_id, topic, question_text, question_type) VALUES (?, ?, ?, ?)', [userId, topic || '', normalizeQ(q.question), q.type]);
  }
}

function similarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  if (!setA.size || !setB.size) return 0;
  const inter = [...setA].filter(w => setB.has(w)).length;
  return inter / (setA.size + setB.size - inter);
}
function deduplicateAgainstHistory(questions, history) {
  return questions.filter(q => { const n = normalizeQ(q.question); return !history.some(h => similarity(n, h) > 0.75); });
}

async function getAdaptiveDirective(userId, topic) {
  if (!topic) return '';
  const prog = await get('SELECT * FROM topic_progress WHERE user_id = ? AND topic = ?', [userId, topic]);
  if (!prog || prog.attempted < 3) return '';
  const accuracy = Math.round((prog.correct / prog.attempted) * 100);
  if (accuracy < 50) return `\nLEARNER PROFILE: ${accuracy}% accuracy on "${topic}" (${prog.attempted} attempts). WEAK AREA. Emphasize fundamentals and core definitions.\n`;
  if (accuracy < 80) return `\nLEARNER PROFILE: ${accuracy}% accuracy on "${topic}" (${prog.attempted} attempts). DEVELOPING. Target the gap between recall and understanding.\n`;
  return `\nLEARNER PROFILE: ${accuracy}% accuracy on "${topic}" — MASTERED. Avoid basics. Focus on advanced aspects and edge cases.\n`;
}

// Concrete, example-driven difficulty criteria — a one-line hint wasn't enough
// to make models actually vary output, so each level gets explicit criteria
// PLUS example question stems to anchor the model's phrasing and complexity.
const DIFFICULTY_GUIDE = {
  easy: `Test direct recall of a single fact, definition, or value explicitly stated in the material.
Example stems: "What is the purpose of...", "Which component is responsible for...", "What does [term] refer to..."
The answer should be findable in one sentence of the source text. No inference required.`,
  medium: `Test understanding of HOW or WHY something works, or the relationship between two concepts — not just recall.
Example stems: "Why is [X] done before [Y]...", "What happens if [parameter] increases...", "How does [component A] affect [component B]..."
Require connecting at least two pieces of information from the material, not a single isolated fact.`,
  hard: `Test analysis, troubleshooting, or synthesis across multiple concepts. The learner must reason through implications, not just recall a relationship.
Example stems: "If [symptom] is observed, what is the most likely root cause among...", "Which sequence of actions would correctly address...", "What would happen to [downstream system] if [upstream failure] occurred..."
Should require combining 2-3 facts and drawing a conclusion that isn't directly stated in the text.`
};

const CONSEQUENCE_DIFFICULTY = {
  easy: 'Simple operational situations with one clear safe response.',
  medium: 'Multiple process variables, operator must prioritize actions.',
  hard: 'Complex cascading situations requiring analytical thinking.'
};

// Redistribute question-type counts based on which types the user selected.
// If all three are chosen, keep the established 50/25/25 split; if fewer are
// chosen, split evenly among just those, so a "T/F only" quiz gets 100% T/F
// instead of silently still trying to generate MCQs.
function computeTypeCounts(count, allowedTypes) {
  const types = (allowedTypes && allowedTypes.length > 0) ? allowedTypes : ['mcq', 'tf', 'fitb'];
  const counts = { mcq: 0, tf: 0, fitb: 0 };
  if (types.length === 3) {
    counts.mcq = Math.ceil(count * 0.5);
    counts.tf = Math.ceil(count * 0.25);
    counts.fitb = count - counts.mcq - counts.tf;
  } else {
    const base = Math.floor(count / types.length);
    let remainder = count - base * types.length;
    types.forEach(t => { counts[t] = base; });
    // distribute remainder one at a time so totals still add up to `count`
    for (let i = 0; remainder > 0; i = (i + 1) % types.length, remainder--) counts[types[i]]++;
  }
  return counts;
}

function buildPrompt({ context, count, difficulty, topic, topicParent, consequenceMode, adaptive, previousQuestions, questionTypes }) {
  const counts = computeTypeCounts(count, questionTypes);
  const formatLines = [];
  if (counts.mcq > 0) formatLines.push(`- ${counts.mcq} multiple choice (type:"mcq") with 4 options and correct answer letter (a/b/c/d)`);
  if (counts.tf > 0) formatLines.push(`- ${counts.tf} true/false (type:"tf") with answer "true" or "false"`);
  if (counts.fitb > 0) formatLines.push(`- ${counts.fitb} fill in the blank (type:"fitb") with a _____ and a short answer`);
  const formatBlock = formatLines.join('\n');

  const topicBlock = topic ? `\nTOPIC FOCUS: ${topicParent ? topicParent + ' > ' : ''}${topic}\nGenerate questions STRICTLY about "${topic}". Use retrieved material; supplement with industry knowledge if partial. Every question must pass: "Is this about ${topic}?"\n` : '';
  const exclusionBlock = previousQuestions.length > 0 ? `\nPREVIOUSLY ASKED — DO NOT repeat or create near-duplicates:\n${previousQuestions.map((q,i)=>`${i+1}. "${q}"`).join('\n')}\nGenerate completely different questions covering different aspects.\n` : '';

  const antiPlainBlock = `
QUALITY RULES — avoid generic, interchangeable-sounding questions:
- Do NOT start every question with "Which of the following..." — vary sentence structure and openers.
- Reference SPECIFIC details from the material: exact terms, numbers, component names, procedures — not vague paraphrases.
- Each question should be answerable ONLY by someone who engaged with THIS material, not generic industry trivia.
- Wrong MCQ options must be specific and plausible (real related concepts/values), never filler like "None of the above" or "All of the above".`;

  if (consequenceMode) {
    return `You are a senior refinery operations trainer creating SCENARIO-BASED assessment.
Every question MUST present a realistic operational SITUATION requiring a decision — NO definition/recall.
${topicBlock}${adaptive}${exclusionBlock}${antiPlainBlock}
Focus: decision making, safety, troubleshooting, root cause, consequence awareness. Wrong options = plausible but incorrect operator actions.
DIFFICULTY: ${(difficulty||'medium').toUpperCase()} — ${CONSEQUENCE_DIFFICULTY[difficulty]||CONSEQUENCE_DIFFICULTY.medium}
GENERATE EXACTLY ${count} scenario questions in these formats:
${formatBlock}
Every question MUST include "explanation" (2-3 sentences).
Return ONLY valid JSON array, no markdown:
[{"type":"mcq","question":"...","options":["...","...","...","..."],"answer":"a","explanation":"..."},{"type":"tf","question":"...","options":["True","False"],"answer":"true","explanation":"..."},{"type":"fitb","question":"... _____ ...","options":null,"answer":"...","explanation":"..."}]
RETRIEVED PLANT DOCUMENTATION:
${context}`;
  }
  return `You are an expert quiz designer for refinery and petrochemical training.
${topicBlock}${adaptive}${exclusionBlock}${antiPlainBlock}
RULES: Test genuine understanding of concepts, facts, and relationships — never document structure or layout. NEVER ask about page numbers, section numbers, headings, or "where in the document" something appears. Answerable from material or standard knowledge. Meaningful T/F. Fill-in answers 1-3 words, never a page/section number. No duplicates.
DIFFICULTY: ${(difficulty||'medium').toUpperCase()}
${DIFFICULTY_GUIDE[difficulty]||DIFFICULTY_GUIDE.medium}
GENERATE EXACTLY ${count} questions in these formats:
${formatBlock}
Every question MUST include "explanation" (1-2 sentences).
Return ONLY valid JSON array, no markdown:
[{"type":"mcq","question":"...","options":["...","...","...","..."],"answer":"a","explanation":"..."},{"type":"tf","question":"...","options":["True","False"],"answer":"true","explanation":"..."},{"type":"fitb","question":"... _____ ...","options":null,"answer":"...","explanation":"..."}]
RETRIEVED STUDY MATERIAL:
${context}`;
}

async function generateQuestions(userId, { count, difficulty, topic, topicParent, consequenceMode, questionTypes }) {
  const providers = getAllProviders();
  const { context, docsReferenced } = await retrieveForTopic(topic || '', { rotate: true });
  if (!context) return { questions: null, docsReferenced: [] };
  if (providers.length === 0) return { questions: null, docsReferenced };

  const adaptive = await getAdaptiveDirective(userId, topic);
  const previousQuestions = await getRecentQuestions(userId, topic);
  const prompt = buildPrompt({ context, count, difficulty, topic, topicParent, consequenceMode, adaptive, previousQuestions, questionTypes });

  // Try each configured provider in order. If one fails (rate limit, outage,
  // bad response), automatically move to the next instead of falling straight
  // to mock questions — this is what makes a single provider going down non-fatal.
  for (const provider of providers) {
    try {
      const responseText = await callLLM(prompt, provider);
      if (!responseText) { console.log(`[${provider.name}] no response, trying next provider...`); continue; }
      const match = responseText.match(/\[[\s\S]*\]/);
      if (!match) { console.log(`[${provider.name}] no JSON array in response, trying next provider...`); continue; }
      let questions = JSON.parse(match[0]);
      if (!Array.isArray(questions)) { continue; }
      questions = questions.filter(q => q.type && q.question && q.answer && (q.type === 'fitb' || (Array.isArray(q.options) && q.options.length >= 2)));
      const deduped = deduplicateAgainstHistory(questions, previousQuestions);
      const final = deduped.slice(0, count);
      if (final.length === 0) { console.log(`[${provider.name}] all questions filtered out, trying next provider...`); continue; }
      console.log(`[${provider.name}] ${final.length}/${count} questions | topic: ${topic||'general'} | excluded: ${previousQuestions.length} | docs: ${docsReferenced.length}`);
      return { questions: final, docsReferenced };
    } catch (e) {
      console.error(`[${provider.name}] threw an error, trying next provider:`, e.message);
    }
  }

  console.log('All configured AI providers failed — falling back to mock questions');
  return { questions: null, docsReferenced };
}

function generateMockQuestions(topic, questionTypes = null) {
  const t = topic || 'refinery operations';
  const pool = [
    { type:'mcq', question:`Which best describes ${t}?`, options:['Core operational concept','Unrelated topic','Historical detail','Marketing term'], answer:'a', explanation:'Mock — configure an AI key.' },
    { type:'mcq', question:`In ${t}, what should the operator prioritize?`, options:['Safety and stable operation','Speed above all','Skipping checks','Ignoring alarms'], answer:'a', explanation:'Safety first.' },
    { type:'tf', question:`${t} is a relevant training area.`, options:['True','False'], answer:'true', explanation:'Part of the tree.' },
    { type:'fitb', question:`The area being tested is _____.`, answer: t.toLowerCase(), explanation:'The selected topic.' },
  ];
  const allowed = (questionTypes && questionTypes.length > 0) ? questionTypes : ['mcq','tf','fitb'];
  const filtered = pool.filter(q => allowed.includes(q.type));
  return filtered.length > 0 ? filtered : pool;
}

async function updateTopicProgress(userId, topic, correct, incorrect) {
  if (!topic) return;
  const existing = await get('SELECT * FROM topic_progress WHERE user_id = ? AND topic = ?', [userId, topic]);
  const now = new Date().toISOString();
  if (existing) {
    await run('UPDATE topic_progress SET attempted=attempted+?, correct=correct+?, incorrect=incorrect+?, last_practiced=?, revision_count=revision_count+1 WHERE user_id=? AND topic=?', [correct+incorrect, correct, incorrect, now, userId, topic]);
  } else {
    await run('INSERT INTO topic_progress (user_id, topic, attempted, correct, incorrect, last_practiced, revision_count) VALUES (?,?,?,?,?,?,1)', [userId, topic, correct+incorrect, correct, incorrect, now]);
  }
}

router.post('/generate', authMiddleware, async (req, res) => {
  const { count=10, difficulty='medium', topic=null, topicParent=null, consequenceMode=false, questionTypes=null } = req.body;
  const qCount = Math.min(Math.max(parseInt(count)||10, 5), 20);
  const diff = ['easy','medium','hard'].includes(difficulty) ? difficulty : 'medium';
  const validTypes = Array.isArray(questionTypes) ? questionTypes.filter(t => ['mcq','tf','fitb'].includes(t)) : null;
  const docRow = await get('SELECT COUNT(*)::int AS c FROM pdfs');
  if ((docRow?.c || 0) === 0) return res.status(400).json({ error: 'No documents in the knowledge base yet. Ask your admin to upload training material.' });

  const { questions: aiQ, docsReferenced } = await generateQuestions(req.user.id, { count: qCount, difficulty: diff, topic, topicParent, consequenceMode: !!consequenceMode, questionTypes: validTypes });
  const questions = aiQ || generateMockQuestions(topic, validTypes);
  if (aiQ) await logQuestionsToHistory(req.user.id, topic, questions);
  res.json({ questions, topic, consequenceMode: !!consequenceMode, docsReferenced });
});

router.post('/submit', authMiddleware, async (req, res) => {
  const { questions, answers, topic, consequenceMode=false, docsReferenced=[] } = req.body;
  if (!questions || !answers) return res.status(400).json({ error: 'Missing data' });
  let score = 0;
  const total = questions.length;
  const results = questions.map((q, i) => {
    const ua = (answers[i]||'').toString().toLowerCase().trim();
    const ca = (q.answer||'').toString().toLowerCase().trim();
    const isCorrect = ua === ca;
    if (isCorrect) score++;
    return { ...q, userAnswer: answers[i], isCorrect };
  });
  let xpEarned = score * XP_PER_CORRECT;
  if (score === total) xpEarned += XP_BONUS_PERFECT;
  const primaryDoc = docsReferenced?.[0]?.id || null;
  await run('INSERT INTO quizzes (user_id, pdf_id, questions, topic, consequence_mode, docs_referenced, score, total, xp_earned) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.user.id, primaryDoc, JSON.stringify(results), topic||null, consequenceMode?1:0, JSON.stringify(docsReferenced||[]), score, total, xpEarned]);
  const user = await get('SELECT xp FROM users WHERE id=?', [req.user.id]);
  const newXp = (user?.xp||0) + xpEarned;
  await run('UPDATE users SET xp=?, level=? WHERE id=?', [newXp, calcLevel(newXp), req.user.id]);
  await updateStreak(req.user.id);
  await updateTopicProgress(req.user.id, topic, score, total-score);
  const updatedUser = await get('SELECT id, username, xp, level, streak FROM users WHERE id=?', [req.user.id]);
  res.json({ score, total, xpEarned, perfectBonus: score===total, results, user: updatedUser, topic: topic||null, consequenceMode: !!consequenceMode, docsReferenced });
});

router.post('/flag', authMiddleware, async (req, res) => {
  const { topic, question_text, question_type, options, correct_answer, explanation, reason, comment } = req.body;
  if (!question_text || !reason) return res.status(400).json({ error: 'question_text and reason required' });
  await run('INSERT INTO flagged_questions (user_id, topic, question_text, question_type, options, correct_answer, explanation, reason, comment) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.user.id, topic||null, question_text, question_type||null, options ? JSON.stringify(options) : null, correct_answer||null, explanation||null, reason, comment||null]);
  res.json({ ok: true });
});

router.get('/admin/flags', authMiddleware, requireAdmin, async (req, res) => {
  const { status = 'open' } = req.query;
  const flags = await all('SELECT f.*, u.username as flagged_by FROM flagged_questions f JOIN users u ON f.user_id = u.id WHERE f.status = ? ORDER BY f.flagged_at DESC', [status]);
  const topicSummary = await all("SELECT topic, COUNT(*)::int as count FROM flagged_questions WHERE status = 'open' AND topic IS NOT NULL GROUP BY topic ORDER BY count DESC LIMIT 5");
  const openRow = await get("SELECT COUNT(*)::int as c FROM flagged_questions WHERE status = 'open'");
  res.json({ flags, topicSummary, openCount: openRow?.c || 0 });
});

router.patch('/admin/flags/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['reviewed','dismissed'].includes(status)) return res.status(400).json({ error: 'status must be reviewed or dismissed' });
  await run('UPDATE flagged_questions SET status=?, reviewed_at=? WHERE id=?', [status, new Date().toISOString(), req.params.id]);
  res.json({ ok: true });
});

router.get('/history', authMiddleware, async (req, res) => {
  res.json(await all('SELECT q.id, q.score, q.total, q.xp_earned, q.completed_at, q.topic, q.consequence_mode, q.docs_referenced, p.filename as pdf_name FROM quizzes q LEFT JOIN pdfs p ON q.pdf_id = p.id WHERE q.user_id = ? ORDER BY q.completed_at DESC LIMIT 20', [req.user.id]));
});

router.get('/progress', authMiddleware, async (req, res) => {
  const progress = await all('SELECT * FROM topic_progress WHERE user_id = ?', [req.user.id]);
  const quizzes = await all('SELECT topic, score, total, completed_at FROM quizzes WHERE user_id=? AND topic IS NOT NULL ORDER BY completed_at ASC', [req.user.id]);
  const byTopic = {};
  for (const q of quizzes) { if (!byTopic[q.topic]) byTopic[q.topic] = []; byTopic[q.topic].push(q.score / q.total); }
  const enriched = progress.map(p => {
    const accuracy = p.attempted > 0 ? Math.round((p.correct/p.attempted)*100) : 0;
    const mastery = accuracy >= 80 ? 'mastered' : accuracy >= 50 ? 'revision' : 'weak';
    let trend = 'stable';
    const series = byTopic[p.topic] || [];
    if (series.length >= 2) {
      const half = Math.floor(series.length/2);
      const early = series.slice(0,half).reduce((a,b)=>a+b,0)/half;
      const late = series.slice(half).reduce((a,b)=>a+b,0)/(series.length-half);
      if (late-early > 0.1) trend = 'improving'; else if (early-late > 0.1) trend = 'declining';
    }
    return { ...p, accuracy, mastery, trend };
  });
  res.json(enriched);
});

router.get('/recommendations', authMiddleware, async (req, res) => {
  const progress = await all('SELECT * FROM topic_progress WHERE user_id=? AND attempted >= 3', [req.user.id]);
  const withAcc = progress.map(p => ({ ...p, accuracy: Math.round((p.correct/p.attempted)*100) }));
  const weakest = [...withAcc].sort((a,b)=>a.accuracy-b.accuracy).slice(0,5);
  const mastered = withAcc.filter(p=>p.accuracy>=80).sort((a,b)=>b.accuracy-a.accuracy);
  let recommendation = null;
  if (weakest.length > 0 && weakest[0].accuracy < 80) {
    recommendation = { topic: weakest[0].topic, reason: weakest[0].accuracy < 50 ? 'This is your weakest area and needs focused revision.' : 'You are close to mastering this — one more session should do it.', accuracy: weakest[0].accuracy, estimatedMinutes: weakest[0].accuracy < 50 ? 10 : 7 };
  }
  const recent = (await all('SELECT score, total, completed_at, topic FROM quizzes WHERE user_id=? ORDER BY completed_at DESC LIMIT 15', [req.user.id])).reverse();
  const growth = recent.map(q => ({ date: q.completed_at, accuracy: Math.round((q.score/q.total)*100), topic: q.topic }));
  res.json({ weakest, mastered: mastered.slice(0,3), recommendation, growth });
});

router.get('/leaderboard', async (req, res) => {
  res.json(await all('SELECT id, username, xp, level, streak FROM users ORDER BY xp DESC LIMIT 10'));
});

export default router;
