import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, Flame, Sprout } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const RANK_ICONS = [
  { Icon: Trophy, color: 'text-amber-500' },
  { Icon: Medal, color: 'text-gray-400' },
  { Icon: Award, color: 'text-amber-700' },
];

export default function Leaderboard() {
  const [leaders, setLeaders] = useState([]);
  const { user } = useAuth();
  useEffect(() => { api.leaderboard().then(setLeaders).catch(() => {}); }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
          <Trophy size={22} className="text-amber-500" />
        </div>
        <h1 className="font-display font-800 text-2xl text-gray-900">Leaderboard</h1>
        <p className="text-sm text-gray-500 font-medium">Top learners this season</p>
      </div>
      <div className="space-y-2">
        {leaders.map((l, i) => {
          const isMe = l.id === user?.id;
          const rank = RANK_ICONS[i];
          return (
            <div key={l.id} className={`card flex items-center gap-4 py-4 ${isMe ? 'border-lime-300 bg-lime-50/50' : ''}`}>
              <div className="w-8 text-center shrink-0">{rank ? <rank.Icon size={20} className={rank.color} /> : <span className="font-display font-700 text-lg text-gray-300">{i + 1}</span>}</div>
              <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold text-sm shrink-0">{l.username[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{l.username} {isMe && <span className="text-xs text-lime-600 font-medium">(you)</span>}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1">Level {l.level} · <Flame size={11} className="text-orange-500" /> {l.streak} day streak</p>
              </div>
              <div className="text-right shrink-0"><p className="font-display font-700 text-lg text-amber-600">{l.xp.toLocaleString()}</p><p className="text-xs text-gray-400">XP</p></div>
            </div>
          );
        })}
        {leaders.length === 0 && <div className="card text-center py-12"><Sprout className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 font-medium text-sm">Be the first on the leaderboard!</p></div>}
      </div>
    </div>
  );
}
