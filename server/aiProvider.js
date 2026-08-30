// Shared AI provider abstraction — used by both the adaptive per-user quiz
// engine (routes/quiz.js) and the document-scoped custom quiz sessions
// (routes/sessions.js). Keeping this in one place means a fix like the Groq
// model rename only has to happen once.

export function getAllProviders() {
  const providers = [];
  if (process.env.CEREBRAS_API_KEY) providers.push({ name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, type: 'cerebras' });
  if (process.env.OPENROUTER_API_KEY) providers.push({ name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, type: 'openrouter' });
  if (process.env.GEMINI_API_KEY) {
    const k = process.env.GEMINI_API_KEY;
    providers.push(k.startsWith('gsk_') ? { name: 'Groq', key: k, type: 'groq' } : { name: 'Gemini', key: k, type: 'gemini' });
  }
  if (process.env.ANTHROPIC_API_KEY) providers.push({ name: 'Anthropic', key: process.env.ANTHROPIC_API_KEY, type: 'anthropic' });
  return providers;
}

export async function callLLM(prompt, provider) {
  if (provider.type === 'cerebras') {
    const r = await fetch('https://api.cerebras.ai/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${provider.key}`}, body: JSON.stringify({ model:'llama-3.3-70b', messages:[{role:'user',content:prompt}], temperature:0.7, max_tokens:3000 }) });
    if (!r.ok) { console.error(`Cerebras error (${r.status}):`, await r.text()); return null; }
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  if (provider.type === 'groq') {
    // llama-3.3-70b-versatile was deprecated by Groq (shut down Aug 16, 2026).
    // openai/gpt-oss-120b is Groq's official recommended replacement, and also
    // carries a higher free-tier daily token allowance.
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${provider.key}`}, body: JSON.stringify({ model:'openai/gpt-oss-120b', messages:[{role:'user',content:prompt}], temperature:0.7, max_tokens:3000 }) });
    if (!r.ok) { console.error(`Groq error (${r.status}):`, await r.text()); return null; }
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
        'HTTP-Referer': 'https://quizforge.app',
        'X-Title': 'QuizForge',
      },
      body: JSON.stringify({ model: 'openrouter/free', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 3000 }),
    });
    if (!r.ok) { console.error(`OpenRouter error (${r.status}):`, await r.text()); return null; }
    return (await r.json()).choices?.[0]?.message?.content || '';
  }
  if (provider.type === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${provider.key}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.7,maxOutputTokens:3000} }) });
    if (!r.ok) { console.error(`Gemini error (${r.status}):`, await r.text()); return null; }
    return (await r.json()).candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  if (provider.type === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'Content-Type':'application/json','x-api-key':provider.key,'anthropic-version':'2023-06-01'}, body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:3000, messages:[{role:'user',content:prompt}] }) });
    if (!r.ok) { console.error(`Anthropic error (${r.status}):`, await r.text()); return null; }
    return (await r.json()).content?.[0]?.text || '';
  }
  return null;
}

// Tries every configured provider in order until one returns a usable JSON
// array. Returns null only if every provider fails — callers decide their own
// mock-question fallback.
export async function generateWithFailover(prompt, { count } = {}) {
  const providers = getAllProviders();
  for (const provider of providers) {
    try {
      const responseText = await callLLM(prompt, provider);
      if (!responseText) { console.log(`[${provider.name}] no response, trying next provider...`); continue; }
      const match = responseText.match(/\[[\s\S]*\]/);
      if (!match) { console.log(`[${provider.name}] no JSON array in response, trying next provider...`); continue; }
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) continue;
      console.log(`[${provider.name}] generated ${parsed.length} items`);
      return parsed;
    } catch (e) {
      console.error(`[${provider.name}] threw an error, trying next provider:`, e.message);
    }
  }
  console.log('All configured AI providers failed');
  return null;
}
