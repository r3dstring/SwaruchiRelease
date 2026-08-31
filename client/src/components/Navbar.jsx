import { useState } from 'react';
import { Home, Flame, Trophy, Flag, FolderTree, Target, QrCode, Zap, Menu, X, LogOut } from 'lucide-react';
import { useAuth, useIsAdmin } from '../context/AuthContext';

const LEVEL_TITLES = ['', 'Novice', 'Learner', 'Scholar', 'Expert', 'Sage', 'Wizard', 'Legend', 'Titan', 'Mythic', 'Apex'];

export default function Navbar({ onNavigate, currentPage }) {
  const { user, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = [
    { page: 'dashboard', label: 'Home', icon: Home },
    { page: 'knowledge', label: 'Progress', icon: Flame },
    { page: 'leaderboard', label: 'Rankings', icon: Trophy },
    ...(isAdmin ? [
      { page: 'flags', label: 'Flags', icon: Flag },
      { page: 'topics', label: 'Topics', icon: FolderTree },
      { page: 'custom-quiz', label: 'Custom Quiz', icon: Target },
    ] : []),
  ];

  const go = (page) => { onNavigate(page); setMobileOpen(false); setProfileOpen(false); };
  const joinQuiz = () => { window.location.href = `${window.location.origin}/?join=true`; };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <button onClick={() => go('dashboard')} className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-lime-500 flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-white" strokeWidth={2.5} size={18} />
          </div>
          <span className="font-display font-800 text-lg text-gray-900">Swaruchi</span>
          <span className="hidden sm:inline-block text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded tracking-wide">HRRL</span>
        </button>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.page} onClick={() => go(item.page)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentPage === item.page ? 'bg-lime-50 text-lime-700' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </button>
            );
          })}

          <button onClick={joinQuiz} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white bg-lime-500 hover:bg-lime-600 transition-colors">
            <QrCode size={15} strokeWidth={2} />
            Join a Quiz
          </button>

          <div className="h-6 w-px bg-gray-200 mx-2" />
          <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg">
            <Zap size={14} className="text-amber-600" strokeWidth={2.5} />
            <span className="text-sm font-bold text-amber-700">{user?.xp || 0}</span>
          </div>
          {(user?.streak || 0) > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-lg">
              <Flame size={14} className="text-orange-500" strokeWidth={2.5} />
              <span className="text-sm font-bold text-orange-600">{user.streak}</span>
            </div>
          )}

          <div className="relative">
            <button onClick={() => setProfileOpen(o => !o)} className="flex items-center gap-1.5 ml-1">
              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold text-xs">{user?.username?.[0]?.toUpperCase() || '?'}</div>
              {isAdmin && <span className="text-xs font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Admin</span>}
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50">
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <p className="font-semibold text-sm text-gray-900">{user?.username}</p>
                    <p className="text-xs text-gray-500">Level {user?.level} · {LEVEL_TITLES[Math.min(user?.level || 1, 10)]}</p>
                  </div>
                  <button onClick={logout} className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium">
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile: stats + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg">
            <Zap size={12} className="text-amber-600" />
            <span className="text-xs font-bold text-amber-700">{user?.xp || 0}</span>
          </div>
          <button onClick={() => setMobileOpen(o => !o)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors" aria-label="Menu">
            {mobileOpen ? <X size={20} className="text-gray-700" /> : <Menu size={20} className="text-gray-700" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.page} onClick={() => go(item.page)}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${currentPage === item.page ? 'bg-lime-50 text-lime-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                <Icon size={17} strokeWidth={2} /> {item.label}
              </button>
            );
          })}

          <button onClick={joinQuiz} className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-lime-500">
            <QrCode size={17} strokeWidth={2} /> Join a Quiz
          </button>

          <div className="h-px bg-gray-100 my-2" />

          {(user?.streak || 0) > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Flame size={15} className="text-orange-500" />
              <span className="text-sm font-semibold text-orange-600">{user.streak} day streak</span>
            </div>
          )}

          <div className="flex items-center gap-3 px-3 py-2 mt-1">
            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold text-sm shrink-0">{user?.username?.[0]?.toUpperCase() || '?'}</div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 truncate">{user?.username} {isAdmin && <span className="text-purple-700">· Admin</span>}</p>
              <p className="text-xs text-gray-500">Level {user?.level} · {LEVEL_TITLES[Math.min(user?.level || 1, 10)]}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors font-medium">
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}
    </nav>
  );
}
