import { useState, useEffect } from 'react';
import { api } from '../api';
import FlagButton from '../components/FlagButton';

export default function Quiz({ settings, onFinish, onBack }) {
  const { count, difficulty, topic, consequenceMode } = settings;
  const [questions, setQuestions] = useState([]);
  const [docsReferenced, setDocsReferenced] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fitbInput, setFitbInput] = useState('');

  useEffect(() => {
    setLoading(true);
    api.generateQuiz({ count, difficulty, topic, consequenceMode })
      .then(data => { setQuestions(data.questions||[]); setDocsReferenced(data.docsReferenced||[]); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const q = questions[current];
  const total = questions.length;
  const progress = total > 0 ? Math.round((current/total)*100) : 0;

  const isCorrect = () => {
    if (!q) return false;
    const ans = q.answer?.toString().toLowerCase().trim();
    if (q.type==='fitb') return fitbInput.toLowerCase().trim()===ans;
    return selected?.toString().toLowerCase().trim()===ans;
  };

  const handleConfirm = () => {
    setAnswers(prev=>({...prev,[current]: q.type==='fitb'?fitbInput.trim():selected}));
    setConfirmed(true);
  };

  const handleNext = () => {
    if (current+1 >= total) {
      const fa={...answers}; fa[current]=q.type==='fitb'?fitbInput.trim():selected;
      const arr=questions.map((_,i)=>fa[i]||'');
      api.submitQuiz({ questions, answers: arr, topic: topic?.label||null, consequenceMode, docsReferenced })
        .then(r=>onFinish(r)).catch(e=>setError(e.message));
      return;
    }
    setCurrent(c=>c+1); setSelected(null); setConfirmed(false); setFitbInput('');
  };

  if (loading) {
    const dl={easy:'🌱 Easy',medium:'⚡ Medium',hard:'🔥 Hard'}[difficulty]||'⚡ Medium';
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-20 h-20 bg-lime-400/10 rounded-full flex items-center justify-center text-4xl animate-pulse">{consequenceMode?'⚠️':'🤖'}</div>
        <p className="font-display font-800 text-lg text-gray-700 mt-6">{consequenceMode?'Building scenarios...':'Generating questions...'}</p>
        {topic && <p className="text-sm text-grape font-semibold mt-1">🎯 {topic.parent} → {topic.label}</p>}
        <p className="text-sm text-gray-400 mt-1">Searching knowledge base · {dl}</p>
        <div className="flex gap-1 mt-4">{[0,1,2].map(i=><div key={i} className="w-2.5 h-2.5 bg-lime-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div>
      </div>
    );
  }

  if (error) return <div className="min-h-[60vh] flex flex-col items-center justify-center"><div className="text-5xl mb-4">😵</div><p className="font-bold text-gray-700 mb-2">Something went wrong</p><p className="text-sm text-gray-400 mb-6">{error}</p><button onClick={onBack} className="btn-secondary">Go back</button></div>;
  if (!q) return null;

  const correct = confirmed && isCorrect();
  const wrong = confirmed && !isCorrect();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden"><div className="bg-lime-400 h-full rounded-full transition-all duration-500 ease-out" style={{width:`${progress}%`}}/></div>
        <span className="text-sm font-bold text-gray-500">{current+1}/{total}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {topic && <div className="flex items-center gap-2 bg-grape/10 px-3 py-1.5 rounded-xl"><span className="text-xs">🎯</span><span className="text-xs font-bold text-purple-700">{topic.label}</span></div>}
        {consequenceMode && <div className="flex items-center gap-2 bg-coral/10 px-3 py-1.5 rounded-xl"><span className="text-xs">⚠️</span><span className="text-xs font-bold text-coral">Consequence Mode</span></div>}
      </div>

      <div className="mb-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg ${q.type==='mcq'?'bg-sky/10 text-sky':q.type==='tf'?'bg-grape/10 text-purple-600':'bg-golden/10 text-amber-700'}`}>
          {q.type==='mcq'?(consequenceMode?'🧭 Scenario':'🔘 Multiple Choice'):q.type==='tf'?'⚖️ True or False':'✏️ Fill in the Blank'}
        </span>
      </div>

      <h2 className="font-display font-800 text-xl md:text-2xl text-gray-800 mb-8 leading-snug">{q.question}</h2>

      {q.type==='fitb' ? (
        <div className="mb-8">
          <input type="text" value={fitbInput} onChange={e=>setFitbInput(e.target.value)} placeholder="Type your answer..."
            className={`input-field text-lg py-4 text-center font-semibold ${confirmed?(correct?'border-lime-400 bg-owl-50':'border-coral bg-red-50'):''}`}
            disabled={confirmed} onKeyDown={e=>e.key==='Enter'&&fitbInput.trim()&&!confirmed&&handleConfirm()} autoFocus/>
          {confirmed&&wrong && <p className="text-sm text-gray-500 mt-2 text-center">Correct answer: <span className="font-bold text-lime-600">{q.answer}</span></p>}
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {(q.options||[]).map((opt,i)=>{
            const letter=String.fromCharCode(97+i);
            const value=q.type==='tf'?opt.toLowerCase():letter;
            const isSel=selected===value, isAns=q.answer?.toString().toLowerCase()===value;
            let style='border-gray-200 bg-white hover:border-lime-400/50 hover:bg-owl-50';
            if(confirmed){ if(isAns) style='border-lime-400 bg-owl-100 ring-2 ring-lime-400/30'; else if(isSel&&!isAns) style='border-coral bg-red-50 ring-2 ring-coral/30'; else style='border-gray-100 bg-gray-50 opacity-60'; }
            else if(isSel) style='border-sky bg-sky/5 ring-2 ring-sky/30';
            return (
              <button key={i} onClick={()=>!confirmed&&setSelected(value)} disabled={confirmed}
                className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-medium transition-all ${style} ${confirmed?'':'active:scale-[0.98]'} ${wrong&&isSel?'animate-shake':''}`}>
                <div className="flex items-center gap-3">
                  {q.type!=='tf'&&<span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${confirmed&&isAns?'bg-lime-400 text-white':confirmed&&isSel?'bg-coral text-white':isSel?'bg-sky text-white':'bg-gray-100 text-gray-500'}`}>{letter.toUpperCase()}</span>}
                  <span className="text-gray-700">{opt}</span>
                  {confirmed&&isAns&&<span className="ml-auto text-lg">✅</span>}
                  {confirmed&&isSel&&!isAns&&<span className="ml-auto text-lg">❌</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {confirmed && (
        <div className={`rounded-2xl p-4 mb-6 animate-slide-up ${correct?'bg-lime-400/10 border-2 border-lime-400/30':'bg-red-50 border-2 border-coral/20'}`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{correct?'🎉':'💪'}</span>
            <div className="min-w-0 flex-1">
              <p className={`font-bold ${correct?'text-lime-600':'text-coral'}`}>{correct?'Correct!':'Not quite!'}</p>
              {correct&&<p className="text-sm text-lime-600/70 font-medium">+10 XP</p>}
              {q.explanation&&<p className="text-sm text-gray-600 mt-2 leading-relaxed">{q.explanation}</p>}
              {/* Flag button appears after answer is shown */}
              <FlagButton question={q} topic={topic?.label||null}/>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        {!confirmed
          ? <button onClick={handleConfirm} disabled={q.type==='fitb'?!fitbInput.trim():selected===null} className="btn-primary text-base px-10">Check</button>
          : <button onClick={handleNext} className="btn-primary text-base px-10">{current+1>=total?'See Results':'Continue'}</button>
        }
      </div>
    </div>
  );
}
