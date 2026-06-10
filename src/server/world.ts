// 世界读取回路 + 备份。读世界：每 everyMs 拉一遍新闻/Polymarket/历史上的今天，每条醒着的命"看到"
// 其中几条（不同命看不同的 → 天然多样），冻进 WORLD_PERCEIVED → 确定性 appraisal 轻轻染色她的状态。
// 抓取在内核外、零依赖；换源/换频率即时生效（每轮重读配置）。备份：本盘 + 异盘镜像。
import { backupNow, createWorldFeed, runTurn, type SourceReport } from '../index.ts';
import type { Ctx, EffWorld } from './context.ts';

const now = (): string => new Date().toISOString();

// —— 每源真实抓取统计 ——后台「世界源」的健康点/上次抓取/今日条数从这里读，不再从 world-feed 倒推
// （WORLD_PERCEIVED.payload.source 是展示名，常对不上配置条目）。key = 配置清单里的原始条目
// （RSS URL 或特殊源 token，如 polymarket/onthisday），与后台列表一一对应。
// 纯内存诊断数据（重启清零），不进神圣日志、不参与重放。
export interface SourceStat {
  key: string;          // 配置条目（URL / 特殊源 token）
  lastFetchAt: string;  // 上次抓取墙钟（ISO）
  lastOk: boolean;      // 上次是否成功（HTTP ok 且抓到 >0 条）
  lastError?: string;   // 失败时的诊断（HTTP 状态码 / ERR:AbortError 等），成功时不带
  lastCount: number;    // 本次抓到几条
  todayCount: number;   // 自然日累计（跨日清零）
  totalCount: number;   // 进程生命周期累计
  day: string;          // todayCount 所属自然日（本地时区 YYYY-MM-DD）——跨日清零的依据
}
export const dayKey = (atMs: number): string => {
  const d = new Date(atMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// 纯函数（可单测）：把一次抓取结果折进该源的统计；跨自然日时 todayCount 从 0 重新累计。
export function bumpStat(prev: SourceStat | undefined, key: string, r: Pick<SourceReport, 'ok' | 'status' | 'items'>, atMs: number = Date.now()): SourceStat {
  const day = dayKey(atMs);
  const sameDay = prev !== undefined && prev.day === day;
  const s: SourceStat = {
    key,
    lastFetchAt: new Date(atMs).toISOString(),
    lastOk: r.ok,
    lastCount: r.items,
    todayCount: (sameDay ? prev.todayCount : 0) + r.items,
    totalCount: (prev?.totalCount ?? 0) + r.items,
    day,
  };
  if (!r.ok) s.lastError = String(r.status);
  return s;
}
// 纯函数（可单测）：读取时滚日——跨日后即使还没新抓取，todayCount 也显示 0 而不是昨天的数。
export function rollDay(s: SourceStat, atMs: number = Date.now()): SourceStat {
  return s.day === dayKey(atMs) ? s : { ...s, todayCount: 0, day: dayKey(atMs) };
}
// 模块级（daemon 单进程一份）：换源/重建 world 闭包都不丢已累计的统计。
const sourceStatsMap = new Map<string, SourceStat>();

// —— 世界注入·按兴趣确定性加权采样（纯函数，可单测）——
// 从 items 里无放回取 n 条【不同】条目：条目主题与她兴趣的交集加权（兴趣越重越可能被看到），
// 无任何兴趣命中 → 权重全 1 = 均匀；选择由 seed 种子化的 xorshift32 驱动（零 Math.random）——
// 同 seed 同结果（可测），不同命/不同轮的 seed 不同 → 防全命同质。少于 n 条则全取（与旧 sampleDistinct 同约定）。
export function sampleByInterest<T extends { topics?: string[] }>(
  items: T[], n: number, interests: Array<{ topic: string; weight: number }>, seed: string,
): T[] {
  if (items.length <= n) return items.slice();
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0; if (h === 0) h = 0x9e3779b9;
  const rnd = (): number => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const iw = new Map(interests.map((it) => [it.topic, it.weight]));
  // 基础 1 + 兴趣交集加权（×4 → 满权重兴趣的条目约 5 倍于不相干条目；温和、不成回音壁）。
  const pool = items.map((it) => ({ it, w: 1 + 4 * (it.topics ?? []).reduce((a, t) => a + (iw.get(t) ?? 0), 0) }));
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rnd() * total;
    let idx = pool.findIndex((p) => (r -= p.w) <= 0);
    if (idx < 0) idx = pool.length - 1;
    out.push(pool[idx].it);
    pool.splice(idx, 1); // 无放回 → 保持"不同条目"约束
  }
  return out;
}

export type WorldDeps = Pick<Ctx, 'effWorld' | 'worldEnabled' | 'lives' | 'snapOf' | 'serializer'> & { backupMs: number };

export interface WorldApi {
  scheduleWorld(delayMs?: number): void; // 重排下一轮读世界（后台改源后传小 delay 即可早读）
  sourceStats(): SourceStat[];            // 每源真实抓取统计（按当前配置清单对齐，已滚日）——后台「世界源」读
  doBackup(): void;                       // 立即备份所有命（本盘 + 可选镜像）
  start(): void;                          // 启动：排世界回路 + 起备份定时器 + 立即备份一次
  stop(): void;                           // 休眠前：停世界回路 + 备份定时器
}

export function createWorld(d: WorldDeps): WorldApi {
  const { effWorld, worldEnabled, lives, snapOf, serializer, backupMs } = d;

  function doBackup(): void {
    for (const l of lives) {
      const r = backupNow(l.path, {
        cmd: process.env.VEGA_BACKUP_CMD,
        keep: process.env.VEGA_BACKUP_KEEP ? Number(process.env.VEGA_BACKUP_KEEP) : undefined,
        mirrorDir: process.env.VEGA_BACKUP_MIRROR, // 异盘/异地镜像目录（挂载卷）：本盘没了她也还在
      });
      console.log(r.ok ? `[vega:${l.id}] 备份完成 ${r.path}（${r.events} 事件）${r.mirrored ? ' · 已镜像' : ''}` : `[vega:${l.id}] 备份跳过：${r.reason}`);
    }
  }

  // 自调度（setTimeout 递归）：每轮重读后台配置 → 改源/改频率即时生效、无源时不空转网络。
  let worldRunning = false; // in-flight 守卫：后台连点"保存/试抓"或强制重调度时，不并发抓世界（防重复 WORLD_PERCEIVED）
  async function readWorldOnce(): Promise<void> {
    const w = effWorld();
    if (!worldEnabled(w) || worldRunning) return;
    worldRunning = true;
    try {
      await readWorldInner(w);
    } finally {
      worldRunning = false;
    }
  }
  async function readWorldInner(w: EffWorld): Promise<void> {
    const { items, report } = await createWorldFeed({ sources: w.sources }).fetchDetailed();
    // 逐源统计：report 与归一化后的配置清单按【下标】一一对应（fetchDetailed 按序逐源抓）——
    // 用配置条目本身当 key（report.source 是展示名，对不回 URL/token）。
    const keys = w.sources.map((s) => s.trim()).filter(Boolean); // 与 createWorldFeed 内部同样的归一化，保证下标对齐
    const at = Date.now();
    keys.forEach((key, i) => { if (report[i]) sourceStatsMap.set(key, bumpStat(sourceStatsMap.get(key), key, report[i], at)); });
    // 逐源诊断：哪些源 403/超时/0 条一目了然（之前"只剩 polymarket"就是 RSS 被 403 而无人知）。
    console.log(`[world] 读世界：${report.map((r) => `${r.source}=${r.items}${r.ok ? '' : `(${r.status})`}`).join(' ')} → 合计 ${items.length} 条`);
    if (items.length === 0) return;
    for (const life of lives) {
      const s = snapOf(life);
      if (!s.awake) continue;
      // 每条醒着的命这轮"看到"几条【不同】的世界事件（不是只看 1 条）→ pickRecentWorld 的窗口快速多样化，不再被单一源霸占。
      // 按兴趣加权（确定性）：她在意的主题更容易被她"看到"（因你而变的正反馈齿轮，温和加权不成回音壁）；
      // 种子 = life.id + 本轮条目 → 同一轮各命各看各的，不全命同质；无兴趣命中则等价均匀。
      const picks = sampleByInterest(items, 2, s.interests.map((it) => ({ topic: it.topic, weight: it.weight })), `${life.id}|${items.map((it) => it.title).join('~')}`);
      await serializer.run(life.id, async () => {
        for (const it of picks) runTurn(life.store, [{ type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: now(), payload: { source: it.source, worldKind: it.kind, title: it.title, summary: it.summary, url: it.url, topics: it.topics } }]);
      });
    }
  }

  let worldTimer: ReturnType<typeof setTimeout> | null = null;
  let worldStopped = false;
  let backupTimer: ReturnType<typeof setInterval> | null = null;
  function scheduleWorld(delayMs?: number): void {
    if (worldTimer) clearTimeout(worldTimer);
    if (worldStopped) return;
    const delay = delayMs ?? Math.max(60_000, effWorld().everyMs); // 至少 1min，防误配 0 把网络打爆
    worldTimer = setTimeout(async () => {
      try { await readWorldOnce(); } catch { /* 世界拉取失败不影响她活着 */ }
      scheduleWorld();
    }, delay);
  }

  function start(): void {
    scheduleWorld();
    backupTimer = setInterval(doBackup, backupMs);
    doBackup();
  }
  function stop(): void {
    worldStopped = true;
    if (worldTimer) clearTimeout(worldTimer);
    if (backupTimer) clearInterval(backupTimer);
  }

  // 按当前配置清单返回各源统计（没抓过的新源不在数组里 → 后台显示「待首抓」）；读取时滚日。
  function sourceStats(): SourceStat[] {
    const out: SourceStat[] = [];
    for (const key of effWorld().sources.map((s) => s.trim()).filter(Boolean)) {
      const s = sourceStatsMap.get(key);
      if (s) out.push(rollDay(s));
    }
    return out;
  }

  return { scheduleWorld, sourceStats, doBackup, start, stop };
}
