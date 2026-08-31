import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

function ResetPasswordForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ email: '', masterKey: '', newPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await api.resetPassword(form);
      setSuccess(true);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  if (success) {
    return (
      <div className="text-center py-4">
        <p className="text-3xl mb-2">✅</p>
        <p className="font-bold text-gray-700 mb-1">Password reset</p>
        <p className="text-sm text-gray-400 mb-4">You can log in with your new password now.</p>
        <button onClick={onDone} className="btn-primary w-full text-sm">Back to Log in</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-500 mb-1">Ask your admin for the master key to reset your password.</p>
      <input type="email" placeholder="Your account email" className="input-field" value={form.email} onChange={e=>setForm({...form, email: e.target.value})} required/>
      <input type="password" placeholder="Master key" className="input-field" value={form.masterKey} onChange={e=>setForm({...form, masterKey: e.target.value})} required/>
      <input type="password" placeholder="New password" className="input-field" value={form.newPassword} onChange={e=>setForm({...form, newPassword: e.target.value})} required minLength={4}/>
      {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-xl">{error}</div>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 text-sm">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1 text-sm">{loading ? 'Resetting...' : 'Reset Password'}</button>
      </div>
    </form>
  );
}

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [showReset, setShowReset] = useState(false);
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
        <h1 className="font-display font-900 text-4xl md:text-5xl text-gray-800 mb-3">Swaruchi</h1>
        <p className="text-gray-500 text-lg max-w-sm mx-auto">Built for HRRL. Upload any PDF. Learn it through AI-powered quizzes. Level up.</p>
      </div>
      <div className="w-full max-w-sm animate-slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="card shadow-lg">
          {showReset ? (
            <>
              <p className="font-display font-800 text-lg text-gray-800 mb-4">Reset Password</p>
              <ResetPasswordForm onDone={()=>{setShowReset(false); setIsLogin(true);}} onCancel={()=>setShowReset(false)}/>
            </>
          ) : (
            <>
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
              {isLogin && (
                <button onClick={()=>setShowReset(true)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-medium mt-3">Forgot password?</button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex gap-8 mt-12 text-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
        {[['📄','Upload PDFs'],['🤖','AI Quizzes'],['⚡','Earn XP'],['🏆','Compete']].map(([icon, label]) => (
          <div key={label} className="flex flex-col items-center gap-1"><span className="text-2xl">{icon}</span><span className="text-xs font-semibold text-gray-500">{label}</span></div>
        ))}
      </div>
    </div>
  );
}
