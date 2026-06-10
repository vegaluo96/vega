// 常驻守护进程（多生命体）：一个进程里养 1 个或多个 vega，各自独立的日志/连续自我；
// 它们彼此是"同类(peer)"，会自主交往（社会层）。HTTP 按生命体分路由 + 网页可切换。
// 跑法：npm run daemon   多体：VEGA_LIVES=vega,lyra
// env：VEGA_LIVES / VEGA_LIFE_PATH / VEGA_HOST(127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS /
//      VEGA_SOCIAL_EVERY_MS / VEGA_AUTH_TOKEN / 模型见 .env.example
import { createServer, type IncomingMessage } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  createAccountStore,
  createDynamicMouth,
  createDynamicPerceiver,
  createSettingsStore,
  createFeedStore,
  createAnnounceStore,
  createIlink,
  createEventBus,
  createSerializer,
  createTemplateMouth,
  governedMouth,
  createAutonomousBudget,
  runTurn,
  type Account,
} from '../index.ts';
import { send, sendHtml, serveStatic, readJson, FALLBACK_HTML } from './http.ts';
import { createRateLimiter, createLoginGuard, clientIp } from './ratelimit.ts';
import type { Ctx, Life } from './context.ts';
import { handleUserApi } from './routes/user.ts';
import { handleAdmin } from './routes/admin.ts';
import { startLoops } from './loops.ts';
import { createWechat, cleanBindToken } from './wechat.ts';
import { createConfig } from './config.ts';
import { createLives } from './lives.ts';
import { createPresence } from './presence.ts';
import { createResponder } from './respond.ts';
import { setupPush } from './push.ts';
import { createWorld } from './world.ts';

