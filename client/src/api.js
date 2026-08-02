const BASE = import.meta.env.VITE_API_URL || '/api';
function getToken() { return localStorage.getItem('qf_token'); }

async function request(path, opts = {}) {
  const token = getToken();
  const headers = { ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  signup: (body) => request('/auth/signup', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),

  uploadPdf: (file) => { const fd = new FormData(); fd.append('pdf', file); return request('/pdf/upload', { method: 'POST', body: fd }); },
  listPdfs: () => request('/pdf/list'),
  deletePdf: (id) => request(`/pdf/${id}`, { method: 'DELETE' }),

  generateQuiz: ({ count=10, difficulty='medium', topic=null, consequenceMode=false }) =>
    request('/quiz/generate', { method: 'POST', body: { count, difficulty, topic: topic?.label||null, topicParent: topic?.parent||null, consequenceMode } }),
  submitQuiz: (data) => request('/quiz/submit', { method: 'POST', body: data }),
  flagQuestion: (data) => request('/quiz/flag', { method: 'POST', body: data }),
  quizHistory: () => request('/quiz/history'),
  leaderboard: () => request('/quiz/leaderboard'),
  topicProgress: () => request('/quiz/progress'),
  recommendations: () => request('/quiz/recommendations'),

  adminFlags: (status='open') => request(`/quiz/admin/flags?status=${status}`),
  adminUpdateFlag: (id, status) => request(`/quiz/admin/flags/${id}`, { method: 'PATCH', body: { status } }),
};
