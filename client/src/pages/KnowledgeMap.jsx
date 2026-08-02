import { useState, useEffect } from 'react';
import { api } from '../api';
import { TOPIC_TREE } from '../topicTree';

const MASTERY = {
  mastered: { dot: '🟢', label: 'Mastered', text: 'text-lime-600', bg: 'bg-lime-400/10' },
  revision: { dot: '🟡', label: 'Needs Revision', text: 'text-amber-600', bg: 'bg-golden/10' },
  weak: { dot: '🔴', label: 'Weak Area', text: 'text-coral', bg: 'bg-red-50' },
  untested: { dot: '⚪', label: 'Not practiced', text: 'text-gray-400', bg: 'bg-gray-50' },
};

const TREND = { improving: '📈 Improving', stable: '➡️ Stable', declining: '📉 Declining' };

function timeAgo(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export default function KnowledgeMap() {
  const [progress, setProgress] = useState([]);
  const [expanded, setExpanded] = useState(() => Object.fromEntries(TOPIC_TREE.map(b => [b.id, true])));

  useEffect(() => { api.topicProgress().then(setProgress).catch(() => {}); }, []);

  const byTopic = Object.fromEntries(progress.map(p => [p.topic, p]));

  // Branch-level mastery: worst status among practiced children
  const branchStatus = (branch) => {
    const practiced = branch.children.map(c => byTopic[c.label]).filter(Boolean);
    if (practiced.length === 0) return 'untested';
    if (practiced.some(p => p.mastery === 'weak')) return 'weak';
    if (practiced.some(p => p.mastery === 'revision')) return 'revision';
    return 'mastered';
  };

  const practiced = progress.length;
  const masteredCount = progress.filter(p => p.mastery === 'mastered').length;
  const weakCount = progress.filter(p => p.mastery === 'weak').length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <span className="text-5xl">🗺️</span>
        <h1 className="font-display font-900 text-2xl text-gray-800 mt-2">Knowledge Map</h1>
        <p className="text-sm text-gray-400 font-medium">Your mastery across the refinery knowledge tree</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card text-center py-3"><p className="text-2xl">🟢</p><p className="font-display font-800 text-lg">{masteredCount}</p><p className="text-xs text-gray-400 font-semibold">Mastered</p></div>
        <div className="card text-center py-3"><p className="text-2xl">📚</p><p className="font-display font-800 text-lg">{practiced}<span className="text-gray-300">/26</span></p><p className="text-xs text-gray-400 font-semibold">Practiced</p></div>
        <div className="card text-center py-3"><p className="text-2xl">🔴</p><p className="font-display font-800 text-lg">{weakCount}</p><p className="text-xs text-gray-400 font-semibold">Weak Areas</p></div>
      </div>

      {/* Tree */}
      <div className="space-y-2">
        {TOPIC_TREE.map(branch => {
          const isOpen = expanded[branch.id];
          const bStatus = branchStatus(branch);
          return (
            <div key={branch.id} className="card p-0 overflow-hidden">
              <button onClick={() => setExpanded(prev => ({ ...prev, [branch.id]: !prev[branch.id] }))}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors">
                <span className="text-xl">{branch.icon}</span>
                <span className="font-display font-800 text-gray-800 flex-1 text-left">{branch.label}</span>
                <span className="text-lg">{MASTERY[bStatus].dot}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">
                  {branch.children.map(leaf => {
                    const p = byTopic[leaf.label];
                    const status = p ? p.mastery : 'untested';
                    const m = MASTERY[status];
                    return (
                      <div key={leaf.id} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-b-0">
                        <span className="text-base ml-6">{m.dot}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate">{leaf.label}</p>
                          {p ? (
                            <p className="text-xs text-gray-400">
                              {p.attempted} attempted · last practiced {timeAgo(p.last_practiced)} · {TREND[p.trend]}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-300">Not practiced yet</p>
                          )}
                        </div>
                        {p && (
                          <span className={`text-sm font-bold px-2.5 py-1 rounded-lg shrink-0 ${m.bg} ${m.text}`}>{p.accuracy}%</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 mt-6 text-xs font-medium text-gray-500">
        <span>🟢 ≥80%</span><span>🟡 50–79%</span><span>🔴 &lt;50%</span><span>⚪ Untested</span>
      </div>
    </div>
  );
}
