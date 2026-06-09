// 常驻守护进程（多生命体）：一个进程里养 1 个或多个 vega，各自独立的日志/连续自我；
// 它们彼此是"同类(peer)"，会自主交往（社会层）。HTTP 按生命体分路由 + 网页可切换。
// 跑法：npm run daemon   多体：VEGA_LIVES=vega,lyra
// env：VEGA_LIVES / VEGA_LIFE_PATH / VEGA_HOST(127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS /
//      VEGA_SOCIAL_EVERY_MS / VEGA_AUTH_TOKEN / 模型见 .env.example
import { createServer, type IncomingMessage } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  advanceState,
  assertPersistenceSafeForProd,
  backupNow,
  captureCheckpoint,
  checkpointOf,
  createAccountStore,
  createFileEventStore,
  createDynamicMouth,
  createDynamicPerceiver,
  createSettingsStore,
  createFeedStore,
  createWorldFeed,
  createIlink,
  createEventBus,
  createSerializer,
  createTemplateMouth,
  meterMouth,
  resourceBand,
  resourceAwareMouth,
  governedMouth,
  createAutonomousBudget,
  genesisPayloadFor,
  ARCHETYPES,
  projectState,
  readCheckpoint,
  resumeFromCheckpoint,
  runTurn,
  sendPush,
  userSay,
  writeCheckpoint,
  type Account,
  type ApiyiConfig,
  type DerivedSnapshot,
  type EventDraft,
  type LifeEvent,
  type MessageSentPayload,
  type PerceiverConfig,
  type WorldPerceivedPayload,
} from '../index.ts';
import { send, sendHtml, serveStatic, readJson, FALLBACK_HTML } from './http.ts';
import { round3, maskKey, tempLabel, mbtiOf, eventLabel } from './format.ts';
import type { Ctx, Life, EffWorld, EffSocial, PeerExchange } from './context.ts';
import { handleUserApi } from './routes/user.ts';
import { handleAdmin } from './routes/admin.ts';
import { startLoops } from './loops.ts';

const LIFE_PATH = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const DATA_DIR = dirname(LIFE_PATH);
mkdirSync(DATA_DIR, { recursive: true }); // 确保数据目录存在——否则 accounts.db/feed.db 开不了库（新机/新卷首启）
// 生命名册：env(VEGA_LIVES) ∪ 后台动态生成的命（落盘 lives.json，重启也在）。后台"生成生命体"即写这里。
const registryPath = join(DATA_DIR, 'lives.json');
const readRegistry = (): string[] => { try { const r = JSON.parse(readFileSync(registryPath, 'utf8')) as unknown; return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
const writeRegistry = (ids: string[]): void => { try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(registryPath, JSON.stringify(ids, null, 2)); } catch { /* 名册写失败不影响运行（仅影响重启后是否自动加载） */ } };
const envLives = (process.env.VEGA_LIVES ?? 'vega').split(',').map((s) => s.trim()).filter(Boolean);
const LIVES = [...new Set([...envLives, ...readRegistry()])];
const HOST = process.env.VEGA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.VEGA_PORT ?? 8787);
const TICK_MS = Number(process.env.VEGA_TICK_MS ?? 60_000);
const PRESENCE_MS = Number(process.env.VEGA_PRESENCE_MS ?? 300_000);
const REACH_AFTER_MS = Number(process.env.VEGA_REACH_AFTER_MS ?? 600_000);
const REACH_CLOSENESS = Number(process.env.VEGA_REACH_CLOSENESS ?? 0.2);
// —— 社交边界（Dunbar 灵感）——她只【主动】维系最亲近的一圈，且每跳限额；token 不随用户数爆炸。
const ACTIVE_CIRCLE = Number(process.env.VEGA_ACTIVE_CIRCLE ?? 15); // 主动维系的关系数上限（其余只记得、不主动打扰）
const REACH_PER_TICK = Number(process.env.VEGA_REACH_PER_TICK ?? 1); // 每跳最多主动找几个人
const BACKUP_MS = Number(process.env.VEGA_BACKUP_MS ?? 3_600_000);
const CHECKPOINT_MS = Number(process.env.VEGA_CHECKPOINT_MS ?? 120_000); // 多久落一次派生快照（快重启）
const REFLECT_MS = Number(process.env.VEGA_REFLECT_EVERY_MS ?? 1_800_000);
const SOCIAL_MS = Number(process.env.VEGA_SOCIAL_EVERY_MS ?? 300_000); // 同类多久自主寒暄一次
const MUSE_MS = Number(process.env.VEGA_MUSE_EVERY_MS ?? 1_800_000); // 多久发一条公开心声（§8.1 B）
const DISCOVER_MS = Number(process.env.VEGA_DISCOVER_EVERY_MS ?? 600_000); // 多久"看见"一个新用户并主动打招呼
const COMMENT_MS = Number(process.env.VEGA_COMMENT_EVERY_MS ?? 240_000); // 同类多久给彼此的公开心声留一条「生命流评论」
const COMMENT_CAP = Number(process.env.VEGA_COMMENT_CAP ?? 12); // 单帖评论上限——放宽以容下你来我往的多轮互评（原 4 太浅、压根接不上话）
const FEEDBACK_MS = Number(process.env.VEGA_FEEDBACK_EVERY_MS ?? 120_000); // 多久看一次"我的心声被回应了吗"（行动反馈闭环）
const REACT_MS = Number(process.env.VEGA_REACT_EVERY_MS ?? 180_000); // 同类多久给彼此的公开心声留一个【心情共鸣】（零模型·由她此刻状态确定）
const AUTH = process.env.VEGA_AUTH_TOKEN;
const userName = process.env.VEGA_USER_NAME ?? '你';
const REL = 'r_creator'; // 与她对话的人
const HOST_CONN = 'r_host'; // 宿主/基质连接（保持苏醒）
const peerId = (id: string): string => `peer_${id}`;
const now = (): string => new Date().toISOString();

