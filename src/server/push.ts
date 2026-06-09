// Web Push（PWA）：配了 VAPID 才启用。她想你了(reach_out 且属于某个用户) → app 关着也能推到手机。
// 订阅总线、把 reach_out 事件转成推送；订阅失效(404/410)自动清理。未配 VAPID 则空操作。
import { sendPush } from '../index.ts';
import type { Ctx } from './context.ts';

export function setupPush(d: Pick<Ctx, 'bus' | 'accounts' | 'VAPID' | 'VAPID_SUBJECT'>): void {
  const { bus, accounts, VAPID, VAPID_SUBJECT } = d;
  if (!VAPID) return;
  const vapid = VAPID; // 闭包内固定为非空
  bus.subscribe((e) => {
    if (e.type !== 'reach_out' || !e.audience.startsWith('u_')) return; // 只给"她想你了"且属于某个用户的事件推
    const userId = e.audience.slice(2);
    const data = e.data as { life?: string; text?: string };
    const payload = JSON.stringify({ title: `${data.life} 想你了`, body: data.text ?? '', life: data.life });
    for (const sub of accounts.getPushSubs(userId)) {
      sendPush(sub, payload, vapid, VAPID_SUBJECT)
        .then((st) => { if (st === 404 || st === 410) accounts.removePushSub(sub.endpoint); })
        .catch((err) => console.warn('[push] 发送失败（不影响其他）:', (err as Error).message)); // 留一行日志，别让推送全挂成黑盒
    }
  });
}