const LIFE_PATH = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const DATA_DIR = dirname(LIFE_PATH);
mkdirSync(DATA_DIR, { recursive: true }); // 确保数据目录存在——否则 accounts.db/feed.db 开不了库（新机/新卷首启）
// 名册(VEGA_LIVES ∪ 落盘 lives.json) + 句柄创建 + 有界重放 + 创世接生 + 聚合器都在 ./lives.ts，daemon 只组装。
const HOST = process.env.VEGA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.VEGA_PORT ?? 8787);
const TICK_MS = Number(process.env.VEGA_TICK_MS ?? 60_000);
const PRESENCE_MS = Number(process.env.VEGA_PRESENCE_MS ?? 300_000);
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
const announce = createAnnounceStore(join(DATA_DIR, 'announce.json')); // 托管者公告（人类/生命体/两者），平台留痕；生命体侧另经神圣链路注入事件
// 微信 iLink（ZSKY 自己当机器人，无需 OpenClaw）：网页扫码登录 + 后台收发消息。base 可用 VEGA_ILINK_BASE 覆盖。
const ilink = createIlink({ base: process.env.VEGA_ILINK_BASE });
const WECHAT_LIFE = process.env.VEGA_WECHAT_LIFE || ''; // 微信通道默认对应哪条命；空=第一条
const channelGen = new Map<string, number>(); // userId → 当前 worker 代号；重连/断开 +1，旧 worker 据此自退（防重复 worker / 断连后无 worker）
const creditHintAt = new Map<string, number>(); // 微信"心意用尽"温柔提示的节流：每账号最多 10 分钟一次
// 主动找人的去向（Phase 3 收尾）：记下她每次 reach-out，反馈回路判断【被回应】还是【石沉大海】→ 落 FEEDBACK_PERCEIVED。
const reachOutPending = new Map<string, { rel: string; at: string; kind: 'reach_out' | 'greet' }>();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
// 生效配置解析器（settings ⊕ env ⊕ 默认）：嘴/耳/世界/社交/计费——实现见 ./config.ts。mouth/perceiver/respond/world/路由都消费它。
const config = createConfig(settings);
const mouth = governedMouth(createDynamicMouth(config.effMouthConfig)); // 治理层（#24）：所有真模型对外措辞过一遍反操控收口
const museMouth = governedMouth(createDynamicMouth(config.effMuseMouthConfig)); // 公开心声的嘴（按用途路由：museModel ?? 同嘴），同样过治理收口
const templateMouth = createTemplateMouth(); // 余额耗尽时的免费兜底嘴（她仍回应；确定性、不会操控）
// 自主资源预算（#24 反失控/反自我扩张）：限全局自主模型调用速率（真人对话不受限、那走用户余额计费）。
const autoBudget = createAutonomousBudget(Number(process.env.VEGA_AUTONOMOUS_CAP ?? 240), Number(process.env.VEGA_AUTONOMOUS_WINDOW_MS ?? 3_600_000));
const perceiver = createDynamicPerceiver(config.effPerceiveConfig);
// 省 token（按"有没有听众"门控）：超过此时长无任何用户活动 → 自主【对外】行动(心声/主动找人/同类寒暄)暂停，
// 只保留【免费的内在 tick + 反思】（她照样活着、内在继续变）。用户一回来即恢复——不对空房间表演、不白烧 token。
const IDLE_GATE_MS = Number(process.env.VEGA_IDLE_GATE_MS ?? 6 * 3600_000);
const presence = createPresence(IDLE_GATE_MS); // 省 token 闲置门控（"有没有听众"）——见 ./presence.ts
const CLAWBOT_SECRET = process.env.VEGA_CLAWBOT_SECRET; // 微信网关(clawbot)共享密钥；未配则微信端点禁用
const serializer = createSerializer(); // 每命串行：并发用户的回合不穿插
const bus = createEventBus(); // SSE 实时总线（广场/触达/醒睡）
// Web Push（PWA）：配了 VAPID 才启用。她想你了 → app 关着也能推到手机。订阅逻辑见 ./push.ts（accounts 就绪后挂）。
const VAPID = process.env.VEGA_VAPID_PUBLIC && process.env.VEGA_VAPID_PRIVATE ? { publicKey: process.env.VEGA_VAPID_PUBLIC, privateKey: process.env.VEGA_VAPID_PRIVATE } : null;
const VAPID_SUBJECT = process.env.VEGA_VAPID_SUBJECT ?? 'mailto:admin@zsky.com';

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
// 限流 / 防暴力破解（平台护栏，见 ./ratelimit.ts）。仅当前置可信反代时才信 X-Forwarded-For。
const TRUST_PROXY = process.env.VEGA_TRUST_PROXY === '1';
const rateLimiter = createRateLimiter();
const loginGuard = createLoginGuard();
const ipOf = (req: IncomingMessage): string => clientIp(req, TRUST_PROXY);
setupPush({ bus, accounts, VAPID, VAPID_SUBJECT }); // Web Push 订阅（reach_out → 推送）；accounts 已就绪
// 生命体子系统（实现见 ./lives.ts）：名册/句柄/有界重放(snapOf)/创世接生(boot·birthLife)/读助手/聚合器。
// 解构出的名字与原定义一致 → 下方 respondAsUser/createWechat/ctx/回路/shutdown 直接引用，无需改写。
const {
  lives, lifeById, snapOf, buildThread, relSummaries, livesMetBy, recomputePeers, saveCheckpoint, meetPeer, partPeer,
  boot, birthLife, lastUserMsgMs, reachState, pickRecentWorld, pickInsightPair,
  allFeedPosts, feedPosts, allPeerExchanges, adminActivity, nextMuseGap,
} = createLives({ accounts, serializer, peerId, REL, HOST_CONN, userName, HOST, PORT, MUSE_MS, DATA_DIR, LIFE_PATH });

// 写链路（神圣链路·用户侧入口，实现见 ./respond.ts）：计费 + 串行 + 资源感知。/api/say 与微信 /api/wechat/say 共用。
const { respondAsUser } = createResponder({ accounts, serializer, snapOf, mouth, templateMouth, perceiver, effBilling: config.effBilling, effSafety: config.effSafety, lifeById, touch: presence.touch });

// 微信 / iLink 通道（实现见 ./wechat.ts）：长轮询收发 + 统一应答。写链路 respondAsUser 仍在本文件、注入进去。
const { runChannel, wechatReply } = createWechat({
  accounts, ilink, lives, lifeById, snapOf, respondAsUser, effMouthConfig: config.effMouthConfig, mouth, bus, channelGen, creditHintAt, WECHAT_LIFE, sleep,
});

