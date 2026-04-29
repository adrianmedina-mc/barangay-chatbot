const API_URL = 'https://barangay-chatbot-production.up.railway.app/api';

let token = localStorage.getItem('token');

export function setToken(t) {
  token = t;
  localStorage.setItem('token', t);
}

export function clearToken() {
  token = null;
  localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getReports: () => request('/reports'),
  updateReport: (id, status) =>
    request(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getResidents: () => request('/residents'),
  getResident: (id) => request(`/residents/${id}`),
  deleteReport: (id) => request(`/reports/${id}`, { method: 'DELETE' }),
  deleteResident: (id) => request(`/residents/${id}`, { method: 'DELETE' }),

  getAnnouncements: () => request('/announcements'),
  sendAnnouncement: (data) =>
    request('/announcements', { method: 'POST', body: JSON.stringify(data) }),
};