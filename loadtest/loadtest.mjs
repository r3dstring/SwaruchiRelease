#!/usr/bin/env node
/**
 * Swaruchi Custom Quiz load test
 * -----------------------------------------------------------------------
 * Simulates N participants joining a live Custom Quiz session and submitting
 * answers, exactly as real phones would: POST /public/join then
 * POST /public/submit. No login, no AI calls (questions are pre-generated at
 * session creation), so this measures YOUR SERVER AND DATABASE under load,
 * not AI rate limits.
 *
 * USAGE
 *   node loadtest.mjs --url <backend-url> --code <JOIN_CODE> [options]
 *
 * OPTIONS
 *   --url        Backend base URL, e.g. https://your-api.onrender.com
 *   --code       The 6-character join code from an OPEN Custom Quiz session
 *   --users      How many participants to simulate      (default 200)
 *   --concurrency How many run simultaneously           (default 50)
 *   --rampup     Seconds to spread joins over           (default 0 = all at once)
 *   --think      Seconds each participant "spends" answering before submitting
 *                (default 3). Real users take 30-120s; a low value here is a
 *                DELIBERATELY harsher test that compresses everyone's submit
 *                into a narrow window.
 *   --joinonly   Only test joining, skip submissions
 *
 * EXAMPLES
 *   # Realistic: 200 people arriving over 60s, answering for ~45s
 *   node loadtest.mjs --url https://api.example.com --code AB12CD \
 *        --users 200 --concurrency 50 --rampup 60 --think 45
 *
 *   # Harsh: 500 people hitting it simultaneously
 *   node loadtest.mjs --url https://api.example.com --code AB12CD \
 *        --users 500 --concurrency 500 --rampup 0 --think 1
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) return true; // boolean flag
  return next;
}

const BASE = (arg('url', '') || '').replace(/\/$/, '');
const CODE = arg('code', '');
const USERS = parseInt(arg('users', '200'), 10);
const CONCURRENCY = parseInt(arg('concurrency', '50'), 10);
const RAMPUP_S = parseFloat(arg('rampup', '0'));
const THINK_S = parseFloat(arg('think', '3'));
const JOIN_ONLY = arg('joinonly', false) === true;

if (!BASE || !CODE) {
  console.error('ERROR: --url and --code are both required.\n');
  console.error('Example:');
  console.error('  node loadtest.mjs --url https://your-api.onrender.com --code AB12CD --users 200\n');
  process.exit(1);
}

const API = `${BASE}/api/sessions`;
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Results collection
// ---------------------------------------------------------------------------
const results = {
  join: { ok: 0, fail: 0, latencies: [], errors: new Map() },
  submit: { ok: 0, fail: 0, latencies: [], errors: new Map() },
};

function recordError(phase, message) {
  const key = String(message).slice(0, 120);
  results[phase].errors.set(key, (results[phase].errors.get(key) || 0) + 1);
}

async function timedFetch(url, options) {
  const start = Date.now();
  try {
    const r = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const elapsed = Date.now() - start;
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
    return { ok: r.ok, status: r.status, body, elapsed };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e.name === 'TimeoutError' ? 'client timeout (30s)' : e.message }, elapsed: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// One simulated participant
// ---------------------------------------------------------------------------
async function runParticipant(index) {
  // Unique employee ID per participant — the backend enforces uniqueness per
  // session, so reusing IDs would produce false "already completed" errors
  // that look like failures but aren't.
  const stamp = Date.now().toString(36);
  const employeeId = `LT${stamp}${index}`;

  const join = await timedFetch(`${API}/public/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      join_code: CODE,
      name: `Load Test User ${index}`,
      employee_id: employeeId,
      grade: `E${(index % 5) + 1}`,
    }),
  });

  results.join.latencies.push(join.elapsed);
  if (!join.ok || !join.body?.participant_id) {
    results.join.fail++;
    recordError('join', join.body?.error || `HTTP ${join.status}`);
    return;
  }
  results.join.ok++;

  if (JOIN_ONLY) return;

  // Simulate the participant reading and answering.
  if (THINK_S > 0) {
    // Jitter so submissions don't land in one artificial spike unless think=0
    const jitter = THINK_S * 1000 * (0.7 + Math.random() * 0.6);
    await new Promise(r => setTimeout(r, jitter));
  }

  const questionCount = (join.body.questions || []).length;
  const answers = Array.from({ length: questionCount }, () => {
    const opts = ['a', 'b', 'c', 'd'];
    return opts[Math.floor(Math.random() * opts.length)];
  });

  const submit = await timedFetch(`${API}/public/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participant_id: join.body.participant_id, answers }),
  });

  results.submit.latencies.push(submit.elapsed);
  if (!submit.ok) {
    results.submit.fail++;
    recordError('submit', submit.body?.error || `HTTP ${submit.status}`);
    return;
  }
  results.submit.ok++;
}

// ---------------------------------------------------------------------------
// Concurrency control
// ---------------------------------------------------------------------------
async function runPool(total, concurrency, rampupMs) {
  let launched = 0;
  let completed = 0;
  const perLaunchDelay = rampupMs > 0 ? rampupMs / total : 0;

  async function worker() {
    while (true) {
      const myIndex = launched++;
      if (myIndex >= total) return;
      if (perLaunchDelay > 0) await new Promise(r => setTimeout(r, perLaunchDelay * Math.random() * concurrency));
      await runParticipant(myIndex);
      completed++;
      if (completed % Math.max(1, Math.floor(total / 10)) === 0) {
        process.stdout.write(`  ...${completed}/${total} participants finished\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function report(phase, label) {
  const r = results[phase];
  const sorted = [...r.latencies].sort((a, b) => a - b);
  const total = r.ok + r.fail;
  if (total === 0) return;

  console.log(`\n${label}`);
  console.log(`  succeeded      ${r.ok}/${total}  (${((r.ok / total) * 100).toFixed(1)}%)`);
  if (r.fail > 0) console.log(`  FAILED         ${r.fail}`);
  console.log(`  median         ${percentile(sorted, 50)}ms`);
  console.log(`  p95            ${percentile(sorted, 95)}ms`);
  console.log(`  p99            ${percentile(sorted, 99)}ms`);
  console.log(`  slowest        ${sorted[sorted.length - 1]}ms`);

  if (r.errors.size > 0) {
    console.log(`  error breakdown:`);
    [...r.errors.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([msg, count]) => console.log(`    ${count}x  ${msg}`));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('Swaruchi Custom Quiz load test');
console.log('='.repeat(60));
console.log(`  target        ${BASE}`);
console.log(`  join code     ${CODE}`);
console.log(`  participants  ${USERS}`);
console.log(`  concurrency   ${CONCURRENCY}`);
console.log(`  ramp-up       ${RAMPUP_S}s`);
console.log(`  think time    ${THINK_S}s${THINK_S < 10 ? '  (aggressive — real users take 30-120s)' : ''}`);
console.log(`  mode          ${JOIN_ONLY ? 'join only' : 'join + submit'}`);
console.log('='.repeat(60));

// Verify the session exists and is open BEFORE hammering it, so a typo'd code
// doesn't produce 500 identical failures that look like a server problem.
const preflight = await timedFetch(`${API}/public/lookup/${CODE}`, { method: 'GET' });
if (!preflight.ok) {
  console.error(`\nPreflight failed: ${preflight.body?.error || `HTTP ${preflight.status}`}`);
  console.error('Check that the join code is correct and the session is still OPEN.\n');
  process.exit(1);
}
console.log(`\nPreflight OK — session "${preflight.body.session_name}" is open (${preflight.body.count} questions)\n`);
console.log('Running...\n');

const startedAt = Date.now();
await runPool(USERS, CONCURRENCY, RAMPUP_S * 1000);
const wallSeconds = (Date.now() - startedAt) / 1000;

console.log('\n' + '='.repeat(60));
console.log('RESULTS');
console.log('='.repeat(60));
report('join', 'JOIN  (POST /public/join)');
if (!JOIN_ONLY) report('submit', 'SUBMIT  (POST /public/submit)');

console.log(`\nTotal wall time  ${wallSeconds.toFixed(1)}s`);
const totalReqs = results.join.ok + results.join.fail + results.submit.ok + results.submit.fail;
console.log(`Total requests   ${totalReqs}  (~${(totalReqs / wallSeconds).toFixed(1)}/sec)`);

const allFailures = results.join.fail + results.submit.fail;
console.log('');
if (allFailures === 0) {
  console.log(`PASS — all ${USERS} participants completed with no failures.`);
} else {
  console.log(`${allFailures} request(s) failed. See the error breakdown above.`);
  console.log('Common causes:');
  console.log('  "already completed"  -> re-running against the same session; create a fresh one');
  console.log('  HTTP 502/503         -> server was overwhelmed or restarted');
  console.log('  client timeout       -> requests queued longer than 30s');
}
console.log('');
