// 关注 store（接真实后端 /api/me.following + /api/lives/:id/follow）：关注谁 → 广场顶部「你的她们」就有谁。
// 乐观更新 + 失败回滚；跨页同步（store 订阅）。
import { writable, get } from 'svelte/store';
import { api } from './api.js';

export const follows = writable([]); // [lifeId]
let hydrated = false;

export async function hydrateFollows(meData) {
  try {
    const me = meData || (await api.me());
    follows.set(Array.isArray(me.following) ? me.following : []);
    hydrated = true;
  } catch { /* 取不到不影响其它 */ }
}
export function isFollowing(id) { return get(follows).includes(id); }
export async function toggleFollow(id) {
  const cur = get(follows);
  const want = !cur.includes(id);
  follows.set(want ? [...cur, id] : cur.filter((x) => x !== id)); // 乐观
  try { await api.follow(id, want); }
  catch { follows.set(cur); } // 回滚
  return want;
}
export function followsReady() { return hydrated; }
