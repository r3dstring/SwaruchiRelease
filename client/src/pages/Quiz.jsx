import { useState, useEffect } from 'react';
import { ArrowLeft, Target, AlertTriangle, Circle, ToggleLeft, Pencil, Check, X, PartyPopper, Dumbbell, Loader2 } from 'lucide-react';
import { api } from '../api';
import FlagButton from '../components/FlagButton';

const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

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
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-lime-50 rounded-full flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-lime-500 animate-spin" />
        </div>
        <p className="font-display font-700 text-lg text-gray-800 mt-6">{consequenceMode?'Building scenarios...':'Generating questions...'}</p>
        {topic && <p className="text-sm text-purple-600 font-medium mt-1">{topic.parent} → {topic.label}</p>}
        <p className="text-sm text-gray-400 mt-1">Searching knowledge base · {DIFFICULTY_LABEL[difficulty] || 'Medium'}</p>
      </div>
    );
  }

  if (error) return <div className="min-h-[60vh] flex flex-col items-center justify-center px-4"><p className="font-semibold text-gray-800 mb-2">Something went wrong</p><p className="text-sm text-gray-400 mb-6">{error}</p><button onClick={onBack} className="btn-secondary">Go back</button></div>;
  if (!q) return null;

  const correct = confirmed && isCorrect();
  const wrong = confirmed && !isCorrect();
  const QuestionTypeIcon = q.type === 'mcq' ? Circle : q.type === 'tf' ? ToggleLeft : Pencil;
  const questionTypeLabel = q.type==='mcq'?(consequenceMode?'Scenario':'Multiple Choice'):q.type==='tf'?'True or False':'Fill in the Blank';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden"><div className="bg-lime-500 h-full rounded-full transition-all duration-500 ease-out" style={{width:`${progress}%`}}/></div>
        <span className="text-sm font-semibold text-gray-500">{current+1}/{total}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {topic && <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-lg"><Target size={13} className="text-purple-600" /><span className="text-xs font-semibold text-purple-700">{topic.label}</span></div>}
        {consequenceMode && <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-lg"><AlertTriangle size={13} className="text-coral" /><span className="text-xs font-semibold text-coral">Scenario Mode</span></div>}
      </div>

      <div className="mb-4">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${q.type==='mcq'?'bg-sky/10 text-sky':q.type==='tf'?'bg-purple-50 text-purple-600':'bg-amber-50 text-amber-700'}`}>
          <QuestionTypeIcon size={13} /> {questionTypeLabel}
        </span>
      </div>

      <h2 className="font-display font-700 text-xl md:text-2xl text-gray-900 mb-8 leading-snug">{q.question}</h2>

      {q.type==='fitb' ? (
        <div className="mb-8">
          <input type="text" value={fitbInput} onChange={e=>setFitbInput(e.target.value)} placeholder="Type your answer..."
            className={`input-field text-lg py-4 text-center font-semibold ${confirmed?(correct?'border-lime-400 bg-lime-50':'border-coral bg-red-50'):''}`}
            disabled={confirmed} onKeyDown={e=>e.key==='Enter'&&fitbInput.trim()&&!confirmed&&handleConfirm()} autoFocus/>
          {confirmed&&wrong && <p className="text-sm text-gray-500 mt-2 text-center">Correct answer: <span className="font-semibold text-lime-600">{q.answer}</span></p>}
        </div>
      ) : (
        <div className="space-y-2.5 mb-8">
          {(q.options||[]).map((opt,i)=>{
            const letter=String.fromCharCode(97+i);
            const value=q.type==='tf'?opt.toLowerCase():letter;
            const isSel=selected===value, isAns=q.answer?.toString().toLowerCase()===value;
            let style='border-gray-200 bg-white hover:border-gray-300';
            if(confirmed){ if(isAns) style='border-lime-400 bg-lime-50'; else if(isSel&&!isAns) style='border-coral bg-red-50'; else style='border-gray-100 bg-gray-50 opacity-60'; }
            else if(isSel) style='border-sky bg-sky/5';
            return (
              <button key={i} onClick={()=>!confirmed&&setSelected(value)} disabled={confirmed}
                className={`w-full text-left px-4 py-3.5 rounded-xl border-2 font-medium transition-colors ${style}`}>
                <div className="flex items-center gap-3">
                  {q.type!=='tf'&&<span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${confirmed&&isAns?'bg-lime-500 text-white':confirmed&&isSel?'bg-coral text-white':isSel?'bg-sky text-white':'bg-gray-100 text-gray-500'}`}>{letter.toUpperCase()}</span>}
                  <span className="text-gray-800">{opt}</span>
                  {confirmed&&isAns&&<Check size={18} className="ml-auto text-lime-600" />}
                  {confirmed&&isSel&&!isAns&&<X size={18} className="ml-auto text-coral" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {confirmed && (
        <div className={`rounded-xl p-4 mb-6 border ${correct?'bg-lime-50 border-lime-200':'bg-red-50 border-red-100'}`}>
          <div className="flex items-start gap-3">
            {correct ? <PartyPopper size={20} className="text-lime-600 shrink-0 mt-0.5" /> : <Dumbbell size={20} className="text-coral shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <p className={`font-semibold ${correct?'text-lime-700':'text-coral'}`}>{correct?'Correct!':'Not quite!'}</p>
              {correct&&<p className="text-sm text-lime-600 font-medium">+10 XP</p>}
              {q.explanation&&<p className="text-sm text-gray-600 mt-2 leading-relaxed">{q.explanation}</p>}
              <FlagButton question={q} topic={topic?.label||null}/>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        {!confirmed
          ? <button onClick={handleConfirm} disabled={q.type==='fitb'?!fitbInput.trim():selected===null} className="btn-primary text-sm px-8">Check</button>
          : <button onClick={handleNext} className="btn-primary text-sm px-8">{current+1>=total?'See Results':'Continue'}</button>
        }
      </div>
    </div>
  );
}
