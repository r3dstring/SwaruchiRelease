import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { if (isLogin) await login(form.email, form.password); else await signup(form.username, form.email, form.password); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-owl-50 to-white flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8 animate-slide-up">
        <div className="text-6xl mb-4">🧠</div>
        <h1 className="font-display font-900 text-4xl md:text-5xl text-gray-800 mb-3">Quiz<span className="text-lime-400">Forge</span></h1>
        <p className="text-gray-500 text-lg max-w-sm mx-auto">Upload any PDF. Learn it through AI-powered quizzes. Level up.</p>
      </div>
      <div className="w-full max-w-sm animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="card shadow-lg">
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button onClick={() => { setIsLogin(true); setError(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${isLogin ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>Log in</button>
            <button onClick={() => { setIsLogin(false); setError(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!isLogin ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>Sign up</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && <input type="text" placeholder="Pick a username" className="input-field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required={!isLogin} />}
            <input type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input type="password" placeholder="Password" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={4} />
            {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-xl">{error}</div>}
            <button type="submit" className="btn-primary w-full text-base" disabled={loading}>{loading ? 'Hold on...' : isLogin ? 'Log in' : 'Create account'}</button>
          </form>
        </div>
        <p className="text-center text-sm text-gray-400 mt-4">Demo? Sign up with any email. No verification needed.</p>
      </div>
      <div className="flex gap-8 mt-12 text-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
        {[['📄','Upload PDFs'],['🤖','AI Quizzes'],['⚡','Earn XP'],['🏆','Compete']].map(([icon, label]) => (
          <div key={label} className="flex flex-col items-center gap-1"><span className="text-2xl">{icon}</span><span className="text-xs font-semibold text-gray-500">{label}</span></div>
        ))}
      </div>
    </div>
  );
}
