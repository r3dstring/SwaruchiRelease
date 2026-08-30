import { useState, useEffect } from 'react';
import { api } from '../api';

// ── Step 1: enter the join code ───────────────────────────────
function CodeEntry({ onFound, prefillCode }) {
  const [code, setCode] = useState(prefillCode || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (c) => {
    if (!c.trim()) return;
    setError(''); setLoading(true);
    try {
      const session = await api.lookupSessionCode(c.trim());
      onFound(session, c.trim().toUpperCase());
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  // If the admin shared a link with the code baked in, skip straight to lookup
  useEffect(() => { if (prefillCode) lookup(prefillCode); }, []);

  const handleSubmit = (e) => { e.preventDefault(); lookup(code); };

  return (
    <div className="min-h-screen bg-gradient-to-b from-owl-50 to-white flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🎯</div>
        <h1 className="font-display font-900 text-3xl md:text-4xl text-gray-800 mb-2">Join a Quiz</h1>
        <p className="text-gray-500">Enter the code your trainer gave you</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD12"
          maxLength={6}
          autoFocus
          className="input-field text-center text-2xl font-display font-800 tracking-[0.3em] py-4 uppercase"
        />
        {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-xl text-center">{error}</div>}
        <button type="submit" disabled={loading || !code.trim()} className="btn-primary w-full text-base">
          {loading ? 'Checking...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

// ── Step 2: collect Name / Employee ID / Grade ────────────────
function ParticipantDetails({ session, code, onJoined }) {
  const [form, setForm] = useState({ name: '', employee_id: '', grade: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const result = await api.joinSession({ join_code: code, ...form });
      onJoined(result);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-owl-50 to-white flex flex-col items-center justify-center px-4">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">📝</div>
        <h1 className="font-display font-800 text-2xl text-gray-800 mb-1">{session.session_name}</h1>
        <p className="text-gray-500 text-sm">{session.count} questions · {session.difficulty} difficulty</p>
      </div>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <input type="text" placeholder="Full Name" className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
        <input type="text" placeholder="Employee ID" className="input-field" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} required />
        <input type="text" placeholder="Grade" className="input-field" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} required />
        {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-xl">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full text-base">{loading ? 'Starting...' : 'Start Quiz'}</button>
      </form>
    </div>
  );
}

// ── Step 3: take the quiz (simplified, no gamification) ───────
function TakeQuiz({ sessionName, participantId, questions, onFinish }) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [fitbInput, setFitbInput] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const q = questions[current];
  const total = questions.length;
  const progress = Math.round((current / total) * 100);

  const handleNext = async () => {
    const value = q.type === 'fitb' ? fitbInput.trim() : selected;
    const updated = { ...answers, [current]: value };
    setAnswers(updated);

    if (current + 1 >= total) {
      setSubmitting(true);
      try {
        const answerArray = questions.map((_, i) => updated[i] || '');
        const result = await api.submitSession({ participant_id: participantId, answers: answerArray });
        onFinish(result);
      } catch (err) { setError(err.message); } finally { setSubmitting(false); }
      return;
    }
    setCurrent(c => c + 1); setSelected(null); setFitbInput('');
  };

  if (error) return <div className="min-h-screen flex flex-col items-center justify-center px-4"><p className="text-5xl mb-4">😵</p><p className="font-bold text-gray-700 mb-2">Something went wrong</p><p className="text-sm text-gray-400">{error}</p></div>;

  const canProceed = q.type === 'fitb' ? fitbInput.trim() : selected !== null;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <p className="text-sm font-bold text-gray-500 shrink-0">{sessionName}</p>
          <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden"><div className="bg-lime-400 h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }} /></div>
          <span className="text-sm font-bold text-gray-500 shrink-0">{current + 1}/{total}</span>
        </div>

        <div className="card">
          <h2 className="font-display font-800 text-xl text-gray-800 mb-6">{q.question}</h2>

          {q.type === 'fitb' ? (
            <input type="text" value={fitbInput} onChange={e => setFitbInput(e.target.value)} placeholder="Type your answer..." className="input-field text-lg py-4 text-center font-semibold mb-6" autoFocus onKeyDown={e => e.key === 'Enter' && canProceed && handleNext()} />
          ) : (
            <div className="space-y-3 mb-6">
              {(q.options || []).map((opt, i) => {
                const letter = String.fromCharCode(97 + i);
                const value = q.type === 'tf' ? opt.toLowerCase() : letter;
                const isSel = selected === value;
                return (
                  <button key={i} onClick={() => setSelected(value)} className={`w-full text-left px-5 py-3.5 rounded-xl border-2 font-medium transition-all ${isSel ? 'border-sky bg-sky/5' : 'border-gray-200 hover:border-gray-300'}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          <button onClick={handleNext} disabled={!canProceed || submitting} className="btn-primary w-full text-base">
            {submitting ? 'Submitting...' : current + 1 >= total ? 'Submit Quiz' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: simple result screen (no gamification, this is a formal assessment) ─
function ResultScreen({ result, sessionName }) {
  const pct = Math.round((result.score / result.total) * 100);
  return (
    <div className="min-h-screen bg-gradient-to-b from-owl-50 to-white flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="text-6xl mb-4">{pct >= 70 ? '✅' : '📋'}</div>
        <h1 className="font-display font-900 text-2xl text-gray-800 mb-1">Quiz Submitted</h1>
        <p className="text-gray-500 mb-6">{sessionName}</p>
        <div className="card inline-block px-10 py-6">
          <p className="font-display font-900 text-4xl text-gray-800">{result.score}<span className="text-gray-300">/{result.total}</span></p>
          <p className="text-sm text-gray-400 font-semibold mt-1">{pct}% Score</p>
        </div>
        <p className="text-sm text-gray-400 mt-6">Your result has been recorded. You may close this page.</p>
      </div>
    </div>
  );
}

// ── Orchestrator ───────────────────────────────────────────────
export default function JoinQuiz() {
  const [step, setStep] = useState('code'); // code -> details -> quiz -> done
  const [session, setSession] = useState(null);
  const [code, setCode] = useState('');
  const [participantId, setParticipantId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [result, setResult] = useState(null);

  if (step === 'code') return <CodeEntry onFound={(s, c) => { setSession(s); setCode(c); setStep('details'); }} />;
  if (step === 'details') return <ParticipantDetails session={session} code={code} onJoined={(r) => { setParticipantId(r.participant_id); setQuestions(r.questions); setStep('quiz'); }} />;
  if (step === 'quiz') return <TakeQuiz sessionName={session.session_name} participantId={participantId} questions={questions} onFinish={(r) => { setResult(r); setStep('done'); }} />;
  if (step === 'done') return <ResultScreen result={result} sessionName={session.session_name} />;
  return null;
}
