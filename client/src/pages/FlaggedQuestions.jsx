import { useState, useEffect } from 'react';
import { api } from '../api';
import { useIsAdmin } from '../context/AuthContext';

const REASON_LABELS = {
  wrong_answer: '❌ Wrong answer',
  confusing: '😕 Confusing',
  not_relevant: '🎯 Not relevant',
  other: '📝 Other',
};

const STATUS_COLORS = {
  open: 'bg-coral/10 text-coral',
  reviewed: 'bg-lime-400/10 text-lime-600',
  dismissed: 'bg-gray-100 text-gray-400',
};

export default function FlaggedQuestions() {
  const isAdmin = useIsAdmin();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('open');
  const [updating, setUpdating] = useState(null);

  const load = (status) => api.adminFlags(status).then(setData).catch(()=>{});

  useEffect(() => { if (isAdmin) load(activeTab); }, [activeTab, isAdmin]);

  if (!isAdmin) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><p className="text-4xl mb-4">🚫</p><p className="font-bold text-gray-700">Admin access required</p></div>;

  const handleUpdate = async (id, status) => {
    setUpdating(id);
    try { await api.adminUpdateFlag(id, status); await load(activeTab); }
    catch(e) { console.error(e); } finally { setUpdating(null); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <span className="text-5xl">🚩</span>
        <h1 className="font-display font-900 text-2xl text-gray-800 mt-2">Flagged Questions</h1>
        <p className="text-sm text-gray-400 font-medium">User-reported question issues</p>
      </div>

      {/* Summary strip */}
      {data && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="card text-center py-4">
            <p className="font-display font-800 text-2xl text-coral">{data.openCount}</p>
            <p className="text-xs text-gray-400 font-semibold mt-1">Open Flags</p>
          </div>
          <div className="card py-4">
            <p className="text-xs font-bold text-gray-500 mb-2">Most Flagged Topics</p>
            {data.topicSummary?.length > 0
              ? data.topicSummary.map(t=>(
                <div key={t.topic} className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-600 truncate">{t.topic||'Unspecified'}</p>
                  <span className="text-xs font-bold text-coral ml-2">{t.count}</span>
                </div>
              ))
              : <p className="text-xs text-gray-300">None</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {['open','reviewed','dismissed'].map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold capitalize transition-all ${activeTab===tab?'bg-white text-gray-800 shadow-sm':'text-gray-500'}`}>{tab}</button>
        ))}
      </div>

      {/* Flags list */}
      {!data ? (
        <div className="card text-center py-8"><div className="flex gap-1 justify-center">{[0,1,2].map(i=><div key={i} className="w-2.5 h-2.5 bg-lime-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div></div>
      ) : data.flags.length === 0 ? (
        <div className="card text-center py-12"><p className="text-3xl mb-2">✅</p><p className="text-gray-400 font-medium">No {activeTab} flags</p></div>
      ) : (
        <div className="space-y-3">
          {data.flags.map(f=>(
            <div key={f.id} className="card">
              {/* Header row */}
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${STATUS_COLORS[f.status]}`}>{f.status}</span>
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-lg">{REASON_LABELS[f.reason]||f.reason}</span>
                    {f.topic && <span className="text-xs text-purple-600 font-semibold bg-grape/10 px-2 py-0.5 rounded-lg truncate">🎯 {f.topic}</span>}
                  </div>
                  <p className="text-xs text-gray-400">by <span className="font-semibold">{f.flagged_by}</span> · {new Date(f.flagged_at).toLocaleDateString()}</p>
                </div>
                {f.status==='open' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={()=>handleUpdate(f.id,'reviewed')} disabled={updating===f.id} className="text-xs bg-lime-400/10 text-lime-700 font-bold px-3 py-1.5 rounded-lg hover:bg-lime-400/20 transition-colors disabled:opacity-50">
                      {updating===f.id?'...':'✓ Reviewed'}
                    </button>
                    <button onClick={()=>handleUpdate(f.id,'dismissed')} disabled={updating===f.id} className="text-xs bg-gray-100 text-gray-500 font-bold px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {/* Question */}
              <div className="bg-gray-50 rounded-xl p-3 mb-2">
                <p className="text-sm font-semibold text-gray-700 mb-1">{f.question_text}</p>
                {f.correct_answer && <p className="text-xs text-gray-400">Correct answer: <span className="font-semibold text-gray-600">{f.correct_answer}</span></p>}
                {f.explanation && <p className="text-xs text-gray-400 mt-1 italic">"{f.explanation}"</p>}
              </div>

              {/* User comment */}
              {f.comment && <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><span className="font-bold">Comment:</span> {f.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
