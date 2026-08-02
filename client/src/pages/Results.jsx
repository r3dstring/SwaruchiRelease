import { useState } from 'react';
import FlagButton from '../components/FlagButton';

export default function Results({ result, onBack }) {
  const [showDetails, setShowDetails] = useState(false);
  const { score, total, xpEarned, perfectBonus, results, user, topic, consequenceMode, docsReferenced } = result;
  const pct = Math.round((score/total)*100);
  const emoji = pct===100?'🏆':pct>=80?'🌟':pct>=60?'👍':pct>=40?'📖':'💪';
  const message = pct===100?'Perfect Score!':pct>=80?'Excellent!':pct>=60?'Good job!':pct>=40?'Keep learning!':"Don't give up!";

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="text-center animate-bounce-in">
        <div className="text-6xl mb-4">{emoji}</div>
        <h1 className="font-display font-900 text-3xl text-gray-800 mb-1">{message}</h1>
        <p className="text-gray-500 font-medium">Quiz Complete</p>
        <div className="flex justify-center gap-2 mt-3 flex-wrap">
          {topic && <div className="inline-flex items-center gap-2 bg-grape/10 px-4 py-1.5 rounded-xl"><span className="text-sm">🎯</span><span className="text-sm font-bold text-purple-700">{topic}</span></div>}
          {consequenceMode && <div className="inline-flex items-center gap-2 bg-coral/10 px-4 py-1.5 rounded-xl"><span className="text-sm">⚠️</span><span className="text-sm font-bold text-coral">Consequence Mode</span></div>}
        </div>
        <div className="relative w-40 h-40 mx-auto my-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#E5E7EB" strokeWidth="10"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke={pct>=70?'#58CC02':pct>=40?'#FFC800':'#FF4B4B'} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct*3.27} 327`} className="transition-all duration-1000 ease-out"/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-display font-900 text-3xl text-gray-800">{pct}%</span><span className="text-xs text-gray-400 font-semibold">{score}/{total}</span></div>
        </div>
      </div>

      <div className="card bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/50 text-center mb-4 animate-slide-up">
        <div className="flex items-center justify-center gap-3"><span className="text-3xl animate-pulse-xp">⚡</span><div><p className="font-display font-800 text-2xl text-amber-700">+{xpEarned} XP</p>{perfectBonus&&<p className="text-xs font-bold text-amber-600">Includes +25 perfect bonus!</p>}</div></div>
      </div>

      {docsReferenced?.length>0 && <p className="text-xs text-gray-400 text-center mb-4">📚 Drew from: {docsReferenced.map(d=>d.filename).join(', ')}</p>}

      <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{animationDelay:'0.1s'}}>
        <div className="card text-center py-3"><p className="text-xs text-gray-400 font-semibold">Total XP</p><p className="font-display font-800 text-lg">{user?.xp||0}</p></div>
        <div className="card text-center py-3"><p className="text-xs text-gray-400 font-semibold">Level</p><p className="font-display font-800 text-lg">{user?.level||1}</p></div>
        <div className="card text-center py-3"><p className="text-xs text-gray-400 font-semibold">Streak</p><p className="font-display font-800 text-lg">🔥 {user?.streak||0}</p></div>
      </div>

      <button onClick={()=>setShowDetails(!showDetails)} className="w-full btn-secondary mb-4 text-sm">{showDetails?'Hide Answers':'Review Answers'}</button>
      {showDetails && (
        <div className="space-y-3 mb-6 animate-slide-up">
          {results?.map((r,i)=>(
            <div key={i} className={`card py-3 px-4 border-l-4 ${r.isCorrect?'border-l-lime-400':'border-l-coral'}`}>
              <div className="flex items-start gap-2"><span className="mt-0.5">{r.isCorrect?'✅':'❌'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-700">{r.question}</p>
                  {!r.isCorrect&&<p className="text-xs text-gray-500 mt-1">Your answer: <span className="text-coral font-medium">{r.userAnswer||'(none)'}</span> · Correct: <span className="text-lime-600 font-medium">{r.answer}</span></p>}
                  {r.explanation&&<p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{r.explanation}</p>}
                  {/* Flag available on results review too */}
                  <FlagButton question={r} topic={topic||null}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <button onClick={onBack} className="btn-primary w-full text-base">Back to Dashboard</button>
    </div>
  );
}
