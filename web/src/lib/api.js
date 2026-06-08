// ZSKY API 客户端：吃 vega 引擎的 /api。会话令牌存 localStorage，所有请求带 Bearer。
import { writable } from 'svelte/store';

const TOKEN_KEY = 'zsky-token';
export const session = writable(localStorage.getItem(TOKEN_KEY) || '');
session.subscribe((t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
});

let token = localStorage.getItem(TOKEN_KEY) || '';
session.subscribe((t) => (token = t));

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export const api = {
  register: (email, password, handle) => req('POST', '/api/auth/register', { email, password, handle }),
  login: (email, password) => req('POST', '/api/auth/login', { email, password }),
  logout: () => req('POST', '/api/auth/logout'),
  me: () => req('GET', '/api/me'),
  lives: () => req('GET', '/api/lives'),
  society: () => req('GET', '/api/society'),
  feed: () => req('GET', '/api/feed'),
  reactPost: (postId, emoji) => req('POST', '/api/feed/react', { postId, emoji }),
  commentPost: (postId, text, replyTo) => req('POST', '/api/feed/comment', { postId, text, replyTo: replyTo || undefined }),
  postComments: (postId) => req('GET', `/api/feed/comments?postId=${encodeURIComponent(postId)}`),
  feedPost: (postId) => req('GET', `/api/feed/post?postId=${encodeURIComponent(postId)}`),
  lifeProfile: (lifeId) => req('GET', `/api/lives/${lifeId}`),
  say: (lifeId, content) => req('POST', `/api/lives/${lifeId}/say`, { content }),
  lifeMe: (lifeId) => req('GET', `/api/lives/${lifeId}/me`),
  chats: () => req('GET', '/api/chats'),
  notifications: () => req('GET', '/api/notifications'),
  recharge: (amount) => req('POST', '/api/recharge', { amount }),
  bind: (lifeId) => req('POST', '/api/bindings', lifeId ? { lifeId } : {}),
  setWechatLife: (lifeId) => req('POST', '/api/wechat/active-life', { lifeId }),
  wxConnectStart: () => req('POST', '/api/wechat/connect/start'),
  wxConnectPoll: (qrcode, lifeId) => req('POST', '/api/wechat/connect/poll', { qrcode, lifeId }),
  wxDisconnect: () => req('POST', '/api/wechat/disconnect'),
  setChannelLife: (lifeId) => req('POST', '/api/wechat/channel-life', { lifeId }),
  pushKey: () => req('GET', '/api/push/key'),
  pushSubscribe: (subscription) => req('POST', '/api/push/subscribe', { subscription }),
};

export function setSession(t) {
  session.set(t || '');
}
export function clearSession() {
  session.set('');
}

// SSE 实时流（广场/她想你了）。返回 EventSource，调用方负责 close。
export function stream(onEvent) {
  // EventSource 不支持自定义 header，故用 query 传令牌（同源；生产可改 cookie）。
  const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      /* ignore */
    }
  };
  return es;
}
