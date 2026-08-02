import { useState } from 'react';
import { api } from '../api';

const REASONS = [
  { value: 'wrong_answer', label: 'Correct answer is wrong' },
  { value: 'confusing', label: 'Question is confusing or unclear' },
  { value: 'not_relevant', label: 'Not relevant to the topic' },
  { value: 'other', label: 'Other issue' },
];

export default function FlagButton({ question, topic }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      await api.flagQuestion({
        topic,
        question_text: question.question,
        question_type: question.type,
        options: question.options,
        correct_answer: question.answer,
        explanation: question.explanation,
        reason,
        comment: comment.trim() || null,
      });
      setSubmitted(true);
    } catch (e) {
      console.error('Flag failed:', e);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mt-2">
        <span>✓</span><span>Reported — thanks for the feedback</span>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-coral transition-colors font-medium flex items-center gap-1">
          <span>🚩</span><span>Report issue</span>
        </button>
      ) : (
        <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200 animate-slide-up">
          <p className="text-xs font-bold text-gray-600 mb-2">What's the issue?</p>
          <div className="space-y-1.5 mb-3">
            {REASONS.map(r => (
              <button key={r.value} onClick={() => setReason(r.value)}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-all font-medium ${reason===r.value?'bg-coral/10 text-coral border border-coral/30':'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}>
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={comment} onChange={e=>setComment(e.target.value)}
            placeholder="Optional: add details..."
            className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white resize-none focus:outline-none focus:border-gray-400 mb-2"
            rows={2}
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600 font-medium px-3 py-1.5">Cancel</button>
            <button onClick={handleSubmit} disabled={!reason||loading}
              className="text-xs bg-coral text-white font-bold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity">
              {loading ? 'Sending...' : 'Send Report'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