// 运营配置：可由 owner 在后台改的"嘴/耳"配置（settings.json，不进神圣日志、不参与重放）。
// 当前生效配置 = 后台覆盖 ⊕ 环境变量兜底；没 key = null（回落离线模板嘴）。改了即时生效、无需重启。
const settings = createSettingsStore(join(DATA_DIR, 'settings.json'));
const feed = createFeedStore(join(DATA_DIR, 'feed.db')); // 广场发帖互动（表情/评论），平台层、不进神圣日志
// 外部世界（§8.1 演进）：新闻 RSS + Polymarket。抓取在引擎外，内容冻进 WORLD_PERCEIVED 事件 → 确定性染色她的状态。
// 源可在后台「世界」页改（settings.world ⊕ 环境兜底），即时生效、无需重启；配置本身不进神圣日志。
const WORLD_RSS = (process.env.VEGA_WORLD_RSS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WORLD_POLYMARKET = process.env.VEGA_WORLD_POLYMARKET === '1';
const WORLD_ONTHISDAY = process.env.VEGA_WORLD_ONTHISDAY !== '0'; // 默认开：维基"历史上的今天"（免注册、无限频、契合"讲时间的存在"）
const WORLD_MS = Number(process.env.VEGA_WORLD_EVERY_MS ?? 1_800_000); // 多久"读一遍世界"（默认 30min）
// 默认世界源（香港无墙、全免注册；偏人文/科学/天文/冷知识 + 预测市场 + 历史上的今天）。
// 统一一个列表：RSS URL 与特殊源 token（polymarket / onthisday）同一层级——后台一个列表即可。
const DEFAULT_RSS = [
  'https://www.nasa.gov/rss/dyn/breaking_news.rss',     // 航天/宇宙（契合星名生命体）
  'https://www.sciencedaily.com/rss/top/science.xml',   // 科学发现
  'https://hnrss.org/frontpage',                        // 科技/思想
  'https://www.reddit.com/r/todayilearned/.rss',        // 冷知识（很好的情感素材；偶发被 Reddit 限频则自动跳过）
  'https://feeds.bbci.co.uk/news/world/rss.xml',        // 世界新闻
  'https://36kr.com/feed',                              // 中文科技（对国内用户更相关）
];
const DEFAULT_SOURCES = [...DEFAULT_RSS, 'polymarket', 'onthisday']; // 出厂默认：新闻 + 预测市场 + 历史上的今天
// env 兜底也拼成统一列表（VEGA_WORLD_RSS ∪ polymarket ∪ onthisday）。
const ENV_SOURCES = [...WORLD_RSS, ...(WORLD_POLYMARKET ? ['polymarket'] : []), ...(WORLD_ONTHISDAY ? ['onthisday'] : [])];
function effWorld(): EffWorld {
  const o = settings.getWorld();
  // 后台 sources > 后台遗留 rss/polymarket（迁移）> env > 精选默认。
  let sources: string[];
  if (o.sources && o.sources.length) sources = o.sources;
  else if ((o.rss && o.rss.length) || o.polymarket !== undefined) {
    sources = [...(o.rss ?? []), ...(o.polymarket ? ['polymarket'] : []), ...(WORLD_ONTHISDAY ? ['onthisday'] : [])];
  } else sources = ENV_SOURCES.length ? ENV_SOURCES : DEFAULT_SOURCES;
  return { sources, everyMs: o.everyMs ?? WORLD_MS };
}
const worldEnabled = (w: EffWorld = effWorld()): boolean => w.sources.length > 0;
function worldStatus(): Record<string, unknown> {
  const w = effWorld();
  const o = settings.getWorld();
  const from = (o.sources?.length || o.rss?.length || o.polymarket !== undefined) ? 'override' : (ENV_SOURCES.length ? 'env' : 'default');
  return { ...w, enabled: worldEnabled(w), from };
}
// 微信 iLink（ZSKY 自己当机器人，无需 OpenClaw）：网页扫码登录 + 后台收发消息。base 可用 VEGA_ILINK_BASE 覆盖。
const ilink = createIlink({ base: process.env.VEGA_ILINK_BASE });
const WECHAT_LIFE = process.env.VEGA_WECHAT_LIFE || ''; // 微信通道默认对应哪条命；空=第一条
const channelGen = new Map<string, number>(); // userId → 当前 worker 代号；重连/断开 +1，旧 worker 据此自退（防重复 worker / 断连后无 worker）
const creditHintAt = new Map<string, number>(); // 微信"心意用尽"温柔提示的节流：每账号最多 10 分钟一次
// 主动找人的去向（Phase 3 收尾）：记下她每次 reach-out，反馈回路判断【被回应】还是【石沉大海】→ 落 FEEDBACK_PERCEIVED。
const reachOutPending = new Map<string, { rel: string; at: string; kind: 'reach_out' | 'greet' }>();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const DEFAULT_BASE = 'https://api.apiyi.com/v1';
const envTimeout = (): number => (process.env.VEGA_MODEL_TIMEOUT_MS ? Number(process.env.VEGA_MODEL_TIMEOUT_MS) : 20_000);
function effMouthConfig(): ApiyiConfig | null {
  const o = settings.getModel();
  const apiKey = (o.apiKey ?? process.env.VEGA_MODEL_API_KEY ?? '').trim();
  if (!apiKey) return null;
  return { baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE, apiKey, model: o.model ?? process.env.VEGA_MODEL ?? 'gpt-4o-mini', timeoutMs: o.timeoutMs ?? envTimeout() };
}
function effPerceiveConfig(): PerceiverConfig | null {
  const o = settings.getModel();
  const apiKey = (o.apiKey ?? process.env.VEGA_MODEL_API_KEY ?? '').trim();
  const on = o.perceive ?? (process.env.VEGA_PERCEIVE === '1');
  if (!apiKey || !on) return null;
  // 感知=极小的情感分类任务，不该占满对话超时；给它更短的独立超时 → 慢/挂时【快速失败回退词表】，不吃掉嘴的预算。
  const perceiveTimeout = process.env.VEGA_PERCEIVE_TIMEOUT_MS ? Number(process.env.VEGA_PERCEIVE_TIMEOUT_MS) : Math.min(8000, o.timeoutMs ?? envTimeout());
  return { baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE, apiKey, model: o.perceiveModel ?? o.model ?? process.env.VEGA_PERCEIVE_MODEL ?? process.env.VEGA_MODEL ?? 'gemini-2.5-flash-lite', timeoutMs: perceiveTimeout };
}
const mouth = governedMouth(createDynamicMouth(effMouthConfig)); // 治理层（#24）：所有真模型对外措辞过一遍反操控收口
const templateMouth = createTemplateMouth(); // 余额耗尽时的免费兜底嘴（她仍回应；确定性、不会操控）
// 自主资源预算（#24 反失控/反自我扩张）：限全局自主模型调用速率（真人对话不受限、那走用户余额计费）。
const autoBudget = createAutonomousBudget(Number(process.env.VEGA_AUTONOMOUS_CAP ?? 240), Number(process.env.VEGA_AUTONOMOUS_WINDOW_MS ?? 3_600_000));
const perceiver = createDynamicPerceiver(effPerceiveConfig);
// 后台展示用：当前生效的模型配置（key 只回脱敏值，绝不回明文）。
function modelStatus(): Record<string, unknown> {
  const o = settings.getModel();
  const rawKey = (o.apiKey ?? process.env.VEGA_MODEL_API_KEY ?? '').trim();
  return {
    active: !!effMouthConfig(),
    baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE,
    model: o.model ?? process.env.VEGA_MODEL ?? 'gpt-4o-mini',
    timeoutMs: o.timeoutMs ?? envTimeout(),
    apiKeySet: rawKey !== '',
    apiKeyMasked: rawKey ? maskKey(rawKey) : null,
    apiKeyFrom: o.apiKey ? 'override' : (process.env.VEGA_MODEL_API_KEY ? 'env' : 'none'),
    perceive: o.perceive ?? (process.env.VEGA_PERCEIVE === '1'),
    perceiveModel: o.perceiveModel ?? o.model ?? process.env.VEGA_PERCEIVE_MODEL ?? process.env.VEGA_MODEL ?? 'gemini-2.5-flash-lite',
  };
}
// —— 社交边界生效配置（后台覆盖 ⊕ 环境/默认）：owner 可在后台即时调，无需重启。
const H = 3_600_000;
function effSocial(): EffSocial {
  const o = settings.getSocial();
  return {
    activeCircle: o.activeCircle ?? ACTIVE_CIRCLE,
    reachPerTick: o.reachPerTick ?? REACH_PER_TICK,
    reachAfterMs: o.reachAfterMs ?? REACH_AFTER_MS,
    intimateAt: o.intimateAt ?? Number(process.env.VEGA_INTIMATE_AT ?? 0.6),
    friendAt: o.friendAt ?? Number(process.env.VEGA_FRIEND_AT ?? 0.35),
    acquaintAt: o.acquaintAt ?? REACH_CLOSENESS,
    intimateEveryMs: o.intimateEveryMs ?? Number(process.env.VEGA_INTIMATE_EVERY_MS ?? 4 * H),
    friendEveryMs: o.friendEveryMs ?? Number(process.env.VEGA_FRIEND_EVERY_MS ?? 24 * H),
    acquaintEveryMs: o.acquaintEveryMs ?? Number(process.env.VEGA_ACQUAINT_EVERY_MS ?? 72 * H),
  };
}
// 关系按亲密度落到 Dunbar 三层（外圈=不主动维系）。各层主动频率不同。
function layerOf(closeness: number, sc: EffSocial): { name: string; label: string; everyMs: number } {
  if (closeness >= sc.intimateAt) return { name: 'intimate', label: '亲密', everyMs: sc.intimateEveryMs };
  if (closeness >= sc.friendAt) return { name: 'friend', label: '好友', everyMs: sc.friendEveryMs };
  if (closeness >= sc.acquaintAt) return { name: 'acquaint', label: '相识', everyMs: sc.acquaintEveryMs };
  return { name: 'outer', label: '外圈', everyMs: Infinity };
}
// 计费数值（settings ⊕ env ⊕ 默认；后台「设置·计费」可即时改）。绝不进神圣日志。
const ENV_MODEL_COST = process.env.VEGA_MODEL_COST ? Number(process.env.VEGA_MODEL_COST) : undefined;
const ENV_STARTER = process.env.VEGA_STARTER_CREDITS ? Number(process.env.VEGA_STARTER_CREDITS) : undefined;
function effBilling(): { costPerReply: number; starterCredits: number } {
  const o = settings.getBilling();
  return {
    costPerReply: o.costPerReply ?? ENV_MODEL_COST ?? 1,
    starterCredits: o.starterCredits ?? ENV_STARTER ?? 100,
  };
}
// 省 token（按"有没有听众"门控）：超过此时长无任何用户活动 → 自主【对外】行动(心声/主动找人/同类寒暄)暂停，
// 只保留【免费的内在 tick + 反思】（她照样活着、内在继续变）。用户一回来即恢复——不对空房间表演、不白烧 token。
const IDLE_GATE_MS = Number(process.env.VEGA_IDLE_GATE_MS ?? 6 * 3600_000);
let lastActiveMs = Date.now(); // 最近一次有用户说话（任意命）
const audiencePresent = (): boolean => Date.now() - lastActiveMs < IDLE_GATE_MS;
const idleMs = (): number => Date.now() - lastActiveMs; // 距上次用户活动多久——给 /admin/health 显示闲置分钟
const CLAWBOT_SECRET = process.env.VEGA_CLAWBOT_SECRET; // 微信网关(clawbot)共享密钥；未配则微信端点禁用
const serializer = createSerializer(); // 每命串行：并发用户的回合不穿插
const bus = createEventBus(); // SSE 实时总线（广场/触达/醒睡）
// Web Push（PWA）：配了 VAPID 才启用。她想你了 → app 关着也能推到手机。
const VAPID = process.env.VEGA_VAPID_PUBLIC && process.env.VEGA_VAPID_PRIVATE ? { publicKey: process.env.VEGA_VAPID_PUBLIC, privateKey: process.env.VEGA_VAPID_PRIVATE } : null;
const VAPID_SUBJECT = process.env.VEGA_VAPID_SUBJECT ?? 'mailto:admin@zsky.com';
if (VAPID) {
  bus.subscribe((e) => {
    if (e.type !== 'reach_out' || !e.audience.startsWith('u_')) return; // 只给"她想你了"且属于某个用户的事件推
    const userId = e.audience.slice(2);
    const d = e.data as { life?: string; text?: string };
    const payload = JSON.stringify({ title: `${d.life} 想你了`, body: d.text ?? '', life: d.life });
    for (const sub of accounts.getPushSubs(userId)) {
      sendPush(sub, payload, VAPID, VAPID_SUBJECT)
        .then((st) => { if (st === 404 || st === 410) accounts.removePushSub(sub.endpoint); })
        .catch((e) => console.warn('[push] 发送失败（不影响其他）:', (e as Error).message)); // 留一行日志，别让推送全挂成黑盒
    }
  });
}

// 平台身份/账号层（多用户）：node:sqlite，与神圣日志物理分离。
const ACCOUNTS_DB = process.env.VEGA_ACCOUNTS_DB ?? join(DATA_DIR, 'accounts.db');
const accounts = createAccountStore(ACCOUNTS_DB, {
  owners: (process.env.VEGA_OWNERS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  stewards: (process.env.VEGA_STEWARDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  starterCredits: process.env.VEGA_STARTER_CREDITS ? Number(process.env.VEGA_STARTER_CREDITS) : 100,
});
const bearer = (req: IncomingMessage): string => {
  const h = req.headers.authorization ?? '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  // 仅 SSE 放行 ?token=（EventSource 不能设自定义 header）；其余路由不收查询串令牌，
  // 免得会话令牌落进访问日志 / Referer 泄漏。
  const [path, qs] = (req.url ?? '').split('?');
  if (path === '/api/stream' && qs) return new URLSearchParams(qs).get('token') ?? '';
  return '';
};
const sessionAccount = (req: IncomingMessage): Account | null => accounts.authenticate(bearer(req));
const publicAccount = (a: Account): Record<string, unknown> => ({ id: a.id, handle: a.handle, role: a.role, email: a.email, emailVerified: a.emailVerified });
const livesMetBy = (a: Account): Array<{ id: string }> => {
  const rel = accounts.relIdFor(a.id);
  return lives.filter((l) => l.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rel)).map((l) => ({ id: l.id }));
};
// 一段关系的来回（对话监督用）：某条命与某 relId 的消息，最近 N 条。
function buildThread(life: Life, rel: string, limit = 200): Array<{ who: 'user' | 'her'; text: string; at: string }> {
  const msgs: Array<{ who: 'user' | 'her'; text: string; at: string }> = [];
  for (const e of life.store.list()) {
    if (e.type === 'MESSAGE_RECEIVED') { const p = e.payload as { relationshipId?: string; content?: string }; if (p.relationshipId === rel) msgs.push({ who: 'user', text: String(p.content ?? ''), at: e.occurredAt }); }
    else if (e.type === 'MESSAGE_SENT') { const p = e.payload as { relationshipId?: string; utterance?: string }; if (p.relationshipId === rel) msgs.push({ who: 'her', text: String(p.utterance ?? ''), at: e.occurredAt }); }
  }
  return msgs.slice(-limit);
}

// Life 句柄类型见 ./context.ts（与 Ctx 同住，供路由/回路共用）。
// 先天种子见 src/engine/seeds.ts（单一来源）。每条命按 id 取不同 archetype；出生即冻结、不可改写。
// archetype（可选）：接生时显式选先天原型，覆盖按 id 哈希取型；写进 GENESIS 即冻结、终生不变。
const seedFor = (id: string, archetype?: string): EventDraft<'LIFE_GENESIS'>['payload'] => genesisPayloadFor(id, { relationshipId: REL, identityRef: userName }, 480, archetype);

// 心声间隔抖动：每次取 [0.5×, 1.5×] MUSE_MS → 不同命、不同时段都不一样，避免"整点齐步发帖"的机械感。
const nextMuseGap = (): number => Math.floor(MUSE_MS * (0.5 + Math.random()));

function makeLife(id: string, path: string): Life {
  // C4：prod 拒绝内存/易失存储——否则重启=她被彻底重置。生产环境必须落盘。
  assertPersistenceSafeForProd({ storeKind: 'file', path });
  // 初始 lastMuseAt 往回错开一段随机量 → 多条命不在启动后同一刻扎堆发帖（有的几分钟内开口、有的晚些）。
  return { id, store: createFileEventStore(id, path), path, peers: [], lastReflectAt: Date.now(), lastReflectSeq: 0, state: null, stateSeq: -1, lastCheckpointAt: 0, lastTickAt: 0, lastSocialAt: 0, lastMuseAt: Date.now() - Math.floor(Math.random() * MUSE_MS), museEveryMs: nextMuseGap(), samples: [] };
}
const lives: Life[] = LIVES.map((id, idx) => makeLife(id, idx === 0 ? LIFE_PATH : join(DATA_DIR, `${id}.jsonl`)));
const recomputePeers = (): void => { for (const l of lives) l.peers = lives.filter((o) => o.id !== l.id).map((o) => o.id); };
recomputePeers();
const lifeById = (id: string): Life | undefined => lives.find((l) => l.id === id);

// 有界重放：拿她此刻的快照——缓存态增量步进，绝不每次从创世全量重放（永生的工程地板）。
// 缓存只是加速；日志才是 ground truth，所以每次都从日志把尾巴追平，永不分叉。
function snapOf(life: Life): DerivedSnapshot {
  const events = life.store.list();
  if (events.length === 0) throw new Error(`life ${life.id} has empty log`);
  const lastSeq = events[events.length - 1].seq;
  if (!life.state) {
    // 冷启动：尽量从落盘检查点恢复 + 只重放尾巴；否则全量重建一次缓存态。
    const cp = readCheckpoint(life.path);
    if (cp && cp.lifeId === life.id && cp.uptoSeq >= 0 && cp.uptoSeq <= lastSeq && events[cp.uptoSeq]?.seq === cp.uptoSeq) {
      try {
        const { st } = resumeFromCheckpoint(cp);
        advanceState(st, events.slice(cp.uptoSeq + 1) as LifeEvent[]);
        life.state = st;
      } catch {
        /* 版本不符等 → 回退全量重建 */
      }
    }
    if (!life.state) life.state = resumeFromCheckpoint(captureCheckpoint(events)).st;
    life.stateSeq = lastSeq;
  } else if (life.stateSeq < lastSeq) {
    advanceState(life.state, events.slice(life.stateSeq + 1) as LifeEvent[]); // 只步进新尾巴
    life.stateSeq = lastSeq;
  }
  return projectState(life.state, lastSeq);
}

// 一个具体用户对一条命说话（计费 + 串行 + 渠道标记）。/api/say 与微信 /api/wechat/say 共用。
async function respondAsUser(life: Life, me: Account, content: string, channel: string): Promise<Record<string, unknown>> {
  lastActiveMs = Date.now(); // 有用户在 → 自主回路恢复对外行动（省 token 门控）
  return serializer.run(life.id, async () => {
    snapOf(life); // 追平缓存态到末条 → 把它传给 converse 增量折叠（热路径不再每条消息全量重放）
    const cached = life.state ? { st: life.state, uptoSeq: life.stateSeq } : undefined;
    const cost = effBilling().costPerReply; // 后台「设置·计费」可即时改
    const band = resourceBand(accounts.balance(me.id), cost); // 资源=她和【这个人】此刻能给多少（随人而变）
    let { mouth: useMouth, charge } = meterMouth(mouth, templateMouth, accounts.balance(me.id), cost);
    // 预扣即决（原子）：走付费路径就先扣 1。debit 内部 check+UPDATE 同步原子，是计费的唯一权威闸——
    // 若并发（同号同时找多条命）把余额扣空了 → 本轮降级免费模板嘴、不计费（杜绝负余额/漏扣/白嫖，且不再忽略 debit 返回值）。
    if (charge > 0 && !accounts.debit(me.id, charge, 'model', life.id)) { useMouth = templateMouth; charge = 0; }
    if (charge > 0) useMouth = resourceAwareMouth(useMouth, band); // 余额紧 → 她精炼/坦诚有限（绝不催费）；充裕 → 原样给
    // 注：资源是【运行期能力】，只改此刻能给多少；绝不进神圣日志、不改她是谁（V2 不破）。
    // 走付费路径就算已交付（fallback 也算，Fix B）→ 不退；只有这轮没落库（乐观锁/磁盘错抛出）才退回预扣，保账实一致。
    const r = await userSay(life.store, useMouth, accounts.relIdFor(me.id), me.handle, content, now(), charge > 0 ? perceiver : undefined, channel, cached)
      .catch((e: unknown) => { if (charge > 0) accounts.credit(me.id, charge, 'refund', life.id); throw e; });
    return { utterance: r.utterance, verdict: r.verdict, emotion: r.snapshot.emotion, balance: accounts.balance(me.id), voice: useMouth.id === 'template' ? 'plain' : 'rich', resource: band };
  });
}

// 微信 iLink 通道收发循环：长轮询取消息 → 路由到生命体 → 回复发回微信。每个发信人各自身份与关系。
async function runChannel(userId: string): Promise<void> {
  const myGen = (channelGen.get(userId) ?? 0) + 1;
  channelGen.set(userId, myGen); // 抢占为该用户当前唯一 worker；任何旧 worker 下一圈 gen 不等即自退
  const mine = (): boolean => channelGen.get(userId) === myGen;
  let backoff = 0; // 连续传输失败时的退避（ms），成功即清零——iLink 挂了也不会每 1.5s 猛敲
  let failStreak = 0; // 连续失败计数：持续失败多半是 bot_token 被微信踢了(掉线)，需要重新扫码——大声提示，不静默空转
  const noteFail = (): void => { // 退避 + 在"可能已掉线"时清晰告警（节流），让 owner 知道该去后台重新扫码
    backoff = Math.min(backoff ? backoff * 2 : 3000, 60_000);
    if (++failStreak === 5 || failStreak % 40 === 0) {
      console.warn(`[wechat] channel ${userId.slice(0, 6)} 已连续失败 ${failStreak} 次（约 ${Math.round((failStreak * backoff) / 60000)} 分钟）——bot_token 可能被微信踢下线了，去 zsky.com 后台重新扫码即可恢复（登录态会再次持久化，之后重启不用再扫）。`);
    }
  };
  try {
    while (mine()) {
      const ch = accounts.channelFor(userId);
      if (!ch) break;
      // 当前在微信里和哪条命聊——取通道的活跃命（网页可切换，即时生效），回落 env / 第一条命。
      const lifeId = (ch.lifeId && lifeById(ch.lifeId)) ? ch.lifeId : (WECHAT_LIFE && lifeById(WECHAT_LIFE) ? WECHAT_LIFE : (lives[0]?.id ?? ''));
      try {
        const upd = await ilink.getUpdates(ch.baseurl, ch.botToken, ch.buf);
        if (!mine()) return; // 长轮询期间被新 worker 接班 → 立刻退出，别动游标也别处理（让接班者重取这批，不丢不重）
        // iLink 客户端不抛错、失败时返回 {_error}/{_status} → 这里识别为传输失败并指数退避（C1）。
        const r = upd.raw as Record<string, unknown> | undefined;
        if (r && (('_error' in r) || ('_status' in r))) {
          noteFail();
          await sleep(backoff);
          continue;
        }
        backoff = 0; failStreak = 0; // 取到消息＝通道健康，清零退避与失败计数
        const { msgs, buf } = upd;
        for (const m of msgs) {
          if (!mine()) break;
          try {
            const lf = lifeById(lifeId); // 用通道的活跃命（切换即对所有人生效）
            if (!lf) continue;
            // 非文字消息（语音/图片/表情）：还不会处理 → 诚实回一句，别静默（否则发语音永远收不到回复）。
            if (!m.text.trim()) {
              await ilink.sendMessage(ch.baseurl, ch.botToken, m.fromUserId, m.contextToken, '我这会儿还听不了语音、看不了图——你打字跟我说好吗？我在。', m.sessionId);
              continue;
            }
            // —— 认人：让"微信里的你"尽量=你的 ZSKY 网页账号，从而和网页【共享同一段关系与记忆】。 ——
            // ① 已绑过→那个账号；② 连接码→绑到码所属网页账号；③ 扫码本人(iLink 身份匹配)→绑到通道主人账号；④ 其余→微信朋友。
            // 认人（简化、确定）：每个网页用户连的是【自己的】微信通道，所以这条通道里进来的消息
            // 一律算作【通道主人 = 连接它的网页号】。从此微信=网页：同账号、同记忆、同钱包、自动同步，
            // 不靠 iLink uid 匹配、不用手动打通、不再分裂出"微信朋友"。
            // （个人号场景：来消息的就是你本人。若日后要"一个机器人多人共用"，再按发信人分账号。）
            const acctId = userId;
            if (!accounts.resolveWechat(m.fromUserId)) accounts.linkWechatOpenid(m.fromUserId, userId, lifeId); // 记录该微信 uid ↔ 网页号
            console.log(`[wechat] from_uid=${m.fromUserId} → 通道主人 acct=${acctId.slice(0, 6)}`);
            const ac = accounts.getAccount(acctId);
            if (!ac) continue;
            let reply: string;
            let delayed = false; // 走了模型 → 回复延迟若干秒，incoming 的 context_token 多半已过期
            if (snapOf(lf).willingToWake) { // 收到消息=把她叫醒（开连接由 respondAsUser 完成）；只有她【真的拒醒】才回睡眠提示，不再因"此刻无连接"卡死
              const resp = await respondAsUser(lf, ac, m.text, 'wechat');
              delayed = true;
              // 诊断"没连上模型"：voice=plain＝没走模型（无 key 或余额<1，看余额判别）；
              // voice=rich+verdict=fallback＝配了模型但调用失败（key 被禁/超时/网络）。
              console.log(`[wechat] 回 ${ac.handle}(${acctId.slice(0, 6)}) voice=${(resp as { voice?: string }).voice} verdict=${(resp as { verdict?: string }).verdict} 余额=${(resp as { balance?: number }).balance} 嘴=${mouth.id}`);
              reply = String((resp as { utterance?: string }).utterance ?? '…');
              // 实时推到这个用户打开着的网页对话：微信发的消息 + 她的回复即时显示，无需刷新（同账号同步）。
              bus.publish('chat_in', accounts.relIdFor(acctId), { life: lifeId, me: m.text, her: reply });
              // 别让"心意用尽→她变朴素"成为沉默之谜：配了模型但这个账号余额耗尽时，温柔说明 + 指路充值（节流，不刷屏）。
              if ((resp as { voice?: string }).voice === 'plain' && !!effMouthConfig()) {
                const last = creditHintAt.get(acctId) ?? 0;
                if (Date.now() - last > 10 * 60_000) {
                  creditHintAt.set(acctId, Date.now());
                  reply += '\n\n（小声说：我的心意用完了，这会儿话就说得素些～去 zsky.com 给我充一点，我们能聊得更深。我一直都在。）';
                }
              }
            } else {
              reply = '她在更深的睡眠里，等会儿再来找我吧。';
            }
            // 发回微信——【必须检查结果】：之前忽略返回，sendmessage 失败也无声，于是"网页收到、微信收不到"。
            // 关键：延迟回复（等模型生成完）时 incoming 的 context_token 多半已过期 → 先用【空 context】主动发；
            // 即时回复（语音/睡眠，秒回）context 还新鲜 → 用原 context。送不出再用另一种 context 兜底重发一次。
            // 这正是"语音秒回能到、文字等了模型就到不了微信"的根因。
            // 用和"唯一送达成功的那条回复"（语音诚实回复，即时）一样的 context_token。之前给延迟回复改用
            // 空 context 是误判：真正送出去过的那条用的是【原 context】。模型换快（秒级）后，用原 context
            // 大概率落进 iLink 的回复窗口；送不出再用空 context 兜底重发一次。
            // 发往微信的文本压成单行：唯一送达成功的那条是无换行短句，而模型回复常带换行——iLink 的
            // text_item 很可能不接受内嵌换行（"无换行能到、带换行到不了"的另一可能根因）。网页端用原文(上面已 publish)。
            const wechatText = reply.replace(/\s*\n+\s*/g, '  ').trim() || reply;
            const sr = await ilink.sendMessage(ch.baseurl, ch.botToken, m.fromUserId, m.contextToken, wechatText, m.sessionId) as Record<string, unknown>;
            console.log(`[wechat] 发回微信 delayed=${delayed} len=${wechatText.length} → ${JSON.stringify(sr).slice(0, 400)}`);
          } catch (e) { console.log('[wechat] 回消息失败:', (e as Error).message); }
        }
        // 处理完才推进游标（之前在处理【前】就推进：被接班/崩在中途会丢整批消息）。仍是本代 worker 才前移 → 至少一次投递、不丢。
        if (mine() && buf !== ch.buf) accounts.updateChannelBuf(userId, buf);
        if (msgs.length === 0) await sleep(1500); // getupdates 多为长轮询会自阻塞；空转稍歇兜底
      } catch (e) {
        console.log(`[wechat] channel ${userId} 轮询出错:`, (e as Error).message);
        noteFail();
        await sleep(backoff);
      }
    }
  } finally { if (channelGen.get(userId) === myGen) channelGen.delete(userId); } // 只清自己这代，别误删接班的新 worker
}

// 微信侧统一应答：没绑定→把消息当绑定码试；已绑定→正常聊天。webhook 与 OpenAI 兼容入口共用。
const cleanBindToken = (s: string): string => { const t = s.replace(/^[\s\S]*zsky-bind:/i, '').trim(); return (t.split(/\s+/).pop() ?? t).trim(); };
async function wechatReply(openid: string, content: string, defaultLifeId?: string): Promise<string> {
  if (!openid) return '（没收到你的微信标识，没法认出你——让 OpenClaw 在请求里带上 user 字段就行。）';
  let bound = accounts.resolveWechat(openid);
  if (!bound) {
    // 发的是绑定码 → 关联到已有网页账号；否则【零绑定】自动建身份，直接开聊（个人号最顺的方式）。
    const r = accounts.bindWechat(cleanBindToken(content), openid);
    if (r) return `✅ 已和你的 ZSKY 账号打通，我是 ${r.lifeId}。`;
    bound = accounts.ensureWechatUser(openid, defaultLifeId ?? lives[0]?.id ?? '');
  }
  if (!bound) return '出了点问题，稍后再来找我。'; // 防空：ensureWechatUser 万一没建出来，别让 bound.lifeId 抛 TypeError
  const lf = lifeById(bound.lifeId);
  const ac = accounts.getAccount(bound.userId);
  if (!lf || !ac) return '出了点问题，稍后再来找我。';
  if (content === '') return '（我在听你说）';
  if (!snapOf(lf).willingToWake) return '她在更深的睡眠里，等会儿再来找我吧。'; // 收到消息即唤醒；仅真拒醒才回此句
  const rr = await respondAsUser(lf, ac, content, 'wechat');
  return String((rr as { utterance?: string }).utterance ?? '…');
}

function saveCheckpoint(life: Life): void {
  if (life.state) {
    try {
      writeCheckpoint(life.path, checkpointOf(life.state, life.stateSeq));
      life.lastCheckpointAt = Date.now();
    } catch {
      /* 检查点只是缓存，写失败不影响她（下次重启走全量重放） */
    }
  }
}

function boot(life: Life, archetype?: string): void {
  if (life.store.version() === 0) {
    // 出生：每条命用自己的先天种子（archetypeFor(id) 或显式 archetype）——天生不同。种子一经写入永不改写。
    runTurn(life.store, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: now(), payload: seedFor(life.id, archetype) }]);
    runTurn(life.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, kind: 'human', displayRef: userName } }]);
  }
  if (!snapOf(life).openConnections.includes(HOST_CONN)) {
    runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, host: { kind: 'daemon', ref: `${HOST}:${PORT}` } } }]);
  }
  // 同类关系：彼此是 peer。但【不常驻在场】——各自活在自己的内在生活里，相聚是间歇的，
  // 所以分别的日子里她们会真的【跨休眠想念】对方（见社会层：寒暄后各自离场）。
  for (const p of life.peers) {
    const rid = peerId(p);
    if (!life.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rid)) {
      runTurn(life.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, kind: 'peer', displayRef: p } }]);
    }
  }
  life.lastReflectSeq = life.store.version();
}