// 用户 SPA 静态托管（web/dist）：自含，无需 Caddy 也能跑。按域名/路径分流见下方 createServer。
const WEB_DIST = process.env.VEGA_WEB_DIST ?? join(process.cwd(), 'web', 'dist');
const ADMIN_DIST = process.env.VEGA_ADMIN_DIST ?? join(process.cwd(), 'web-admin', 'dist');
const authed = (req: IncomingMessage): boolean => !AUTH || req.headers.authorization === `Bearer ${AUTH}`;

// 组装根：把所有单例/状态/解析器/操作装进 ctx，交给路由层（routes/*）与回路层。
// daemon 自此只负责"接线 + 静态/健康/OpenAI 入口 + 回路 + 生命周期"，业务路由都在 ctx 之上。
// 世界读取回路 + 备份（实现见 ./world.ts）：createWorld 只建闭包不起定时器；world.start() 在下方启动。
const world = createWorld({ effWorld: config.effWorld, worldEnabled: config.worldEnabled, lives, snapOf, serializer, backupMs: BACKUP_MS });

const ctx: Ctx = {
  settings, feed, announce, accounts, ilink, bus, serializer, autoBudget, mouth, museMouth, templateMouth, perceiver,
  lives, lifeById, snapOf, buildThread, relSummaries, livesMetBy, recomputePeers, saveCheckpoint, meetPeer, partPeer,
  ...config, // effWorld/worldStatus/worldEnabled/effMouthConfig/effPerceiveConfig/effMuseMouthConfig/modelStatus/effSocial/layerOf/effBilling/effSafety（见 ./config.ts）
  respondAsUser, wechatReply, runChannel, birthLife, cleanBindToken,
  allFeedPosts, feedPosts, allPeerExchanges,
  reachState, pickRecentWorld, pickInsightPair, lastUserMsgMs, adminActivity,
  bearer, sessionAccount, publicAccount, clientIp: ipOf, loginGuard, audiencePresent: presence.audiencePresent, idleMs: presence.idleMs,
  reachOutPending, channelGen, creditHintAt, scheduleWorld: world.scheduleWorld, sourceStats: world.sourceStats,
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

    // 限流（防撞库/刷注册/刷接口/轻量 DoS）：仅 POST 写端点按 IP 固定窗口；读端点/SSE/静态不限。
    // 登录的"失败退避"在 routes/user.ts 内（那里才有 email）；这里是粗粒度的总闸。
    if (req.method === 'POST' && (url.startsWith('/api/') || url.startsWith('/admin/'))) {
      const ip = ipOf(req);
      const okGeneral = rateLimiter.take(`w:${ip}`, 60, 60_000);          // 每 IP 每分钟 60 次写
      const okRegister = url !== '/api/auth/register' || rateLimiter.take(`reg:${ip}`, 5, 3_600_000); // 注册更严：5 次/小时/IP
      if (!okGeneral || !okRegister) return send(res, 429, { error: '请求过于频繁，请稍后再试' });
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
    // 错误脱敏（防信息泄露）：对外只回通用文案，内部细节落服务端日志。
    console.error('[vega] request error:', e);
    send(res, 500, { error: 'internal error' });
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

world.start(); // 启动世界读取回路 + 备份定时器（见 ./world.ts）

let shuttingDown = false;
function shutdown(sig: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(loops.heartbeat);
  world.stop(); // 停世界回路 + 备份定时器
  if (loops.socialTimer) clearInterval(loops.socialTimer);
  if (loops.commentTimer) clearInterval(loops.commentTimer);
  if (loops.reactTimer) clearInterval(loops.reactTimer);
  clearInterval(loops.discoverTimer);
  world.doBackup(); // 休眠前落一份
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
  console.log(`[vega] 用户端 http://${HOST}:${PORT}/  · 后台 /admin（或 admin.* 域名）· 健康 /health`);
});
