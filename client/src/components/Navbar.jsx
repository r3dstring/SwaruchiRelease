import { useAuth, useIsAdmin } from '../context/AuthContext';
const LEVEL_TITLES = ['','Novice','Learner','Scholar','Expert','Sage','Wizard','Legend','Titan','Mythic','Apex'];

export default function Navbar({ onNavigate, currentPage }) {
  const { user, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const link = (page, label) => (
    <button onClick={() => onNavigate(page)} className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${currentPage===page ? 'bg-lime-400/10 text-lime-600' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
  );
  return (
    <nav className="bg-white border-b-2 border-gray-100 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 group">
          <span className="text-2xl">🧠</span>
          <span className="font-display font-900 text-xl text-gray-800 group-hover:text-lime-500 transition-colors">QuizForge</span>
        </button>
        <div className="flex items-center gap-2">
          {link('dashboard', 'Home')}
          {link('knowledge', '🗺️ Map')}
          {link('leaderboard', '🏆 Ranks')}
          {isAdmin && link('flags', '🚩 Flags')}
          <div className="h-6 w-px bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5 bg-golden/10 px-3 py-1.5 rounded-xl"><span className="text-sm">⚡</span><span className="text-sm font-bold text-amber-700">{user?.xp||0}</span></div>
          {(user?.streak||0) > 0 && <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl"><span className="text-sm">🔥</span><span className="text-sm font-bold text-orange-600">{user.streak}</span></div>}
          <div className="relative group">
            <button className="flex items-center gap-1.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">{user?.username?.[0]?.toUpperCase()||'?'}</div>
              {isAdmin && <span className="text-xs font-bold text-purple-600 bg-grape/10 px-1.5 py-0.5 rounded-lg">Admin</span>}
            </button>
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border-2 border-gray-100 shadow-lg py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="font-bold text-sm">{user?.username}</p>
                <p className="text-xs text-gray-500">Level {user?.level} {LEVEL_TITLES[Math.min(user?.level||1,10)]} {isAdmin && '· Admin'}</p>
              </div>
              <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors font-medium">Log out</button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
