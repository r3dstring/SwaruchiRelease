import { useState, useEffect } from 'react';
import { Flag, XCircle, Frown, Target, FileText, CheckCircle2, Ban, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useIsAdmin } from '../context/AuthContext';

const REASON_META = {
  wrong_answer: { Icon: XCircle, label: 'Wrong answer' },
  confusing: { Icon: Frown, label: 'Confusing' },
  not_relevant: { Icon: Target, label: 'Not relevant' },
  other: { Icon: FileText, label: 'Other' },
};

const STATUS_COLORS = {
  open: 'bg-red-50 text-coral',
  reviewed: 'bg-lime-50 text-lime-700',
  dismissed: 'bg-gray-100 text-gray-400',
};

export default function FlaggedQuestions() {
  const isAdmin = useIsAdmin();
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('open');
  const [updating, setUpdating] = useState(null);

  const load = (status) => api.adminFlags(status).then(setData).catch(()=>{});

  useEffect(() => { if (isAdmin) load(activeTab); }, [activeTab, isAdmin]);

  if (!isAdmin) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><Ban className="w-10 h-10 text-gray-300 mx-auto mb-3" /><p className="font-semibold text-gray-700">Admin access required</p></div>;

  const handleUpdate = async (id, status) => {
    setUpdating(id);
    try { await api.adminUpdateFlag(id, status); await load(activeTab); }
    catch(e) { console.error(e); } finally { setUpdating(null); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-3">
          <Flag size={22} className="text-coral" />
        </div>
        <h1 className="font-display font-800 text-2xl text-gray-900">Flagged Questions</h1>
        <p className="text-sm text-gray-500 font-medium">User-reported question issues</p>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="card text-center py-4">
            <p className="font-display font-700 text-2xl text-coral">{data.openCount}</p>
            <p className="text-xs text-gray-400 font-semibold mt-1">Open Flags</p>
          </div>
          <div className="card py-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Most Flagged Topics</p>
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

      <div className="flex bg-gray-100 rounded-lg p-1 mb-5">
        {['open','reviewed','dismissed'].map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 py-2 rounded-md text-sm font-semibold capitalize transition-colors ${activeTab===tab?'bg-white text-gray-900 shadow-sm':'text-gray-500'}`}>{tab}</button>
        ))}
      </div>

      {!data ? (
        <div className="card text-center py-8"><Loader2 className="w-6 h-6 text-lime-500 animate-spin mx-auto" /></div>
      ) : data.flags.length === 0 ? (
        <div className="card text-center py-12"><CheckCircle2 className="w-8 h-8 text-lime-400 mx-auto mb-2" /><p className="text-gray-400 font-medium text-sm">No {activeTab} flags</p></div>
      ) : (
        <div className="space-y-3">
          {data.flags.map(f=>{
            const reason = REASON_META[f.reason] || { Icon: FileText, label: f.reason };
            return (
            <div key={f.id} className="card">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${STATUS_COLORS[f.status]}`}>{f.status}</span>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md flex items-center gap-1"><reason.Icon size={11} /> {reason.label}</span>
                    {f.topic && <span className="text-xs text-purple-600 font-medium bg-purple-50 px-2 py-0.5 rounded-md truncate">{f.topic}</span>}
                  </div>
                  <p className="text-xs text-gray-400">by <span className="font-medium">{f.flagged_by}</span> · {new Date(f.flagged_at).toLocaleDateString()}</p>
                </div>
                {f.status==='open' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={()=>handleUpdate(f.id,'reviewed')} disabled={updating===f.id} className="text-xs bg-lime-50 text-lime-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-lime-100 transition-colors disabled:opacity-50">
                      {updating===f.id?'...':'Reviewed'}
                    </button>
                    <button onClick={()=>handleUpdate(f.id,'dismissed')} disabled={updating===f.id} className="text-xs bg-gray-100 text-gray-500 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-2">
                <p className="text-sm font-medium text-gray-800 mb-1">{f.question_text}</p>
                {f.correct_answer && <p className="text-xs text-gray-400">Correct answer: <span className="font-medium text-gray-600">{f.correct_answer}</span></p>}
                {f.explanation && <p className="text-xs text-gray-400 mt-1 italic">"{f.explanation}"</p>}
              </div>

              {f.comment && <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2"><span className="font-semibold">Comment:</span> {f.comment}</p>}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
