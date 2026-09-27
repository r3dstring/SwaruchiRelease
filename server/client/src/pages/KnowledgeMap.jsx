import { useState, useEffect } from 'react';
import { Flame, TrendingUp, Minus, TrendingDown, X, FolderTree } from 'lucide-react';
import { api } from '../api';
import { useTopics } from '../context/TopicsContext';

const TREND_META = {
  improving: { Icon: TrendingUp, label: 'Improving' },
  stable: { Icon: Minus, label: 'Stable' },
  declining: { Icon: TrendingDown, label: 'Declining' },
};

function timeAgo(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

// Continuous color interpolation: red -> amber -> lime, driven by accuracy 0-100.
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
        <span className="font-display font-800 text-xl text-gray-900">{pct}%</span>
        <span className="text-[10px] text-gray-400 font-semibold -mt-0.5">mastery</span>
      </div>
    </div>
  );
}

export default function KnowledgeMap() {
  const { topics } = useTopics();
  const [progress, setProgress] = useState([]);
  const [activeLeaf, setActiveLeaf] = useState(null);

  useEffect(() => { api.topicProgress().then(setProgress).catch(() => {}); }, []);

  const byTopic = Object.fromEntries(progress.map(p => [p.topic, p]));
  const totalLeaves = topics.reduce((n, b) => n + b.children.length, 0) || 1;
  const practicedCount = progress.length;
  const masteredCount = progress.filter(p => p.mastery === 'mastered').length;
  const weakCount = progress.filter(p => p.mastery === 'weak').length;

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
        <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center mx-auto mb-3">
          <Flame size={22} className="text-orange-500" />
        </div>
        <h1 className="font-display font-800 text-2xl text-gray-900">Knowledge Heatmap</h1>
        <p className="text-sm text-gray-500 font-medium">Tap any tile to see the details</p>
      </div>

      <div className="card flex items-center gap-5 mb-6">
        <OverallRing pct={overallPct} />
        <div className="flex-1 grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="font-display font-700 text-xl text-lime-600">{masteredCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Mastered</p>
          </div>
          <div className="text-center">
            <p className="font-display font-700 text-xl text-gray-700">{practicedCount}<span className="text-gray-300">/{totalLeaves}</span></p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Practiced</p>
          </div>
          <div className="text-center">
            <p className="font-display font-700 text-xl text-coral">{weakCount}</p>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Weak</p>
          </div>
        </div>
      </div>

      {activeLeaf && (
        <div className="card mb-6 border-2" style={{ borderColor: activeLeaf.data ? heatColor(activeLeaf.data.accuracy) : '#E5E7EB' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-semibold mb-0.5">{activeLeaf.branch.label}</p>
              <p className="font-display font-700 text-gray-900">{activeLeaf.leaf.label}</p>
            </div>
            <button onClick={() => setActiveLeaf(null)} className="text-gray-300 hover:text-gray-500 shrink-0">
              <X size={18} />
            </button>
          </div>
          {activeLeaf.data ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div><p className="font-display font-700 text-lg" style={{ color: heatColor(activeLeaf.data.accuracy) }}>{activeLeaf.data.accuracy}%</p><p className="text-[11px] text-gray-400 font-semibold">Accuracy</p></div>
              <div><p className="font-display font-700 text-lg text-gray-700">{activeLeaf.data.attempted}</p><p className="text-[11px] text-gray-400 font-semibold">Attempted</p></div>
              <div><p className="font-display font-700 text-lg text-gray-700">{timeAgo(activeLeaf.data.last_practiced)}</p><p className="text-[11px] text-gray-400 font-semibold">Last practiced</p></div>
              <div>
                {(() => { const t = TREND_META[activeLeaf.data.trend] || TREND_META.stable; return <t.Icon size={20} className="text-gray-600" />; })()}
                <p className="text-[11px] text-gray-400 font-semibold">{(TREND_META[activeLeaf.data.trend] || TREND_META.stable).label}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-3">Not practiced yet — take a quiz on this topic to fill it in.</p>
          )}
        </div>
      )}

      <div className="space-y-6">
        {topics.map(branch => (
          <div key={branch.id}>
            <h2 className="font-display font-700 text-sm text-gray-700 mb-2.5">{branch.label}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {branch.children.map(leaf => {
                const p = byTopic[leaf.label];
                const isActive = activeLeaf?.leaf.id === leaf.id;
                const color = p ? heatColor(p.accuracy) : null;
                return (
                  <button
                    key={leaf.id}
                    onClick={() => handleTileClick(branch, leaf)}
                    className={`relative aspect-square rounded-xl p-2.5 flex flex-col items-start justify-between text-left transition-all duration-200 ${
                      isActive ? 'ring-2 ring-offset-2 ring-gray-400 scale-[0.97]' : 'hover:scale-[1.03]'
                    } ${!p ? 'border-2 border-dashed border-gray-200 bg-gray-50' : ''}`}
                    style={p ? { backgroundColor: color } : {}}
                  >
                    <span className={`text-[10px] font-semibold leading-tight line-clamp-3 ${p ? 'text-white/95' : 'text-gray-400'}`}>
                      {leaf.label}
                    </span>
                    {p ? (
                      <span className="text-white font-display font-800 text-sm self-end">{p.accuracy}%</span>
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
        <div className="card text-center py-12"><FolderTree className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-gray-400 font-medium text-sm">No topics configured yet</p></div>
      )}

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
