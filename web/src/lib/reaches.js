// 红点模型（与旧版不同）：
//   对话红点 = 私聊类：她「想你了 / 在等你回」(SSE reach_out + 未回)。对话页「✓ 全部已读」清。
//   通知红点 = 仅【广场互动 + 系统】未读。通知页「✓ 全部已读」清。
//   私聊「想你了」绝不进通知——只在对话页红点提醒。
import { writable, get } from 'svelte/store';

export const reaches = writable([]); // lifeIds：她主动来找你了（对话红点）
export function addReach(id) { if (id) reaches.update((r) => (r.includes(id) ? r : [...r, id])); }
export function clearReach(id) { reaches.update((r) => r.filter((x) => x !== id)); }
export function clearReaches() { reaches.set([]); }

// 通知「已读」水位线：记最近一次「全部已读/进过通知页」的墙钟；新于它的通知即未读。
const KEY = 'zsky-notif-seen';
export const notifSeenAt = writable(Number(localStorage.getItem(KEY) || 0));
notifSeenAt.subscribe((v) => { try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ } });
export function markNotifsSeen() { notifSeenAt.set(Date.now()); }
// 给一组通知算「是否有未读」（plaza/system 两类，排除私聊 reach）。
export function hasUnread(notes) {
  const seen = get(notifSeenAt);
  return (notes || []).some((n) => n.type !== 'reach' && new Date(n.at).getTime() > seen);
}