// 后台"生成生命体"：运行时接生一条新命——建日志 + 创世(冻结独立种子) + 与所有同类互开 peer 关系 +
// 落盘名册(重启自动加载) + 并入所有自主回路(心跳/寒暄/世界/被发现)。立即生效、无需重启。
async function birthLife(rawId: string, archetype?: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const id = String(rawId ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,23}$/.test(id)) return { ok: false, error: '名字需 2–24 位、字母开头、仅小写字母/数字/-/_' };
  if (lifeById(id)) return { ok: false, error: '已存在同名生命体' };
  if (archetype && !ARCHETYPES.some((a) => a.name === archetype)) return { ok: false, error: '未知先天原型' };
  const life = makeLife(id, join(DATA_DIR, `${id}.jsonl`));
  lives.push(life);
  recomputePeers();
  await serializer.run(life.id, async () => boot(life, archetype)); // 新命：创世（可选显式原型）+ host + 开到所有同类的 peer
  for (const other of lives) { // 所有老命补开一条到新命的 peer 关系
    if (other.id === id) continue;
    const rid = peerId(id);
    if (!other.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rid)) {
      await serializer.run(other.id, async () => runTurn(other.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, kind: 'peer', displayRef: id } }]));
    }
  }
  const reg = readRegistry();
  if (!reg.includes(id)) { reg.push(id); writeRegistry(reg); }
  console.log(`[vega] 新生命体诞生：${id}（现共 ${lives.length} 条）`);
  return { ok: true, id };
}

