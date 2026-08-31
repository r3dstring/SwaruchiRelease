import { useState, useEffect } from 'react';
import { api } from '../api';
import { useTopics } from '../context/TopicsContext';

const TREND_ICON = { improving: '📈', stable: '➡️', declining: '📉' };
const TREND_LABEL = { improving: 'Improving', stable: 'Stable', declining: 'Declining' };

function timeAgo(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// Continuous color interpolation: red -> amber -> lime, driven by accuracy 0-100.
// This is what makes it an actual heatmap instead of three fixed traffic-light colors.
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function heatColor(accuracy) {
  const RED = hexToRgb('#FF4B4B'), AMBER = hexToRgb('#FFC800'), LIME = hexToRgb('#58CC02');
  let from, to, t;
  if (accuracy <= 50) { from = RED; to = AMBER; t = accuracy / 50; }
  else { from = AMBER; to = LIME; t = (accuracy - 50) / 50; }
  const [r, g, b] = [lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t)];
  return `rgb(${r}, ${g}, ${b})`;
}

function OverallRing({ pct }) {
  const size = 96, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={heatColor(pct)} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct/100)*c}
          className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-900 text-xl text-gray-800">{pct}%</span>
        <span className="text-[10px] text-gray-400 font-semibold -mt-0.5">mastery</span>
      </div>
    </div>
  );
}

export default function KnowledgeMap() {
  const { topics } = useTopics();
  const [progress, setProgress] = useState([]);
  const [activeLeaf, setActiveLeaf] = useState(null); // { branch, leaf, data }

  useEffect(() => { api.topicProgress().then(setProgress).catch(() => {}); }, []);

  const byTopic = Object.fromEntries(progress.map(p => [p.topic, p]));
  const totalLeaves = topics.reduce((n, b) => n + b.children.length, 0) || 1;
  const practicedCount = progress.length;
  const masteredCount = progress.filter(p => p.mastery === 'mastered').length;
  const weakCount = progress.filter(p => p.mastery === 'weak').length;

  // Overall mastery: average accuracy across practiced topics, weighted toward
  // completeness (unpracticed topics pull the ring down, encouraging coverage)
  const avgAccuracy = practicedCount > 0
    ? Math.round(progress.reduce((s, p) => s + p.accuracy, 0) / practicedCount)
    : 0;
  const overallPct = Math.round((avgAccuracy * practicedCount) / totalLeaves) || (practicedCount > 0 ? avgAccuracy : 0);

  const handleTileClick = (branch, leaf) => {
    const data = byTopic[leaf.label] || null;
    setActiveLeaf({ branch, leaf, data });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <span className="text-5xl">🔥</span>
        <h1 className="font-display font-900 text-2xl text-gray-800 mt-2">Knowledge Heatmap</h1>
        <p className="text-sm text-gray-400 font-medium">Tap any tile to see the details</p>
      </div>

      {/* Summary row with ring */}
      <div className="card flex items-center gap-5 mb-6">
        <OverallRing pct={overallPct} />
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="font-display font-800 text-xl text-lime-600">{masteredCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Mastered</p>
          </div>
          <div className="text-center">
            <p className="font-display font-800 text-xl text-gray-700">{practicedCount}<span className="text-gray-300">/{totalLeaves}</span></p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Practiced</p>
          </div>
          <div className="text-center">
            <p className="font-display font-800 text-xl text-coral">{weakCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Weak</p>
          </div>
        </div>
      </div>

      {/* Active tile detail panel */}
      {activeLeaf && (
        <div className="card mb-6 border-2 animate-slide-up" style={{ borderColor: activeLeaf.data ? heatColor(activeLeaf.data.accuracy) : '#E5E7EB' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-semibold mb-0.5">{activeLeaf.branch.icon} {activeLeaf.branch.label}</p>
              <p className="font-display font-800 text-gray-800">{activeLeaf.leaf.label}</p>
            </div>
            <button onClick={() => setActiveLeaf(null)} className="text-gray-300 hover:text-gray-500 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          {activeLeaf.data ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div><p className="font-display font-800 text-lg" style={{ color: heatColor(activeLeaf.data.accuracy) }}>{activeLeaf.data.accuracy}%</p><p className="text-[11px] text-gray-400 font-semibold">Accuracy</p></div>
              <div><p className="font-display font-800 text-lg text-gray-700">{activeLeaf.data.attempted}</p><p className="text-[11px] text-gray-400 font-semibold">Attempted</p></div>
              <div><p className="font-display font-800 text-lg text-gray-700">{timeAgo(activeLeaf.data.last_practiced)}</p><p className="text-[11px] text-gray-400 font-semibold">Last practiced</p></div>
              <div><p className="text-lg">{TREND_ICON[activeLeaf.data.trend]}</p><p className="text-[11px] text-gray-400 font-semibold">{TREND_LABEL[activeLeaf.data.trend]}</p></div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-3">Not practiced yet — take a quiz on this topic to fill it in.</p>
          )}
        </div>
      )}

      {/* Heatmap grid, grouped by branch */}
      <div className="space-y-6">
        {topics.map(branch => (
          <div key={branch.id}>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-lg">{branch.icon}</span>
              <h2 className="font-display font-800 text-sm text-gray-700">{branch.label}</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {branch.children.map(leaf => {
                const p = byTopic[leaf.label];
                const isActive = activeLeaf?.leaf.id === leaf.id;
                const color = p ? heatColor(p.accuracy) : null;
                return (
                  <button
                    key={leaf.id}
                    onClick={() => handleTileClick(branch, leaf)}
                    className={`relative aspect-square rounded-2xl p-2.5 flex flex-col items-start justify-between text-left transition-all duration-200 ${
                      isActive ? 'ring-2 ring-offset-2 ring-gray-400 scale-[0.97]' : 'hover:scale-[1.03]'
                    } ${!p ? 'border-2 border-dashed border-gray-200 bg-gray-50' : ''}`}
                    style={p ? { backgroundColor: color, boxShadow: `0 4px 12px -2px ${color}66` } : {}}
                  >
                    <span className={`text-[10px] font-bold leading-tight line-clamp-3 ${p ? 'text-white/95' : 'text-gray-400'}`}>
                      {leaf.label}
                    </span>
                    {p ? (
                      <span className="text-white font-display font-900 text-sm self-end drop-shadow">{p.accuracy}%</span>
                    ) : (
                      <span className="text-gray-300 text-[10px] font-semibold self-end">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {topics.length === 0 && (
        <div className="card text-center py-12"><p className="text-3xl mb-2">🗂️</p><p className="text-gray-400 font-medium">No topics configured yet</p></div>
      )}

      {/* Gradient legend */}
      <div className="mt-8 mb-2">
        <div className="h-2.5 rounded-full w-full" style={{ background: 'linear-gradient(90deg, #FF4B4B, #FFC800, #58CC02)' }} />
        <div className="flex justify-between text-[11px] text-gray-400 font-semibold mt-1.5">
          <span>Weak</span>
          <span>Developing</span>
          <span>Mastered</span>
        </div>
      </div>
      <p className="text-center text-[11px] text-gray-300 font-medium">Dashed tiles = not yet practiced</p>
    </div>
  );
}
