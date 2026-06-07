import { writable } from 'svelte/store';

const KEY = 'zsky_admin';
export const session = writable(localStorage.getItem(KEY) || '');
let token = localStorage.getItem(KEY) || '';
session.subscribe((t) => { token = t; if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); });

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  login: (email, password) => req('POST', '/api/auth/login', { email, password }),
  overview: () => req('GET', '/admin/overview'),
  activity: (limit = 150) => req('GET', `/admin/activity?limit=${limit}`),
  users: () => req('GET', '/admin/users'),
  recharges: () => req('GET', '/admin/recharges'),
  decideRecharge: (id, approve) => req('POST', '/admin/recharges', { id, approve }),
  block: (userId, unblock) => req('POST', '/admin/users/block', { userId, unblock }),
  life: (id) => req('GET', `/admin/lives/${id}`),
  wellbeing: (id) => req('GET', `/admin/lives/${id}/wellbeing`),
};
export const setSession = (t) => session.set(t || '');
export const clearSession = () => session.set('');
