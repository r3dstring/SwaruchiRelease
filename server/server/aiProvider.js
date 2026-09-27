// Shared AI provider abstraction — used by both the adaptive per-user quiz
// engine (routes/quiz.js) and the document-scoped custom quiz sessions
// (routes/sessions.js). Keeping this in one place means a fix like the Groq
// model rename only has to happen once.

// Groq enforces rate limits PER MODEL, not per account — so one Groq key can
// yield several independent free quotas just by trying different models.
// This directly addresses concurrent users exhausting a single shared quota:
// when qwen3.8-27b's 30 req/min is used up, gpt-oss-20b's separate 30 req/min
// is still untouched. Each entry below is tried in order as its own failover
// step, reusing the existing generateWithFailover loop with no changes there.
// Ordered by REAL observed output-token headroom, not the dashboard's general
// TPM column. Live error logs showed qwen/qwen3.8-27b enforces a separate,
// much stricter "output tokens per minute" (OTPM) sub-limit of just 1000 -
// invisible in the RPM/TPM table - so it was failing almost every request
// with more than a handful of questions. gpt-oss-120b/20b confirmed the full
// 8000 TPM from the table; allam-2-7b confirmed 6000. qwen is kept as a last
// resort (still useful for small requests) rather than removed entirely.
const GROQ_MODEL_CASCADE = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'allam-2-7b',
  'qwen/qwen3.8-27b',
];

export function getAllProviders() {
  const providers = [];

  // Groq key resolution, backward-compatible with the original single-slot
  // setup so existing Render deployments keep working with zero required
  // changes:
  //   1. GROQ_API_KEY, if set, is used directly (the upgrade path).
  //   2. Otherwise, if GEMINI_API_KEY looks like a Groq key (starts with
  //      "gsk_"), it's used as Groq — this is exactly the original behavior,
  //      preserved so nothing breaks if Render env vars aren't touched.
  const groqKey = process.env.GROQ_API_KEY
    || (process.env.GEMINI_API_KEY?.startsWith('gsk_') ? process.env.GEMINI_API_KEY : null);

  if (groqKey) {
    for (const model of GROQ_MODEL_CASCADE) {
      providers.push({ name: `Groq (${model})`, key: groqKey, type: 'groq', model });
    }
  }

  // GEMINI_API_KEY is used for Gemini only when it does NOT look like a Groq
  // key — this is unchanged from before, so a genuine Gemini key in this slot
  // still works exactly as it always did.
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('gsk_')) {
    providers.push({ name: 'Gemini', key: process.env.GEMINI_API_KEY, type: 'gemini' });
  }

  if (process.env.MISTRAL_API_KEY) providers.push({ name: 'Mistral', key: process.env.MISTRAL_API_KEY, type: 'mistral' });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, type: 'openrouter' });
  if (process.env.ANTHROPIC_API_KEY) providers.push({ name: 'Anthropic', key: process.env.ANTHROPIC_API_KEY, type: 'anthropic' });

  // Cerebras's no-card free tier is gone (now a paid $5 trial) — kept as an
  // absolute last resort in case a paid key is ever added, but no longer
  // tried early where it would waste a round-trip on every single generation
  // for accounts that still have this env var set from before.
  if (process.env.CEREBRAS_API_KEY) providers.push({ name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, type: 'cerebras' });

  return providers;
}

// Live logs showed "Expected ',' or '}' after property value in JSON" on
// MULTIPLE providers (gpt-oss-20b, gpt-oss-120b, allam-2-7b, OpenRouter) -
// the exact signature of a response cut off mid-value before the JSON array
// closed. Root cause: max_tokens was a fixed 3000 regardless of how many
// questions were requested. A 20-question quiz with full explanations
// routinely needs more than that; a 5-question one doesn't need nearly as
// much. This scales the ceiling to the actual request, with a floor so small
// requests still get comfortable headroom and a cap so one call can't eat an
// entire model's per-minute token budget by itself.
function computeMaxTokens(count) {
  const n = count || 10;
  return Math.min(6000, Math.max(1200, n * 170 + 400));
}

