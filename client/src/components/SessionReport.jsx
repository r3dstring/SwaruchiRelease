// A clean, formal, print-ready results report. Deliberately NOT styled like
// the rest of the app (no rounded cartoon buttons, no emoji-heavy UI) — this
// is meant to look like a document someone could file or hand to a manager,
// not a screen someone plays with.

function formatDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function SessionReport({ session }) {
  const { date, time } = formatDateTime(session.created_at);
  const completed = session.participants.filter(p => p.completed_at);
  const notCompleted = session.participants.filter(p => !p.completed_at);
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((sum, p) => sum + (p.score / p.total) * 100, 0) / completed.length)
    : 0;

  return (
    <div className="bg-white">
      {/* Print-only styles: hide everything else on the page, force one clean sheet */}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body * { visibility: hidden; }
          #printable-report, #printable-report * { visibility: visible; }
          #printable-report { position: absolute; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="printable-report" className="max-w-3xl mx-auto p-8 font-sans text-gray-900">
        {/* Header */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-1">Assessment Result Report</p>
          <h1 className="text-2xl font-bold text-gray-900">{session.session_name}</h1>
          <div className="flex gap-6 mt-2 text-sm text-gray-600">
            <span><strong>Date:</strong> {date}</span>
            <span><strong>Time:</strong> {time}</span>
            <span><strong>Source Document:</strong> {session.pdf_filename}</span>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-4 mb-6 text-center">
          <div className="border border-gray-300 rounded p-3">
            <p className="text-2xl font-bold">{session.participants.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Registered</p>
          </div>
          <div className="border border-gray-300 rounded p-3">
            <p className="text-2xl font-bold">{completed.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Completed</p>
          </div>
          <div className="border border-gray-300 rounded p-3">
            <p className="text-2xl font-bold">{session.count}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Questions</p>
          </div>
          <div className="border border-gray-300 rounded p-3">
            <p className="text-2xl font-bold">{avgScore}%</p>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Average Score</p>
          </div>
        </div>

        {/* Results table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-2 pr-2 font-semibold">Rank</th>
              <th className="text-left py-2 pr-2 font-semibold">Name</th>
              <th className="text-left py-2 pr-2 font-semibold">Employee ID</th>
              <th className="text-left py-2 pr-2 font-semibold">Grade</th>
              <th className="text-right py-2 pr-2 font-semibold">Score</th>
              <th className="text-right py-2 font-semibold">Percentage</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((p, i) => {
              const pct = Math.round((p.score / p.total) * 100);
              return (
                <tr key={p.id} className="border-b border-gray-200">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">{p.name}</td>
                  <td className="py-2 pr-2">{p.employee_id}</td>
                  <td className="py-2 pr-2">{p.grade}</td>
                  <td className="py-2 pr-2 text-right">{p.score} / {p.total}</td>
                  <td className="py-2 text-right font-semibold">{pct}%</td>
                </tr>
              );
            })}
            {completed.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-gray-400">No participants have completed this quiz yet.</td></tr>
            )}
          </tbody>
        </table>

        {/* Not-yet-completed list, if any — relevant for a trainer tracking attendance */}
        {notCompleted.length > 0 && (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-2">Registered but not completed ({notCompleted.length})</p>
            <p className="text-sm text-gray-600">{notCompleted.map(p => `${p.name} (${p.employee_id})`).join(', ')}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-300 pt-3 mt-8 text-xs text-gray-400 flex justify-between">
          <span>Generated by QuizForge</span>
          <span>Quiz Code: {session.join_code}</span>
        </div>
      </div>
    </div>
  );
}
