import { useState } from 'react';
import { Zap, FileText, Sparkles, Trophy, CheckCircle2, QrCode, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

function ResetPasswordForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ email: '', masterKey: '', newPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try { await api.resetPassword(form); setSuccess(true); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  if (success) {
    return (
      <div className="text-center py-4">
        <CheckCircle2 className="w-10 h-10 text-lime-500 mx-auto mb-2" />
        <p className="font-semibold text-gray-800 mb-1">Password reset</p>
        <p className="text-sm text-gray-500 mb-4">You can log in with your new password now.</p>
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
      {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-lg">{error}</div>}
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

  const joinQuiz = () => { window.location.href = `${window.location.origin}/?join=true`; };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-lime-500 flex items-center justify-center mx-auto mb-4">
          <Zap className="text-white" size={24} strokeWidth={2.5} />
        </div>
        <h1 className="font-display font-800 text-3xl text-gray-900 mb-2">Swaruchi</h1>
        <p className="text-gray-500 max-w-sm mx-auto">Built for HRRL — learn from your training documents through AI-generated quizzes.</p>
      </div>

      {/* Prominent Join a Quiz entry point — no account needed */}
      <button onClick={joinQuiz} className="w-full max-w-sm bg-white border-2 border-sky/30 hover:border-sky/60 rounded-xl p-4 mb-4 flex items-center gap-3 transition-colors group">
        <div className="w-10 h-10 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
          <QrCode size={20} className="text-sky" />
        </div>
        <div className="text-left flex-1">
          <p className="font-semibold text-gray-900 text-sm">Joining a training session?</p>
          <p className="text-xs text-gray-500">Enter a quiz code — no account needed</p>
        </div>
        <ArrowRight size={18} className="text-gray-300 group-hover:text-sky transition-colors" />
      </button>

      <div className="w-full max-w-sm flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 font-medium">OR SIGN IN</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <div className="w-full max-w-sm">
        <div className="card shadow-sm">
          {showReset ? (
            <>
              <p className="font-display font-700 text-lg text-gray-900 mb-4">Reset Password</p>
              <ResetPasswordForm onDone={()=>{setShowReset(false); setIsLogin(true);}} onCancel={()=>setShowReset(false)}/>
            </>
          ) : (
            <>
              <div className="flex bg-gray-100 rounded-lg p-1 mb-5">
                <button onClick={() => { setIsLogin(true); setError(''); }} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Log in</button>
                <button onClick={() => { setIsLogin(false); setError(''); }} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${!isLogin ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Sign up</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                {!isLogin && <input type="text" placeholder="Pick a username" className="input-field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required={!isLogin} />}
                <input type="email" placeholder="Email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <input type="password" placeholder="Password" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={4} />
                {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-lg">{error}</div>}
                <button type="submit" className="btn-primary w-full text-sm" disabled={loading}>{loading ? 'Hold on...' : isLogin ? 'Log in' : 'Create account'}</button>
              </form>
              {isLogin && (
                <button onClick={()=>setShowReset(true)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-medium mt-3">Forgot password?</button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-8 mt-10">
        {[[FileText,'Upload PDFs'],[Sparkles,'AI Quizzes'],[Zap,'Earn XP'],[Trophy,'Compete']].map(([Icon, label]) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <Icon size={20} className="text-gray-400" strokeWidth={1.75} />
            <span className="text-xs font-medium text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
