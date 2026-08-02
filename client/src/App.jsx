import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Quiz from './pages/Quiz';
import Results from './pages/Results';
import Leaderboard from './pages/Leaderboard';
import KnowledgeMap from './pages/KnowledgeMap';
import FlaggedQuestions from './pages/FlaggedQuestions';

function AppInner() {
  const { user, loading, refreshUser } = useAuth();
  const [page, setPage] = useState('dashboard');
  const [quizSettings, setQuizSettings] = useState(null);
  const [quizResult, setQuizResult] = useState(null);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-3 h-3 bg-lime-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}</div></div>;
  if (!user) return <Auth/>;

  const handleStartQuiz = (settings) => { setQuizSettings(settings); setQuizResult(null); setPage('quiz'); };
  const handleQuizFinish = (result) => { setQuizResult(result); setPage('results'); refreshUser(); };
  const handleBack = () => { setPage('dashboard'); setQuizSettings(null); setQuizResult(null); refreshUser(); };

  return (
    <div className="min-h-screen bg-gray-50">
      {page!=='quiz' && <Navbar onNavigate={setPage} currentPage={page}/>}
      {page==='dashboard' && <Dashboard onStartQuiz={handleStartQuiz}/>}
      {page==='quiz' && quizSettings && <Quiz settings={quizSettings} onFinish={handleQuizFinish} onBack={handleBack}/>}
      {page==='results' && quizResult && <Results result={quizResult} onBack={handleBack}/>}
      {page==='leaderboard' && <Leaderboard/>}
      {page==='knowledge' && <KnowledgeMap/>}
      {page==='flags' && <FlaggedQuestions/>}
    </div>
  );
}

export default function App() { return <AuthProvider><AppInner/></AuthProvider>; }
