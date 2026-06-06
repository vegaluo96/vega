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
  | 'MESSAGE_RECEIVED'
  | 'MESSAGE_SENT'
  | 'AUTONOMOUS_TICK'
  | 'REFLECTION_TRIGGERED';

// ── payloads（§4）──
export interface InnateSeed {
  temperamentBias: Record<string, number>;
  valueSeed: Record<string, number>;
  somaSetpoints: Record<string, number>;
  somaTau: Record<string, number>;
  vitalityFloor: number;
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
// 模型感知特征（§10 开放岔口，已签署）：模型把消息解析成结构化情感，【冻进事件】。
// 重放只读这份冻结值、不再调模型 → V2 仍确定性；状态仍由确定性推理算（模型不写状态）。
export interface Perception {
  sentiment: number; // -1..1 整体善意↔敌意（预测误差方向）
  warmth: number; // 0..1 温暖/亲近
  threat: number; // 0..1 威胁/伤害
  modelId: string; // 哪个模型感知的（审计）
}
export interface MessageReceivedPayload {
  relationshipId: RelationshipId;
  content: string; // 唯一被冻结的 ground truth；appraisal 全部派生重算
  channel: string;
  perception?: Perception; // 可选：模型感知特征（冻结输入，非派生状态）
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
  MESSAGE_RECEIVED: MessageReceivedPayload;
  MESSAGE_SENT: MessageSentPayload;
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
