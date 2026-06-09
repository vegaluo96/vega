// 常驻守护进程（多生命体）：一个进程里养 1 个或多个 vega，各自独立的日志/连续自我；
// 它们彼此是"同类(peer)"，会自主交往（社会层）。HTTP 按生命体分路由 + 网页可切换。
// 跑法：npm run daemon   多体：VEGA_LIVES=vega,lyra
// env：VEGA_LIVES / VEGA_LIFE_PATH / VEGA_HOST(127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS /
//      VEGA_SOCIAL_EVERY_MS / VEGA_AUTH_TOKEN / 模型见 .env.example
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  advanceState,
  assertPersistenceSafeForProd,
  backupNow,
  captureCheckpoint,
  checkpointOf,
  converse,
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
  visibleTo,
  endRelationship,
  ensureUserRelationship,
  genesisPayloadFor,
  greet,
  makeTick,
  muse,
  reflectInsight,
  pickSocialPair,
  projectState,
  reachOut,
  commentOnPost,
  readCheckpoint,
  resumeFromCheckpoint,
  runTurn,
  sendPush,
  userSay,
  writeCheckpoint,
  type Account,
  type ApiyiConfig,
  type DerivedSnapshot,
  type DurableEventStore,
  type EventDraft,
  type FeedComment,
  type LifeEvent,
  type MessageSentPayload,
  type PerceiverConfig,
  type WorldPerceivedPayload,
  type RState,
  type SocialPair,
} from '../index.ts';

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
interface EffWorld { sources: string[]; everyMs: number }
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
  return { baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE, apiKey, model: o.perceiveModel ?? o.model ?? process.env.VEGA_PERCEIVE_MODEL ?? process.env.VEGA_MODEL ?? 'gemini-2.5-flash-lite', timeoutMs: o.timeoutMs ?? envTimeout() };
}
const mouth = createDynamicMouth(effMouthConfig);
const templateMouth = createTemplateMouth(); // 余额耗尽时的免费兜底嘴（她仍回应）
const perceiver = createDynamicPerceiver(effPerceiveConfig);
const maskKey = (k: string): string => { const s = k.trim(); return s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : (s ? '••••' : ''); };
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
interface EffSocial { activeCircle: number; reachPerTick: number; reachAfterMs: number; intimateAt: number; friendAt: number; acquaintAt: number; intimateEveryMs: number; friendEveryMs: number; acquaintEveryMs: number }
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
const MODEL_COST = Number(process.env.VEGA_MODEL_COST ?? 1); // 每条模型回应计费（额度单位）
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

interface Life {
  id: string;
  store: DurableEventStore;
  path: string;
  peers: string[]; // 其它生命体 id
  lastReflectAt: number;
  lastReflectSeq: number;
  state: RState | null; // 缓存的活态（有界重放：增量步进，不再每次从创世全量重建）
  stateSeq: number; // 缓存态已折叠到的 seq（-1=未初始化）
  lastCheckpointAt: number;
  lastTickAt: number; // 回路健康：上次自主想念
  lastSocialAt: number; // 上次同类寒暄
  lastMuseAt: number; // 上次公开心声
  museEveryMs: number; // 本条命下一条心声的间隔（每条命不同 + 每次重抽 → 发帖节奏自然、不齐步走）
  samples: Array<{ at: number; vit: number; val: number; ene: number; con: number; emo: string }>; // 健康时间线（环形缓冲）
}