// ---------------------------------------------------------------------------
// RATE-LIMIT COOLDOWN CACHE
// ---------------------------------------------------------------------------
// Live logs showed the same model failing with 429 repeatedly across several
// requests within the same short window — e.g. qwen hit 429 five times in a
// row within about 90 seconds, each attempt costing a real network round-trip
// before moving on. Groq's error body tells us exactly how long to wait
// ("Please try again in 41.76s"). Remembering that and skipping the model
// entirely until then costs 0ms instead of a wasted request, which is what
// actually makes repeated failures during a burst fast instead of slow.
// In-process only — resets on restart, which is fine, it's a short-lived cache.
const cooldowns = new Map();

function providerKey(provider) {
  return `${provider.type}:${provider.model || ''}`;
}

function isOnCooldown(provider) {
  const until = cooldowns.get(providerKey(provider));
  return until !== undefined && Date.now() < until;
}

function cooldownRemaining(provider) {
  const until = cooldowns.get(providerKey(provider)) || 0;
  return Math.max(0, until - Date.now());
}

// Parses "Please try again in 41.76s" / "...11.21s" / "...982.5ms" from Groq's
// error body. Falls back to a fixed short cooldown if the message doesn't
// match (other providers phrase 429s differently and don't give a hint).
const DEFAULT_COOLDOWN_MS = 12_000;

function setCooldownFromError(provider, errorText) {
  let ms = DEFAULT_COOLDOWN_MS;
  const match = errorText && errorText.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (match) {
    const value = parseFloat(match[1]);
    ms = match[2].toLowerCase() === 'ms' ? value : value * 1000;
    ms = Math.min(ms, 90_000); // sanity cap — never wait more than 90s on one model
  }
  cooldowns.set(providerKey(provider), Date.now() + ms);
}

// ---------------------------------------------------------------------------
// PER-REQUEST TIMEOUT
// ---------------------------------------------------------------------------
// Live logs showed a single OpenRouter call take ~15 seconds to respond, with
// nothing bounding that wait. With up to 5 sequential attempts before falling
// back to the question pool, one slow provider can single-handedly make the
// whole chain feel "extremely slow." Capping each attempt bounds the worst
// case to (providers x timeout) instead of being open-ended.
const REQUEST_TIMEOUT_MS = 8_000;

