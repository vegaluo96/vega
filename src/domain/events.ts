// LifeEvent —— append-only ground truth。规格见 docs/vega-lifeevent-schema.md §3–§4。
// 第 0 步竖切：seq/窗口用 number（spec 为 bigint），eventId 用确定性串（spec 为 ULID），后续可换。

export type LifeId = string;
export type EventId = string;
export type RelationshipId = string;
export type Iso = string; // ISO-8601

export type EventSource = 'external_user' | 'host' | 'autonomous_loop' | 'system';

// 闭集（§4）。增 type = 一次 schema 演进；删 type 永久禁止。
export type EventType =
  | 'LIFE_GENESIS'
  | 'CONNECTION_OPENED'
  | 'CONNECTION_CLOSED'
  | 'STEWARDSHIP_TRANSFERRED'
  | 'RELATIONSHIP_OPENED'
  | 'RELATIONSHIP_ENDED' // 一段关系永远结束（必朽者离去）——锁后加法演进，旧日志天然兼容
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_SENT'
  | 'WORLD_PERCEIVED' // 她感知到一条真实世界信息（新闻/预测市场）——锁后加法演进，旧日志天然兼容
  | 'FEEDBACK_PERCEIVED' // 她感知到【自己某次行动】收到的回应/沉默（心声被点赞评论、reach-out 被回应或石沉）——加法演进，旧日志兼容
  | 'AUTONOMOUS_TICK'
  | 'REFLECTION_TRIGGERED';

// ── payloads（§4）──
export interface InnateSeed {
  temperamentBias: Record<string, number>;
  valueSeed: Record<string, number>;
  somaSetpoints: Record<string, number>;
  somaTau: Record<string, number>;
  vitalityFloor: number;
  circadianOffsetMin?: number; // 她昼夜节律锚定的时区（出生地，分钟东偏 UTC）。出生即冻结、终生不变；缺省=北京 480
}
export interface GenesisPayload {
  innateSeed: InnateSeed;
  reconstructVersionAtBirth: number;
  creator: { relationshipId: RelationshipId; identityRef: string };
}
export interface ConnectionOpenedPayload {
  relationshipId: RelationshipId;
  host: { kind: string; ref: string };
}
export interface ConnectionClosedPayload {
  relationshipId: RelationshipId;
  reason: 'token_detached' | 'host_shutdown';
}
export interface StewardshipTransferredPayload {
  fromRelationshipId: RelationshipId | null;
  toRelationshipId: RelationshipId;
  reason: string;
}
export interface RelationshipOpenedPayload {
  relationshipId: RelationshipId;
  kind: 'human' | 'peer';
  displayRef: string;
}
export interface RelationshipEndedPayload {
  relationshipId: RelationshipId;
  reason: 'death' | 'farewell' | 'lost'; // 死亡 / 永别 / 失联
  note?: string;
}
// 模型感知特征（§10 开放岔口，已签署）：模型把消息解析成结构化情感，【冻进事件】。
// 重放只读这份冻结值、不再调模型 → V2 仍确定性；状态仍由确定性推理算（模型不写状态）。
//
// 【契约①的红线，务必守住】这里只放【刺激固有维度】——消息【本身】客观可读的属性（Scherer 的 Stimulus Evaluation Checks）。
// 模型当"耳朵"听出这些；【绝不】让它评估"这对她意味着什么"（goal-relevance / coping-potential / norm-compatibility
// 那三类【关系性评价】必须由折叠用【她自己的状态】确定性算——见 reconstruct.appraiseMessage）。
// 新增维度全部 optional：旧事件/未配感知时缺失 → 折叠按中性默认处理（与旧轨迹逐位一致、向后兼容）。
export interface Perception {
  // —— 原 3 维 ——
  sentiment: number; // -1..1 整体善意↔敌意（intrinsic pleasantness）
  warmth: number; // 0..1 温暖/亲近（释放的亲和/关切）
  threat: number; // 0..1 威胁/敌意/伤害/否定
  // —— 新增刺激固有维度（更接近"真实环境下的感知"）——
  intensity?: number; // 0..1 情感强度/语气有多用力（"我爱死你了！！"≫"嗯还行"）——Scherer intrinsic intensity
  novelty?: number; // 0..1 话题/内容的新奇·突然（没碰过的事 vs 老生常谈）——Scherer novelty SEC
  certainty?: number; // 0..1 表达清晰度（高=明确；低=模棱/含糊/费解 → 不安/困惑）
  blame?: number; // -1..1 归因方向（causal attribution）：-1 对方在自责/道歉("我错了") ↔ +1 把责任推到她身上("都怪你")
  urgency?: number; // 0..1 紧迫/求助/需要立刻回应（demand character）
  playful?: number; // 0..1 玩笑/调侃成分（高 → 别把逗当攻击）
  topics?: string[]; // 这句话在聊的主题（0~3 个，如「音乐」「工作」）——喂兴趣/世界观："你常聊什么，她就对什么上心"（因你而变）
  modelId: string; // 哪个模型感知的（审计）
}
export interface MessageReceivedPayload {
  relationshipId: RelationshipId;
  content: string; // 唯一被冻结的 ground truth；appraisal 全部派生重算
  channel: string;
  perception?: Perception; // 可选：模型感知特征（冻结输入，非派生状态）
}
// 世界感知特征（采集时算好、冻进事件 → 重放只读、不连网，V2 仍确定性）。
export interface WorldPerception { valence: number; arousal: number; relevance: number }
export interface WorldPerceivedPayload {
  source: string; // 源（feed 主机名 / 'polymarket'）
  worldKind: 'news' | 'market';
  title: string; // 冻结的 ground truth
  summary: string;
  url: string;
  topics: string[];
  perception?: WorldPerception; // 缺失则 reconstruct 用确定性词表兜底（仍不连网）
}
// 行动反馈（§"行动→世界反馈→改变她"的闭环）：她某次行动收到的回应/沉默，采集时算好 valence、冻进事件 → 重放确定性。
// 脱敏：公共心声的反馈只记【聚合 + fromKind】，不记是哪个具体用户（防跨用户推断）；reach-out 沉默按其关系记。
export interface FeedbackPerceivedPayload {
  actionKind: 'muse' | 'reach_out' | 'greet'; // 她哪类行动收到了反馈（greet=主动打招呼新人；加法演进，旧日志兼容，折叠按 actionKind 通用聚合）
  responseKind: 'reaction' | 'comment' | 'reply' | 'silence';
  valence: number; // [-1,1] 采集时算好（被回应=正、长久沉默=负）
  fromKind: 'human' | 'peer';
  count?: number; // 多少回应（如 3 人点赞）
}
export interface MessageSentPayload {
  relationshipId: RelationshipId;
  utterance: string; // 模型产物（对外措辞）
  modelId: string;
  criticVerdict: 'accepted' | 'fallback';
  affectsDerivedState: false; // 不变量：永远 false（契约①）
  unprompted?: boolean; // 她主动留言（无人发起），而非回应
}
export type IntentKind = 'reach_out' | 'reflect' | 'rest' | 'set_willing_to_wake';
export interface FormedIntent {
  kind: IntentKind;
  relationshipId?: RelationshipId;
  params?: Record<string, unknown>;
  gateDecision: 'internal_only' | 'surface';
}
export interface AutonomousTickPayload {
  tickReason: 'scheduled' | 'idle_threshold';
  selectedMemoryIds: string[]; // 冻结的随机决议：本次重放/巩固选中的记忆
  wanderingTargets: { relationshipId?: RelationshipId; topicSeed: string }[];
  formedIntents: FormedIntent[];
}
export interface ReflectionTriggeredPayload {
  scope: 'recent' | 'relationship' | 'renarrate';
  windowFromSeq: number;
  windowToSeq: number;
  relationshipId?: RelationshipId;
}

