import zlib from 'zlib';
import { all, get } from './db.js';

// Keywords now live in the topics table (admin-editable via /api/topics).
// Small in-process cache so we're not hitting the DB on every single chunk
// score during a generation call — refreshed every 60s, which is more than
// fast enough for admin edits to take effect quickly without adding load.
let keywordCache = new Map();
let keywordCacheAt = 0;
const KEYWORD_CACHE_TTL = 60_000;

async function getKeywordsForTopic(topicLabel) {
  if (!topicLabel) return [];
  const now = Date.now();
  if (now - keywordCacheAt > KEYWORD_CACHE_TTL) {
    const rows = await all('SELECT label, keywords FROM topics WHERE parent_id IS NOT NULL');
    keywordCache = new Map(rows.map(r => {
      let kw = [];
      try { kw = JSON.parse(r.keywords || '[]'); } catch { /* leave empty */ }
      return [r.label, kw];
    }));
    keywordCacheAt = now;
  }
  return keywordCache.get(topicLabel) || [];
}

const GENERIC = ['pressure','temperature','flow','level','valve','pump','compressor','exchanger','pipe','process'];

export function chunkText(text, chunkSize = 1200) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let current = '';
  for (const s of sentences) {
    if ((current + ' ' + s).length > chunkSize && current.length > 200) {
      chunks.push(current.trim());
      current = s;
    } else { current += ' ' + s; }
  }
  if (current.trim().length > 100) chunks.push(current.trim());
  return chunks;
}

function scoreChunk(chunk, topicLabel, keywords) {
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    const matches = lower.split(kw.toLowerCase()).length - 1;
    if (matches > 0) score += matches * (kw.includes(' ') ? 3 : 2);
  }
  for (const w of topicLabel.toLowerCase().split(/[\s/&()]+/).filter(w => w.length > 3)) {
    const matches = lower.split(w).length - 1;
    if (matches > 0) score += matches * 2;
  }
  for (const g of GENERIC) { if (lower.includes(g)) score += 0.2; }
  return score;
}

// Weighted random sample — higher scores get higher probability but not guaranteed top-N
// This provides retrieval variety so the LLM sees different passages each call
function weightedSample(items, n) {
  if (items.length <= n) return items;
  const result = [];
  const pool = [...items];
  const totalScore = pool.reduce((s, i) => s + i.score + 1, 0);
  while (result.length < n && pool.length > 0) {
    let rand = Math.random() * pool.reduce((s, i) => s + i.score + 1, 0);
    for (let i = 0; i < pool.length; i++) {
      rand -= pool[i].score + 1;
      if (rand <= 0) { result.push(pool.splice(i, 1)[0]); break; }
    }
  }
  return result;
}

// Decompress a document's chunks, preferring the compressed bytea columns.
// Falls back to legacy plain-text columns for documents uploaded before
// gzip storage was introduced, so nothing breaks on already-uploaded PDFs.
function getChunksForDoc(doc) {
  if (doc.chunks_gz) {
    try { return JSON.parse(zlib.gunzipSync(doc.chunks_gz).toString('utf8')); }
    catch { /* fall through */ }
  }
  if (doc.chunks) {
    try { return JSON.parse(doc.chunks); }
    catch { /* fall through */ }
  }
  if (doc.text_gz) {
    try { return chunkText(zlib.gunzipSync(doc.text_gz).toString('utf8')); }
    catch { /* fall through */ }
  }
  return chunkText(doc.text_content || '');
}

// userId param removed — all users share the same knowledge base (admin-managed)
export async function retrieveForTopic(topicLabel, { rotate = false, maxChars = 8000 } = {}) {
  const docs = await all('SELECT id, filename, chunks, text_content, chunks_gz, text_gz FROM pdfs');
  if (docs.length === 0) return { context: '', docsReferenced: [] };

  const keywords = await getKeywordsForTopic(topicLabel);
  const scored = [];

  for (const doc of docs) {
    const chunks = getChunksForDoc(doc);
    chunks.forEach((chunk, i) => {
      const score = scoreChunk(chunk, topicLabel, keywords);
      if (score > 0) scored.push({ docId: doc.id, filename: doc.filename, chunk, score, i });
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Retrieval rotation: sample from top 2x pool instead of always taking top-N
  // This ensures different passages surface on repeat calls for the same topic
  const needed = Math.ceil(maxChars / 1200);
  const pool = rotate ? scored.slice(0, needed * 2) : scored.slice(0, needed);
  const selected = rotate && pool.length > needed ? weightedSample(pool, needed) : pool;

  const docsUsed = new Map();
  let chars = 0;
  const final = [];
  for (const s of selected) {
    if (chars + s.chunk.length > maxChars) continue;
    final.push(s);
    docsUsed.set(s.docId, s.filename);
    chars += s.chunk.length;
  }

  // Fallback: nothing matched — sample evenly from all docs
  if (final.length === 0) {
    for (const doc of docs) {
      const chunks = getChunksForDoc(doc);
      const step = Math.max(1, Math.floor(chunks.length / 3));
      for (let i = 0; i < chunks.length && chars < maxChars; i += step) {
        final.push({ docId: doc.id, filename: doc.filename, chunk: chunks[i] });
        docsUsed.set(doc.id, doc.filename);
        chars += chunks[i].length;
      }
    }
  }

  const context = final.map(s => `[Source: ${s.filename}]\n${s.chunk}`).join('\n\n');
  const docsReferenced = [...docsUsed.entries()].map(([id, filename]) => ({ id, filename }));
  return { context, docsReferenced };
}
