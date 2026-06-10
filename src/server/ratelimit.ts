// 限流 / 防暴力破解（平台传输层·零依赖·内存）。防的是外部攻击者：撞库 / 账号枚举 / 刷注册 / 刷接口 / 轻量 DoS。
// 这是【护栏】，不是控制她的开关——只限外部请求速率，绝不限她的自主行为（那是 autoBudget 的事）、更不碰她的主权。
// 进程单例、Map 内存态、惰性 + 周期自清（无外部依赖、无定时器泄漏）。注入 now() 便于确定性单测。
import type { IncomingMessage } from 'node:http';

// 取客户端 IP：默认用 socket 直连地址；仅当运维显式 VEGA_TRUST_PROXY=1（前置可信反代）才信任
// X-Forwarded-For 首跳——否则任何人都能伪造该头、按"换 IP"绕过限流。
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff ?? '').split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

// 固定窗口计数器：同一 key 在 windowMs 内至多 limit 次 take()→true，超出→false（窗口到期自动重置）。
export interface RateLimiter {
  take(key: string, limit: number, windowMs: number): boolean;
  clear(key: string): void;
}
export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, { n: number; reset: number }>();
  let lastSweep = now();
  return {
    take(key, limit, windowMs) {
      const t = now();
      if (t - lastSweep >= 60_000) { lastSweep = t; for (const [k, v] of hits) if (v.reset <= t) hits.delete(k); } // 周期清扫，防内存堆积
      const cur = hits.get(key);
      if (!cur || cur.reset <= t) { hits.set(key, { n: 1, reset: t + windowMs }); return true; }
      if (cur.n >= limit) return false;
      cur.n += 1;
      return true;
    },
    clear(key) { hits.delete(key); },
  };
}

// 登录失败退避（按 IP+email）：连续失败到阈值后指数退避锁定；成功即清零。
// 与窗口限流叠加——窗口防"高频试"，退避防"慢速逐个猜"。
export interface LoginGuard {
  retryAfterMs(key: string): number; // >0 = 当前被锁定、还需等待的毫秒
  fail(key: string): void;
  succeed(key: string): void;
}
export function createLoginGuard(now: () => number = Date.now): LoginGuard {
  const st = new Map<string, { fails: number; until: number }>();
  return {
    retryAfterMs(key) { const s = st.get(key); return s && s.until > now() ? s.until - now() : 0; },
    fail(key) {
      const s = st.get(key) ?? { fails: 0, until: 0 };
      s.fails += 1;
      // 前 4 次不锁（容忍手误）；第 5 次起指数退避：5→2s, 6→4s, 7→8s… 上限 15 分钟。
      const backoff = s.fails >= 5 ? Math.min(2 ** (s.fails - 4) * 1000, 15 * 60_000) : 0;
      s.until = now() + backoff;
      st.set(key, s);
    },
    succeed(key) { st.delete(key); },
  };
}
