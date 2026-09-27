import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshUser = useCallback(async () => {
    try { setUser(await api.me()); } catch { localStorage.removeItem('qf_token'); setUser(null); }
  }, []);
  useEffect(() => {
    if (localStorage.getItem('qf_token')) refreshUser().finally(() => setLoading(false));
    else setLoading(false);
  }, [refreshUser]);

  const login = async (email, password) => { const { token, user } = await api.login({ email, password }); localStorage.setItem('qf_token', token); setUser(user); };
  const signup = async (username, email, password) => { const { token, user } = await api.signup({ username, email, password }); localStorage.setItem('qf_token', token); setUser(user); };
  const logout = () => { localStorage.removeItem('qf_token'); setUser(null); };

  return <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useIsAdmin = () => useContext(AuthContext)?.user?.role === 'admin';
