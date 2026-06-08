// 极简客户端路由（store 驱动）+ 浏览器历史集成。
// 视图：plaza/explore/chats/chat/profile/post/notifications/me。
// 关键：navigate 会 pushState、back() 走真实浏览器历史——所以二级页的返回键、
// 以及手机的返回键/侧滑手势，都能回到「你真正来的那一页」，而不是写死回广场。
import { writable, get } from 'svelte/store';

export const route = writable({ name: 'plaza', params: {} });

if (typeof window !== 'undefined') {
  // 种下当前（首屏）历史条目，back() 才有的退、popstate 才能复原。
  try { history.replaceState({ zsky: get(route) }, ''); } catch { /* ignore */ }
  window.addEventListener('popstate', (e) => {
    const s = e.state && e.state.zsky;
    route.set(s && s.name ? { name: s.name, params: s.params || {} } : { name: 'plaza', params: {} });
    window.scrollTo(0, 0);
  });
}

export function navigate(name, params = {}) {
  const cur = get(route);
  // 同页同参不重复入栈（避免返回键“点了没反应”）。
  if (cur.name === name && JSON.stringify(cur.params) === JSON.stringify(params)) return;
  route.set({ name, params });
  try { history.pushState({ zsky: { name, params } }, ''); } catch { /* ignore */ }
  window.scrollTo(0, 0);
}

// 返回上一页：走浏览器历史（与系统返回键/手势一致）；popstate 会复原路由。
export function back() {
  if (typeof window !== 'undefined') history.back();
  else route.set({ name: 'plaza', params: {} });
}