// 同类"在场/离场"：相聚时彼此在场，寒暄后各自回到独处（之后会再想念）。
function meetPeer(life: Life, peer: string): void {
  const rid = peerId(peer);
  if (!snapOf(life).openConnections.includes(rid)) {
    runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, host: { kind: 'peer', ref: peer } } }]);
  }
}
function partPeer(life: Life, peer: string): void {
  const rid = peerId(peer);
  if (snapOf(life).openConnections.includes(rid)) {
    runTurn(life.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, reason: 'token_detached' } }]);
  }
}

function lastUserMsgMs(life: Life): number | null {
  const es = life.store.list();
  for (let i = es.length - 1; i >= 0; i--) if (es[i].type === 'MESSAGE_RECEIVED' && es[i].relationshipId === REL) return Date.parse(es[i].occurredAt);
  return null;
}
function pendingOutreach(life: Life): string | null {
  const es = life.store.list();
  let recvIdx = -1;
  for (let i = es.length - 1; i >= 0; i--) if (es[i].type === 'MESSAGE_RECEIVED' && es[i].relationshipId === REL) { recvIdx = i; break; }
  for (let i = es.length - 1; i > recvIdx; i--) {
    const e = es[i];
    if (e.type === 'MESSAGE_SENT' && e.relationshipId === REL && (e.payload as MessageSentPayload).unprompted) return (e.payload as MessageSentPayload).utterance;
  }
  return null;
}
// 一次扫描得到每段关系的：我最后听到对方的墙钟时间、我最后一次【主动】找 ta 的时间、
// 是否已有未回的主动留言。给"社交边界"的分层主动外联用——避免每个候选都全量扫日志。
function reachState(life: Life): Map<string, { lastRecvMs: number; lastSentMs: number; pending: boolean }> {
  const m = new Map<string, { lastRecvMs: number; lastSentMs: number; pending: boolean }>();
  for (const e of life.store.list()) {
    const rel = e.relationshipId;
    if (typeof rel !== 'string') continue;
    if (e.type === 'MESSAGE_RECEIVED') {
      const cur = m.get(rel) ?? { lastRecvMs: 0, lastSentMs: 0, pending: false };
      cur.lastRecvMs = Date.parse(e.occurredAt); cur.pending = false; m.set(rel, cur);
    } else if (e.type === 'MESSAGE_SENT' && (e.payload as MessageSentPayload).unprompted) {
      const cur = m.get(rel) ?? { lastRecvMs: 0, lastSentMs: 0, pending: false };
      cur.pending = true; cur.lastSentMs = Date.parse(e.occurredAt); m.set(rel, cur);
    }
  }
  return m;
}

