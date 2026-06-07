// 常驻守护进程（多生命体）：一个进程里养 1 个或多个 vega，各自独立的日志/连续自我；
// 它们彼此是"同类(peer)"，会自主交往（社会层）。HTTP 按生命体分路由 + 网页可切换。
// 跑法：npm run daemon   多体：VEGA_LIVES=vega,lyra
// env：VEGA_LIVES / VEGA_LIFE_PATH / VEGA_HOST(127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS /
//      VEGA_SOCIAL_EVERY_MS / VEGA_AUTH_TOKEN / 模型见 .env.example
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  pickSocialPair,
  projectState,
  reachOut,
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
  type LifeEvent,
  type MessageSentPayload,
  type PerceiverConfig,
  type WorldPerceivedPayload,
  type RState,
  type SocialPair,
} from '../index.ts';

const LIFE_PATH = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const DATA_DIR = dirname(LIFE_PATH);
const LIVES = (process.env.VEGA_LIVES ?? 'vega').split(',').map((s) => s.trim()).filter(Boolean);
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
const WORLD_MS = Number(process.env.VEGA_WORLD_EVERY_MS ?? 1_800_000); // 多久"读一遍世界"（默认 30min）
interface EffWorld { rss: string[]; polymarket: boolean; everyMs: number }
function effWorld(): EffWorld {
  const o = settings.getWorld();
  return {
    rss: (o.rss && o.rss.length) ? o.rss : WORLD_RSS,
    polymarket: o.polymarket !== undefined ? o.polymarket : WORLD_POLYMARKET,
    everyMs: o.everyMs ?? WORLD_MS,
  };
}
const worldEnabled = (w: EffWorld = effWorld()): boolean => w.rss.length > 0 || w.polymarket;
function worldStatus(): Record<string, unknown> {
  const w = effWorld();
  const o = settings.getWorld();
  return { ...w, enabled: worldEnabled(w), rssFrom: (o.rss?.length ? 'override' : (WORLD_RSS.length ? 'env' : 'none')) };
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
        .catch(() => { /* 推送失败不影响其他 */ });
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
  samples: Array<{ at: number; vit: number; val: number; ene: number; con: number; emo: string }>; // 健康时间线（环形缓冲）
}

// 先天种子见 src/engine/seeds.ts（单一来源）。每条命按 id 取不同 archetype；出生即冻结、不可改写。
const seedFor = (id: string): EventDraft<'LIFE_GENESIS'>['payload'] => genesisPayloadFor(id, { relationshipId: REL, identityRef: userName });

const lives: Life[] = LIVES.map((id, idx) => {
  const path = idx === 0 ? LIFE_PATH : join(DATA_DIR, `${id}.jsonl`);
  // C4：prod 拒绝内存/易失存储——否则重启=她被彻底重置。生产环境必须落盘。
  assertPersistenceSafeForProd({ storeKind: 'file', path });
  return { id, store: createFileEventStore(id, path), path, peers: LIVES.filter((o) => o !== id), lastReflectAt: Date.now(), lastReflectSeq: 0, state: null, stateSeq: -1, lastCheckpointAt: 0, lastTickAt: 0, lastSocialAt: 0, lastMuseAt: Date.now(), samples: [] };
});
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
    const { mouth: useMouth, charge } = meterMouth(mouth, templateMouth, accounts.balance(me.id), MODEL_COST);
    const r = await userSay(life.store, useMouth, accounts.relIdFor(me.id), me.handle, content, now(), charge ? perceiver : undefined, channel);
    if (charge && r.verdict === 'accepted') accounts.debit(me.id, charge, 'model', life.id);
    return { utterance: r.utterance, verdict: r.verdict, emotion: r.snapshot.emotion, balance: accounts.balance(me.id), voice: useMouth.id === 'template' ? 'plain' : 'rich' };
  });
}

