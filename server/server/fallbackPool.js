import { all, get, run } from './db.js';
import { generateWithFailover } from './aiProvider.js';
import { processQuestions } from './questionUtils.js';
import { getChunksForDoc } from './retrieval.js';

const POOL_TARGET_SIZE = 18;

// ---------------------------------------------------------------------------
// WHY THIS IS LAZY, NOT AT UPLOAD TIME
// ---------------------------------------------------------------------------
// Generating a fallback pool at upload would burn tokens on every document,
// including ones nobody ever quizzes — the opposite of the goal, given the API
// budget pressure this was built under.
//
// It's also self-defeating to build the pool at the moment of failure: if the
// whole provider chain is down, the fallback generation fails for exactly the
// same reason. So the pool is built opportunistically, piggybacked on a moment
// we KNOW a provider is healthy — the first successful live generation for
// that document. One extra call, once, only for documents actually in use.

export async function hasFallbackPool(pdfId) {
  const row = await get('SELECT fallback_questions FROM pdfs WHERE id = ?', [pdfId]);
  if (!row?.fallback_questions) return false;
  try {
    const parsed = JSON.parse(row.fallback_questions);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch { return false; }
}

function buildPoolPrompt(context, filename) {
  return `You are creating a broad reserve set of assessment questions from a refinery training document. These will be used when live question generation is unavailable, so they must stand on their own and cover the document widely.

RULES:
1. Every question must test genuine understanding of the CONTENT, PROCEDURES or CONCEPTS in the text — never the document's structure.
2. NEVER ask about page numbers, section numbers, headings, or "where in the document" something appears.
3. Spread the questions ACROSS THE WHOLE document, not clustered on the opening pages.
4. Vary difficulty: roughly one third straightforward recall, one third relationship/cause-effect, one third analysis or troubleshooting.
5. Wrong multiple-choice options must be specific and plausible, never "None of the above" or "All of the above".
6. Vary sentence structure. Do NOT start every question with "Which of the following".
7. No two questions may be near-duplicates of each other.

GENERATE EXACTLY ${POOL_TARGET_SIZE} questions as a mix:
- 10 multiple choice (type:"mcq") with 4 options and correct answer letter (a/b/c/d)
- 4 true/false (type:"tf") with answer "true" or "false"
- 4 fill in the blank (type:"fitb") with a _____ and a short answer

Every question MUST include an "explanation" field (1-2 sentences).

Return ONLY a valid JSON array, no markdown:
[{"type":"mcq","question":"...","options":["...","...","...","..."],"answer":"a","explanation":"..."},{"type":"tf","question":"...","options":["True","False"],"answer":"true","explanation":"..."},{"type":"fitb","question":"... _____ ...","options":null,"answer":"...","explanation":"..."}]

DOCUMENT (${filename}):
${context}`;
}

// Fire-and-forget. Never blocks or fails the request that triggered it — if
// this errors, the pool simply stays empty and the next successful generation
// tries again.
export async function ensureFallbackPool(pdfId, _unusedContext, filename) {
  try {
    if (await hasFallbackPool(pdfId)) return;

    // Deliberately re-read the document rather than using the caller's context.
    // The caller's context is topic-filtered, rotation-sampled, and may span
    // several documents — building a "document-wide" pool from that would
    // produce a narrow pool attributed to the wrong document. The pool must
    // cover THIS document broadly, so we read its own chunks directly.
    const doc = await get('SELECT id, filename, chunks, text_content, chunks_gz, text_gz FROM pdfs WHERE id = ?', [pdfId]);
    if (!doc) return;

    const chunks = getChunksForDoc(doc);
    if (!chunks || chunks.length === 0) return;

    // Sample evenly across the whole document so the pool isn't biased toward
    // the opening pages, while staying inside a sane token budget.
    const MAX_CHARS = 7000;
    let context;
    if (chunks.join('\n\n').length <= MAX_CHARS) {
      context = chunks.join('\n\n');
    } else {
      const perChunk = Math.max(400, Math.floor(MAX_CHARS / Math.min(chunks.length, 8)));
      const step = Math.max(1, Math.floor(chunks.length / 8));
      const picked = [];
      for (let i = 0; i < chunks.length && picked.length < 8; i += step) {
        picked.push(chunks[i].slice(0, perChunk));
      }
      context = picked.join('\n\n').slice(0, MAX_CHARS);
    }

    const prompt = buildPoolPrompt(context, filename || doc.filename);
    const raw = await generateWithFailover(prompt, { count: POOL_TARGET_SIZE });
    if (!raw) {
      console.log(`[fallback] pool generation returned nothing for pdf ${pdfId}; will retry on a later successful generation`);
      return;
    }

    const processed = processQuestions(raw, []);
    if (processed.length === 0) {
      console.log(`[fallback] all pool questions failed validation for pdf ${pdfId}`);
      return;
    }

    await run('UPDATE pdfs SET fallback_questions = ?, fallback_generated_at = ? WHERE id = ?',
      [JSON.stringify(processed), new Date().toISOString(), pdfId]);
    console.log(`[fallback] built pool of ${processed.length} questions for pdf ${pdfId} (${filename})`);
  } catch (e) {
    console.error('[fallback] pool generation error (non-fatal):', e.message);
  }
}

// Pulls `count` questions from a document's pool. Rotates via random sampling
// so a prolonged outage doesn't show the same handful of questions every time.
export async function getFromFallbackPool(pdfId, count, { questionTypes = null, excludeTexts = [] } = {}) {
  try {
    const row = await get('SELECT fallback_questions FROM pdfs WHERE id = ?', [pdfId]);
    if (!row?.fallback_questions) return null;

    let pool = JSON.parse(row.fallback_questions);
    if (!Array.isArray(pool) || pool.length === 0) return null;

    if (questionTypes && questionTypes.length > 0) {
      const filtered = pool.filter(q => questionTypes.includes(q.type));
      if (filtered.length > 0) pool = filtered;
    }

    // Prefer questions the user hasn't recently seen, but fall back to the
    // whole pool rather than returning nothing.
    const processed = processQuestions(pool, excludeTexts);
    const usable = processed.length >= Math.min(count, 3) ? processed : pool;

    const shuffled = [...usable];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  } catch (e) {
    console.error('[fallback] pool read error:', e.message);
    return null;
  }
}

// For the personal-quiz path, which draws from the whole knowledge base rather
// than one document: pull from whichever documents were actually retrieved for
// this topic, so fallback content still relates to what was being studied.
export async function getFromFallbackPoolMulti(pdfIds, count, opts = {}) {
  if (!Array.isArray(pdfIds) || pdfIds.length === 0) {
    // No specific docs retrieved — draw from any document that has a pool.
    const rows = await all('SELECT id FROM pdfs WHERE fallback_questions IS NOT NULL LIMIT 5');
    pdfIds = rows.map(r => r.id);
  }
  if (pdfIds.length === 0) return null;

  const collected = [];
  for (const id of pdfIds) {
    const got = await getFromFallbackPool(id, count, opts);
    if (got) collected.push(...got);
    if (collected.length >= count * 2) break;
  }
  if (collected.length === 0) return null;

  const shuffled = [...collected];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