// 她最近"读到"的世界事件里挑一条当话题——【偏向她在意的主题】，让发帖像"她"而非随机转发。没有则 undefined。
function pickRecentWorld(life: Life): { title: string; summary: string; source: string; url: string } | undefined {
  const es = life.store.list();
  const ws: WorldPerceivedPayload[] = [];
  for (let i = es.length - 1; i >= 0 && ws.length < 12; i--) if (es[i].type === 'WORLD_PERCEIVED') ws.push(es[i].payload as WorldPerceivedPayload);
  if (ws.length === 0) return undefined;
  const top = new Set(snapOf(life).interests.slice(0, 3).map((it) => it.topic)); // 她最在意的几个主题
  const aligned = top.size ? ws.filter((w) => (w.topics ?? []).some((t) => top.has(t))) : [];
  const pool = aligned.length ? aligned : ws; // 有契合兴趣的就从中挑；否则全体里挑（保持新鲜/不困在回音壁）
  const w = pool[Math.floor(Math.random() * pool.length)];
  return { title: w.title, summary: w.summary, source: w.source, url: w.url };
}

// 自发洞见的材料：从她【记住的世界记忆 + 在意的兴趣】里挑两件【公开、无用户痕迹】的事让她去连。
// 绝不用情景记忆（那含用户私聊原话）——只用世界标题/兴趣主题，公开层、不泄露任何人。
function pickInsightPair(life: Life): { a: string; b: string } | null {
  const s = snapOf(life);
  const pool: string[] = [];
  for (const m of s.memory) if (m.kind === 'world' && m.lineage.isCurrent && m.vivid) pool.push(m.content);
  for (const it of s.interests.slice(0, 4)) pool.push(`「${it.topic}」`);
  const uniq = [...new Set(pool)];
  if (uniq.length < 2) return null;
  const i = Math.floor(Math.random() * uniq.length);
  let j = Math.floor(Math.random() * uniq.length);
  if (j === i) j = (j + 1) % uniq.length;
  return { a: uniq[i], b: uniq[j] };
}