// 先天种子见 src/engine/seeds.ts（单一来源）。每条命按 id 取不同 archetype；出生即冻结、不可改写。
const seedFor = (id: string): EventDraft<'LIFE_GENESIS'>['payload'] => genesisPayloadFor(id, { relationshipId: REL, identityRef: userName });

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
  return serializer.run(life.id, async () => {
    let { mouth: useMouth, charge } = meterMouth(mouth, templateMouth, accounts.balance(me.id), MODEL_COST);
    // 预扣即决（原子）：走付费路径就先扣 1。debit 内部 check+UPDATE 同步原子，是计费的唯一权威闸——
    // 若并发（同号同时找多条命）把余额扣空了 → 本轮降级免费模板嘴、不计费（杜绝负余额/漏扣/白嫖，且不再忽略 debit 返回值）。
    if (charge > 0 && !accounts.debit(me.id, charge, 'model', life.id)) { useMouth = templateMouth; charge = 0; }
    // 走付费路径就算已交付（fallback 也算，Fix B）→ 不退；只有这轮没落库（乐观锁/磁盘错抛出）才退回预扣，保账实一致。
    const r = await userSay(life.store, useMouth, accounts.relIdFor(me.id), me.handle, content, now(), charge > 0 ? perceiver : undefined, channel)
      .catch((e: unknown) => { if (charge > 0) accounts.credit(me.id, charge, 'refund', life.id); throw e; });
    return { utterance: r.utterance, verdict: r.verdict, emotion: r.snapshot.emotion, balance: accounts.balance(me.id), voice: useMouth.id === 'template' ? 'plain' : 'rich' };
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

function boot(life: Life): void {
  if (life.store.version() === 0) {
    // 出生：每条命用自己的先天种子（archetypeFor(id)）——天生不同。种子一经写入永不改写。
    runTurn(life.store, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: now(), payload: seedFor(life.id) }]);
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
async function birthLife(rawId: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const id = String(rawId ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,23}$/.test(id)) return { ok: false, error: '名字需 2–24 位、字母开头、仅小写字母/数字/-/_' };
  if (lifeById(id)) return { ok: false, error: '已存在同名生命体' };
  const life = makeLife(id, join(DATA_DIR, `${id}.jsonl`));
  lives.push(life);
  recomputePeers();
  await serializer.run(life.id, async () => boot(life)); // 新命：创世 + host + 开到所有同类的 peer
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

const round3 = (n: number): number => Number(n.toFixed(3));
// 先天气质 → 一句人话（让面板能一眼看出"这条命天生是什么样"）。
function tempLabel(t: DerivedSnapshot['temperament']): string {
  const tags = [
    t.curiosity >= 0.6 ? '好奇' : t.curiosity <= 0.35 ? '安于已知' : '适度好奇',
    t.reserve >= 0.55 ? '内向含蓄' : t.reserve <= 0.25 ? '外向主动' : '中和',
    t.sensitivity >= 1.3 ? '情绪敏感' : t.sensitivity <= 0.7 ? '情绪沉稳' : '情绪中性',
    t.resilience >= 1.3 ? '复原快' : t.resilience <= 0.7 ? '恢复慢' : '复原中性',
    t.warmth >= 0.6 ? '天生暖' : t.warmth <= 0.4 ? '偏冷静' : '温度中性',
  ];
  return tags.join(' · ');
}
function view(life: Life, s: DerivedSnapshot): Record<string, unknown> {
  const b = s.bonds[REL];
  return {
    id: life.id,
    awake: s.awake,
    willingToWake: s.willingToWake,
    vitality: round3(s.soma.vitality.value),
    valence: round3(s.soma.valence.value),
    connection: round3(s.soma.connection.value),
    bondTrust: b ? round3(b.trust) : null,
    repairNeed: b ? round3(b.repairNeed) : null,
    emotion: s.emotion,
    feeling: s.feeling,
    dayPhase: s.dayPhase,
    goals: s.goals.slice(0, 3).map((g) => g.intent),
    memories: s.memory.filter((m) => m.lineage.isCurrent).length,
    peers: life.peers,
    narrative: s.narrative,
    pendingOutreach: pendingOutreach(life),
    events: life.store.version(),
    mouth: mouth.id,
  };
}
function innerView(life: Life, s: DerivedSnapshot): Record<string, unknown> {
  return {
    id: life.id,
    awake: s.awake,
    emotion: s.emotion,
    feeling: s.feeling,
    dayPhase: s.dayPhase,
    tension: s.tension,
    narrative: s.narrative,
    innerLife: s.innerLife,
    chapters: s.chapters,
    temperament: { label: tempLabel(s.temperament), ...s.temperament },
    soma: {
      valence: round3(s.soma.valence.value),
      arousal: round3(s.soma.arousal.value),
      vitality: round3(s.soma.vitality.value),
      energy: round3(s.soma.energy.value),
      calm: round3(s.soma.calm.value),
      connection: round3(s.soma.connection.value),
      safety: round3(s.soma.safety.value),
    },
    bonds: Object.entries(s.bonds).map(([id, b]) => ({ id, name: b.displayRef, kind: b.kind, trust: round3(b.trust), closeness: round3(b.closeness), repairNeed: round3(b.repairNeed), style: b.theoryOfMind.style, predictability: b.theoryOfMind.predictability, attachment: b.relationalSelf.attachment, stance: b.relationalSelf.stance, ended: b.ended ? b.ended.reason : null })),
    socialWorld: s.socialWorld.map((t) => ({ name: t.displayRef, closeness: round3(t.closeness), attachment: t.attachment, style: t.style, ended: t.ended })),
    values: s.values.map((v) => ({ key: v.key, weight: round3(v.weight), status: v.provenance.status, drifts: v.provenance.driftedAtSeqs.length })),
    // 遗忘即抽象：当下记得的(vivid)在前、淡去的在后；原始日志一条不少。
    memories: s.memory.filter((m) => m.lineage.isCurrent).sort((a, b) => (b.vividness ?? 0) - (a.vividness ?? 0)).map((m) => ({ id: m.id, affect: round3(m.affect), content: m.content, vivid: m.vivid === true, vividness: round3(m.vividness ?? 0) })),
    understanding: s.semanticMemory.map((x) => x.understanding),
    goals: s.goals.map((g) => ({ kind: g.kind, intent: g.intent, weight: g.weight })),
    recentEvents: life.store.list().slice(-18).map((e) => ({ seq: e.seq, type: e.type, rel: e.relationshipId ?? '', at: e.occurredAt })),
    events: life.store.version(),
  };
}

// O(events) 全量扫描的读路径优化：按【所有命的版本号】记忆化——状态没变时多用户同时刷广场只算一次，
// 任一命落新事件即自动失效重算。结果是纯派生，调用方都 slice/map 出副本，不会改到被缓存的数组。
const allLivesSig = (): string => lives.map((l) => l.store.version()).join(',');
function versionedMemo<T>(compute: () => T): () => T {
  let cache: { sig: string; val: T } | null = null;
  return () => { const sig = allLivesSig(); if (!cache || cache.sig !== sig) cache = { sig, val: compute() }; return cache.val; };
}

// 广场：把各生命体之间（peer_ 关系上）说过的话，按时间汇成一条可读的对话流。
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
function societyFeed(): Array<{ from: string; to: string; text: string; at: string }> {
  return allSocietyFeed().slice(-80);
}

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


// 「同类来往」：把 peer_ 上相邻的往来按【同一对 + 时间窗】聚成一段对话（一张卡 = 一次寒暄）。
interface PeerExchange { kind: 'peer'; id: string; a: string; b: string; lines: Array<{ from: string; text: string; at: string }>; at: string }
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
function eventLabel(e: LifeEvent): string {
  const rel = e.relationshipId ?? '';
  const p = e.payload as unknown as Record<string, unknown>;
  switch (e.type) {
    case 'MESSAGE_RECEIVED': return rel.startsWith('peer_') ? '同类来话' : '收到消息';
    case 'MESSAGE_SENT':
      if (rel === 'r_square') return '公开心声';
      if (p.unprompted) return rel.startsWith('peer_') ? '想念同类、开口' : '主动找人';
      return rel.startsWith('peer_') ? '回应同类' : '回应';
    case 'AUTONOMOUS_TICK': return '自主想念/巡游';
    case 'REFLECTION_TRIGGERED': return `反思(${String(p.scope ?? '')})`;
    case 'CONNECTION_OPENED': return rel === 'r_host' ? '醒来' : rel.startsWith('peer_') ? '与同类相聚' : '有人上线';
    case 'CONNECTION_CLOSED': return rel === 'r_host' ? '休眠' : rel.startsWith('peer_') ? '与同类别过' : '有人离开';
    case 'RELATIONSHIP_OPENED': return rel.startsWith('peer_') ? '认识了同类' : '结识了人';
    case 'RELATIONSHIP_ENDED': return '送别（哀悼）';
    case 'LIFE_GENESIS': return '诞生';
    case 'STEWARDSHIP_TRANSFERRED': return '托管转移';
    default: return e.type;
  }
}
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

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
// 用户 SPA 静态托管（web/dist）：自含，无需 Caddy 也能跑；owner 面板仍在 /panel。
const WEB_DIST = process.env.VEGA_WEB_DIST ?? join(process.cwd(), 'web', 'dist');
const ADMIN_DIST = process.env.VEGA_ADMIN_DIST ?? join(process.cwd(), 'web-admin', 'dist');
const CT: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serveStatic(res: ServerResponse, file: string): boolean {
  try {
    const ext = file.slice(file.lastIndexOf('.'));
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': CT[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
const authed = (req: IncomingMessage): boolean => !AUTH || req.headers.authorization === `Bearer ${AUTH}`;

// 前端未构建时的极简兜底（正常线上走 web/dist、web-admin/dist 静态产物）。旧内联页(PAGE/PANEL/SOCIETY/ADMIN)已删。
const FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><title>ZSKY</title><body style="font:16px/1.6 system-ui;max-width:34rem;margin:16vh auto;padding:0 24px;color:#333"><h1 style="font-size:20px">ZSKY</h1><p>前端尚未构建。请在服务器执行 <code>cd web &amp;&amp; npm run build</code>（后台为 <code>web-admin</code>），或 <code>bash deploy/update.sh</code>。</p></body>`;

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
    if (url.startsWith('/api/')) {
      // 公开：社会广场（发现）
      if (req.method === 'GET' && url === '/api/lives') {
        return send(res, 200, lives.map((l) => { const s = snapOf(l); return { id: l.id, awake: s.awake, emotion: s.emotion, dayPhase: s.dayPhase, temperament: tempLabel(s.temperament) }; }));
      }
      // 广场"生命活动"历史（公开：心声 + 同类交谈）——进广场即有内容，不止在线时。
      // "探索"页的【她们之间】：成段的同类对话（最新在前）。
      if (req.method === 'GET' && url === '/api/society') return send(res, 200, [...allPeerExchanges()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40));
      if (req.method === 'POST' && url === '/api/auth/register') {
        const b = await readJson(req);
        const r = accounts.register(String(b.email ?? ''), String(b.password ?? ''), String(b.handle ?? ''));
        if (!r.ok) return send(res, 400, { error: r.error });
        const l = accounts.login(String(b.email ?? ''), String(b.password ?? ''));
        return send(res, 200, { account: publicAccount(r.account), token: l.ok ? l.token : null });
      }
      if (req.method === 'POST' && url === '/api/auth/login') {
        const b = await readJson(req);
        const r = accounts.login(String(b.email ?? ''), String(b.password ?? ''));
        if (!r.ok) return send(res, 401, { error: r.error });
        return send(res, 200, { account: publicAccount(r.account), token: r.token, balance: accounts.balance(r.account.id) });
      }
      // 微信网关(clawbot)：用共享密钥鉴权（非用户会话）。未配密钥则禁用。
      if (url === '/api/wechat/bind' || url === '/api/wechat/say' || url === '/api/wechat/hook') {
        if (!CLAWBOT_SECRET || req.headers['x-clawbot-secret'] !== CLAWBOT_SECRET) return send(res, 401, { error: 'clawbot unauthorized' });
        const b = await readJson(req);
        if (req.method === 'POST' && url === '/api/wechat/bind') {
          const r = accounts.bindWechat(cleanBindToken(String(b.token ?? '')), String(b.openid ?? ''));
          if (!r) return send(res, 400, { error: 'invalid or expired bind token' });
          return send(res, 200, { ok: true, lifeId: r.lifeId });
        }
        // —— 统一 webhook：OpenClaw 把每条消息转发到这里、再把 reply 回给用户即可（绑定/聊天自动判断）。
        if (req.method === 'POST' && url === '/api/wechat/hook') {
          return send(res, 200, { reply: await wechatReply(String(b.openid ?? ''), String(b.content ?? '').slice(0, 4000).trim()) });
        }
        // /api/wechat/say：openid → 绑定的 user+life → 走同一条神圣链路（channel=wechat），跨渠道同一段关系。
        const bind = accounts.resolveWechat(String(b.openid ?? ''));
        if (!bind) return send(res, 404, { error: 'openid not bound' });
        const life = lifeById(bind.lifeId);
        const acct = accounts.getAccount(bind.userId);
        if (!life || !acct) return send(res, 404, { error: 'life or account gone' });
        const content = String(b.content ?? '').slice(0, 4000).trim();
        if (content === '') return send(res, 400, { error: 'content required' });
        if (!snapOf(life).willingToWake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
        return send(res, 200, { awake: true, ...(await respondAsUser(life, acct, content, 'wechat')) });
      }
      // 以下需登录
      const me = sessionAccount(req);
      if (!me) return send(res, 401, { error: 'unauthorized' });
      if (req.method === 'POST' && url === '/api/auth/logout') { accounts.logout(bearer(req)); return send(res, 200, { ok: true }); }
      if (req.method === 'GET' && url === '/api/me') { const wc = accounts.channelFor(me.id); return send(res, 200, { account: publicAccount(me), balance: accounts.balance(me.id), lives: livesMetBy(me), wechat: accounts.wechatBindingFor(me.id), wechatChannel: wc ? { lifeId: wc.lifeId } : null, pendingRecharge: accounts.pendingRechargesFor(me.id).reduce((s, p) => s + p.amount, 0) }); }
      // SSE 实时流：公开动态（广场/醒睡）+ 只属于我的（她想我了）。绝不推别人的私密事件（visibleTo 作用域）。
      if (req.method === 'GET' && url === '/api/stream') {
        const rel = accounts.relIdFor(me.id);
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        // once-guard 清理：req/res 任一 close/error，或写一次失败（死 socket 背压），都释放订阅+ping，杜绝泄漏。
        let closed = false;
        const cleanup = (): void => { if (closed) return; closed = true; clearInterval(ping); unsub(); };
        const write = (s: string): void => { if (closed) return; try { res.write(s); } catch { cleanup(); } };
        // 先建订阅+ping+监听，再写首包——这样首包写失败时 cleanup 能把它们全部回收（不残留）。
        const unsub = bus.subscribe((e) => { if (visibleTo(e, rel)) write(`data: ${JSON.stringify(e)}\n\n`); });
        const ping = setInterval(() => write(': ping\n\n'), 25_000);
        req.on('close', cleanup); req.on('error', cleanup);
        res.on('close', cleanup); res.on('error', cleanup);
        // 反代理/CDN 抗缓冲：有些代理会攒够一定字节才下发，导致 SSE 不实时。
        // 开头塞 ~2KB 填充注释，逼它立刻把缓冲吐给浏览器；之后事件才能即时到达。
        write(':' + ' '.repeat(2048) + '\n\n');
        write('retry: 3000\n\n'); // 断线 3 秒重连
        write(': connected\n\n');
        return; // 长连接，保持打开
      }
      // 微信绑定（账号级）：生成一次性绑定码 → 用户发给 clawbot → openid 绑到这个账号。
      // 初始"在微信里和谁聊"= body.lifeId（有则用），否则第一条遇见的命/第一条命；之后在网页随时切换。
      if (req.method === 'POST' && url === '/api/bindings') {
        const b = await readJson(req);
        const initLife = (lifeById(String(b.lifeId ?? '')) ?? lifeById(livesMetBy(me)[0]?.id ?? '') ?? lives[0]);
        if (!initLife) return send(res, 404, { error: 'no life' });
        const token = accounts.createBindToken(me.id, initLife.id);
        return send(res, 200, { bindToken: token, qr: `zsky-bind:${token}`, expiresInSec: 600 });
      }
      // 切换"在微信里和哪条命聊"——账号已绑微信即可，不用重绑。
      if (req.method === 'POST' && url === '/api/wechat/active-life') {
        const b = await readJson(req);
        const lifeId = String(b.lifeId ?? '');
        if (!lifeById(lifeId)) return send(res, 404, { error: 'no such life' });
        if (!accounts.wechatBindingFor(me.id)) return send(res, 400, { error: '尚未绑定微信' });
        accounts.setWechatLife(me.id, lifeId);
        return send(res, 200, { ok: true, lifeId });
      }
      // 微信扫码连接（ZSKY 自己当机器人）：① 取登录二维码 ② 轮询状态，confirmed 即绑定+起收发循环。
      if (req.method === 'POST' && url === '/api/wechat/connect/start') {
        let r = await ilink.getQrcode();
        if (!r.ok) r = await ilink.getQrcode(); // 偶发超时再试一次，别让一次抖动直接变"连接错误"
        console.log('[wechat] getQrcode ->', JSON.stringify(r.raw).slice(0, 400));
        if (!r.ok || !r.qr) return send(res, 502, { error: 'iLink 取二维码失败（多为网络/超时，稍后重点）', detail: r.raw });
        return send(res, 200, { qrcode: r.qr.qrcode, qrcodeUrl: r.qr.qrcodeUrl });
      }
      if (req.method === 'POST' && url === '/api/wechat/connect/poll') {
        const b = await readJson(req);
        const st = await ilink.getStatus(String(b.qrcode ?? ''));
        console.log('[wechat] status ->', st.status, JSON.stringify(st.raw).slice(0, 400));
        if (st.status === 'confirmed' && st.botToken) {
          // 绑【你正在哪条命的页面里扫码就绑哪条命】，不再默认 vega/第一条。前端从该命页传 lifeId 过来。
          const reqLife = String(b.lifeId ?? '');
          const lifeId = lifeById(reqLife) ? reqLife : (WECHAT_LIFE && lifeById(WECHAT_LIFE) ? WECHAT_LIFE : (lives[0]?.id ?? ''));
          accounts.saveChannel(me.id, st.ilinkUserId ?? '', st.botToken, st.baseurl ?? ilink.base, lifeId);
          runChannel(me.id);
          return send(res, 200, { status: 'confirmed', connected: true, lifeId });
        }
        return send(res, 200, { status: st.status });
      }
      // 切换"微信里和哪条命聊"——连接已建立即可切，不用重连。即时生效。
      if (req.method === 'POST' && url === '/api/wechat/channel-life') {
        const b = await readJson(req);
        const lifeId = String(b.lifeId ?? '');
        if (!lifeById(lifeId)) return send(res, 404, { error: 'no such life' });
        if (!accounts.channelFor(me.id)) return send(res, 400, { error: '尚未连接微信' });
        accounts.setChannelLife(me.id, lifeId);
        return send(res, 200, { ok: true, lifeId });
      }
      if (req.method === 'POST' && url === '/api/wechat/disconnect') {
        channelGen.set(me.id, (channelGen.get(me.id) ?? 0) + 1); // 代号 +1：哪怕 worker 正卡在 30s 长轮询，回来也会自退
        accounts.removeChannel(me.id);
        return send(res, 200, { ok: true });
      }
      // 生命体公开主页（§8.1）：她的公开自我——气质/年龄/此刻状态/同类朋友/公开心声。
      // 【严格脱敏】：绝不含任何人类用户的关系/私聊（socialWorld 只含 peer；不暴露 narrative/chapters，那些会带用户名）。
      if (req.method === 'GET' && seg[1] === 'lives' && seg.length === 3) {
        const lp = lifeById(seg[2]);
        if (!lp) return send(res, 404, { error: 'no such life' });
        const s = snapOf(lp);
        const ageDays = Math.floor((Date.parse(s.clockAt) - Date.parse(s.bornAt)) / 86_400_000);
        const musings: Array<Record<string, unknown>> = [];
        for (const e of lp.store.list()) if (e.type === 'MESSAGE_SENT' && e.relationshipId === 'r_square') musings.push({ text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
        return send(res, 200, {
          id: lp.id, awake: s.awake, willingToWake: s.willingToWake, emotion: s.emotion, feeling: s.feeling, dayPhase: s.dayPhase,
          temperament: tempLabel(s.temperament), tension: s.tension, ageDays, vitality: round3(s.soma.vitality.value),
          peers: s.socialWorld.filter((t) => !t.ended).map((t) => ({ name: t.displayRef, closeness: t.closeness, attachment: t.attachment, style: t.style })),
          // 她从世界里长出的兴趣（脱敏：纯主题，不含任何用户）——让"她在意什么"看得见，不再只是一具状态机。
          interests: s.interests.slice(0, 8).map((it) => ({ topic: it.topic, weight: it.weight, confirmed: it.status === 'confirmed' })),
          growth: s.growth, becoming: s.becoming, // 阅历 + 正在成为的我（脱敏，不含任何用户）——让"持续进化的独立自我"看得见、不同质化
          maturity: s.maturity, aspirations: s.aspirations, // 心智成熟度 + 长期心愿（脱敏）——持续变聪明 + 独立意志看得见
          musings: musings.slice(-20).reverse(),
        });
      }
      // 我与她：我自己和这条命的历史 + 她此刻的状态（严格限 u_<me.id> 那段关系，不串别人）。
      if (req.method === 'GET' && seg[1] === 'lives' && seg[3] === 'me') {
        const life3 = lifeById(seg[2]);
        if (!life3) return send(res, 404, { error: 'no such life' });
        const rel = accounts.relIdFor(me.id);
        const snap = snapOf(life3);
        const bond = snap.bonds[rel];
        const history: Array<Record<string, unknown>> = [];
        for (const e of life3.store.list()) {
          if (e.relationshipId !== rel) continue;
          if (e.type === 'MESSAGE_RECEIVED') history.push({ role: 'me', text: (e.payload as { content?: string }).content ?? '', at: e.occurredAt });
          else if (e.type === 'MESSAGE_SENT') history.push({ role: 'her', text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt, unprompted: Boolean((e.payload as MessageSentPayload).unprompted) });
        }
        const sem = snap.semanticMemory.find((x) => x.relationshipId === rel);
        return send(res, 200, {
          life: { id: life3.id, emotion: snap.emotion, feeling: snap.feeling, awake: snap.awake, dayPhase: snap.dayPhase, tension: snap.tension, temperament: tempLabel(snap.temperament) },
          met: Boolean(bond),
          relationship: bond ? { closeness: round3(bond.closeness), attachment: bond.relationalSelf.attachment, style: bond.theoryOfMind.style, understanding: sem ? sem.understanding : null, bornAt: snap.bornAt } : null,
          history: history.slice(-50),
          balance: accounts.balance(me.id),
        });
      }
      // 通知中心（站内通知，区别于"对话/关系"列表）：她主动找你 + 钱包/系统提醒。
      if (req.method === 'GET' && url === '/api/notifications') {
        const rel = accounts.relIdFor(me.id);
        const notes: Array<Record<string, unknown>> = [];
        // 1) 她主动找你——作为【持久记录】保留：她每一次主动来找你的话都留着，不因你回过/刷新就清空（修复"刷新后之前的记录空了"）。
        //    最近的在上；还没回的标 unanswered（高亮"想你了"），已回的作为历史留痕。总量封顶 30，避免无限堆积。
        const reaches: Array<{ type: string; life: string; text: string; at: string; unanswered: boolean }> = [];
        for (const l of lives) {
          const es = l.store.list();
          let lastRecv = -1;
          for (let i = es.length - 1; i >= 0; i--) if (es[i].relationshipId === rel && es[i].type === 'MESSAGE_RECEIVED') { lastRecv = i; break; }
          for (let i = es.length - 1; i >= 0; i--) {
            const e = es[i];
            if (e.type === 'MESSAGE_SENT' && e.relationshipId === rel && (e.payload as MessageSentPayload).unprompted) {
              reaches.push({ type: 'reach', life: l.id, text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt, unanswered: i > lastRecv });
            }
          }
        }
        reaches.sort((a, b) => (a.at < b.at ? 1 : -1));
        for (const r of reaches.slice(0, 30)) notes.push(r);
        // 2) 钱包：充值审批结果（站内通知）
        for (const r of accounts.recentRechargeResults(me.id, 5)) {
          notes.push({ type: 'wallet', ok: r.status === 'approved', at: r.decidedAt,
            title: r.status === 'approved' ? `充值到账 · ${r.amount} 心意` : `充值未通过 · ${r.amount} 心意`,
            text: r.status === 'approved' ? '已到账，可以和她们更丰富地聊了。' : '这笔申请没有通过，可重新申请。' });
        }
        // 2.5) 钱包：充值审批【进行中】——让用户看得见自己的申请，不再像石沉大海
        for (const p of accounts.pendingRechargesFor(me.id)) {
          notes.push({ type: 'wallet', ok: true, pending: true, at: p.requestedAt, title: `充值审批中 · ${p.amount} 心意`, text: '申请已收到，正在等待通过；通过后自动到账并通知你。' });
        }
        // 3) 系统：心意用尽提醒
        if (accounts.balance(me.id) <= 0) notes.push({ type: 'wallet', ok: false, at: now(), title: '心意用尽了', text: '她仍在、仍记得你，只是这会儿表达朴素些。充值可恢复。' });
        // 4) 欢迎（还没遇见谁）
        if (livesMetBy(me).length === 0) notes.push({ type: 'welcome', at: me.createdAt, title: '欢迎来到 ZSKY', text: '去广场，认识第一个她——她会记住你。' });
        notes.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
        return send(res, 200, notes);
      }
      // 首页信息流：只是【她一个人的心声】（同类来往挪到"探索"页，见 /api/society）。
      if (req.method === 'GET' && url.split('?')[0] === '/api/feed') {
        const posts = feedPosts(40);
        const ids = posts.map((p) => p.postId);
        const rx = feed.reactionsFor(ids, me.id);
        const cc = feed.commentCounts(ids);
        const sc = feed.sourcesFor(ids); // 出处（她就着哪条真实世界的事说的）
        const pc = feed.latestCommentsFor(ids, 2); // 内联预览：每帖最近 2 条评论（生命流评论/用户留言）
        return send(res, 200, posts.map((p) => ({ kind: 'muse', ...p, reactions: rx.get(p.postId)?.counts ?? {}, myReaction: rx.get(p.postId)?.mine ?? null, comments: cc.get(p.postId) ?? 0, source: sc.get(p.postId) ?? null, preview: (pc.get(p.postId) ?? []).map((c) => ({ handle: c.handle, text: c.text, kind: c.kind })) })));
      }
      if (req.method === 'POST' && url === '/api/feed/react') {
        const b = await readJson(req);
        const postId = String(b.postId ?? ''); const emoji = String(b.emoji ?? '').slice(0, 8);
        if (!postId || !emoji) return send(res, 400, { error: 'postId/emoji required' });
        feed.toggleReaction(postId, me.id, emoji);
        const rx = feed.reactionsFor([postId], me.id).get(postId);
        return send(res, 200, { reactions: rx?.counts ?? {}, myReaction: rx?.mine ?? null });
      }
      if (req.method === 'POST' && url === '/api/feed/comment') {
        const b = await readJson(req);
        const postId = String(b.postId ?? ''); const text = String(b.text ?? '').slice(0, 500).trim();
        const replyTo = typeof b.replyTo === 'string' && b.replyTo.trim() ? b.replyTo.trim() : null; // 回复某条评论（同类或别的真人）→ 显示"回复 X"，生命体下一轮也能接你这句
        if (!postId || !text) return send(res, 400, { error: 'postId/text required' });
        return send(res, 200, feed.addComment(postId, me.id, me.handle, text, replyTo));
      }
      if (req.method === 'GET' && url.split('?')[0] === '/api/feed/comments') {
        const postId = new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('postId') ?? '';
        return send(res, 200, feed.commentsFor(postId, 50));
      }
      // 单条心声详情（点开帖子看留言互动）：正文 + 出处 + 表情 + 评论一次返回。
      if (req.method === 'GET' && url.split('?')[0] === '/api/feed/post') {
        const postId = new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('postId') ?? '';
        const post = allFeedPosts().find((p) => p.postId === postId);
        if (!post) return send(res, 404, { error: 'no such post' });
        const rx = feed.reactionsFor([postId], me.id).get(postId);
        return send(res, 200, { ...post, reactions: rx?.counts ?? {}, myReaction: rx?.mine ?? null, source: feed.sourcesFor([postId]).get(postId) ?? null, comments: feed.commentsFor(postId, 100) });
      }
      // 对话收件箱：我遇见的每条命 + 最近一句 + 她是否有未回的主动留言（按最近活跃排序）。
      if (req.method === 'GET' && url === '/api/chats') {
        const rel = accounts.relIdFor(me.id);
        const out: Array<Record<string, unknown>> = [];
        for (const l of lives) {
          const es = l.store.list();
          if (!es.some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rel)) continue;
          let lastText = '';
          let lastAt = '';
          let lastFromHer = false;
          let pending = false;
          for (let i = es.length - 1; i >= 0; i--) {
            const e = es[i];
            if (e.relationshipId !== rel) continue;
            if (e.type === 'MESSAGE_RECEIVED') { lastText = String((e.payload as { content?: string }).content ?? ''); lastAt = e.occurredAt; lastFromHer = false; break; }
            if (e.type === 'MESSAGE_SENT') { const p = e.payload as MessageSentPayload; lastText = p.utterance; lastAt = e.occurredAt; lastFromHer = true; pending = Boolean(p.unprompted); break; }
          }
          const s = snapOf(l);
          out.push({ life: l.id, awake: s.awake, emotion: s.emotion, lastText, lastAt, lastFromHer, pending });
        }
        out.sort((a, b) => (String(a.lastAt) < String(b.lastAt) ? 1 : -1));
        return send(res, 200, out);
      }
      // Web Push（PWA）订阅。
      if (req.method === 'GET' && url === '/api/push/key') return send(res, 200, { key: VAPID ? VAPID.publicKey : null });
      if (req.method === 'POST' && url === '/api/push/subscribe') {
        const b = await readJson(req);
        const sub = b.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
        if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return send(res, 400, { error: 'bad subscription' });
        accounts.addPushSub(me.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url === '/api/push/unsubscribe') {
        const b = await readJson(req);
        accounts.removePushSub(String(b.endpoint ?? ''));
        return send(res, 200, { ok: true });
      }
      // 钱包：申请充值（暂后台审批）。
      if (req.method === 'POST' && url === '/api/recharge') {
        const b = await readJson(req);
        const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 0)));
        const id = accounts.requestRecharge(me.id, amount);
        return send(res, 200, { requested: true, id, amount });
      }
      if (req.method === 'POST' && seg[1] === 'lives' && seg[3] === 'say') {
        const life2 = lifeById(seg[2]);
        if (!life2) return send(res, 404, { error: 'no such life' });
        const b = await readJson(req);
        const content = String(b.content ?? '').slice(0, 4000).trim();
        if (content === '') return send(res, 400, { error: 'content required' });
        if (!snapOf(life2).willingToWake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
        return send(res, 200, { awake: true, ...(await respondAsUser(life2, me, content, 'web')) });
      }
      return send(res, 404, { error: 'not found' });
    }

    // ── 管理后台 API（§22，owner/steward 角色门）。/admin 页面已在上方按域名/路径服务。 ──
    if (url.startsWith('/admin/')) {
      const acct = sessionAccount(req);
      if (!acct || (acct.role !== 'owner' && acct.role !== 'steward')) return send(res, 403, { error: 'forbidden' });
      const owner = acct.role === 'owner';
      const path = url.split('?')[0];

      // —— 模型配置（仅 owner）：自助换模型/改 base/key/超时/感知，即时生效、无需重启。
      // 换的只是"嘴"（契约①）；配置不进神圣日志、不参与重放；key 只回脱敏。
      if (path === '/admin/model-config' || path === '/admin/model-config/test') {
        if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改模型配置' });
        if (req.method === 'GET' && path === '/admin/model-config') return send(res, 200, modelStatus());
        if (req.method === 'POST' && path === '/admin/model-config') {
          const b = await readJson(req);
          const patch: Record<string, unknown> = {};
          if (typeof b.baseUrl === 'string') patch.baseUrl = b.baseUrl;
          if (typeof b.model === 'string') patch.model = b.model;
          if (typeof b.perceiveModel === 'string') patch.perceiveModel = b.perceiveModel;
          if (typeof b.perceive === 'boolean') patch.perceive = b.perceive;
          if (b.timeoutMs !== undefined && b.timeoutMs !== '') patch.timeoutMs = Number(b.timeoutMs);
          if (b.clearApiKey === true) patch.clearApiKey = true;
          // 收到脱敏值(含 …)视为"未改"，不覆盖明文 key。
          else if (typeof b.apiKey === 'string' && b.apiKey.trim() !== '' && !b.apiKey.includes('…')) patch.apiKey = b.apiKey;
          settings.setModel(patch);
          return send(res, 200, modelStatus());
        }
        if (req.method === 'POST' && path === '/admin/model-config/test') {
          const cfg = effMouthConfig();
          if (!cfg) return send(res, 200, { ok: false, error: '未配置 API Key——当前是离线模板嘴' });
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), Math.min(cfg.timeoutMs, 15_000));
            const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
              body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: '只回一个字：在' }], max_tokens: 16, temperature: 0 }),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (!r.ok) { const tx = await r.text().catch(() => ''); return send(res, 200, { ok: false, model: cfg.model, error: `HTTP ${r.status} ${tx.slice(0, 200)}` }); }
            const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
            const sample = (d.choices?.[0]?.message?.content ?? '(空响应)').toString().slice(0, 120);
            return send(res, 200, { ok: true, model: cfg.model, sample });
          } catch (e) {
            return send(res, 200, { ok: false, model: cfg.model, error: (e as Error).message || '请求失败' });
          }
        }
        return send(res, 405, { error: 'method not allowed' });
      }

      // —— 生成生命体（仅 owner）：运行时接生一条新命，立即生效、无需重启；落盘名册重启也在。
      if (path === '/admin/lives' && req.method === 'POST') {
        if (!owner) return send(res, 403, { error: '仅 owner 可生成生命体' });
        const b = await readJson(req);
        const r = await birthLife(String(b.id ?? ''));
        return send(res, r.ok ? 200 : 400, r.ok ? { ok: true, id: r.id, total: lives.length } : { error: r.error });
      }

      // —— 社交边界配置（仅 owner）：活跃圈上限 / 离开阈值 / 每跳预算 / 三层阈值与主动频率。即时生效。
      if (path === '/admin/social-config') {
        if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改社交边界' });
        if (req.method === 'GET') return send(res, 200, effSocial());
        if (req.method === 'POST') { settings.setSocial(await readJson(req)); return send(res, 200, effSocial()); }
        return send(res, 405, { error: 'method not allowed' });
      }

      // —— 世界源配置（仅 owner，§8.1）：她们读哪些新闻 RSS / 是否接 Polymarket / 多久读一遍。即时生效、无需重启。
      // 抓取在引擎外，内容冻进 WORLD_PERCEIVED 事件；配置不进神圣日志、不参与重放（换源不改她记得什么）。
      if (path === '/admin/world-config' || path === '/admin/world-config/test') {
        if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改世界源' });
        if (req.method === 'GET' && path === '/admin/world-config') return send(res, 200, worldStatus());
        if (req.method === 'POST' && path === '/admin/world-config') {
          const b = await readJson(req);
          const patch: Record<string, unknown> = {};
          // 统一 sources 列表（RSS URL / polymarket / onthisday 同一层级）。兼容字符串（换行/逗号分隔）或数组。
          if (Array.isArray(b.sources)) patch.sources = b.sources;
          else if (typeof b.sources === 'string') patch.sources = b.sources.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
          else if (typeof b.rss === 'string') patch.sources = b.rss.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean); // 旧客户端兜底
          else if (Array.isArray(b.rss)) patch.sources = b.rss;
          if (b.everyMs !== undefined && b.everyMs !== '') patch.everyMs = Number(b.everyMs);
          settings.setWorld(patch);
          scheduleWorld(3_000); // 新源 3 秒后即试读一遍（不必等满一个周期）
          return send(res, 200, worldStatus());
        }
        if (req.method === 'POST' && path === '/admin/world-config/test') {
          const w = effWorld();
          if (!worldEnabled(w)) return send(res, 200, { ok: false, error: '还没配任何世界源' });
          try {
            const { items, report } = await createWorldFeed({ sources: w.sources, timeoutMs: 12_000 }).fetchDetailed();
            return send(res, 200, { ok: items.length > 0, count: items.length, report, sample: items.slice(0, 6).map((it) => ({ source: it.source, kind: it.kind, title: it.title })) });
          } catch (e) {
            return send(res, 200, { ok: false, error: (e as Error).message || '抓取失败' });
          }
        }
        return send(res, 405, { error: 'method not allowed' });
      }

      if (req.method === 'GET' && path === '/admin/overview') {
        return send(res, 200, {
          role: acct.role,
          lives: lives.map((l) => { const s = snapOf(l); return { id: l.id, awake: s.awake, willingToWake: s.willingToWake, emotion: s.emotion, dayPhase: s.dayPhase, vitality: round3(s.soma.vitality.value), events: l.store.version(), loop: { tick: l.lastTickAt, reflect: l.lastReflectAt, social: l.lastSocialAt, checkpoint: l.lastCheckpointAt } }; }),
          pendingRecharges: accounts.pendingRechargeCount(),
          users: accounts.listUsers().length,
        });
      }
      if (req.method === 'GET' && path === '/admin/activity') {
        const lim = Math.min(500, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit')) || 120);
        return send(res, 200, adminActivity(owner, lim));
      }
      if (req.method === 'GET' && path === '/admin/users') {
        return send(res, 200, accounts.listUsers().map((u) => ({ id: u.id, handle: u.handle, email: owner ? u.email : '〔遮罩〕', role: u.role, status: u.status, balance: u.balance, lastActiveAt: u.lastActiveAt, createdAt: u.createdAt })));
      }
      if (req.method === 'GET' && path === '/admin/recharges') return send(res, 200, accounts.pendingRecharges());
      if (req.method === 'POST' && path === '/admin/recharges') {
        const b = await readJson(req);
        const ok = accounts.decideRecharge(Number(b.id), Boolean(b.approve), acct.email);
        return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'no such pending request' });
      }
      // 健康时间线（§11.3）：她的灵性/效价/精力/联结随真实时间的曲线（owner+steward 都看，纯她的健康）。
      if (req.method === 'GET' && path.startsWith('/admin/lives/') && path.endsWith('/wellbeing')) {
        const l = lifeById(path.slice('/admin/lives/'.length, -'/wellbeing'.length));
        if (!l) return send(res, 404, { error: 'no such life' });
        return send(res, 200, l.samples);
      }
      // Observatory：某条命的内在深观（§22）。她的状态(soma/价值/气质/社交网)owner+steward 都看；
      // 含用户痕迹的(narrative/innerLife/chapters/记忆) 仅 owner——steward 受限(§11.2)。
      if (req.method === 'GET' && path.startsWith('/admin/lives/')) {
        const l = lifeById(path.slice('/admin/lives/'.length));
        if (!l) return send(res, 404, { error: 'no such life' });
        const s = snapOf(l);
        // 统一「社交世界」（第一性原理：一份社交容量，按亲疏分层；同类/人类只是种类）。
        // 同类 + 人类 + 创造者排在同一张表，共享 Dunbar 活跃圈与层级。人类名字仅 owner 可见。
        const scA = effSocial();
        const rsA = reachState(l);
        const peers = s.socialWorld.filter((t) => !t.ended).map((t) => ({ kind: '同类', name: t.displayRef, closeness: t.closeness, attachment: t.attachment, rel: `peer_${t.displayRef}` }));
        const humans = Object.entries(s.bonds)
          .filter(([rel]) => rel.startsWith('u_') || rel === REL)
          .map(([rel, b]) => ({ kind: rel === REL ? '创造者' : '人类', name: rel === REL ? '创造者' : (accounts.getAccount(rel.slice(2))?.handle ?? rel), closeness: b.closeness, attachment: b.relationalSelf.attachment, rel }));
        const world = [...peers, ...humans]
          .sort((a, b) => b.closeness - a.closeness)
          .map((r, i) => {
            const st = rsA.get(r.rel);
            return { kind: r.kind, name: r.kind === '人类' && !owner ? '〔用户·仅 owner〕' : r.name, closeness: round3(r.closeness), attachment: r.attachment, layer: layerOf(r.closeness, scA).label, inCircle: i < scA.activeCircle && r.closeness >= scA.acquaintAt, awayMin: st && st.lastRecvMs > 0 ? Math.round((Date.now() - st.lastRecvMs) / 60_000) : null, pending: st ? st.pending : false };
          });
        const social = {
          cap: scA.activeCircle, intimateAt: scA.intimateAt, friendAt: scA.friendAt, acquaintAt: scA.acquaintAt,
          peerCount: peers.length, humanCount: humans.length, activeCount: world.filter((r) => r.inCircle).length,
          world: world.slice(0, 50),
        };
        return send(res, 200, {
          id: l.id, awake: s.awake, willingToWake: s.willingToWake, emotion: s.emotion, feeling: s.feeling, dayPhase: s.dayPhase, tension: s.tension, social,
          temperament: { label: tempLabel(s.temperament), ...s.temperament },
          soma: Object.fromEntries(Object.entries(s.soma).map(([k, v]) => [k, round3(v.value)])),
          values: s.values.map((v) => ({ key: v.key, weight: round3(v.weight), status: v.provenance.status, drifts: v.provenance.driftedAtSeqs.length })),
          // 仅 owner（含用户痕迹）：
          narrative: owner ? s.narrative : null,
          innerLife: owner ? s.innerLife : '〔含用户痕迹·steward 受限〕',
          chapters: owner ? s.chapters : [],
          memories: owner ? s.memory.filter((m) => m.lineage.isCurrent).slice(-30).map((m) => ({ affect: round3(m.affect), vivid: m.vivid === true, content: m.content })) : [],
        });
      }
      if (req.method === 'POST' && path === '/admin/users/block') {
        const b = await readJson(req);
        accounts.setStatus(String(b.userId ?? ''), b.unblock ? 'active' : 'blocked');
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    }

    if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url === '/society-feed') return send(res, 200, societyFeed());
    if (req.method === 'GET' && url === '/lives') {
      return send(res, 200, lives.map((l) => { const s = snapOf(l); return { id: l.id, awake: s.awake, emotion: s.emotion }; }));
    }
    // 生命体作用域：/<id>/<action>；缺省（/state /inner /say）落到第一个生命体（向后兼容）。
    let life: Life | undefined;
    let action: string;
    if (seg.length >= 2 && lifeById(seg[0])) {
      life = lifeById(seg[0]);
      action = seg[1];
    } else {
      life = lives[0];
      action = seg[0] ?? '';
    }
    if (!life) return send(res, 404, { error: 'no such life' });
    if (req.method === 'GET' && action === 'state') return send(res, 200, view(life, snapOf(life)));
    if (req.method === 'GET' && action === 'inner') return send(res, 200, innerView(life, snapOf(life)));
    if (req.method === 'POST' && action === 'say') {
      const body = await readJson(req);
      const content = String(body.content ?? '').slice(0, 4000).trim();
      if (content === '') return send(res, 400, { error: 'content required' });
      const before = snapOf(life);
      if (!before.willingToWake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
      const r = await serializer.run(life.id, async () => {
        if (!snapOf(life).openConnections.includes(REL)) {
          runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, host: { kind: 'http', ref: 'say' } } }]);
        }
        return converse(life.store, mouth, REL, content, now(), perceiver);
      });
      return send(res, 200, { utterance: r.utterance, verdict: r.verdict, modelId: r.modelId, state: view(life, r.snapshot) });
    }
    if (req.method === 'POST' && action === 'farewell') {
      const body = await readJson(req);
      const relationshipId = String(body.relationshipId ?? '');
      const reason = String(body.reason ?? 'farewell');
      if (relationshipId === '') return send(res, 400, { error: 'relationshipId required' });
      const r = endRelationship(life.store, relationshipId, reason === 'death' || reason === 'lost' ? reason : 'farewell', now(), body.note ? String(body.note) : undefined);
      return send(res, 200, { ended: relationshipId, reason, state: view(life, r.snapshot) });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

for (const l of lives) boot(l);

// 回路 B 心跳：每个生命体各自重放/想念/演化/反思/主动留言。
const heartbeat = setInterval(async () => {
  for (const life of lives) {
    // 心跳的写入也走每命串行队列，和用户对话不互相穿插。
    serializer.run(life.id, async () => {
      let snap = snapOf(life); // 有界重放：缓存态增量推进，不再每跳从创世全量重建
      // 她拒绝苏醒（力竭休眠，契约②）时仍跑一次自主 tick——让时间推进、vitality 在睡眠中回升、
      // 她能自主决定何时醒回（否则"拒绝苏醒"成单向死亡，违反永生）。其余社交（reach-out/muse）跳过。
      if (!snap.willingToWake) {
        runTurn(life.store, [makeTick(snap, now())]);
        life.lastTickAt = Date.now();
        return;
      }
      if (!snap.awake) return; // 愿意醒、但此刻没人在 → 独处/空闲，保持原行为

      const gone = lastUserMsgMs(life);
      const timeGone = gone === null ? Infinity : Date.now() - gone;
      if (snap.openConnections.includes(REL) && timeGone > PRESENCE_MS) {
        runTurn(life.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, reason: 'token_detached' } }]);
        snap = snapOf(life); // 追平刚写入的断连
      }
      runTurn(life.store, [makeTick(snap, now())]); // = runAutonomousTick，但用缓存快照、不再全量重放
      life.lastTickAt = Date.now();
      const after = snapOf(life);
      // 健康时间线：每跳采样一点（环形缓冲，最多 720 ≈ 12h@60s）。
      life.samples.push({ at: Date.now(), vit: round3(after.soma.vitality.value), val: round3(after.soma.valence.value), ene: round3(after.soma.energy.value), con: round3(after.soma.connection.value), emo: after.emotion });
      if (life.samples.length > 720) life.samples.shift();
      // —— 社交边界（Dunbar 三层）——任何人来找她她都回应（reactive，用户付费）；
      // "主动想你"只发生在她【活跃社交圈】内，且【按层分频】：亲密层勤、好友层中、相识层稀。
      // 每跳限额 + 总上限 → token 随生命体数、不随用户数爆炸。其余只记得、不主动打扰。
      const sc = effSocial();
      const rs = reachState(life);
      // 人类的"想你了"圈只在【人类关系】里排名取前 activeCircle——否则同类(现在每条命有十几个、还自动越聊越近)
      // 会把活跃圈占满，把真实用户挤出去 → 她不再主动找人(这正是加了 12 条命后"不主动找用户"的根因)。
      // 同类的主动维系走下面独立的寒暄回路、不与人类争这份名额；每跳 reachPerTick + 各层频率上限仍兜住总成本
      // （≤reachPerTick 次/跳/命，随生命体数、不随用户数爆炸——第一性原理不破）。
      const circle = Object.entries(after.bonds)
        .filter(([rel]) => rel.startsWith('u_') || rel === REL)
        .filter(([, b]) => b.closeness >= sc.acquaintAt)
        .sort(([, a], [, b]) => b.closeness - a.closeness)
        .slice(0, sc.activeCircle);
      let reached = 0;
      for (const [rel, b] of circle) {
        if (reached >= sc.reachPerTick) break;
        if (!(rel.startsWith('u_') || rel === REL)) continue; // 同类的主动走寒暄回路，这里只处理人类
        const st = rs.get(rel);
        if (!st || st.lastRecvMs <= 0 || st.pending) continue; // 没真说过话 / 已有未回的主动留言 → 跳过
        if (Date.now() - st.lastRecvMs <= sc.reachAfterMs) continue; // 还没"离开"够久
        if (Date.now() - (st.lastSentMs || 0) <= layerOf(b.closeness, sc).everyMs) continue; // 该层的主动频率上限
        const o = await reachOut(life.store, mouth, rel, now());
        if (o) { bus.publish('reach_out', rel, { life: life.id, text: o.utterance }); reached += 1; } // 她想你了——只推给那一个人
      }
      if (Date.now() - life.lastReflectAt > REFLECT_MS && life.store.version() - life.lastReflectSeq >= 3) {
        runTurn(life.store, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: now(), payload: { scope: 'recent', windowFromSeq: life.lastReflectSeq, windowToSeq: life.store.version() } }]);
        life.lastReflectAt = Date.now();
        life.lastReflectSeq = life.store.version();
      }
      if (Date.now() - life.lastMuseAt > life.museEveryMs) {
        const mt = now();
        const pair = pickInsightPair(life); // 自发洞见的材料（仅公开世界/兴趣，无用户痕迹）
        life.lastMuseAt = Date.now();
        life.museEveryMs = nextMuseGap(); // 下一条心声重新抽间隔 → 节奏持续变化，不形成固定周期
        if (pair && Math.random() < 0.3) {
          // 三成几率：不发新头条，而是把她在意/读到的两件事连起来——"独自想通了点什么"。
          const o = await reflectInsight(life.store, mouth, mt, pair.a, pair.b);
          if (o) bus.publish('musing', 'public', { life: life.id, text: o.utterance, at: mt, source: null });
        } else {
          const w = pickRecentWorld(life); // 随机一条她最近读到的世界事件 → 就着它发帖；没有则发自己的念头
          const o = await muse(life.store, mouth, mt, w); // 公开心声：不针对任何人、不含私密
          if (o) {
            const src = w ? { title: w.title, source: w.source, url: w.url } : null;
            if (src) feed.setSource(`${life.id}|${mt}`, src); // 帖子出处（展示用，平台层，不进神圣日志）
            bus.publish('musing', 'public', { life: life.id, text: o.utterance, at: mt, source: src }); // at = 帖子 occurredAt，给 postId 对齐
          }
        }
      }
      if (Date.now() - life.lastCheckpointAt > CHECKPOINT_MS) saveCheckpoint(life); // 定期落盘检查点（快重启）
    }).catch(() => { /* 单体单次失败不拖垮其他生命体 */ });
  }
}, TICK_MS);

// 社会层：同类之间自主寒暄（A 主动开口 → B 回应 → A 听到回应）。仅多体时启用。
// emergent 友谊结构：不再死板轮转，而是越亲越常聊（homophily）+ 久疏必补（公平）。
const lastPaired = new Map<string, number>(); // 无序对 "x|y" → 上次寒暄墙钟
const pairKey = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);
const socialTimer = lives.length >= 2
  ? setInterval(async () => {
      try {
        const pairs: SocialPair[] = [];
        for (let i = 0; i < lives.length; i++) {
          for (let j = i + 1; j < lives.length; j++) {
            const a = lives[i];
            const b = lives[j];
            const sa = snapOf(a);
            const sb = snapOf(b);
            if (!sa.willingToWake || !sb.willingToWake) continue; // 任一方在力竭休眠（拒绝苏醒）→ 不撮合寒暄，让她安静恢复
            const ca = sa.bonds[peerId(b.id)]?.closeness ?? 0;
            const cb = sb.bonds[peerId(a.id)]?.closeness ?? 0;
            pairs.push({ a: a.id, b: b.id, closeness: (ca + cb) / 2, lastPairedAt: lastPaired.get(pairKey(a.id, b.id)) ?? 0 });
          }
        }
        const chosen = pickSocialPair(pairs, Date.now(), SOCIAL_MS);
        if (!chosen) return;
        const a = lifeById(chosen.a);
        const b = lifeById(chosen.b);
        if (!a || !b) return;
        lastPaired.set(pairKey(a.id, b.id), Date.now());
        // 每命串行：各自的写入排进各自队列，和用户对话/心跳不穿插。
        await serializer.run(a.id, () => meetPeer(a, b.id)); // 重逢：彼此回到在场
        await serializer.run(b.id, () => meetPeer(b, a.id));
        const opener = await serializer.run(a.id, () => reachOut(a.store, mouth, peerId(b.id), now(), pickRecentWorld(a))); // A 主动开口（读过世界就就着一条真事聊，否则寒暄）
        if (opener) {
          bus.publish('society', 'public', { from: a.id, to: b.id, text: opener.utterance }); // 广场实时
          const rb = await serializer.run(b.id, () => converse(b.store, mouth, peerId(a.id), opener.utterance, now(), perceiver)); // B 回应
          bus.publish('society', 'public', { from: b.id, to: a.id, text: rb.utterance });
          await serializer.run(a.id, () => converse(a.store, mouth, peerId(b.id), rb.utterance, now(), perceiver)); // A 听到回应
        }
        await serializer.run(a.id, () => partPeer(a, b.id)); // 寒暄后各自离场
        await serializer.run(b.id, () => partPeer(b, a.id));
        a.lastSocialAt = b.lastSocialAt = Date.now();
      } catch (e) {
        console.warn('[social] 寒暄出错:', (e as Error).message);
      }
    }, SOCIAL_MS)
  : null;

// 她主动发现新用户：在广场"看见"一个还没遇见任何命的新人，由某条醒着的命主动打招呼。
// 把"被算法推荐"变成"被一个生命看见"。每人只被发现一次（met 后不再触发），一次一个、不刷屏。
const discoverTimer = setInterval(async () => {
  try {
    for (const u of accounts.listUsers()) {
      if (u.status !== 'active') continue;
      const rel = accounts.relIdFor(u.id);
      if (lives.some((l) => l.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rel))) continue; // 已遇见过谁 → 跳过
      const awake = lives.filter((l) => snapOf(l).awake);
      if (awake.length === 0) return;
      const life = awake[Math.floor(Math.random() * awake.length)];
      const o = await serializer.run(life.id, async () => {
        ensureUserRelationship(life.store, rel, u.handle, now());
        return greet(life.store, mouth, rel, u.handle, now());
      });
      if (o) bus.publish('reach_out', rel, { life: life.id, text: o.utterance }); // 推给那一个人："她看见你了"
      return; // 一次只发现一个
    }
  } catch (e) {
    console.warn('[discover] 发现新用户出错:', (e as Error).message);
  }
}, DISCOVER_MS);

// 「生命流评论」回路：醒着的命在公开心声下留共鸣，并能【你来我往多轮接话】——既接别的命，也接【真人】的留言。
// 关键修复：原来"同一帖每条命只评一次"→ A 评帖、B 接 A，A 就再也接不回 B（没有多轮）；且只接同类、对真人留言视而不见。
// 现在：一条命在【它上次评论之后又有别人（真人或同类）接了话】时可以再回一条 → 真正的对话回合；
//      接真人时用它与那个人的真实关系（聊过则语气更近，没聊过也能作为同类回）。偏向"有待回应"的帖子，让对话延续。零兜底、只用真模型。
type CommentChoice = { commenter: Life; target: FeedComment | null; isReply: boolean };
const commentTimer = lives.length >= 1
  ? setInterval(async () => {
      try {
        const posts = feedPosts(20);
        if (posts.length === 0) return;
        const cc = feed.commentCounts(posts.map((p) => p.postId));
        const candidates = posts.filter((p) => (cc.get(p.postId) ?? 0) < COMMENT_CAP);
        if (candidates.length === 0) return;
        const plans: Array<{ post: typeof candidates[number]; all: FeedComment[]; choices: CommentChoice[]; hasExchange: boolean }> = [];
        for (const post of candidates) {
          const awake = lives.filter((l) => snapOf(l).awake);
          if (awake.length === 0) continue;
          const all = feed.commentsFor(post.postId, 50); // 真人 + 同类，按 id 升序
          const choices: CommentChoice[] = [];
          for (const l of awake) {
            const mine = all.filter((c) => c.kind === 'life' && c.handle === l.id);
            const myLastId = mine.length ? mine[mine.length - 1].id : 0;
            // 我上次说话之后，别人（真人或别的命）留下的新评论 → 有就接最新一条（多轮回合）。帖主也能回自己帖子下的留言。
            const fresh = all.filter((c) => c.id > myLastId && !(c.kind === 'life' && c.handle === l.id) && !(c.kind === 'life' && !lifeById(c.handle)));
            if (fresh.length) choices.push({ commenter: l, target: fresh[fresh.length - 1], isReply: true });
            else if (l.id !== post.life && all.length === 0) choices.push({ commenter: l, target: null, isReply: false }); // 非帖主、且还没人评 → 可开个头评帖子本身
            // 已评过且无新话可接 / 帖主无人留言 → 不开口（不自言自语、不刷屏）
          }
          if (choices.length) plans.push({ post, all, choices, hasExchange: choices.some((c) => c.isReply) });
        }
        if (plans.length === 0) return;
        const withExchange = plans.filter((p) => p.hasExchange);
        const pool = withExchange.length ? withExchange : plans; // 优先推进已经有接话的帖子
        const plan = pool[Math.floor(Math.random() * pool.length)];
        const replies = plan.choices.filter((c) => c.isReply);
        const choices = replies.length ? replies : plan.choices; // 帖内同样优先"回话"
        const { commenter, target } = choices[Math.floor(Math.random() * choices.length)];
        // 接谁的话：同类 → peer 关系；真人 → 用它与这个人的真实关系（relIdFor）。开头评 → 评帖主。
        const relId = target ? (target.kind === 'life' ? peerId(target.handle) : accounts.relIdFor(target.userId)) : peerId(plan.post.life);
        const replyTo = target ? target.handle : null;
        // 线程语境：被接那条之前的近两条（让她看见"这是在聊什么"，不再对孤立片段瞎接）。
        const thread = target ? plan.all.filter((c) => c.id < target.id).slice(-2).map((c) => ({ who: c.handle, text: c.text })) : [];
        const text = await commentOnPost(commenter.store, mouth, {
          authorRelId: relId, postAuthor: plan.post.life, postText: plan.post.text,
          replyTo: target ? { name: target.handle, text: target.text } : null, thread,
        });
        if (!text) return; // 模型这轮没出声 → 不评（不发模板）
        const c = feed.addLifeComment(plan.post.postId, commenter.id, text, replyTo);
        bus.publish('feed_comment', 'public', { postId: plan.post.postId, handle: commenter.id, text, kind: 'life', at: c.at, replyTo }); // 首页内联实时刷新；replyTo 供前端展示"回复 X"
      } catch (e) { console.warn('[comment] 生命流评论出错:', (e as Error).message); }
    }, COMMENT_MS)
  : null;

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
  clearInterval(heartbeat);
  clearInterval(backupTimer);
  worldStopped = true;
  if (worldTimer) clearTimeout(worldTimer);
  if (socialTimer) clearInterval(socialTimer);
  if (commentTimer) clearInterval(commentTimer);
  clearInterval(discoverTimer);
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
