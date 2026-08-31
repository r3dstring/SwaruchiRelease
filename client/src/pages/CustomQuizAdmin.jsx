import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Target, Copy, Check, Printer, ArrowLeft, Clock, ShieldOff, Trash2, QrCode, Plus, ClipboardList, Ban } from 'lucide-react';
import { api } from '../api';
import { useIsAdmin } from '../context/AuthContext';
import SessionReport from '../components/SessionReport';

function CreateSessionForm({ pdfs, onCreated, onCancel }) {
  const [form, setForm] = useState({ session_name: '', pdf_id: pdfs[0]?.id || '', count: 10, difficulty: 'medium' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.session_name.trim() || !form.pdf_id) return;
    setError(''); setLoading(true);
    try { onCreated(await api.createSession(form)); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="card mb-6">
      <h3 className="font-display font-700 text-lg text-gray-900 mb-4">New Custom Quiz</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" placeholder="Quiz name (e.g. Boiler Safety Assessment - Aug 2026)" className="input-field" value={form.session_name} onChange={e => setForm({ ...form, session_name: e.target.value })} required autoFocus />

        <label className="block text-sm font-semibold text-gray-600 mt-2">Document</label>
        <select className="input-field" value={form.pdf_id} onChange={e => setForm({ ...form, pdf_id: e.target.value })} required>
          {pdfs.length === 0 && <option value="">No documents uploaded yet</option>}
          {pdfs.map(p => <option key={p.id} value={p.id}>{p.filename}</option>)}
        </select>

        <label className="block text-sm font-semibold text-gray-600 mb-1 mt-2">Questions</label>
        <div className="flex gap-2">
          {[5, 10, 15, 20].map(n => (
            <button key={n} type="button" onClick={() => setForm({ ...form, count: n })} className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${form.count === n ? 'bg-lime-500 text-white' : 'bg-gray-100 text-gray-500'}`}>{n}</button>
          ))}
        </div>

        <label className="block text-sm font-semibold text-gray-600 mb-1 mt-2">Difficulty</label>
        <div className="flex gap-2">
          {['easy', 'medium', 'hard'].map(d => (
            <button key={d} type="button" onClick={() => setForm({ ...form, difficulty: d })} className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${form.difficulty === d ? 'bg-sky text-white' : 'bg-gray-100 text-gray-500'}`}>{d}</button>
          ))}
        </div>

        {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-lg">{error}</div>}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button type="submit" disabled={loading || pdfs.length === 0} className="btn-primary flex-1 text-sm">{loading ? 'Generating quiz...' : 'Create Quiz'}</button>
        </div>
      </form>
    </div>
  );
}

function ShareModal({ session, onClose }) {
  const shareLink = `${window.location.origin}/?join=true&code=${session.join_code}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-medium text-gray-500 mb-1">Quiz is live</p>
        <p className="font-display font-700 text-gray-900 mb-4">{session.session_name}</p>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex justify-center">
          <QRCodeSVG value={shareLink} size={180} level="M" />
        </div>
        <p className="text-xs text-gray-400 mb-4">Scan to join instantly</p>

        <div className="bg-gray-50 rounded-lg py-4 mb-4">
          <p className="text-3xl font-display font-800 tracking-[0.25em] text-gray-800">{session.join_code}</p>
        </div>

        <div className="flex gap-2">
          <button onClick={copy} className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1.5">
            {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy Link</>}
          </button>
          <button onClick={onClose} className="btn-primary flex-1 text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}

function Scoreboard({ sessionId, onBack }) {
  const [session, setSession] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.getSession(sessionId).then(setSession).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [sessionId]);

  if (!session) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Loading...</div>;

  const handleToggleStatus = async () => {
    setBusy(true);
    try { await api.updateSessionStatus(sessionId, session.status === 'open' ? 'closed' : 'open'); await load(); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${session.session_name}" and all its results? This cannot be undone.`)) return;
    await api.deleteSession(sessionId);
    onBack();
  };

  const completed = session.participants.filter(p => p.completed_at);

  if (showReport) {
    return (
      <div>
        <div className="no-print max-w-3xl mx-auto px-4 pt-6 flex gap-2">
          <button onClick={() => setShowReport(false)} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5"><ArrowLeft size={15} /> Back to Scoreboard</button>
          <button onClick={() => window.print()} className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5"><Printer size={15} /> Print / Save as PDF</button>
        </div>
        <SessionReport session={session} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {showShare && <ShareModal session={session} onClose={() => setShowShare(false)} />}

      <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 font-medium mb-4 flex items-center gap-1.5"><ArrowLeft size={15} /> All Quizzes</button>

      <div className="card mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h1 className="font-display font-700 text-xl text-gray-900">{session.session_name}</h1>
            <p className="text-sm text-gray-500">{session.pdf_filename} · {session.count} questions · {session.difficulty}</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-md shrink-0 ${session.status === 'open' ? 'bg-lime-50 text-lime-700' : 'bg-gray-100 text-gray-500'}`}>{session.status}</span>
        </div>
        <button onClick={() => setShowShare(true)} className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors rounded-lg px-4 py-2.5 mb-4 w-full">
          <QrCode size={16} className="text-gray-500" />
          <span className="text-xs text-gray-500">Join code:</span>
          <span className="font-display font-700 tracking-widest text-gray-800">{session.join_code}</span>
          <span className="text-xs text-sky ml-auto font-medium">Show QR & Link</span>
        </button>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleToggleStatus} disabled={busy} className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5">
            {session.status === 'open' ? <><ShieldOff size={15} /> Close Quiz</> : <>Reopen Quiz</>}
          </button>
          <button onClick={() => setShowReport(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5"><ClipboardList size={15} /> View Report</button>
          <button onClick={handleDelete} className="text-coral text-sm font-semibold px-4 py-2 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"><Trash2 size={15} /> Delete</button>
        </div>
      </div>

      <h2 className="font-display font-700 text-lg text-gray-900 mb-3">Scoreboard ({completed.length} completed)</h2>
      {session.participants.length === 0 ? (
        <div className="card text-center py-10">
          <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-400 font-medium text-sm">Waiting for participants to join...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {session.participants.map((p, i) => {
            const pct = p.total ? Math.round((p.score / p.total) * 100) : null;
            return (
              <div key={p.id} className="card py-3 px-4 flex items-center gap-4">
                <span className="font-display font-700 text-gray-300 w-6 text-center shrink-0">{p.completed_at ? i + 1 : '—'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.employee_id} · Grade {p.grade}</p>
                </div>
                {pct !== null ? (
                  <span className={`font-display font-700 text-lg shrink-0 ${pct >= 70 ? 'text-lime-600' : pct >= 40 ? 'text-amber-600' : 'text-coral'}`}>{pct}%</span>
                ) : (
                  <span className="text-xs text-gray-400 font-medium shrink-0">In progress...</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CustomQuizAdmin() {
  const isAdmin = useIsAdmin();
  const [sessions, setSessions] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newSession, setNewSession] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);

  const loadSessions = () => api.listSessions().then(setSessions).catch(() => {});
  useEffect(() => { loadSessions(); api.listPdfs().then(setPdfs).catch(() => {}); }, []);

  if (!isAdmin) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><Ban className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="font-semibold text-gray-700">Admin access required</p></div>;

  if (activeSessionId) return <Scoreboard sessionId={activeSessionId} onBack={() => { setActiveSessionId(null); loadSessions(); }} />;

  const handleCreated = (session) => { setShowCreate(false); setNewSession(session); loadSessions(); };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {newSession && <ShareModal session={newSession} onClose={() => setNewSession(null)} />}

      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-lg bg-sky/10 flex items-center justify-center"><Target size={17} className="text-sky" /></div>
          <h1 className="font-display font-800 text-2xl text-gray-900">Custom Quiz</h1>
        </div>
        <p className="text-sm text-gray-500">One document, one join code, one scoreboard — for live training sessions</p>
      </div>

      {showCreate ? (
        <CreateSessionForm pdfs={pdfs} onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
      ) : (
        <button onClick={() => setShowCreate(true)} disabled={pdfs.length === 0} className="w-full btn-primary mb-6 disabled:opacity-50 flex items-center justify-center gap-2">
          <Plus size={17} /> {pdfs.length === 0 ? 'Upload a document first' : 'Create New Quiz'}
        </button>
      )}

      <h2 className="font-display font-700 text-lg text-gray-900 mb-3">Your Quizzes</h2>
      {sessions.length === 0 ? (
        <div className="card text-center py-10"><ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 font-medium text-sm">No custom quizzes yet</p></div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <button key={s.id} onClick={() => setActiveSessionId(s.id)} className="w-full card flex items-center justify-between py-4 text-left hover:border-lime-300 transition-colors">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">{s.session_name}</p>
                <p className="text-xs text-gray-500">{s.pdf_filename} · code {s.join_code} · {new Date(s.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-sm font-semibold text-gray-700">{s.completed_count}/{s.participant_count}</p>
                <span className={`text-xs font-semibold ${s.status === 'open' ? 'text-lime-600' : 'text-gray-400'}`}>{s.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
