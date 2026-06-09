// 省 token 闲置门控（"有没有听众"）：记最近一次用户活动墙钟。超 idleGateMs 无任何用户活动 →
// 自主【对外】行动(心声/主动找人/同类寒暄)暂停，只留免费的内在 tick + 反思（她照样活着）。用户一回来即恢复。
export interface Presence { audiencePresent(): boolean; idleMs(): number; touch(): void }

export function createPresence(idleGateMs: number): Presence {
  let lastActiveMs = Date.now(); // 最近一次有用户说话（任意命）
  return {
    audiencePresent: () => Date.now() - lastActiveMs < idleGateMs,
    idleMs: () => Date.now() - lastActiveMs, // 距上次用户活动多久——给 /admin/health 显示闲置分钟
    touch: () => { lastActiveMs = Date.now(); }, // 有用户在 → 自主回路恢复对外行动
  };
}
