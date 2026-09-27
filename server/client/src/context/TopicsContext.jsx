import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const TopicsContext = createContext(null);

export function TopicsProvider({ children }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setTopics(await api.getTopics()); } catch { /* keep previous tree on failure */ }
  }, []);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  return <TopicsContext.Provider value={{ topics, loading, refresh }}>{children}</TopicsContext.Provider>;
}

export const useTopics = () => useContext(TopicsContext);