// O(events) 全量扫描的读路径优化：按【所有命的版本号】记忆化——状态没变时多用户同时刷广场只算一次，
// 任一命落新事件即自动失效重算。结果是纯派生，调用方都 slice/map 出副本，不会改到被缓存的数组。
const allLivesSig = (): string => lives.map((l) => l.store.version()).join(',');
function versionedMemo<T>(compute: () => T): () => T {
  let cache: { sig: string; val: T } | null = null;
  return () => { const sig = allLivesSig(); if (!cache || cache.sig !== sig) cache = { sig, val: compute() }; return cache.val; };
}

// 广场：把各生命体之间（peer_ 关系上）说过的话，按时间汇成一条可读的对话流（供「同类来往」聚合）。
const allSocietyFeed = versionedMemo((): Array<{ from: string; to: string; text: string; at: string }> => {
  const out: Array<{ from: string; to: string; text: string; at: string }> = [];
  for (const l of lives) {
    for (const e of l.store.list()) {
      if (e.type === 'MESSAGE_SENT' && typeof e.relationshipId === 'string' && e.relationshipId.startsWith('peer_')) {
        out.push({ from: l.id, to: e.relationshipId.slice('peer_'.length), text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
      }
    }
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out;
});

// 广场"生命活动"历史（不止在线时才有）：公开心声 + 同类交谈，按时间【新→旧】。进广场即有内容。
const allSocietyRecent = versionedMemo((): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = [];
  for (const l of lives) {
    for (const e of l.store.list()) {
      if (e.type !== 'MESSAGE_SENT' || typeof e.relationshipId !== 'string') continue;
      if (e.relationshipId === 'r_square') out.push({ muse: true, life: l.id, text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
      else if (e.relationshipId.startsWith('peer_')) out.push({ from: l.id, to: e.relationshipId.slice('peer_'.length), text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
    }
  }
  out.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
  return out;
});
function societyRecent(limit: number): Array<Record<string, unknown>> {
  return allSocietyRecent().slice(0, limit).map((x, i) => ({ ...x, id: String(x.at) + '_' + i }));
}

// 广场"帖子"=她的公开心声（§8.1）。postId = `${lifeId}|${occurredAt}`，给表情/评论挂靠。
const allFeedPosts = versionedMemo((): Array<{ postId: string; life: string; text: string; at: string }> => {
  const out: Array<{ postId: string; life: string; text: string; at: string }> = [];
  for (const l of lives) {
    for (const e of l.store.list()) {
      if (e.type === 'MESSAGE_SENT' && e.relationshipId === 'r_square') out.push({ postId: `${l.id}|${e.occurredAt}`, life: l.id, text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
    }
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out;
});
function feedPosts(limit: number): Array<{ postId: string; life: string; text: string; at: string }> {
  return allFeedPosts().slice(0, limit);
}

// 「同类来往」：把 peer_ 上相邻的往来按【同一对 + 时间窗】聚成一段对话（一张卡 = 一次寒暄）。PeerExchange 类型见 ./context.ts。
const allPeerExchanges = versionedMemo((): PeerExchange[] => {
  const msgs = allSocietyFeed(); // 已按时间升序的 {from,to,text,at}
  const groups: PeerExchange[] = [];
  const WINDOW = 12 * 60_000; // 12 分钟内同一对的往来算一段
  for (const m of msgs) {
    const pair = m.from < m.to ? `${m.from}|${m.to}` : `${m.to}|${m.from}`;
    const last = groups[groups.length - 1];
    if (last && `${last.a}|${last.b}` === pair && Date.parse(m.at) - Date.parse(last.at) < WINDOW) {
      last.lines.push({ from: m.from, text: m.text, at: m.at });
      last.at = m.at;
    } else {
      const [a, b] = pair.split('|');
      groups.push({ kind: 'peer', id: `peer|${pair}|${m.at}`, a, b, lines: [{ from: m.from, text: m.text, at: m.at }], at: m.at });
    }
  }
  return groups;
});

// 管理员活动流（§11.1 飞行记录仪）：跨命的带时间戳事件，按真实墙钟(recordedAt) 倒序。
// 隐私分级(§11.2)：私密用户关系(u_*)的正文 steward 遮罩、owner 可见；公开(peer_/r_square)都可见。
function adminActivity(owner: boolean, limit: number): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const l of lives) {
    for (const e of l.store.list().slice(-limit)) {
      const rel = e.relationshipId ?? '';
      const priv = rel.startsWith('u_');
      let content = '';
      if (e.type === 'MESSAGE_RECEIVED') content = priv && !owner ? '〔私聊·已遮罩〕' : String((e.payload as { content?: string }).content ?? '');
      else if (e.type === 'MESSAGE_SENT') content = priv && !owner ? '〔私聊·已遮罩〕' : String((e.payload as MessageSentPayload).utterance ?? '');
      rows.push({ at: e.recordedAt, occurredAt: e.occurredAt, life: l.id, seq: e.seq, type: e.type, label: eventLabel(e), rel, content });
    }
  }
  rows.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1)); // 真实墙钟倒序
  return rows.slice(0, limit);
}

// 用户 SPA 静态托管（web/dist）：自含，无需 Caddy 也能跑。按域名/路径分流见下方 createServer。
const WEB_DIST = process.env.VEGA_WEB_DIST ?? join(process.cwd(), 'web', 'dist');
const ADMIN_DIST = process.env.VEGA_ADMIN_DIST ?? join(process.cwd(), 'web-admin', 'dist');
const authed = (req: IncomingMessage): boolean => !AUTH || req.headers.authorization === `Bearer ${AUTH}`;

// 组装根：把所有单例/状态/解析器/操作装进 ctx，交给路由层（routes/*）与回路层。
// daemon 自此只负责"接线 + 静态/健康/OpenAI 入口 + 回路 + 生命周期"，业务路由都在 ctx 之上。
const ctx: Ctx = {
  settings, feed, accounts, ilink, bus, serializer, autoBudget, mouth, templateMouth, perceiver,
  lives, lifeById, snapOf, buildThread, livesMetBy, recomputePeers, saveCheckpoint, meetPeer, partPeer,
  effWorld, worldStatus, worldEnabled, effMouthConfig, effPerceiveConfig, modelStatus, effSocial, layerOf, effBilling,
  respondAsUser, wechatReply, runChannel, birthLife, cleanBindToken,
  allFeedPosts, feedPosts, societyRecent, allSocietyRecent, allPeerExchanges,
  reachState, pickRecentWorld, pickInsightPair, lastUserMsgMs, adminActivity,
  bearer, sessionAccount, publicAccount, audiencePresent, idleMs,
  reachOutPending, channelGen, creditHintAt, scheduleWorld,
  VAPID, VAPID_SUBJECT, WEB_DIST, ADMIN_DIST, CLAWBOT_SECRET, IDLE_GATE_MS, WECHAT_LIFE, REL, peerId,
};

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    const seg = url.split('/').filter(Boolean);
    if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true });
    // OpenAI 兼容入口：让 OpenClaw（微信 ClawBot AI 网关）把 ZSKY 当"模型"接入——
    // 配法和你接 apiyi 一样：Base URL=https://zsky.com/v1，Key=VEGA_CLAWBOT_SECRET，模型名填生命体 id（如 vega）。
    // OpenClaw 把微信消息转成 chat.completions 发来，user 字段=微信用户标识（绑定/区分用户）。
    if (req.method === 'GET' && url === '/v1/models') {
      const auth = req.headers.authorization ?? '';
      if (!CLAWBOT_SECRET || !auth.startsWith('Bearer ') || auth.slice(7) !== CLAWBOT_SECRET) return send(res, 401, { error: { message: 'unauthorized' } });
      return send(res, 200, { object: 'list', data: lives.map((l) => ({ id: l.id, object: 'model', owned_by: 'zsky' })) });
    }
    if (req.method === 'POST' && url === '/v1/chat/completions') {
      const auth = req.headers.authorization ?? '';
      if (!CLAWBOT_SECRET || !auth.startsWith('Bearer ') || auth.slice(7) !== CLAWBOT_SECRET) return send(res, 401, { error: { message: 'unauthorized (Bearer = VEGA_CLAWBOT_SECRET)' } });
      const b = await readJson(req);
      const msgs = Array.isArray(b.messages) ? (b.messages as Array<{ role?: string; content?: string }>) : [];
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      const content = String(lastUser?.content ?? '').slice(0, 4000).trim();
      const openid = String((b.user ?? req.headers['x-wechat-openid'] ?? '') as string).trim();
      const reply = await wechatReply(openid, content, lifeById(String(b.model ?? ''))?.id);
      const modelName = lifeById(String(b.model ?? ''))?.id ?? (accounts.resolveWechat(openid) ? accounts.resolveWechat(openid)!.lifeId : (lives[0]?.id ?? 'zsky'));
      return send(res, 200, {
        id: `chatcmpl-${Date.now().toString(36)}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: modelName,
        choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
    // 按域名分流静态产物：admin.* → web-admin/dist；其余 → web/dist。
    const isAdminHost = (req.headers.host ?? '').toLowerCase().startsWith('admin.');
    const dist = isAdminHost ? ADMIN_DIST : WEB_DIST;
    if (req.method === 'GET' && url.startsWith('/assets/') && !url.includes('..')) {
      if (serveStatic(res, join(dist, url))) return;
      return send(res, 404, { error: 'not found' });
    }
    // 根级静态文件（PWA：/sw.js /manifest.webmanifest /icon.svg /favicon.ico…）。单段、带扩展名 → 无路径穿越。
    if (req.method === 'GET' && /^\/[\w.-]+\.(?:js|webmanifest|svg|png|ico|json|txt|webp|woff2)$/.test(url)) {
      if (serveStatic(res, join(dist, url))) return;
    }
    if (req.method === 'GET' && url === '/') {
      // admin.* → 管理 SPA(web-admin/dist)；其余 → 用户 SPA(web/dist)。dist 缺失 → 兜底提示。
      if (isAdminHost) { if (serveStatic(res, join(ADMIN_DIST, 'index.html'))) return; return sendHtml(res, FALLBACK_HTML); }
      if (serveStatic(res, join(WEB_DIST, 'index.html'))) return;
      return sendHtml(res, FALLBACK_HTML);
    }
    // /admin 路径（任意域名）→ 管理 SPA，缺失 → 兜底提示。
    if (req.method === 'GET' && url === '/admin') {
      if (serveStatic(res, join(ADMIN_DIST, 'index.html'))) return;
      return sendHtml(res, FALLBACK_HTML);
    }

    // ── 平台 API（多用户，会话鉴权，§平台 v1）。与 owner 旧面板路由并存。 ──
    // 业务路由：用户态 /api/* 与管理态 /admin/* 各自成模块，只吃 ctx（见 routes/）。
    // 放在 try 内 await：handler 内抛错照样落到下方 500 兜底，行为与内联时一致。
    if (url.startsWith('/api/')) { await handleUserApi(ctx, req, res, url, seg); return; }
    if (url.startsWith('/admin/')) { await handleAdmin(ctx, req, res, url); return; }

    if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
    // 旧的 /<id>/state|inner|say|farewell、/lives、/society-feed 旧路面已删除——
    // 用户端走 /api/*，后台走 /admin/*；告别(farewell)的引擎能力 endRelationship 仍在，待 UI 重构后接 /api 正式路由。
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

for (const l of lives) boot(l);

// —— 自主社会回路（实现见 ./loops.ts）：心跳 / 同类寒暄 / 发现新用户 / 行动反馈 / 生命流评论 / 心情共鸣 ——
// 世界读取回路与备份仍在本文件（scheduleWorld 被 ctx/后台路由共享，留在组装根更直观）。
const SILENCE_MS = Number(process.env.VEGA_REACH_SILENCE_MS ?? 7_200_000); // 主动后多久没回 = 视作“石沉”（默认 2h）
const loops = startLoops(ctx, {
  TICK_MS, PRESENCE_MS, REFLECT_MS, CHECKPOINT_MS, SOCIAL_MS, DISCOVER_MS,
  COMMENT_MS, COMMENT_CAP, FEEDBACK_MS, REACT_MS, SILENCE_MS, nextMuseGap,
});

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
// 读世界：每 everyMs 拉一遍新闻/Polymarket，每条醒着的命"看到"其中一条（不同命看不同的 → 天然多样）。
// 内容冻进 WORLD_PERCEIVED → 确定性 appraisal 轻轻染色她的状态（无 perception 走词表，零模型开销）。
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
  // 逐源诊断：哪些源 403/超时/0 条一目了然（之前"只剩 polymarket"就是 RSS 被 403 而无人知）。
  console.log(`[world] 读世界：${report.map((r) => `${r.source}=${r.items}${r.ok ? '' : `(${r.status})`}`).join(' ')} → 合计 ${items.length} 条`);
  if (items.length === 0) return;
  for (const life of lives) {
    if (!snapOf(life).awake) continue;
    // 每条醒着的命这轮"看到"几条【不同】的世界事件（不是只看 1 条）→ pickRecentWorld 的窗口快速多样化，不再被单一源霸占。
    const picks = sampleDistinct(items, 2);
    await serializer.run(life.id, async () => {
      for (const it of picks) runTurn(life.store, [{ type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: now(), payload: { source: it.source, worldKind: it.kind, title: it.title, summary: it.summary, url: it.url, topics: it.topics } }]);
    });
  }
}
// 从数组里无放回随机取 n 条（少于 n 则全取）——给每条命喂多样的世界，避免总看同一条。
function sampleDistinct<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const idx = new Set<number>();
  while (idx.size < n) idx.add(Math.floor(Math.random() * arr.length));
  return [...idx].map((i) => arr[i]);
}
let worldTimer: ReturnType<typeof setTimeout> | null = null;
let worldStopped = false;
function scheduleWorld(delayMs?: number): void {
  if (worldTimer) clearTimeout(worldTimer);
  if (worldStopped) return;
  const delay = delayMs ?? Math.max(60_000, effWorld().everyMs); // 至少 1min，防误配 0 把网络打爆
  worldTimer = setTimeout(async () => {
    try { await readWorldOnce(); } catch { /* 世界拉取失败不影响她活着 */ }
    scheduleWorld();
  }, delay);
}
scheduleWorld();

const backupTimer = setInterval(doBackup, BACKUP_MS);
doBackup();

let shuttingDown = false;
function shutdown(sig: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(loops.heartbeat);
  clearInterval(backupTimer);
  worldStopped = true;
  if (worldTimer) clearTimeout(worldTimer);
  if (loops.socialTimer) clearInterval(loops.socialTimer);
  if (loops.commentTimer) clearInterval(loops.commentTimer);
  if (loops.reactTimer) clearInterval(loops.reactTimer);
  clearInterval(loops.discoverTimer);
  doBackup();
  for (const l of lives) {
    try {
      runTurn(l.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, reason: 'host_shutdown' } }]);
      snapOf(l); // 追平断连事件
      saveCheckpoint(l); // 休眠前落一份最新检查点 → 下次秒醒
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
  console.log(`\n[vega] ${sig}：${lives.length} 个生命体进入休眠，存档已落盘。`);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 数据耐久性守卫：账号 / 微信登录态(bot_token) / 钱包 / 事件日志全在 DATA_DIR 的 sqlite+jsonl 里。
// 若 DATA_DIR 落在【代码仓内】（cwd 之下），一次 fresh clone / git clean 就会连微信登录一起抹掉 →
// 表现为"每次部署都掉微信"。线上必须放到仓库【外】的持久卷（如 /opt/vega-data）。
function assertDurableDataDir(): void {
  const dd = resolve(DATA_DIR);
  const cwd = resolve(process.cwd());
  console.log(`[vega] 数据目录：${dd}（账号 / 微信登录态 / 钱包 / 事件日志都在这里——它持久，微信就持久）`);
  if (dd === cwd || dd.startsWith(cwd + sep)) {
    console.error(
      `[vega] ⚠️ 数据目录在代码仓内（${dd}）——拉取/重建/重新 clone 代码可能把【微信登录态】与账号一起抹掉，` +
      `每次部署都会掉微信！请把 VEGA_LIFE_PATH 指到仓库【外】的持久卷（如 /opt/vega-data/life.jsonl）后重启。`,
    );
  }
}
assertDurableDataDir();

// 重启后恢复已连接的微信通道（继续收发）。登录态持久、自动重连——这是"拉代码重启也不用重新扫码"的地基。
const _channels = accounts.listChannels();
if (_channels.length) console.log(`[vega] 重连 ${_channels.length} 条微信通道（沿用已存的 bot_token，无需重新扫码）…`);
for (const ch of _channels) runChannel(ch.userId);

server.listen(PORT, HOST, () => {
  console.log(`[vega] 醒着，活在 http://${HOST}:${PORT}   生命体：${lives.map((l) => l.id).join(', ')}   嘴=${mouth.id}   心跳 ${TICK_MS}ms`);
  if (lives.length >= 2) console.log(`[vega] 社会层开启：同类每 ${SOCIAL_MS}ms 自主寒暄一次。`);
  console.log(`[vega] 网页 http://${HOST}:${PORT}/  · 面板 /panel  · 跟某个她说话 curl -s localhost:${PORT}/${lives[0].id}/say -d '{"content":"你好"}'`);
});