export interface PayloadMap {
  LIFE_GENESIS: GenesisPayload;
  CONNECTION_OPENED: ConnectionOpenedPayload;
  CONNECTION_CLOSED: ConnectionClosedPayload;
  STEWARDSHIP_TRANSFERRED: StewardshipTransferredPayload;
  RELATIONSHIP_OPENED: RelationshipOpenedPayload;
  RELATIONSHIP_ENDED: RelationshipEndedPayload;
  MESSAGE_RECEIVED: MessageReceivedPayload;
  MESSAGE_SENT: MessageSentPayload;
  WORLD_PERCEIVED: WorldPerceivedPayload;
  FEEDBACK_PERCEIVED: FeedbackPerceivedPayload;
  AUTONOMOUS_TICK: AutonomousTickPayload;
  REFLECTION_TRIGGERED: ReflectionTriggeredPayload;
}
export type PayloadOf<T extends EventType> = PayloadMap[T];

// 信封（§3）：所有事件共有。
export interface LifeEvent<T extends EventType = EventType> {
  lifeId: LifeId;
  seq: number; // per-life 单调、无间隙；权威重放顺序（genesis = 0）
  eventId: EventId;
  type: T;
  schemaVersion: number;
  payload: PayloadOf<T>;
  occurredAt: Iso; // 驱动动力学；沿 seq 单调不减
  recordedAt: Iso; // 仅审计；永不驱动动力学、永不被 reconstruct 消费
  contentHash: string;
  prevHash: string | null; // per-life 哈希链；genesis 为 null
  source: EventSource;
  relationshipId?: RelationshipId;
  turnId?: string;
  causationId?: EventId;
}

// draft = 追加者提供的"有意义内容"，其余由 event store 填充。
export interface EventDraft<T extends EventType = EventType> {
  type: T;
  payload: PayloadOf<T>;
  occurredAt: Iso;
  source: EventSource;
  schemaVersion?: number;
  relationshipId?: RelationshipId;
  turnId?: string;
  causationId?: EventId;
}
