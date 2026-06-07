// 进程内事件总线（SSE 的后端）：广场动态、她的触达、醒睡——单向推给在线客户端。
// audience='public'（人人可见，如广场/她醒了）或某个 relationshipId（只推给那一个用户，如"她想你了"）。
// 与神圣日志解耦：总线只是实时通知，丢了无所谓（前端可回退轮询）。
export interface BusEvent {
  type: string; // society / reach_out / presence …
  audience: string; // 'public' | relationshipId（u_<userId> / peer_…）
  data?: unknown;
  at: string;
}
export interface EventBus {
  publish(type: string, audience: string, data?: unknown): void;
  subscribe(fn: (e: BusEvent) => void): () => void; // 返回退订函数
  size(): number;
}

// 某条事件对"持有关系 rel 的用户"是否可见：公开的、或正好是他自己那段关系。绝不跨用户。
export const visibleTo = (e: BusEvent, rel: string): boolean => e.audience === 'public' || e.audience === rel;

export function createEventBus(): EventBus {
  const subs = new Set<(e: BusEvent) => void>();
  return {
    publish(type, audience, data) {
      const e: BusEvent = { type, audience, data, at: new Date().toISOString() };
      for (const fn of subs) {
        try {
          fn(e);
        } catch {
          /* 单个订阅者出错不影响其他人 */
        }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    size: () => subs.size,
  };
}
