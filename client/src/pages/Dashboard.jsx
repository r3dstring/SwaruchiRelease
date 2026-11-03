import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Zap, Flame, Trophy, Upload, FileText, Trash2, GraduationCap, Target, TrendingUp, Rocket, Sparkles } from 'lucide-react';
import { useAuth, useIsAdmin } from '../context/AuthContext';
import { useTopics } from '../context/TopicsContext';
import { api } from '../api';

const LEVEL_TITLES = ['','Novice','Learner','Scholar','Expert','Sage','Wizard','Legend','Titan','Mythic','Apex'];
function xpForLevel(l) { let t=0; for(let i=1;i<l;i++) t+=100+50*i; return t; }
function xpToNext(xp,level) { const c=xpForLevel(level),n=xpForLevel(level+1),p=xp-c,needed=n-c; return {progress:p,needed,pct:Math.min(100,Math.round((p/needed)*100))}; }

function TopicTreePicker({ topics, selected, onSelect }) {
  const [expanded, setExpanded] = useState({});
  return (
    <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1 -mr-1">
      {topics.map(branch => {
        const isOpen = expanded[branch.id];
        const hasSel = branch.children.some(c => c.id === selected);
        return (
          <div key={branch.id}>
            <button onClick={() => setExpanded(p=>({...p,[branch.id]:!p[branch.id]}))}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${hasSel?'bg-lime-50':'hover:bg-gray-50'}`}>
              <span className={`text-sm font-semibold flex-1 ${hasSel?'text-lime-700':'text-gray-700'}`}>{branch.label}</span>
              <ChevronRight size={16} className={`text-gray-400 transition-transform ${isOpen?'rotate-90':''}`} />
            </button>
            {isOpen && (
              <div className="ml-3 pl-3 border-l-2 border-gray-100 space-y-0.5 py-1">
                {branch.children.map(leaf => (
                  <button key={leaf.id} onClick={() => onSelect(leaf.id, leaf.label, branch.label)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected===leaf.id?'bg-lime-500 text-white font-semibold':'text-gray-600 hover:bg-gray-50 font-medium'}`}>
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
  if (!data || data.length < 2) return <p className="text-xs text-gray-400 text-center py-6">Complete more quizzes to see growth</p>;
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
  const { topics } = useTopics();
  const [pdfs, setPdfs] = useState([]);
  const [history, setHistory] = useState([]);
  const [recs, setRecs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [quizCount, setQuizCount] = useState(10);
  const [quizDiff, setQuizDiff] = useState('medium');
  const [quizTypes, setQuizTypes] = useState(['mcq','tf','fitb']);
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
      for (const b of topics) { const l=b.children.find(c=>c.label===presetLabel); if(l){setSelTopicId(l.id);setSelTopicLabel(l.label);setSelTopicParent(b.label);break;} }
    }
    setShowSettings(true);
  };

  const handleLaunch = () => {
    if (!selTopicId) return;
    onStartQuiz({ count: quizCount, difficulty: quizDiff, consequenceMode, questionTypes: quizTypes.length > 0 ? quizTypes : ['mcq','tf','fitb'], topic: { id: selTopicId, label: selTopicLabel, parent: selTopicParent } });
    setShowSettings(false);
  };

  const lvl = xpToNext(user?.xp||0, user?.level||1);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>setShowSettings(false)}>
          <div className="bg-white rounded-xl w-full max-w-md flex flex-col" style={{maxHeight:'calc(100vh - 3rem)'}} onClick={e=>e.stopPropagation()}>
            <div className="p-6 pb-4 border-b border-gray-100 shrink-0">
              <h3 className="font-display font-700 text-xl text-gray-900 mb-0.5">Start a Quiz</h3>
              <p className="text-sm text-gray-500">{pdfs.length} document{pdfs.length!==1?'s':''} in knowledge base</p>
            </div>
            <div className="p-6 pt-4 overflow-y-auto flex-1">
              <label className="block text-sm font-semibold text-gray-600 mb-2">Select Topic <span className="text-coral">*</span></label>
              <TopicTreePicker topics={topics} selected={selTopicId} onSelect={(id,label,parent)=>{setSelTopicId(id);setSelTopicLabel(label);setSelTopicParent(parent);}}/>
              {selTopicId && <div className="mt-3 flex items-center gap-2 bg-lime-50 px-3 py-2 rounded-lg"><Target size={14} className="text-lime-600" /><span className="text-sm font-semibold text-lime-700 truncate">{selTopicParent} → {selTopicLabel}</span></div>}
              <div className="h-px bg-gray-100 my-5"/>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Questions</label>
              <div className="flex gap-2 mb-5">
                {[5,10,15,20].map(n=><button key={n} onClick={()=>setQuizCount(n)} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${quizCount===n?'bg-lime-500 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{n}</button>)}
              </div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Difficulty</label>
              <div className="flex gap-2 mb-5">
                {[{key:'easy',label:'Easy',color:'bg-emerald-500'},{key:'medium',label:'Medium',color:'bg-sky'},{key:'hard',label:'Hard',color:'bg-coral'}].map(d=>(
                  <button key={d.key} onClick={()=>setQuizDiff(d.key)} className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${quizDiff===d.key?`${d.color} text-white`:'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{d.label}</button>
                ))}
              </div>
              <label className="block text-sm font-semibold text-gray-600 mb-2">Question Types</label>
              <div className="flex gap-2 mb-5">
                {[{key:'mcq',label:'Multiple Choice'},{key:'tf',label:'True/False'},{key:'fitb',label:'Fill in Blank'}].map(t=>{
                  const active = quizTypes.includes(t.key);
                  return (
                    <button key={t.key} type="button"
                      onClick={()=>setQuizTypes(prev => active ? prev.filter(x=>x!==t.key) : [...prev, t.key])}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${active?'bg-gray-800 text-white':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {quizTypes.length === 0 && <p className="text-xs text-coral -mt-3 mb-4">Select at least one question type — defaulting to all types.</p>}
              <button onClick={()=>setConsequenceMode(!consequenceMode)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${consequenceMode?'border-purple-300 bg-purple-50':'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${consequenceMode?'bg-purple-600 border-purple-600':'border-gray-300'}`}>
                  {consequenceMode && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${consequenceMode?'text-purple-700':'text-gray-700'}`}>Scenario Mode</p>
                  <p className="text-xs text-gray-500">Operational decision-making instead of factual recall</p>
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

      {/* Consolidated stats bar — one card instead of three */}
      <div className="card mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-lime-500 flex items-center justify-center text-white font-display font-800 text-sm shrink-0">L{user?.level||1}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{LEVEL_TITLES[Math.min(user?.level||1,10)]}</p>
              <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden mt-1"><div className="bg-lime-500 h-full rounded-full transition-all duration-700" style={{width:`${lvl.pct}%`}}/></div>
            </div>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="flex items-center gap-1.5">
              <Zap size={16} className="text-amber-500" strokeWidth={2.5} />
              <span className="font-display font-700 text-gray-900">{user?.xp||0}</span>
              <span className="text-xs text-gray-400">XP</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame size={16} className="text-orange-500" strokeWidth={2.5} />
              <span className="font-display font-700 text-gray-900">{user?.streak||0}</span>
              <span className="text-xs text-gray-400">streak</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Trophy size={16} className="text-gray-400" strokeWidth={2} />
              <span className="font-display font-700 text-gray-900">{history.length}</span>
              <span className="text-xs text-gray-400">quizzes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Start Quiz banner */}
      <div className="card bg-gray-900 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display font-700 text-lg text-white">Ready to learn?</h2>
          <p className="text-sm text-gray-400">{pdfs.length>0?`Quizzes draw from all ${pdfs.length} document${pdfs.length!==1?'s':''} in the knowledge base`:'No documents yet — ask your admin to upload training material'}</p>
        </div>
        <button onClick={()=>openSettings()} disabled={pdfs.length===0} className="bg-lime-500 hover:bg-lime-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-2">
          <Rocket size={16} /> Start Quiz
        </button>
      </div>

      {/* Recommendations */}
      {recs && (recs.recommendation||recs.weakest?.length>0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card">
            <div className="flex items-center gap-1.5 mb-2"><GraduationCap size={14} className="text-purple-600" /><p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Recommended</p></div>
            {recs.recommendation ? (<>
              {recs.mastered?.[0] && <p className="text-xs text-gray-500 mb-1">Mastered: <span className="font-semibold text-lime-600">{recs.mastered[0].topic}</span></p>}
              <p className="font-display font-700 text-gray-900 text-sm mb-1">{recs.recommendation.topic}</p>
              <p className="text-xs text-gray-500 mb-3">{recs.recommendation.reason} · ~{recs.recommendation.estimatedMinutes} min</p>
              <button onClick={()=>openSettings(recs.recommendation.topic)} className="btn-primary text-xs py-2 px-4 w-full">Practice Now</button>
            </>) : <p className="text-xs text-gray-400 py-4 text-center">Complete a few quizzes to get recommendations</p>}
          </div>
          <div className="card">
            <div className="flex items-center gap-1.5 mb-2"><Target size={14} className="text-coral" /><p className="text-xs font-semibold text-coral uppercase tracking-wide">Weakest Topics</p></div>
            {recs.weakest?.length>0 ? <div className="space-y-1">{recs.weakest.slice(0,5).map(w=>(
              <button key={w.topic} onClick={()=>openSettings(w.topic)} className="w-full flex items-center justify-between text-left hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors">
                <span className="text-xs font-medium text-gray-600 truncate">{w.topic}</span>
                <span className={`text-xs font-bold shrink-0 ml-2 ${w.accuracy<50?'text-coral':'text-amber-600'}`}>{w.accuracy}%</span>
              </button>
            ))}</div> : <p className="text-xs text-gray-400 py-4 text-center">No data yet</p>}
          </div>
          <div className="card">
            <div className="flex items-center gap-1.5 mb-2"><TrendingUp size={14} className="text-lime-600" /><p className="text-xs font-semibold text-lime-600 uppercase tracking-wide">Growth</p></div>
            <GrowthChart data={recs.growth}/>
          </div>
        </div>
      )}

      {/* Documents + History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {isAdmin && (
            <div className={`card border-dashed cursor-pointer transition-colors ${dragOver?'border-lime-400 bg-lime-50/50':'hover:border-gray-300'} ${uploading?'pointer-events-none opacity-60':''}`}
              onDragOver={(e)=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={()=>fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e)=>handleUpload(e.target.files?.[0])}/>
              <div className="text-center py-6">
                {uploading ? <><Upload className="w-7 h-7 text-gray-400 mx-auto mb-2 animate-bounce" /><p className="font-medium text-gray-600 text-sm">Indexing document...</p></> : <><Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" /><p className="font-medium text-gray-700 text-sm">Add to knowledge base</p><p className="text-xs text-gray-400 mt-1">Drop PDFs here. All users can quiz from these documents.</p></>}
              </div>
              {error && <p className="text-coral text-sm font-medium text-center">{error}</p>}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-700 text-lg text-gray-900">Knowledge Base</h2>
              {!isAdmin && <span className="text-xs text-gray-400 font-medium">Managed by admin</span>}
            </div>
            {pdfs.length===0 ? <div className="card text-center py-8"><FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 font-medium text-sm">{isAdmin?'Upload PDFs to build the knowledge base':'No documents yet — ask your admin to upload training material'}</p></div>
            : <div className="space-y-2">{pdfs.map(p=>(
              <div key={p.id} className="card flex items-center justify-between py-3.5 group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-sky/10 rounded-lg flex items-center justify-center shrink-0"><FileText size={16} className="text-sky" /></div>
                  <div className="min-w-0"><p className="font-medium text-gray-800 truncate text-sm">{p.filename}</p><p className="text-xs text-gray-400">{p.page_count} page{p.page_count!==1?'s':''} · {new Date(p.uploaded_at).toLocaleDateString()}</p></div>
                </div>
                {isAdmin && (
                  <button onClick={()=>handleDelete(p.id)} className="text-gray-300 hover:text-coral transition-colors p-2 opacity-0 group-hover:opacity-100 shrink-0">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}</div>}
          </div>
        </div>

        <div>
          <h2 className="font-display font-700 text-lg text-gray-900 mb-3">Recent Quizzes</h2>
          {history.length===0 ? <div className="card text-center py-8"><Sparkles className="w-7 h-7 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 font-medium text-sm">Complete a quiz to see your history</p></div>
          : <div className="space-y-2">{history.map(h=>{
              const pct=Math.round((h.score/h.total)*100);
              return (<div key={h.id} className="card py-3 px-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-700 truncate max-w-[130px]">{h.topic||h.pdf_name||'Quiz'}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${pct===100?'bg-lime-50 text-lime-700':pct>=70?'bg-sky/10 text-sky':'bg-orange-50 text-orange-600'}`}>{pct}%</span>
                </div>
                <div className="flex items-center justify-between"><p className="text-xs text-gray-400">{h.score}/{h.total}{h.consequence_mode?' · Scenario':''}</p><p className="text-xs font-bold text-amber-600">+{h.xp_earned} XP</p></div>
              </div>);
            })}</div>}
        </div>
      </div>
    </div>
  );
}
