import { useState, useEffect, useRef } from 'react';
import { useAuth, useIsAdmin } from '../context/AuthContext';
import { api } from '../api';
import { TOPIC_TREE } from '../topicTree';

const LEVEL_TITLES = ['','Novice','Learner','Scholar','Expert','Sage','Wizard','Legend','Titan','Mythic','Apex'];
function xpForLevel(l) { let t=0; for(let i=1;i<l;i++) t+=100+50*i; return t; }
function xpToNext(xp,level) { const c=xpForLevel(level),n=xpForLevel(level+1),p=xp-c,needed=n-c; return {progress:p,needed,pct:Math.min(100,Math.round((p/needed)*100))}; }

function TopicTreePicker({ selected, onSelect }) {
  const [expanded, setExpanded] = useState({});
  return (
    <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1 -mr-1">
      {TOPIC_TREE.map(branch => {
        const isOpen = expanded[branch.id];
        const hasSel = branch.children.some(c => c.id === selected);
        return (
          <div key={branch.id}>
            <button onClick={() => setExpanded(p=>({...p,[branch.id]:!p[branch.id]}))}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${hasSel?'bg-lime-400/10':'hover:bg-gray-50'}`}>
              <span className="text-base">{branch.icon}</span>
              <span className={`text-sm font-semibold flex-1 ${hasSel?'text-lime-700':'text-gray-700'}`}>{branch.label}</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen?'rotate-90':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
            {isOpen && (
              <div className="ml-4 pl-4 border-l-2 border-gray-100 space-y-0.5 py-1 animate-slide-up">
                {branch.children.map(leaf => (
                  <button key={leaf.id} onClick={() => onSelect(leaf.id, leaf.label, branch.label)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${selected===leaf.id?'bg-lime-400 text-white font-bold shadow-[0_2px_0_0_#3A8A01]':'text-gray-600 hover:bg-gray-50 font-medium'}`}>
                    {leaf.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GrowthChart({ data }) {
  if (!data || data.length < 2) return <p className="text-xs text-gray-300 text-center py-6">Complete more quizzes to see growth</p>;
  const w=260,h=80,pad=6;
  const pts = data.map((d,i) => `${pad+(i/(data.length-1))*(w-pad*2)},${h-pad-(d.accuracy/100)*(h-pad*2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <polyline points={pts} fill="none" stroke="#58CC02" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {data.map((d,i) => { const x=pad+(i/(data.length-1))*(w-pad*2),y=h-pad-(d.accuracy/100)*(h-pad*2); return <circle key={i} cx={x} cy={y} r="3" fill="#58CC02"/>; })}
    </svg>
  );
}

export default function Dashboard({ onStartQuiz }) {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [pdfs, setPdfs] = useState([]);
  const [history, setHistory] = useState([]);
  const [recs, setRecs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [quizCount, setQuizCount] = useState(10);
  const [quizDiff, setQuizDiff] = useState('medium');
  const [consequenceMode, setConsequenceMode] = useState(false);
  const [selTopicId, setSelTopicId] = useState(null);
  const [selTopicLabel, setSelTopicLabel] = useState('');
  const [selTopicParent, setSelTopicParent] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    api.listPdfs().then(setPdfs).catch(()=>{});
    api.quizHistory().then(setHistory).catch(()=>{});
    api.recommendations().then(setRecs).catch(()=>{});
  }, []);

  const handleUpload = async (file) => {
    if (!file||file.type!=='application/pdf') { setError('Please select a PDF file'); return; }
    setError(''); setUploading(true);
    try { const p = await api.uploadPdf(file); setPdfs(prev=>[p,...prev]); }
    catch(e) { setError(e.message); } finally { setUploading(false); }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if(e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]); };
  const handleDelete = async (id) => { await api.deletePdf(id); setPdfs(prev=>prev.filter(p=>p.id!==id)); };

  const openSettings = (presetLabel=null) => {
    setSelTopicId(null); setSelTopicLabel(''); setSelTopicParent(''); setConsequenceMode(false);
    if (presetLabel) {
      for (const b of TOPIC_TREE) { const l=b.children.find(c=>c.label===presetLabel); if(l){setSelTopicId(l.id);setSelTopicLabel(l.label);setSelTopicParent(b.label);break;} }
    }
    setShowSettings(true);
  };

  const handleLaunch = () => {
    if (!selTopicId) return;
    onStartQuiz({ count: quizCount, difficulty: quizDiff, consequenceMode, topic: { id: selTopicId, label: selTopicLabel, parent: selTopicParent } });
    setShowSettings(false);
  };

  const lvl = xpToNext(user?.xp||0, user?.level||1);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>setShowSettings(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md animate-bounce-in flex flex-col" style={{maxHeight:'calc(100vh - 3rem)'}} onClick={e=>e.stopPropagation()}>
            <div className="p-6 pb-4 border-b border-gray-100 shrink-0">
              <h3 className="font-display font-800 text-xl text-gray-800 mb-0.5">Start a Quiz</h3>
              <p className="text-sm text-gray-400">{pdfs.length} document{pdfs.length!==1?'s':''} in knowledge base</p>
            </div>
            <div className="p-6 pt-4 overflow-y-auto flex-1">
              <label className="block text-sm font-semibold text-gray-600 mb-2">Select Topic <span className="text-coral">*</span></label>
              <TopicTreePicker selected={selTopicId} onSelect={(id,label,parent)=>{setSelTopicId(id);setSelTopicLabel(label);setSelTopicParent(parent);}}/>
              {selTopicId && <div className="mt-3 flex items-center gap-2 bg-lime-400/10 px-3 py-2 rounded-xl"><span className="text-sm">🎯</span><span className="text-sm font-semibold text-lime-700 truncate">{selTopicParent} → {selTopicLabel}</span></div>}
              <div className="h-px bg-gray-100 my-5"/>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Questions</label>
              <div className="flex gap-2 mb-5">
                {[5,10,15,20].map(n=><button key={n} onClick={()=>setQuizCount(n)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${quizCount===n?'bg-lime-400 text-white shadow-[0_3px_0_0_#3A8A01]':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{n}</button>)}
              </div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Difficulty</label>
              <div className="flex gap-2 mb-5">
                {[{key:'easy',label:'🌱 Easy',color:'bg-emerald-400 shadow-[0_3px_0_0_#059669]'},{key:'medium',label:'⚡ Medium',color:'bg-sky shadow-[0_3px_0_0_#0284C7]'},{key:'hard',label:'🔥 Hard',color:'bg-coral shadow-[0_3px_0_0_#CC3B3B]'}].map(d=>(
                  <button key={d.key} onClick={()=>setQuizDiff(d.key)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${quizDiff===d.key?`${d.color} text-white`:'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{d.label}</button>
                ))}
              </div>
              <button onClick={()=>setConsequenceMode(!consequenceMode)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${consequenceMode?'border-grape bg-grape/5':'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${consequenceMode?'bg-grape border-grape':'border-gray-300'}`}>
                  {consequenceMode && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div className="text-left">
                  <p className={`text-sm font-bold ${consequenceMode?'text-purple-700':'text-gray-700'}`}>⚠️ Consequence Mode</p>
                  <p className="text-xs text-gray-400">Scenario-based operational decisions</p>
                </div>
              </button>
            </div>
            <div className="p-6 pt-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={()=>setShowSettings(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={handleLaunch} disabled={!selTopicId||pdfs.length===0} className="btn-primary flex-1 text-sm">
                {pdfs.length===0?'No documents yet':selTopicId?'Start Quiz':'Pick a topic'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card bg-gradient-to-br from-lime-400 to-emerald-500 border-none text-white">
          <div className="flex items-center justify-between mb-3">
            <div><p className="text-sm font-semibold text-white/70">Level {user?.level||1}</p><p className="font-display font-800 text-2xl">{LEVEL_TITLES[Math.min(user?.level||1,10)]}</p></div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">{user?.level>=7?'👑':user?.level>=4?'⭐':'🌱'}</div>
          </div>
          <div className="bg-white/20 rounded-full h-3 overflow-hidden"><div className="bg-white h-full rounded-full transition-all duration-700" style={{width:`${lvl.pct}%`}}/></div>
          <p className="text-xs text-white/70 mt-1.5 font-medium">{lvl.progress} / {lvl.needed} XP to next level</p>
        </div>
        <div className="card"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-400">Total XP</p><p className="font-display font-800 text-3xl text-gray-800">{user?.xp||0}</p></div><div className="w-14 h-14 bg-golden/10 rounded-2xl flex items-center justify-center text-3xl">⚡</div></div><p className="text-xs text-gray-400 mt-2 font-medium">{history.length} quiz{history.length!==1?'zes':''} completed</p></div>
        <div className="card"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-400">Streak</p><p className="font-display font-800 text-3xl text-gray-800">{user?.streak||0} day{(user?.streak||0)!==1?'s':''}</p></div><div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-3xl">🔥</div></div><p className="text-xs text-gray-400 mt-2 font-medium">{user?.streak>=7?'Unstoppable!':user?.streak>=3?'Keep it going!':'Take a quiz today!'}</p></div>
      </div>

      {/* Start Quiz banner */}
      <div className="card bg-gradient-to-r from-sky/10 to-grape/10 border-sky/20 flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display font-800 text-lg text-gray-800">Ready to learn?</h2>
          <p className="text-sm text-gray-500">{pdfs.length>0?`Quizzes draw from all ${pdfs.length} document${pdfs.length!==1?'s':''} in the knowledge base`:'No documents yet — ask your admin to upload training material'}</p>
        </div>
        <button onClick={()=>openSettings()} disabled={pdfs.length===0} className="btn-primary px-8 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">🚀 Start Quiz</button>
      </div>

      {/* Recommendations */}
      {recs && (recs.recommendation||recs.weakest?.length>0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card border-grape/30">
            <p className="text-xs font-bold text-purple-600 mb-2">🎓 RECOMMENDED NEXT</p>
            {recs.recommendation ? (<>
              {recs.mastered?.[0] && <p className="text-xs text-gray-400 mb-1">Mastered: <span className="font-semibold text-lime-600">{recs.mastered[0].topic}</span></p>}
              <p className="font-display font-800 text-gray-800 text-sm mb-1">{recs.recommendation.topic}</p>
              <p className="text-xs text-gray-400 mb-3">{recs.recommendation.reason} · ~{recs.recommendation.estimatedMinutes} min</p>
              <button onClick={()=>openSettings(recs.recommendation.topic)} className="btn-primary text-xs py-2 px-4 w-full">Practice Now</button>
            </>) : <p className="text-xs text-gray-300 py-4 text-center">Complete a few quizzes to get recommendations</p>}
          </div>
          <div className="card">
            <p className="text-xs font-bold text-coral mb-2">🎯 WEAKEST TOPICS</p>
            {recs.weakest?.length>0 ? <div className="space-y-1.5">{recs.weakest.slice(0,5).map(w=>(
              <button key={w.topic} onClick={()=>openSettings(w.topic)} className="w-full flex items-center justify-between text-left hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors">
                <span className="text-xs font-medium text-gray-600 truncate">{w.topic}</span>
                <span className={`text-xs font-bold shrink-0 ml-2 ${w.accuracy<50?'text-coral':'text-amber-600'}`}>{w.accuracy}%</span>
              </button>
            ))}</div> : <p className="text-xs text-gray-300 py-4 text-center">No data yet</p>}
          </div>
          <div className="card"><p className="text-xs font-bold text-lime-600 mb-2">📈 KNOWLEDGE GROWTH</p><GrowthChart data={recs.growth}/></div>
        </div>
      )}

      {/* Documents + History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Upload zone: admin only */}
          {isAdmin && (
            <div className={`card border-dashed cursor-pointer transition-all ${dragOver?'border-lime-400 bg-owl-50 scale-[1.01]':'hover:border-lime-400/50'} ${uploading?'pointer-events-none opacity-60':''}`}
              onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e)=>handleUpload(e.target.files?.[0])}/>
              <div className="text-center py-6">
                {uploading?<><div className="text-4xl mb-3 animate-bounce">📄</div><p className="font-bold text-gray-600">Indexing document...</p></> : <><div className="text-4xl mb-3">📤</div><p className="font-bold text-gray-600">Add to knowledge base</p><p className="text-sm text-gray-400 mt-1">Drop PDFs here. All users can quiz from these documents.</p></>}
              </div>
              {error && <p className="text-coral text-sm font-medium text-center">{error}</p>}
            </div>
          )}

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-800 text-lg text-gray-800">Knowledge Base</h2>
              {!isAdmin && <span className="text-xs text-gray-400 font-medium">Managed by admin</span>}
            </div>
            {pdfs.length===0 ? <div className="card text-center py-8"><p className="text-4xl mb-2">📚</p><p className="text-gray-400 font-medium">{isAdmin?'Upload PDFs to build the knowledge base':'No documents yet — ask your admin to upload training material'}</p></div>
            : <div className="space-y-3">{pdfs.map(p=>(
              <div key={p.id} className="card flex items-center justify-between py-4 group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-sky/10 rounded-xl flex items-center justify-center text-lg shrink-0">📄</div>
                  <div className="min-w-0"><p className="font-semibold text-gray-700 truncate">{p.filename}</p><p className="text-xs text-gray-400">{p.page_count} page{p.page_count!==1?'s':''} · {new Date(p.uploaded_at).toLocaleDateString()} · <span className="text-lime-600 font-medium">✓ Indexed</span></p></div>
                </div>
                {isAdmin && (
                  <button onClick={()=>handleDelete(p.id)} className="text-gray-300 hover:text-coral transition-colors p-2 opacity-0 group-hover:opacity-100 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  </button>
                )}
              </div>
            ))}</div>}
          </div>
        </div>

        {/* History */}
        <div>
          <h2 className="font-display font-800 text-lg text-gray-800 mb-3">Recent Quizzes</h2>
          {history.length===0 ? <div className="card text-center py-8"><p className="text-3xl mb-2">🎯</p><p className="text-gray-400 font-medium text-sm">Complete a quiz to see your history</p></div>
          : <div className="space-y-2">{history.map(h=>{
              const pct=Math.round((h.score/h.total)*100);
              return (<div key={h.id} className="card py-3 px-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-700 truncate max-w-[130px]">{h.topic||h.pdf_name||'Quiz'}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${pct===100?'bg-lime-400/10 text-lime-600':pct>=70?'bg-sky/10 text-sky':'bg-orange-50 text-orange-500'}`}>{pct}%</span>
                </div>
                <div className="flex items-center justify-between"><p className="text-xs text-gray-400">{h.score}/{h.total}{h.consequence_mode?' · ⚠️':''}</p><p className="text-xs font-bold text-amber-600">+{h.xp_earned} XP</p></div>
              </div>);
            })}</div>}
        </div>
      </div>
    </div>
  );
}