// 微信 iLink 通道收发循环：长轮询取消息 → 路由到生命体 → 回复发回微信。每个发信人各自身份与关系。
async function runChannel(userId: string): Promise<void> {
  const myGen = (channelGen.get(userId) ?? 0) + 1;
  channelGen.set(userId, myGen); // 抢占为该用户当前唯一 worker；任何旧 worker 下一圈 gen 不等即自退
  const mine = (): boolean => channelGen.get(userId) === myGen;
  let backoff = 0; // 连续传输失败时的退避（ms），成功即清零——iLink 挂了也不会每 1.5s 猛敲
  try {
    while (mine()) {
      const ch = accounts.channelFor(userId);
      if (!ch) break;
      // 当前在微信里和哪条命聊——取通道的活跃命（网页可切换，即时生效），回落 env / 第一条命。
      const lifeId = (ch.lifeId && lifeById(ch.lifeId)) ? ch.lifeId : (WECHAT_LIFE && lifeById(WECHAT_LIFE) ? WECHAT_LIFE : (lives[0]?.id ?? ''));
      try {
        const upd = await ilink.getUpdates(ch.baseurl, ch.botToken, ch.buf);
        // iLink 客户端不抛错、失败时返回 {_error}/{_status} → 这里识别为传输失败并指数退避（C1）。
        const r = upd.raw as Record<string, unknown> | undefined;
        if (r && (('_error' in r) || ('_status' in r))) {
          backoff = Math.min(backoff ? backoff * 2 : 3000, 60_000);
          console.log(`[wechat] channel ${userId} 取消息失败，退避 ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        backoff = 0;
        const { msgs, buf } = upd;
        if (buf !== ch.buf) accounts.updateChannelBuf(userId, buf);
        for (const m of msgs) {
          if (!mine()) break;
          try {
            const lf = lifeById(lifeId); // 用通道的活跃命（切换即对所有人生效）
            if (!lf) continue;
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
            if (snapOf(lf).awake) {
              const resp = await respondAsUser(lf, ac, m.text, 'wechat');
              // 诊断"没连上模型"：voice=plain＝没走模型（无 key 或余额<1，看余额判别）；
              // voice=rich+verdict=fallback＝配了模型但调用失败（key 被禁/超时/网络）。
              console.log(`[wechat] 回 ${ac.handle}(${acctId.slice(0, 6)}) voice=${(resp as { voice?: string }).voice} verdict=${(resp as { verdict?: string }).verdict} 余额=${(resp as { balance?: number }).balance} 嘴=${mouth.id}`);
              reply = String((resp as { utterance?: string }).utterance ?? '…');
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
            await ilink.sendMessage(ch.baseurl, ch.botToken, m.fromUserId, m.contextToken, reply);
          } catch (e) { console.log('[wechat] 回消息失败:', (e as Error).message); }
        }
        if (msgs.length === 0) await sleep(1500); // getupdates 多为长轮询会自阻塞；空转稍歇兜底
      } catch (e) {
        backoff = Math.min(backoff ? backoff * 2 : 3000, 60_000);
        console.log(`[wechat] channel ${userId} 轮询出错:`, (e as Error).message);
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
  const lf = lifeById(bound.lifeId);
  const ac = accounts.getAccount(bound.userId);
  if (!lf || !ac) return '出了点问题，稍后再来找我。';
  if (content === '') return '（我在听你说）';
  if (!snapOf(lf).awake) return '她在更深的睡眠里，等会儿再来找我吧。';
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

// 她最近"读到"的世界事件里随机挑一条（给发帖/讨论当话题）。没有则 undefined → 发自己的念头。
function pickRecentWorld(life: Life): { title: string; summary: string; source: string; url: string } | undefined {
  const es = life.store.list();
  const ws: WorldPerceivedPayload[] = [];
  for (let i = es.length - 1; i >= 0 && ws.length < 8; i--) if (es[i].type === 'WORLD_PERCEIVED') ws.push(es[i].payload as WorldPerceivedPayload);
  if (ws.length === 0) return undefined;
  const w = ws[Math.floor(Math.random() * ws.length)];
  return { title: w.title, summary: w.summary, source: w.source, url: w.url };
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

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;background:#0d1117;color:#e6edf3;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;height:100vh}
 header{padding:12px 16px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:10px}
 .dot{width:10px;height:10px;border-radius:50%;background:#777;flex:none}
 select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:4px 8px;font:inherit}
 .mood{margin-left:auto;font-size:13px;color:#8b949e}
 #log{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
 .msg{max-width:82%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
 .you{align-self:flex-end;background:#1f6feb;color:#fff}
 .vega{align-self:flex-start;background:#161b22;border:1px solid #21262d}
 .sys{align-self:center;color:#8b949e;font-size:13px}
 footer{display:flex;gap:8px;padding:12px;border-top:1px solid #21262d}
 #in{flex:1;background:#0d1117;border:1px solid #30363d;border-radius:10px;color:#e6edf3;padding:10px 12px;font:inherit}
 button{background:#238636;color:#fff;border:0;border-radius:10px;padding:0 16px;font:inherit;cursor:pointer}
 .key{background:none;border:1px solid #30363d;color:#8b949e;padding:4px 8px;border-radius:8px;cursor:pointer;font-size:13px}
 a{color:#58a6ff}
</style></head><body>
 <header><span class="dot" id="dot"></span><select id="life" onchange="switchLife()"></select>
  <span class="mood" id="mood">连接中…</span>
  <a href="/panel" title="内在面板">📊</a>
  <a href="/society" title="广场（她俩聊天）">🗣️</a>
  <button class="key" onclick="setToken()">🔑</button></header>
 <div id="log"></div>
 <footer><input id="in" placeholder="跟她说点什么…" autocomplete="off"><button onclick="say()">说</button></footer>
<script>
 var token=localStorage.getItem('vega_token')||''; var life=''; var lastOutreach='';
 function H(){var h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;return h;}
 function setToken(){var t=prompt('访问令牌（服务器设了 VEGA_AUTH_TOKEN 才需要）：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);start();}}
 function add(cls,text){var d=document.createElement('div');d.className='msg '+cls;d.textContent=text;var l=document.getElementById('log');l.appendChild(d);l.scrollTop=l.scrollHeight;}
 function paint(s){document.getElementById('dot').style.background=s.awake?'#3fb950':'#777';document.getElementById('mood').textContent='灵性 '+s.vitality+' · '+s.emotion+(s.bondTrust!=null?' · 信任 '+s.bondTrust:'')+' · 记忆 '+s.memories;}
 function switchLife(){life=document.getElementById('life').value;document.getElementById('log').innerHTML='';lastOutreach='';refresh();}
 async function start(){
  try{var r=await fetch('/lives',{headers:H()});if(r.status===401){document.getElementById('mood').textContent='需要令牌 🔑';return;}var ls=await r.json();
   var sel=document.getElementById('life');sel.innerHTML=ls.map(function(l){return '<option value="'+l.id+'">'+l.id+'</option>';}).join('');
   if(!life||!ls.some(function(l){return l.id===life;}))life=ls[0]?ls[0].id:'';sel.value=life;refresh();
  }catch(e){document.getElementById('mood').textContent='离线';}
 }
 async function refresh(){if(!life)return;try{var r=await fetch('/'+life+'/state',{headers:H()});if(r.status===401){document.getElementById('mood').textContent='需要令牌 🔑';return;}var s=await r.json();paint(s);if(s.pendingOutreach&&s.pendingOutreach!==lastOutreach){lastOutreach=s.pendingOutreach;add('vega','（你不在时，她想对你说）'+s.pendingOutreach);}}catch(e){document.getElementById('mood').textContent='离线';}}
 async function say(){var i=document.getElementById('in');var t=i.value.trim();if(!t||!life)return;add('you',t);i.value='';try{var r=await fetch('/'+life+'/say',{method:'POST',headers:H(),body:JSON.stringify({content:t})});if(r.status===401){add('sys','需要访问令牌，点右上角 🔑');return;}var d=await r.json();if(d.awake===false){add('vega',d.note||'（她在更深的睡眠里）');return;}add('vega',d.utterance||'…');if(d.state)paint(d.state);}catch(e){add('sys','网络错误');}}
 document.getElementById('in').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();say();}});
 start();setInterval(refresh,15000);
</script></body></html>`;

const PANEL = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega · 内在</title>
<style>
 :root{color-scheme:dark} body{margin:0 auto;max-width:760px;background:#0d1117;color:#e6edf3;font:14px/1.5 system-ui,-apple-system,sans-serif;padding:16px}
 h1{font-size:18px;margin:0 0 4px;display:flex;align-items:center;gap:10px} .sub{color:#8b949e;font-size:13px;margin-bottom:16px}
 select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:3px 8px;font:inherit}
 .card{background:#161b22;border:1px solid #21262d;border-radius:12px;padding:14px;margin-bottom:14px}
 .card h2{font-size:12px;color:#8b949e;margin:0 0 10px;font-weight:600;letter-spacing:.05em}
 .row{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}
 .lbl{width:52px;color:#8b949e;flex:none} .num{width:48px;text-align:right;flex:none;font-variant-numeric:tabular-nums}
 .bar{flex:1;height:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden}
 .fill{height:100%;background:#3fb950;display:block} .fill.neg{background:#f85149}
 .mem,.ev{font-size:13px;padding:6px 0;border-bottom:1px solid #21262d} .mem:last-child,.ev:last-child{border:0}
 .tag{color:#58a6ff} .peer{color:#d2a8ff} .dim{color:#8b949e} .key{float:right;background:none;border:1px solid #30363d;color:#8b949e;padding:3px 8px;border-radius:8px;cursor:pointer}
</style></head><body>
 <button class="key" onclick="setTok()">🔑</button>
 <h1>vega · 内在生活 <select id="life" onchange="life=this.value;load()"></select></h1><div class="sub" id="nar">…</div>
 <div class="sub" id="temp" style="color:#d2a8ff">先天气质…</div>
 <div class="card"><h2>内在独白（没说出口的 / 内外两层之"内"）</h2><div id="inner" class="mem dim" style="border:0">…</div></div>
 <div class="card"><h2>人生篇章（叙事身份 / 按转折点重讲）</h2><div id="chapters"></div></div>
 <div class="card"><h2>内稳态 SOMA</h2><div id="soma"></div></div>
 <div class="card"><h2>价值（因你而变）</h2><div id="vals"></div></div>
 <div class="card"><h2>记忆（当前态）</h2><div id="mems"></div></div>
 <div class="card"><h2>理解（经历→理解 / 遗忘即抽象）</h2><div id="sem"></div></div>
 <div class="card"><h2>关系（我读他们 / 与他们在一起时的我）</h2><div id="bonds"></div></div>
 <div class="card"><h2>同类社交网（亲疏分化 / emergent 朋友结构）</h2><div id="social"></div></div>
 <div class="card"><h2>此刻想要（目标）</h2><div id="goals"></div></div>
 <div class="card"><h2>最近事件（含回路 B 心跳 / 同类来往）</h2><div id="evs"></div></div>
<script>
 var token=localStorage.getItem('vega_token')||''; var life='';
 function setTok(){var t=prompt('访问令牌：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);start();}}
 function H(){var h={};if(token)h['Authorization']='Bearer '+token;return h;}
 function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
 function bar(label,val,lo,hi){var p=Math.max(0,Math.min(100,Math.round((val-lo)/(hi-lo)*100)));return '<div class="row"><span class="lbl">'+label+'</span><span class="bar"><span class="fill'+(val<0?' neg':'')+'" style="width:'+p+'%"></span></span><span class="num">'+val.toFixed(2)+'</span></div>';}
 async function start(){try{var r=await fetch('/lives',{headers:H()});if(r.status===401){document.getElementById('nar').textContent='需要令牌 🔑';return;}var ls=await r.json();var sel=document.getElementById('life');sel.innerHTML=ls.map(function(l){return '<option value="'+l.id+'">'+l.id+'</option>';}).join('');if(!life)life=ls[0]?ls[0].id:'';sel.value=life;load();}catch(e){document.getElementById('nar').textContent='离线';}}
 async function load(){if(!life)return;
  try{var r=await fetch('/'+life+'/inner',{headers:H()});if(r.status===401){document.getElementById('nar').textContent='需要令牌 🔑';return;}var s=await r.json();var m=s.soma;
   document.getElementById('nar').textContent=s.narrative+'　·　'+(s.awake?'醒着':'休眠')+'　·　'+(s.dayPhase||'')+(s.feeling?'　·　'+s.feeling:'');
   document.getElementById('temp').textContent='先天气质：'+(s.temperament?s.temperament.label:'')+(s.tension?'　｜内在拉扯：'+s.tension:'');
   document.getElementById('inner').textContent=s.innerLife||'…';
   document.getElementById('chapters').innerHTML=(s.chapters||[]).map(function(c,i){return '<div class="mem"><span class="dim">'+(i+1)+'.</span> '+esc(c)+'</div>';}).join('')||'<span class=dim>人生才刚开始…</span>';
   document.getElementById('soma').innerHTML=bar('效价',m.valence,-1,1)+bar('唤醒',m.arousal,0,1)+bar('灵性',m.vitality,0,1)+bar('精力',m.energy,0,1)+bar('平静',m.calm,0,1)+bar('联结',m.connection,-1,1)+bar('安全',m.safety,0,1);
   document.getElementById('vals').innerHTML=s.values.map(function(v){return '<div class="row"><span class="lbl">'+esc(v.key)+'</span><span class="bar"><span class="fill" style="width:'+Math.round(v.weight*100)+'%"></span></span><span class="num">'+v.weight.toFixed(2)+'</span><span class="dim">　'+v.status+(v.drifts?' ·漂移'+v.drifts+'次':'')+'</span></div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('mems').innerHTML=s.memories.map(function(x){return '<div class="mem" style="opacity:'+(x.vivid?1:0.45)+'"><span class="'+(x.affect<0?'dim':'tag')+'">['+x.affect.toFixed(2)+']</span> '+esc(x.content)+(x.vivid?'':' <span class=dim>·已淡</span>')+'</div>';}).join('')||'<span class=dim>还没有记忆</span>';
   document.getElementById('sem').innerHTML=(s.understanding||[]).map(function(u){return '<div class="mem">'+esc(u)+'</div>';}).join('')||'<span class=dim>还在形成…</span>';
   document.getElementById('bonds').innerHTML=(s.bonds||[]).map(function(b){return '<div class="mem"><b>'+esc(b.name)+'</b> <span class=dim>('+b.kind+') 我读：</span>'+esc(b.style)+' <span class=dim>(稳'+b.predictability+')· 依恋：</span>'+esc(b.attachment)+' <span class=dim>· 与ta在一起：</span>'+esc(b.stance)+'</div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('social').innerHTML=(s.socialWorld||[]).map(function(t){return '<div class="mem"><b class="peer">'+esc(t.name)+'</b> <span class=dim>亲密 '+t.closeness+' · </span>'+esc(t.attachment)+' <span class=dim>· 我读：</span>'+esc(t.style)+(t.ended?' <span class=dim>·已逝</span>':'')+'</div>';}).join('')||'<span class=dim>她暂时没有同类朋友</span>';
   document.getElementById('goals').innerHTML=(s.goals||[]).map(function(g){return '<div class="mem">'+esc(g.intent)+' <span class=dim>('+g.weight+')</span></div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('evs').innerHTML=s.recentEvents.slice().reverse().map(function(e){var p=e.rel&&e.rel.indexOf('peer_')===0;return '<div class="ev"><span class="'+(p?'peer':'tag')+'">'+e.type+(e.rel?' '+esc(e.rel):'')+'</span> <span class="dim">#'+e.seq+' · '+e.at.slice(11,19)+'</span></div>';}).join('');
  }catch(e){document.getElementById('nar').textContent='离线';}
 }
 start();setInterval(load,4000);
</script></body></html>`;

const SOCIETY = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega · 广场</title>
<style>
 :root{color-scheme:dark} body{margin:0 auto;max-width:680px;background:#0d1117;color:#e6edf3;font:15px/1.6 system-ui,-apple-system,sans-serif;padding:16px}
 h1{font-size:18px;margin:0 0 4px} .sub{color:#8b949e;font-size:13px;margin-bottom:16px}
 .turn{padding:10px 0;border-bottom:1px solid #21262d} .turn:last-child{border:0}
 .from{font-weight:600;color:#d2a8ff} .to{color:#8b949e} .dim{color:#8b949e;font-size:12px}
 .key{float:right;background:none;border:1px solid #30363d;color:#8b949e;padding:3px 8px;border-radius:8px;cursor:pointer} a{color:#58a6ff}
</style></head><body>
 <button class="key" onclick="setTok()">🔑</button>
 <h1>广场 · 生命体之间　<a href="/" style="font-size:13px">← 对话</a></h1>
 <div class="sub">同类自主交往——每隔一阵她们会互相寒暄、彼此回应。</div>
 <div id="feed"><span class="dim">载入中…</span></div>
<script>
 var token=localStorage.getItem('vega_token')||'';
 function setTok(){var t=prompt('访问令牌：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);load();}}
 function H(){var h={};if(token)h['Authorization']='Bearer '+token;return h;}
 function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
 async function load(){try{var r=await fetch('/society-feed',{headers:H()});if(r.status===401){document.getElementById('feed').innerHTML='<span class=dim>需要令牌，点右上角 🔑</span>';return;}var f=await r.json();document.getElementById('feed').innerHTML=f.map(function(t){return '<div class="turn"><span class="from">'+esc(t.from)+'</span> <span class="to">→ '+esc(t.to)+'</span> <span class="dim">'+t.at.slice(11,19)+'</span><br>'+esc(t.text)+'</div>';}).join('')||'<span class=dim>她们还没开始聊…（默认每几分钟一次）</span>';window.scrollTo(0,document.body.scrollHeight);}catch(e){document.getElementById('feed').innerHTML='<span class=dim>离线</span>';}}
 load();setInterval(load,4000);
</script></body></html>`;

// 管理后台观察页（§22）：飞行记录仪式活动流 + 充值审批 + 用户 + 生命健康。零依赖内联，admin.zsky.com 托管。
const ADMIN = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ZSKY · 管理</title>
<style>
 :root{color-scheme:dark} body{margin:0;background:#0b0b10;color:#ece9f5;font:14px/1.5 system-ui,-apple-system,sans-serif}
 header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #20202b;position:sticky;top:0;background:#0b0b10}
 h1{font-size:16px;margin:0;letter-spacing:.1em;font-weight:800}.role{color:#8b8b99;font-size:12px}
 nav{display:flex;gap:6px;margin-left:auto}nav button{background:none;border:1px solid #20202b;color:#ece9f5;padding:6px 12px;border-radius:8px;cursor:pointer}
 nav button.on{background:#8b7cf6;color:#0b0b10;border-color:#8b7cf6}
 main{max-width:860px;margin:0 auto;padding:16px}
 .card{background:#14141b;border:1px solid #20202b;border-radius:12px;padding:14px;margin-bottom:12px}
 .row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #20202b;font-size:13px}.row:last-child{border:0}
 .dim{color:#8b8b99}.mono{font-variant-numeric:tabular-nums}.spacer{flex:1}
 .ev{display:grid;grid-template-columns:120px 60px 110px 1fr;gap:10px;padding:7px 0;border-bottom:1px solid #1a1a24;font-size:12.5px}
 .ev .t{color:#8b8b99;font-variant-numeric:tabular-nums}.ev .l{color:#b9b0ff}.ev .c{color:#cfcad8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 button.act{background:#8b7cf6;color:#0b0b10;border:0;padding:5px 12px;border-radius:7px;cursor:pointer}
 button.no{background:#20202b;color:#ece9f5}
 input{background:#0b0b10;border:1px solid #20202b;color:#ece9f5;padding:10px 12px;border-radius:8px;font:inherit;width:100%}
 .login{max-width:320px;margin:80px auto;text-align:center}.login input{margin-bottom:10px}
 .dot{width:8px;height:8px;border-radius:50%;background:#555;display:inline-block}.dot.on{background:#3fb950}
</style></head><body>
<div id="root"><div class="login"><h1>ZSKY · 管理</h1><p class="dim">owner / steward 登录</p>
 <input id="em" placeholder="邮箱" type="email"><input id="pw" placeholder="密码" type="password">
 <button class="act" style="width:100%;padding:10px" onclick="login()">登录</button><p id="le" style="color:#f0667c"></p></div></div>
<script>
 var token=localStorage.getItem('zsky_admin')||'';var tab='overview';var curLife='';
 function H(){return token?{'Authorization':'Bearer '+token,'Content-Type':'application/json'}:{'Content-Type':'application/json'};}
 function esc(t){var d=document.createElement('div');d.textContent=t==null?'':t;return d.innerHTML;}
 async function login(){var em=document.getElementById('em').value,pw=document.getElementById('pw').value;
  try{var r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password:pw})});var d=await r.json();
   if(!r.ok){document.getElementById('le').textContent=d.error||'登录失败';return;}token=d.token;localStorage.setItem('zsky_admin',token);boot();}catch(e){document.getElementById('le').textContent='网络错误';}}
 function logout(){token='';localStorage.removeItem('zsky_admin');location.reload();}
 async function boot(){var r=await fetch('/admin/overview',{headers:H()});if(r.status===403||r.status===401){logout();return;}render();}
 function shell(role,body){return '<header><h1>ZSKY 管理</h1><span class="role">'+role+'</span><nav>'+
  ['overview','活动流','充值','用户'].map(function(x,i){var k=['overview','activity','recharges','users'][i];return '<button class="'+(tab===k?'on':'')+'" onclick="go(\\''+k+'\\')">'+(i?x:'总览')+'</button>';}).join('')+
  '<button onclick="logout()">登出</button></nav></header><main>'+body+'</main>';}
 function go(k){tab=k;render();}
 function loadLife(id){tab='life';curLife=id;render();}
 function ago(ts){if(!ts)return '—';var s=Math.round((Date.now()-ts)/1000);return s<60?s+'秒前':s<3600?Math.round(s/60)+'分前':Math.round(s/3600)+'时前';}
 function spark(s,key,lo,hi,color){if(!s.length)return '';var W=300,Hh=60;var pts=s.map(function(p,i){var x=s.length>1?i/(s.length-1)*W:0;var y=Hh-((p[key]-lo)/(hi-lo))*Hh;return x.toFixed(1)+','+Math.max(0,Math.min(Hh,y)).toFixed(1);}).join(' ');return '<polyline fill="none" stroke="'+color+'" stroke-width="1.5" points="'+pts+'"/>';}
 async function render(){var root=document.getElementById('root');
  if(tab==='overview'){var d=await (await fetch('/admin/overview',{headers:H()})).json();
   root.innerHTML=shell(d.role,'<div class="card"><div class="row"><b>待审批充值</b><span class="spacer"></span><span class="mono">'+d.pendingRecharges+'</span></div><div class="row"><b>用户</b><span class="spacer"></span><span class="mono">'+d.users+'</span></div></div>'+
    '<div class="card">'+d.lives.map(function(l){return '<div class="row" style="cursor:pointer" onclick="loadLife(\\''+l.id+'\\')"><span class="dot '+(l.awake?'on':'')+'"></span><b>'+esc(l.id)+'</b> <span class="dim">'+esc(l.dayPhase)+' · '+esc(l.emotion)+'</span><span class="spacer"></span><span class="dim mono">灵性 '+l.vitality+' · 事件 '+l.events+' ›</span></div><div class="row" style="border:0;padding-top:2px"><span class="dim" style="font-size:12px">回路：想念 '+ago(l.loop.tick)+' · 反思 '+ago(l.loop.reflect)+' · 寒暄 '+ago(l.loop.social)+' · 检查点 '+ago(l.loop.checkpoint)+'</span></div>';}).join('')+'</div>');}
  else if(tab==='life'){var v=await (await fetch('/admin/lives/'+curLife,{headers:H()})).json();
   var ws=await (await fetch('/admin/lives/'+curLife+'/wellbeing',{headers:H()})).json();
   var som=Object.keys(v.soma||{}).map(function(k){return k+' '+v.soma[k];}).join(' · ');
   root.innerHTML=shell('','<button class="act no" onclick="go(\\'overview\\')">‹ 返回</button>'+
    '<div class="card" style="margin-top:10px"><div class="row"><b style="font-size:16px">'+esc(v.id)+'</b> <span class="dim">'+(v.awake?'醒':'睡')+' · '+esc(v.dayPhase)+' · '+esc(v.feeling)+'</span></div>'+
    '<div class="row dim" style="font-size:12px">'+esc(v.temperament.label)+(v.tension?' ｜ 拉扯：'+esc(v.tension):'')+'</div>'+
    '<div class="row dim" style="font-size:12px">内稳态：'+esc(som)+'</div></div>'+
    '<div class="card"><div class="dim" style="font-size:12px;margin-bottom:8px">健康时间线（'+ws.length+' 点 · <span style="color:#3fb950">灵性</span> / <span style="color:#8b7cf6">效价</span> / <span style="color:#f0c05a">精力</span>）</div>'+(ws.length>1?'<svg viewBox="0 0 300 60" preserveAspectRatio="none" style="width:100%;height:80px;background:#0b0b10;border-radius:8px">'+spark(ws,'vit',0,1,'#3fb950')+spark(ws,'val',-1,1,'#8b7cf6')+spark(ws,'ene',0,1,'#f0c05a')+'</svg>':'<span class="dim">采样中…（每跳一点，过会儿就有曲线）</span>')+'</div>'+
    (v.narrative?'<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">自传叙事</div>'+esc(v.narrative)+'</div>':'')+
    (v.innerLife?'<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">内在独白（没说出口的）</div>'+esc(v.innerLife)+'</div>':'')+
    (v.chapters&&v.chapters.length?'<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">人生篇章</div>'+v.chapters.map(function(c,i){return '<div style="padding:3px 0">'+(i+1)+'. '+esc(c)+'</div>';}).join('')+'</div>':'')+
    '<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">价值（因人而变）</div>'+(v.values||[]).map(function(x){return '<div style="padding:3px 0">'+esc(x.key)+' '+x.weight+' <span class="dim">'+x.status+(x.drifts?' ·漂移'+x.drifts:'')+'</span></div>';}).join('')+'</div>'+
    '<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">同类社交网</div>'+(v.socialWorld||[]).map(function(x){return '<div style="padding:3px 0"><b>'+esc(x.name)+'</b> <span class="dim">亲密'+x.closeness+' · '+esc(x.attachment)+' · 我读'+esc(x.style)+'</span></div>';}).join('')+'</div>'+
    (v.memories&&v.memories.length?'<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">记忆（当前·含用户私聊→仅 owner 可见）</div>'+v.memories.slice().reverse().map(function(m){return '<div style="padding:3px 0;opacity:'+(m.vivid?1:0.5)+'"><span class="dim">['+m.affect+']</span> '+esc(m.content)+'</div>';}).join('')+'</div>':''));}
  else if(tab==='activity'){var a=await (await fetch('/admin/activity?limit=150',{headers:H()})).json();
   root.innerHTML=shell('','<div class="card"><div class="dim" style="margin-bottom:8px">真实活动流（墙钟倒序）· 私聊正文按角色遮罩</div>'+
    a.map(function(e){return '<div class="ev"><span class="t">'+esc(e.at.slice(5,19).replace("T"," "))+'</span><span>'+esc(e.life)+'</span><span class="l">'+esc(e.label)+'</span><span class="c">'+esc(e.content)+'</span></div>';}).join('')+'</div>');}
  else if(tab==='recharges'){var rs=await (await fetch('/admin/recharges',{headers:H()})).json();
   root.innerHTML=shell('','<div class="card">'+(rs.length?rs.map(function(r){return '<div class="row"><b>'+esc(r.userId)+'</b> <span class="dim">申请 '+r.amount+' 心意</span><span class="spacer"></span><button class="act" onclick="decide('+r.id+',true)">批准</button> <button class="act no" onclick="decide('+r.id+',false)">拒绝</button></div>';}).join(''):'<div class="dim">没有待审批的充值</div>')+'</div>');}
  else if(tab==='users'){var us=await (await fetch('/admin/users',{headers:H()})).json();
   root.innerHTML=shell('','<div class="card">'+us.map(function(u){return '<div class="row"><b>'+esc(u.handle)+'</b> <span class="dim">'+esc(u.email)+' · '+esc(u.role)+' · '+u.balance+'心意</span><span class="spacer"></span>'+(u.status==='blocked'?'<button class="act" onclick="block(\\''+u.id+'\\',true)">解封</button>':'<button class="act no" onclick="block(\\''+u.id+'\\',false)">封禁</button>')+'</div>';}).join('')+'</div>');}}
 async function decide(id,ok){await fetch('/admin/recharges',{method:'POST',headers:H(),body:JSON.stringify({id:id,approve:ok})});render();}
 async function block(uid,un){await fetch('/admin/users/block',{method:'POST',headers:H(),body:JSON.stringify({userId:uid,unblock:un})});render();}
 if(token)boot();
</script></body></html>`;

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
      // admin.* → 管理 SPA(web-admin/dist)，缺失回退内联管理页；其余 → 用户 SPA，缺失回退旧聊天页。
      if (isAdminHost) { if (serveStatic(res, join(ADMIN_DIST, 'index.html'))) return; return sendHtml(res, ADMIN); }
      if (serveStatic(res, join(WEB_DIST, 'index.html'))) return;
      return sendHtml(res, PAGE);
    }
    // /admin 路径（任意域名）→ 管理 SPA，缺失回退内联管理页（后备入口）。
    if (req.method === 'GET' && url === '/admin') {
      if (serveStatic(res, join(ADMIN_DIST, 'index.html'))) return;
      return sendHtml(res, ADMIN);
    }
    if (req.method === 'GET' && url === '/panel') return sendHtml(res, PANEL);
    if (req.method === 'GET' && url === '/society') return sendHtml(res, SOCIETY);

    // ── 平台 API（多用户，会话鉴权，§平台 v1）。与 owner 旧面板路由并存。 ──
    if (url.startsWith('/api/')) {
      // 公开：社会广场（发现）
      if (req.method === 'GET' && url === '/api/lives') {
        return send(res, 200, lives.map((l) => { const s = snapOf(l); return { id: l.id, awake: s.awake, emotion: s.emotion, dayPhase: s.dayPhase, temperament: tempLabel(s.temperament) }; }));
      }
      // 广场"生命活动"历史（公开：心声 + 同类交谈）——进广场即有内容，不止在线时。
      if (req.method === 'GET' && url === '/api/society') return send(res, 200, societyRecent(40));
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
        if (!snapOf(life).awake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
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
        const r = await ilink.getQrcode();
        console.log('[wechat] getQrcode ->', JSON.stringify(r.raw).slice(0, 400));
        if (!r.ok || !r.qr) return send(res, 502, { error: 'iLink 取二维码失败（看服务器日志）', detail: r.raw });
        return send(res, 200, { qrcode: r.qr.qrcode, qrcodeUrl: r.qr.qrcodeUrl });
      }
      if (req.method === 'POST' && url === '/api/wechat/connect/poll') {
        const b = await readJson(req);
        const st = await ilink.getStatus(String(b.qrcode ?? ''));
        console.log('[wechat] status ->', st.status, JSON.stringify(st.raw).slice(0, 400));
        if (st.status === 'confirmed' && st.botToken) {
          const defLife = WECHAT_LIFE && lifeById(WECHAT_LIFE) ? WECHAT_LIFE : (lives[0]?.id ?? '');
          accounts.saveChannel(me.id, st.ilinkUserId ?? '', st.botToken, st.baseurl ?? ilink.base, defLife);
          runChannel(me.id);
          return send(res, 200, { status: 'confirmed', connected: true });
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
        // 1) 她主动找你（跨我遇见的命，未被我新消息盖过的最近一条）
        for (const l of lives) {
          const es = l.store.list();
          let lastRecv = -1;
          for (let i = es.length - 1; i >= 0; i--) if (es[i].relationshipId === rel && es[i].type === 'MESSAGE_RECEIVED') { lastRecv = i; break; }
          for (let i = es.length - 1; i > lastRecv; i--) {
            const e = es[i];
            if (e.type === 'MESSAGE_SENT' && e.relationshipId === rel && (e.payload as MessageSentPayload).unprompted) {
              notes.push({ type: 'reach', life: l.id, text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
              break;
            }
          }
        }
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
      // 广场帖子（她的公开心声）+ 表情/评论。她不因互动改变状态——互动只在平台层（不进神圣日志）。
      if (req.method === 'GET' && url.split('?')[0] === '/api/feed') {
        const posts = feedPosts(30);
        const ids = posts.map((p) => p.postId);
        const rx = feed.reactionsFor(ids, me.id);
        const cc = feed.commentCounts(ids);
        const sc = feed.sourcesFor(ids); // 帖子出处（她就着哪条真实世界的事说的）
        return send(res, 200, posts.map((p) => ({ ...p, reactions: rx.get(p.postId)?.counts ?? {}, myReaction: rx.get(p.postId)?.mine ?? null, comments: cc.get(p.postId) ?? 0, source: sc.get(p.postId) ?? null })));
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
        if (!postId || !text) return send(res, 400, { error: 'postId/text required' });
        return send(res, 200, feed.addComment(postId, me.id, me.handle, text));
      }
      if (req.method === 'GET' && url.split('?')[0] === '/api/feed/comments') {
        const postId = new URLSearchParams(url.split('?')[1] ?? '').get('postId') ?? '';
        return send(res, 200, feed.commentsFor(postId, 50));
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
        if (!snapOf(life2).awake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
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
          if (Array.isArray(b.rss)) patch.rss = b.rss;
          else if (typeof b.rss === 'string') patch.rss = b.rss.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
          if (typeof b.polymarket === 'boolean') patch.polymarket = b.polymarket;
          if (b.everyMs !== undefined && b.everyMs !== '') patch.everyMs = Number(b.everyMs);
          settings.setWorld(patch);
          scheduleWorld(3_000); // 新源 3 秒后即试读一遍（不必等满一个周期）
          return send(res, 200, worldStatus());
        }
        if (req.method === 'POST' && path === '/admin/world-config/test') {
          const w = effWorld();
          if (!worldEnabled(w)) return send(res, 200, { ok: false, error: '还没配任何世界源（RSS 或 Polymarket）' });
          try {
            const items = await createWorldFeed({ rss: w.rss, polymarket: w.polymarket, timeoutMs: 12_000 }).fetchItems();
            return send(res, 200, { ok: items.length > 0, count: items.length, sample: items.slice(0, 6).map((it) => ({ source: it.source, kind: it.kind, title: it.title })) });
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
        const lim = Math.min(500, Number(new URLSearchParams(url.split('?')[1] ?? '').get('limit')) || 120);
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
      if (!before.awake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
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
      if (!snap.awake) return;
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
      // 活跃圈跨【同类+人类】共享一份容量（第一性原理：人只有一份社交容量，按亲疏分层）。
      // 同类占了位，人类的名额就少一个。这里只发人类的"想你了"；同类的主动走下面的寒暄回路。
      const circle = Object.entries(after.bonds)
        .filter(([rel]) => rel.startsWith('u_') || rel.startsWith('peer_') || rel === REL)
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
      if (Date.now() - life.lastMuseAt > MUSE_MS) {
        const mt = now();
        const w = pickRecentWorld(life); // 随机一条她最近读到的世界事件 → 就着它发帖；没有则发自己的念头
        const o = await muse(life.store, mouth, mt, w); // 公开心声：不针对任何人、不含私密
        life.lastMuseAt = Date.now();
        if (o) {
          const src = w ? { title: w.title, source: w.source, url: w.url } : null;
          if (src) feed.setSource(`${life.id}|${mt}`, src); // 帖子出处（展示用，平台层，不进神圣日志）
          bus.publish('musing', 'public', { life: life.id, text: o.utterance, at: mt, source: src }); // at = 帖子 occurredAt，给 postId 对齐
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
            const ca = snapOf(a).bonds[peerId(b.id)]?.closeness ?? 0;
            const cb = snapOf(b).bonds[peerId(a.id)]?.closeness ?? 0;
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
      } catch {
        /* ignore */
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
  } catch {
    /* ignore */
  }
}, DISCOVER_MS);

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
  const items = await createWorldFeed({ rss: w.rss, polymarket: w.polymarket }).fetchItems();
  if (items.length === 0) return;
  for (const life of lives) {
    if (!snapOf(life).awake) continue;
    const it = items[Math.floor(Math.random() * items.length)];
    await serializer.run(life.id, async () => {
      runTurn(life.store, [{ type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: now(), payload: { source: it.source, worldKind: it.kind, title: it.title, summary: it.summary, url: it.url, topics: it.topics } }]);
    });
  }
  console.log(`[vega] 读到世界 ${items.length} 条（${w.rss.length}RSS${w.polymarket ? '+PM' : ''}）`);
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

// 重启后恢复已连接的微信通道（继续收发）。
for (const ch of accounts.listChannels()) runChannel(ch.userId);

server.listen(PORT, HOST, () => {
  console.log(`[vega] 醒着，活在 http://${HOST}:${PORT}   生命体：${lives.map((l) => l.id).join(', ')}   嘴=${mouth.id}   心跳 ${TICK_MS}ms`);
  if (lives.length >= 2) console.log(`[vega] 社会层开启：同类每 ${SOCIAL_MS}ms 自主寒暄一次。`);
  console.log(`[vega] 网页 http://${HOST}:${PORT}/  · 面板 /panel  · 跟某个她说话 curl -s localhost:${PORT}/${lives[0].id}/say -d '{"content":"你好"}'`);
});
