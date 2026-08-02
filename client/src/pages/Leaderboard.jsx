import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const { user } = useAuth();
  useEffect(() => { api.leaderboard().then(setLeaders).catch(() => {}); }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="text-center mb-8"><span className="text-5xl">🏆</span><h1 className="font-display font-900 text-2xl text-gray-800 mt-2">Leaderboard</h1><p className="text-sm text-gray-400 font-medium">Top learners this season</p></div>
      <div className="space-y-2">
        {leaders.map((l, i) => {
          const isMe = l.id === user?.id;
          return (
            <div key={l.id} className={`card flex items-center gap-4 py-4 transition-all ${isMe ? 'border-lime-400 bg-owl-50 ring-2 ring-lime-400/20' : ''} ${i < 3 ? 'border-amber-200/50' : ''}`}>
              <div className="w-10 text-center shrink-0">{i < 3 ? <span className="text-2xl">{MEDALS[i]}</span> : <span className="font-display font-800 text-lg text-gray-400">{i + 1}</span>}</div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${i === 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-500' : i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400' : i === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700' : 'bg-gradient-to-br from-lime-400 to-emerald-500'}`}>{l.username[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0"><p className="font-bold text-gray-700 truncate">{l.username} {isMe && <span className="text-xs text-lime-600">(you)</span>}</p><p className="text-xs text-gray-400">Level {l.level} · 🔥 {l.streak} day streak</p></div>
              <div className="text-right shrink-0"><p className="font-display font-800 text-lg text-amber-600">{l.xp.toLocaleString()}</p><p className="text-xs text-gray-400">XP</p></div>
            </div>
          );
        })}
        {leaders.length === 0 && <div className="card text-center py-12"><p className="text-3xl mb-2">🌱</p><p className="text-gray-400 font-medium">Be the first on the leaderboard!</p></div>}
      </div>
    </div>
  );
}
