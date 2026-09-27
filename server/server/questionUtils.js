// Shared question post-processing used by BOTH quiz.js (personal quizzes) and
// sessions.js (Custom Quiz). Keeping this in one place means a fix applies to
// both modes instead of drifting apart.

// ---------------------------------------------------------------------------
// OPTION SHUFFLING
// ---------------------------------------------------------------------------
// LLMs have a well-documented position bias: they disproportionately place the
// correct answer in the first one or two positions. That's why answers were
// coming back as mostly A or B. Rather than trying to prompt the bias away
// (unreliable), we shuffle the options ourselves after generation and remap
// the answer letter to wherever the correct option actually landed. This makes
// answer distribution genuinely uniform regardless of what the model does.
//
// True/false is deliberately NOT shuffled — "True" must stay option A and
// "False" option B, or the rendered labels stop matching the answer values.
export function shuffleOptions(q) {
  if (q.type !== 'mcq' || !Array.isArray(q.options) || q.options.length < 2) return q;

  const answerIdx = letterToIndex(q.answer);
  if (answerIdx === null || answerIdx >= q.options.length) return q; // invalid; validation catches it

  // Pair each option with whether it's the correct one, shuffle, then find
  // where the correct one ended up.
  const paired = q.options.map((opt, i) => ({ opt, correct: i === answerIdx }));
  for (let i = paired.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paired[i], paired[j]] = [paired[j], paired[i]];
  }
  const newAnswerIdx = paired.findIndex(p => p.correct);

  return {
    ...q,
    options: paired.map(p => p.opt),
    answer: String.fromCharCode(97 + newAnswerIdx),
  };
}

function letterToIndex(answer) {
  if (answer === undefined || answer === null) return null;
  const a = answer.toString().toLowerCase().trim();
  if (!/^[a-z]$/.test(a)) return null;
  return a.charCodeAt(0) - 97;
}

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------
// Previously the only check was "has at least 2 options". An AI hallucinating
// an out-of-range answer (e.g. "e" on a 4-option question) produced a question
// nobody could ever answer correctly, and it failed silently. This rejects
// those outright so they never reach a learner.
export function isValidQuestion(q) {
  if (!q || !q.type || !q.question || q.answer === undefined || q.answer === null) return false;

  if (q.type === 'fitb') {
    return q.answer.toString().trim().length > 0;
  }

  if (!Array.isArray(q.options) || q.options.length < 2) return false;

  if (q.type === 'tf') {
    const a = q.answer.toString().toLowerCase().trim();
    return a === 'true' || a === 'false';
  }

  if (q.type === 'mcq') {
    const idx = letterToIndex(q.answer);
    // The answer letter must actually point at one of the options provided.
    return idx !== null && idx >= 0 && idx < q.options.length;
  }

  return false;
}

// ---------------------------------------------------------------------------
// DEDUPLICATION
// ---------------------------------------------------------------------------
// Jaccard similarity on word sets. Cheap, no dependencies, and good enough to
// catch "the same question reworded", which is the actual failure mode.
export function normalizeText(s) {
  // Keep hyphens and digits joined to letters so equipment tags survive as a
  // single distinguishing token (PSV-101 stays "psv-101", not "psv" + "101").
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Words that carry no distinguishing meaning in a question. Filtering these
// (rather than filtering by LENGTH) is critical in a refinery context: short
// tokens like "fd", "id", "hp", "lp" are exactly the tokens that distinguish
// one piece of equipment from another, and must NOT be discarded.
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','of','to','in','on','at','for','with',
  'and','or','but','if','then','than','that','this','these','those','it','its','as','by',
  'from','what','which','who','when','where','why','how','does','do','did','can','could',
  'should','would','will','shall','may','might','must','has','have','had','not','no','you',
]);

function tokenSet(s) {
  return new Set(normalizeText(s).split(' ').filter(w => w.length > 0 && !STOPWORDS.has(w)));
}

export function similarity(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

const SIMILARITY_THRESHOLD = 0.60;

// Word overlap ALONE cannot separate "the same question reworded" from "the
// same template applied to different equipment" — e.g. "function of the FD
// fan" vs "function of the ID fan" share nearly every word but are entirely
// different questions. In a refinery context that distinction is critical,
// since tag numbers and 2-letter prefixes are exactly what differentiates
// equipment. So before declaring two questions duplicates, we check whether
// either contains a "specific identifier" the other lacks. If so, they are
// treated as distinct no matter how similar the surrounding wording is.
// Matches equipment tags (psv-101, ub-01, 2oo3) AND standalone numbers.
// Standalone numbers matter: in a refinery context they're setpoints, unit
// numbers, pressures, percentages. Two questions differing only by a number
// are asking about different things, not rewording the same thing.
const IDENTIFIER_RE = /^(?:[a-z]{1,4}-?\d{1,4}[a-z]?|\d{1,4}[a-z]{1,3}|\d+)$/;

function identifierTokens(s) {
  const out = new Set();
  for (const w of normalizeText(s).split(' ')) {
    if (IDENTIFIER_RE.test(w)) out.add(w);
  }
  return out;
}

// Short all-letter tokens (fd, id, hp, lp, mp, vhp...) that aren't stopwords
// are almost always equipment/service qualifiers and are equally load-bearing.
function qualifierTokens(s) {
  const out = new Set();
  for (const w of normalizeText(s).split(' ')) {
    if (w.length <= 3 && /^[a-z]+$/.test(w) && !STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

function hasDistinguishingDifference(a, b) {
  const setsToCheck = [
    [identifierTokens(a), identifierTokens(b)],
    [qualifierTokens(a), qualifierTokens(b)],
  ];
  for (const [A, B] of setsToCheck) {
    // If either side has a specific identifier/qualifier the other lacks,
    // these are about different things.
    for (const t of A) if (!B.has(t)) return true;
    for (const t of B) if (!A.has(t)) return true;
  }
  return false;
}

// Removes questions that are too similar to previously-asked ones AND
// questions that duplicate each other within the same batch. The
// within-batch check matters: an AI asked for 15 questions will sometimes
// produce near-identical pairs in a single response.
export function deduplicate(questions, previousTexts = []) {
  const kept = [];
  const seen = previousTexts.map(normalizeText);

  for (const q of questions) {
    const text = q.question;
    const isDupe = seen.some(prev =>
      similarity(text, prev) >= SIMILARITY_THRESHOLD && !hasDistinguishingDifference(text, prev)
    );
    if (isDupe) continue;
    kept.push(q);
    seen.push(normalizeText(text));
  }
  return kept;
}

// ---------------------------------------------------------------------------
// PIPELINE
// ---------------------------------------------------------------------------
// One call that applies validation, shuffling and dedup in the right order.
// Order matters: validate first (so shuffling never sees a broken answer),
// then shuffle, then dedup.
export function processQuestions(rawQuestions, previousTexts = []) {
  if (!Array.isArray(rawQuestions)) return [];
  const valid = rawQuestions.filter(isValidQuestion);
  const shuffled = valid.map(shuffleOptions);
  return deduplicate(shuffled, previousTexts);
}
