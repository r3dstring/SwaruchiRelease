import { useState } from 'react';
import { useAuth, useIsAdmin } from '../context/AuthContext';

const LEVEL_TITLES = ['', 'Novice', 'Learner', 'Scholar', 'Expert', 'Sage', 'Wizard', 'Legend', 'Titan', 'Mythic', 'Apex'];

export default function Navbar({ onNavigate, currentPage }) {
  const { user, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = [
    { page: 'dashboard', label: 'Home' },
    { page: 'knowledge', label: '🔥 Heatmap' },
    { page: 'leaderboard', label: '🏆 Ranks' },
    ...(isAdmin ? [
      { page: 'flags', label: '🚩 Flags' },
      { page: 'topics', label: '🗂️ Topics' },
      { page: 'custom-quiz', label: '🎯 Custom Quiz' },
    ] : []),
  ];

  const go = (page) => { onNavigate(page); setMobileOpen(false); setProfileOpen(false); };

  return (
    <nav className="bg-white border-b-2 border-gray-100 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <button onClick={() => go('dashboard')} className="flex items-center gap-2 group shrink-0">
          <span className="text-2xl">🧠</span>
          <span className="font-display font-900 text-xl text-gray-800 group-hover:text-lime-500 transition-colors">Swaruchi</span>
          <span className="hidden sm:inline-block text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md tracking-wide">HRRL</span>
        </button>

        {/* Desktop nav — hidden below md breakpoint */}
        <div className="hidden md:flex items-center gap-2">
          {navItems.map(item => (
            <button key={item.page} onClick={() => go(item.page)}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${currentPage === item.page ? 'bg-lime-400/10 text-lime-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {item.label}
            </button>
          ))}
          <div className="h-6 w-px bg-gray-200 mx-1" />
          <div className="flex items-center gap-1.5 bg-golden/10 px-3 py-1.5 rounded-xl"><span className="text-sm">⚡</span><span className="text-sm font-bold text-amber-700">{user?.xp || 0}</span></div>
          {(user?.streak || 0) > 0 && <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl"><span className="text-sm">🔥</span><span className="text-sm font-bold text-orange-600">{user.streak}</span></div>}

          {/* Profile — click-toggle, not hover, so it behaves the same on touch and desktop */}
          <div className="relative">
            <button onClick={() => setProfileOpen(o => !o)} className="flex items-center gap-1.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">{user?.username?.[0]?.toUpperCase() || '?'}</div>
              {isAdmin && <span className="text-xs font-bold text-purple-600 bg-grape/10 px-1.5 py-0.5 rounded-lg">Admin</span>}
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border-2 border-gray-100 shadow-lg py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="font-bold text-sm">{user?.username}</p>
                    <p className="text-xs text-gray-500">Level {user?.level} {LEVEL_TITLES[Math.min(user?.level || 1, 10)]} {isAdmin && '· Admin'}</p>
                  </div>
                  <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors font-medium">Log out</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile: compact stats + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <div className="flex items-center gap-1 bg-golden/10 px-2 py-1 rounded-lg"><span className="text-xs">⚡</span><span className="text-xs font-bold text-amber-700">{user?.xp || 0}</span></div>
          <button onClick={() => setMobileOpen(o => !o)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors" aria-label="Menu">
            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {mobileOpen && (
        <div className="md:hidden border-t-2 border-gray-100 bg-white px-4 py-3 space-y-1">
          {navItems.map(item => (
            <button key={item.page} onClick={() => go(item.page)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${currentPage === item.page ? 'bg-lime-400/10 text-lime-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              {item.label}
            </button>
          ))}

          <div className="flex items-center gap-2 px-3 py-2">
            {(user?.streak || 0) > 0 && <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-xl"><span className="text-sm">🔥</span><span className="text-sm font-bold text-orange-600">{user.streak} day streak</span></div>}
          </div>

          <div className="h-px bg-gray-100 my-2" />

          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0">{user?.username?.[0]?.toUpperCase() || '?'}</div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-gray-800 truncate">{user?.username} {isAdmin && <span className="text-purple-600">· Admin</span>}</p>
              <p className="text-xs text-gray-500">Level {user?.level} {LEVEL_TITLES[Math.min(user?.level || 1, 10)]}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full text-left px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors font-medium">Log out</button>
        </div>
      )}
    </nav>
  );
}
