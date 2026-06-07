// 极简客户端路由（store 驱动）。视图：plaza（广场）/ chat（与某条命对话）/ me（我）。
import { writable } from 'svelte/store';

export const route = writable({ name: 'plaza', params: {} });

export function navigate(name, params = {}) {
  route.set({ name, params });
  window.scrollTo(0, 0);
}
