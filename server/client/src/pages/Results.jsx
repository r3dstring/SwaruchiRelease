import { useState } from 'react';
import { Trophy, Star, ThumbsUp, BookOpen, Dumbbell, Target, AlertTriangle, Zap, Flame, Check, X, Library } from 'lucide-react';
import FlagButton from '../components/FlagButton';

export default function Results({ result, onBack }) {
  const [showDetails, setShowDetails] = useState(false);
  const { score, total, xpEarned, perfectBonus, results, user, topic, consequenceMode, docsReferenced } = result;
  const pct = Math.round((score/total)*100);
  const Icon = pct===100?Trophy:pct>=80?Star:pct>=60?ThumbsUp:pct>=40?BookOpen:Dumbbell;
  const message = pct===100?'Perfect Score!':pct>=80?'Excellent!':pct>=60?'Good job!':pct>=40?'Keep learning!':"Don't give up!";

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-lime-50 flex items-center justify-center mx-auto mb-4">
          <Icon size={28} className="text-lime-600" />
        </div>
        <h1 className="font-display font-800 text-2xl text-gray-900 mb-1">{message}</h1>
        <p className="text-gray-500 font-medium">Quiz Complete</p>
        <div className="flex justify-center gap-2 mt-3 flex-wrap">
          {topic && <div className="inline-flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-lg"><Target size={13} className="text-purple-600" /><span className="text-xs font-semibold text-purple-700">{topic}</span></div>}
          {consequenceMode && <div className="inline-flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-lg"><AlertTriangle size={13} className="text-coral" /><span className="text-xs font-semibold text-coral">Scenario Mode</span></div>}
        </div>
        <div className="relative w-36 h-36 mx-auto my-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#E5E7EB" strokeWidth="9"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke={pct>=70?'#58CC02':pct>=40?'#FFC800':'#FF4B4B'} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct*3.27} 327`} className="transition-all duration-1000 ease-out"/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-display font-800 text-2xl text-gray-900">{pct}%</span><span className="text-xs text-gray-400 font-medium">{score}/{total}</span></div>
        </div>
      </div>

      <div className="card bg-amber-50 border-amber-100 text-center mb-4">
        <div className="flex items-center justify-center gap-3">
          <Zap size={22} className="text-amber-500" />
          <div><p className="font-display font-700 text-xl text-amber-700">+{xpEarned} XP</p>{perfectBonus&&<p className="text-xs font-semibold text-amber-600">Includes +25 perfect bonus!</p>}</div>
        </div>
      </div>

      {docsReferenced?.length>0 && (
        <p className="text-xs text-gray-400 text-center mb-4 flex items-center justify-center gap-1.5">
          <Library size={12} /> Drew from: {docsReferenced.map(d=>d.filename).join(', ')}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card text-center py-3"><p className="text-xs text-gray-400 font-medium">Total XP</p><p className="font-display font-700 text-lg">{user?.xp||0}</p></div>
        <div className="card text-center py-3"><p className="text-xs text-gray-400 font-medium">Level</p><p className="font-display font-700 text-lg">{user?.level||1}</p></div>
        <div className="card text-center py-3"><p className="text-xs text-gray-400 font-medium">Streak</p><p className="font-display font-700 text-lg flex items-center justify-center gap-1"><Flame size={14} className="text-orange-500" />{user?.streak||0}</p></div>
      </div>

      <button onClick={()=>setShowDetails(!showDetails)} className="w-full btn-secondary mb-4 text-sm">{showDetails?'Hide Answers':'Review Answers'}</button>
      {showDetails && (
        <div className="space-y-3 mb-6">
          {results?.map((r,i)=>(
            <div key={i} className={`card py-3 px-4 border-l-4 ${r.isCorrect?'border-l-lime-400':'border-l-coral'}`}>
              <div className="flex items-start gap-2">
                {r.isCorrect ? <Check size={16} className="text-lime-600 mt-0.5 shrink-0" /> : <X size={16} className="text-coral mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">{r.question}</p>
                  {!r.isCorrect&&<p className="text-xs text-gray-500 mt-1">Your answer: <span className="text-coral font-medium">{r.userAnswer||'(none)'}</span> · Correct: <span className="text-lime-600 font-medium">{r.answer}</span></p>}
                  {r.explanation&&<p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{r.explanation}</p>}
                  <FlagButton question={r} topic={topic||null}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={onBack} className="btn-primary w-full text-sm">Back to Dashboard</button>
    </div>
  );
}
