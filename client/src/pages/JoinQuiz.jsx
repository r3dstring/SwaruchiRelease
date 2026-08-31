import { useState, useEffect } from 'react';
import { Target, ClipboardEdit, AlertCircle, CheckCircle2, ClipboardList } from 'lucide-react';
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
        <div className="w-14 h-14 rounded-2xl bg-sky/10 flex items-center justify-center mx-auto mb-4"><Target size={26} className="text-sky" /></div>
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
        <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mx-auto mb-3"><ClipboardEdit size={22} className="text-purple-600" /></div>
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
  const [answers, setAnswers] = useState({}); // canonical answer store, keyed by question index — persists across navigation
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const q = questions[current];
  const total = questions.length;
  const answeredCount = Object.keys(answers).filter(i => answers[i]).length;

  const setAnswerForCurrent = (value) => setAnswers(prev => ({ ...prev, [current]: value }));

  const goTo = (index) => setCurrent(Math.max(0, Math.min(total - 1, index)));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const answerArray = questions.map((_, i) => answers[i] || '');
      const result = await api.submitSession({ participant_id: participantId, answers: answerArray });
      onFinish(result);
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  if (error) return <div className="min-h-screen flex flex-col items-center justify-center px-4"><AlertCircle className="w-10 h-10 text-coral mb-3" /><p className="font-semibold text-gray-800 mb-2">Something went wrong</p><p className="text-sm text-gray-400">{error}</p></div>;

  const currentAnswer = answers[current];

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-sm font-semibold text-gray-600 shrink-0 truncate max-w-[40%]">{sessionName}</p>
          <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden"><div className="bg-lime-500 h-full rounded-full transition-all duration-500" style={{ width: `${(answeredCount/total)*100}%` }} /></div>
          <span className="text-sm font-semibold text-gray-500 shrink-0">{answeredCount}/{total} answered</span>
        </div>

        {/* Question navigator — jump to any question, see which are answered */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {questions.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                i === current ? 'bg-gray-900 text-white' : answers[i] ? 'bg-lime-100 text-lime-700' : 'bg-white border border-gray-200 text-gray-400'
              }`}>
              {i + 1}
            </button>
          ))}
        </div>

        <div className="card">
          <p className="text-xs font-semibold text-gray-400 mb-2">Question {current + 1} of {total}</p>
          <h2 className="font-display font-700 text-xl text-gray-900 mb-6">{q.question}</h2>

          {q.type === 'fitb' ? (
            <input type="text" value={currentAnswer || ''} onChange={e => setAnswerForCurrent(e.target.value)} placeholder="Type your answer..." className="input-field text-lg py-4 text-center font-semibold mb-6" autoFocus />
          ) : (
            <div className="space-y-2.5 mb-6">
              {(q.options || []).map((opt, i) => {
                const letter = String.fromCharCode(97 + i);
                const value = q.type === 'tf' ? opt.toLowerCase() : letter;
                const isSel = currentAnswer === value;
                return (
                  <button key={i} onClick={() => setAnswerForCurrent(value)} className={`w-full text-left px-4 py-3.5 rounded-xl border-2 font-medium transition-colors ${isSel ? 'border-sky bg-sky/5' : 'border-gray-200 hover:border-gray-300'}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => goTo(current - 1)} disabled={current === 0} className="btn-secondary px-4 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
            {current + 1 < total ? (
              <button onClick={() => goTo(current + 1)} className="btn-primary flex-1">Next</button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1">{submitting ? 'Submitting...' : 'Submit Quiz'}</button>
            )}
          </div>
        </div>

        {answeredCount < total && (
          <p className="text-center text-xs text-gray-400 mt-4">{total - answeredCount} question{total-answeredCount!==1?'s':''} still unanswered — you can submit anyway or go back and complete them.</p>
        )}
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
        <div className="w-14 h-14 rounded-2xl bg-lime-50 flex items-center justify-center mx-auto mb-4">
          {pct >= 70 ? <CheckCircle2 size={26} className="text-lime-600" /> : <ClipboardList size={26} className="text-gray-500" />}
        </div>
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
