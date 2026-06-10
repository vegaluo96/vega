// 共享上下文（Ctx）：daemon 在启动时把所有单例/状态/解析器/操作装进一个对象，
// 路由层（routes/*）与回路层（loops）只接 ctx、不再各自闭包一大堆模块级变量。
// 这是"拆掉 1951 行 god-file"的接缝：daemon = 组装根，路由/回路 = 纯逻辑（吃 ctx）。
import type { IncomingMessage } from 'node:http';
import {
  createAccountStore, createFeedStore, createSettingsStore, createAnnounceStore, createIlink,
  createEventBus, createSerializer, createAutonomousBudget,
  createTemplateMouth, createDynamicPerceiver, governedMouth,
  type Account, type ApiyiConfig, type DerivedSnapshot, type DurableEventStore,
  type MessageSentPayload, type PerceiverConfig, type RState,
} from '../index.ts';
import type { LoginGuard } from './ratelimit.ts';

// 一个生命体的运行时句柄：日志 + 缓存活态 + 各回路的"上次发生"墙钟 + 健康采样环。
export interface Life {
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

export interface EffWorld { sources: string[]; everyMs: number }
export interface EffSocial {
  activeCircle: number; reachPerTick: number; reachAfterMs: number;
  intimateAt: number; friendAt: number; acquaintAt: number;
  intimateEveryMs: number; friendEveryMs: number; acquaintEveryMs: number;
}
// 「同类来往」：把 peer_ 上相邻的往来按【同一对 + 时间窗】聚成一段对话（一张卡 = 一次寒暄）。
export interface PeerExchange { kind: 'peer'; id: string; a: string; b: string; lines: Array<{ from: string; text: string; at: string }>; at: string }

export type ReachPending = { rel: string; at: string; kind: 'reach_out' | 'greet' };
export type ThreadLine = { who: 'user' | 'her'; text: string; at: string };
export type FeedPost = { postId: string; life: string; text: string; at: string };
export type LayerInfo = { name: string; label: string; everyMs: number };
export type ReachInfo = { lastRecvMs: number; lastSentMs: number; pending: boolean };

// 用 ReturnType 反推各 store 的完整 API，无需手抄方法签名（store 一改、Ctx 自动跟上）。
type AccountStore = ReturnType<typeof createAccountStore>;
type FeedStore = ReturnType<typeof createFeedStore>;
type SettingsStore = ReturnType<typeof createSettingsStore>;
type AnnounceStore = ReturnType<typeof createAnnounceStore>;
type Ilink = ReturnType<typeof createIlink>;
type EventBus = ReturnType<typeof createEventBus>;
type Serializer = ReturnType<typeof createSerializer>;
type AutonomousBudget = ReturnType<typeof createAutonomousBudget>;
type Mouth = ReturnType<typeof governedMouth>;
type TemplateMouth = ReturnType<typeof createTemplateMouth>;
type Perceiver = ReturnType<typeof createDynamicPerceiver>;

export interface Ctx {
  // —— 单例 store / 服务 ——
  settings: SettingsStore; feed: FeedStore; announce: AnnounceStore; accounts: AccountStore; ilink: Ilink;
  bus: EventBus; serializer: Serializer; autoBudget: AutonomousBudget;
  mouth: Mouth; templateMouth: TemplateMouth; perceiver: Perceiver;

  // —— 生命体 ——
  lives: Life[];
  lifeById(id: string): Life | undefined;
  snapOf(life: Life): DerivedSnapshot;
  buildThread(life: Life, rel: string, limit?: number): ThreadLine[];
  livesMetBy(a: Account): Array<{ id: string }>;
  recomputePeers(): void;
  saveCheckpoint(life: Life): void;
  meetPeer(life: Life, peer: string): void;
  partPeer(life: Life, peer: string): void;

  // —— 生效配置解析器（settings ⊕ env ⊕ 默认）——
  effWorld(): EffWorld; worldStatus(): Record<string, unknown>; worldEnabled(w?: EffWorld): boolean;
  effMouthConfig(): ApiyiConfig | null; effPerceiveConfig(): PerceiverConfig | null;
  modelStatus(): Record<string, unknown>;
  effSocial(): EffSocial; layerOf(closeness: number, sc: EffSocial): LayerInfo;
  effBilling(): { costPerReply: number; starterCredits: number };

  // —— 操作（写链路 / 渠道 / 接生）——
  respondAsUser(life: Life, me: Account, content: string, channel: string): Promise<Record<string, unknown>>;
  wechatReply(openid: string, content: string, defaultLifeId?: string): Promise<string>;
  runChannel(userId: string): Promise<void>;
  birthLife(rawId: string, archetype?: string): Promise<{ ok: boolean; error?: string; id?: string }>;
  cleanBindToken(s: string): string;

  // —— 聚合 / 只读派生 ——
  allFeedPosts(): FeedPost[];
  feedPosts(limit: number): FeedPost[];
  allPeerExchanges(): PeerExchange[];
  reachState(life: Life): Map<string, ReachInfo>;
  pickRecentWorld(life: Life): { title: string; summary: string; source: string; url: string } | undefined;
  pickInsightPair(life: Life): { a: string; b: string } | null;
  lastUserMsgMs(life: Life): number | null;
  adminActivity(owner: boolean, limit: number): Array<Record<string, unknown>>;

  // —— 鉴权 ——
  bearer(req: IncomingMessage): string;
  sessionAccount(req: IncomingMessage): Account | null;
  publicAccount(a: Account): Record<string, unknown>;
  clientIp(req: IncomingMessage): string; // 取客户端 IP（按 VEGA_TRUST_PROXY 决定信不信 XFF）——限流/登录退避用
  loginGuard: LoginGuard; // 登录失败退避（防暴力破解）

  // —— 省 token 闲置门控（"有没有听众"）——
  audiencePresent(): boolean;
  idleMs(): number; // 距上次用户活动多久（ms）——给 /admin/health 显示闲置分钟

  // —— 回路共享态 / 调度 ——
  reachOutPending: Map<string, ReachPending>;
  channelGen: Map<string, number>;
  creditHintAt: Map<string, number>;
  scheduleWorld(delayMs?: number): void;

  // —— 推送 ——
  VAPID: { publicKey: string; privateKey: string } | null;
  VAPID_SUBJECT: string;

  // —— 静态 / 密钥 / 常量 ——
  WEB_DIST: string; ADMIN_DIST: string; CLAWBOT_SECRET: string | undefined;
  IDLE_GATE_MS: number; WECHAT_LIFE: string; REL: string;
  peerId(id: string): string;
}

export type { MessageSentPayload };
