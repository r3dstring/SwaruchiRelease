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
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body }),

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

  getTopics: () => request('/topics'),
  adminCreateBranch: (data) => request('/topics/admin/branch', { method: 'POST', body: data }),
  adminCreateLeaf: (data) => request('/topics/admin/leaf', { method: 'POST', body: data }),
  adminUpdateTopic: (id, data) => request(`/topics/admin/${id}`, { method: 'PATCH', body: data }),
  adminDeleteTopic: (id) => request(`/topics/admin/${id}`, { method: 'DELETE' }),

  // Custom Quiz sessions — admin management (requires login)
  createSession: (data) => request('/sessions', { method: 'POST', body: data }),
  listSessions: () => request('/sessions'),
  getSession: (id) => request(`/sessions/${id}`),
  updateSessionStatus: (id, status) => request(`/sessions/${id}`, { method: 'PATCH', body: { status } }),
  deleteSession: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),

  // Custom Quiz sessions — public participant flow (no login)
  lookupSessionCode: (code) => request(`/sessions/public/lookup/${code}`),
  joinSession: (data) => request('/sessions/public/join', { method: 'POST', body: data }),
  submitSession: (data) => request('/sessions/public/submit', { method: 'POST', body: data }),
};