export async function callLLM(prompt, provider, count) {
  if (isOnCooldown(provider)) {
    console.log(`[${provider.name}] skipping — still on cooldown for another ${(cooldownRemaining(provider) / 1000).toFixed(1)}s`);
    return null;
  }

  const maxTokens = computeMaxTokens(count);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  try {
    return await callLLMInner(prompt, provider, maxTokens, signal);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.error(`[${provider.name}] timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      return null;
    }
    throw e;
  }
}

async function handleErrorResponse(provider, response, label) {
  const text = await response.text();
  console.error(`${label} error (${response.status}):`, text);
  if (response.status === 429) {
    setCooldownFromError(provider, text);
    console.log(`[${provider.name}] entering cooldown for ${(cooldownRemaining(provider) / 1000).toFixed(1)}s based on rate-limit response`);
  }
}

async function callLLMInner(prompt, provider, maxTokens, signal) {
  if (provider.type === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${provider.key}`}, body: JSON.stringify({ model: provider.model, messages:[{role:'user',content:prompt}], temperature:0.7, max_tokens: maxTokens }), signal });
    if (!r.ok) { await handleErrorResponse(provider, r, `Groq/${provider.model}`); return null; }
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  if (provider.type === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${provider.key}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.7,maxOutputTokens:maxTokens} }), signal });
    if (!r.ok) { await handleErrorResponse(provider, r, 'Gemini'); return null; }
    return (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  if (provider.type === 'mistral') {
    // "open-mistral-nemo" is on Mistral's free "Experiment" tier.
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${provider.key}`}, body: JSON.stringify({ model:'open-mistral-nemo', messages:[{role:'user',content:prompt}], temperature:0.7, max_tokens: maxTokens }), signal });
    if (!r.ok) { await handleErrorResponse(provider, r, 'Mistral'); return null; }
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  if (provider.type === 'openrouter') {
    // Model rotation on OpenRouter's free tier is frequent — "openrouter/free" is
    // their own auto-router that always resolves to whatever free model is
    // currently live, instead of hardcoding a specific model ID that can vanish.
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.key}`,
        'HTTP-Referer': 'https://swaruchi-app.pages.dev',
        'X-Title': 'Swaruchi (HRRL)',
      },
      body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: maxTokens }),
      signal,
    });
    if (!r.ok) { await handleErrorResponse(provider, r, 'OpenRouter'); return null; }
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  if (provider.type === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json','x-api-key':provider.key,'anthropic-version':'2023-06-01'}, body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens: maxTokens, messages:[{role:'user',content:prompt}] }), signal });
    if (!r.ok) { await handleErrorResponse(provider, r, 'Anthropic'); return null; }
    return (await r.json()).content?.[0]?.text || '';
  }
  if (provider.type === 'cerebras') {
    const r = await fetch('https://api.cerebras.ai/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${provider.key}`}, body: JSON.stringify({ model:'llama-3.3-70b', messages:[{role:'user',content:prompt}], temperature:0.7, max_tokens: maxTokens }), signal });
    if (!r.ok) { await handleErrorResponse(provider, r, 'Cerebras'); return null; }
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  return null;
}

// Tries every configured provider in order until one returns a usable JSON
// array. Returns null only if every provider fails — callers decide their own
// mock-question fallback.
// Previews raw model output in logs on failure. Without this, "no JSON array
// in response" gives no way to tell whether the model refused, returned
// empty content, wrapped the array in markdown fences, or something else
// entirely — exactly the gap that made an OpenRouter failure undiagnosable.
export function preview(text, max = 300) {
  if (!text) return '(empty)';
  const t = text.trim();
  if (!t) return '(whitespace only)';
  return t.length > max ? t.slice(0, max) + `... [${t.length} chars total]` : t;
}

// Extracts and validates a JSON array of question objects from a model's raw
// text output. Shared by generateWithFailover below AND routes/quiz.js's own
// provider loop, so a fix here applies everywhere instead of needing to be
// made twice (which is exactly how the max_tokens/model-order bugs in this
// file went unfixed in quiz.js's separate copy for as long as they did).
//
// The regex requires an object immediately inside the brackets (`[{...}]`),
// not just any two square brackets anywhere in the text. Live logs showed a
// weaker model emit stray bracket notation like "[objective]" as part of its
// prose, which the old bare `/\[[\s\S]*\]/` regex happily grabbed and then
// failed to parse as JSON.
export function extractQuestionArray(responseText, providerName) {
  if (!responseText) {
    console.log(`[${providerName}] no response, trying next provider...`);
    return null;
  }
  const match = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) {
    console.log(`[${providerName}] no JSON array in response, trying next provider... raw output: ${preview(responseText)}`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (parseErr) {
    console.log(`[${providerName}] found bracketed text but it wasn't valid JSON (${parseErr.message}), trying next provider... matched text: ${preview(match[0])}`);
    return null;
  }
  if (!Array.isArray(parsed)) {
    console.log(`[${providerName}] parsed JSON but it wasn't an array, trying next provider... got: ${preview(JSON.stringify(parsed))}`);
    return null;
  }
  return parsed;
}

export async function generateWithFailover(prompt, { count } = {}) {
  const providers = getAllProviders();
  for (const provider of providers) {
    try {
      const responseText = await callLLM(prompt, provider, count);
      const parsed = extractQuestionArray(responseText, provider.name);
      if (!parsed) continue;
      console.log(`[${provider.name}] generated ${parsed.length} items`);
      return parsed;
    } catch (e) {
      console.error(`[${provider.name}] threw an error, trying next provider:`, e.message);
    }
  }
  console.log('All configured AI providers failed');
  return null;
}
