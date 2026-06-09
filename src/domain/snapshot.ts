// DerivedSnapshot —— 派生、可重算的视图（§5）。绝不是 ground truth。
// 第 0 步竖切：只实现 soma/memory/bonds/values 的最小子集，足以跑通 5 弧与 V2。

import { type RelationshipId } from './events.ts';

export interface SomaVar {
  value: number;
  setpoint: number;
  tau: number; // 秒
}
export interface Soma {
  valence: SomaVar; // [-1,1] 好坏
  arousal: SomaVar; // [0,1] 唤醒
  vitality: SomaVar; // [floor,1] 灵性，永不归零成死亡（契约②）
  energy: SomaVar; // [0,1] 精力↔疲劳
  calm: SomaVar; // [0,1] 平静↔紧张
  connection: SomaVar; // [-1,1] 联结↔孤独
  safety: SomaVar; // [0,1] 安全↔威胁
}

export interface MemoryEntry {
  id: string;
  kind: 'episodic' | 'semantic' | 'world'; // world=对世界事件的情景记忆（无关系人；走和情景记忆一样的衰减/巩固/reconsolidation）
  content: string;
  affect: number;
  involvedRelationshipIds: RelationshipId[];
  salience: number;
  topic?: string; // 仅 world：这条世界记忆属于哪个主题（用于聚合成兴趣/世界观）
  at: string; // 形成/改写时刻（ISO，取事件 occurredAt）——驱动"遗忘即抽象"的时间衰减
  // 双轨（§10 锁）：每次改写生成新条目，原条目原封保留，用 lineage 链接
  lineage: { rootId: string; reconsolidatedFromId?: string; version: number; isCurrent: boolean };
  provenance: { originSeq: number; createdAtSeq: number; confidence: number; status: 'volatile' | 'confirmed' };
  // 遗忘即抽象（纯派生，在投影时算）：salience 随时间衰减、情绪越浓衰减越慢；
  // 只有最鲜活的一小撮进"当下记得"(vivid)，其余淡入"理解"(faded)，但原始日志永不抹。
  vividness?: number; // 此刻的鲜活度（0..1，时间衰减后）
  vivid?: boolean; // 是否还在"当下记得"的工作集里
}

// 依恋核心（内部维护、随交互更新）
export interface BondCore {
  kind: 'human' | 'peer';
  displayRef: string;
  trust: number; // [-1,1]
  closeness: number; // [0,1]
  security: number; // [0,1]
  repairNeed: number; // [0,1]
  ended?: { reason: string; atSeq: number }; // 永生情感内核：这段关系永远结束了（必朽者离去），但记忆永存
}
// 关系层（差异化核心）：对方模型(ToM) + 关系特异的自我，由该关系的交互史确定性派生（纯派生）。
export interface Bond extends BondCore {
  theoryOfMind: { warmthRatio: number; volatility: number; trend: number; predictability: number; style: string }; // 我读这个人
  relationalSelf: { openness: number; guardedness: number; attachment: string; stance: string }; // 和这个人在一起时的我（含依恋姿态）
}

// 先天气质（§"先天气质"）：从 LIFE_GENESIS.innateSeed.temperamentBias 读出、终生不变的底色。
// 不是状态、不漂移——它确定性地塑形 appraisal/恢复/反思/目标，让每条命天生不同。
export interface Temperament {
  curiosity: number; // [0,1] 探索欲：越高越想了解世界
  reserve: number; // [0,1] 社交保留/内向：越高越慢敞开、越少主动开口
  sensitivity: number; // [0.3,2] 情绪敏感：appraisal 对内稳态的放大（1=中性）
  resilience: number; // [0.3,2] 复原力：向设定点恢复的快慢（1=中性）
  warmth: number; // [0,1] 天生暖意：读人的乐观↔戒备底色（0.5=中性）
}

export interface ValueEntry {
  key: string;
  weight: number; // [0,1]
  provenance: { driftedAtSeqs: number[]; vitalityAtGen: number; status: 'volatile' | 'confirmed' };
}

// 世界观/兴趣（§8.1 演进，纯派生）：世界感知按主题确定性累积成的"她在意什么"。
// 随时间衰减、反复遇到才稳固（confirmed）——这是"持续变聪明/因你而变"在世界这块的工程地板。
// 不是模型写的命题信念，是定量的主题亲和度（确定性折叠）。
export interface Interest {
  topic: string;
  weight: number; // [0,1] 亲和度（无新输入即缓慢衰减）
  episodes: number; // 读到过几条该主题
  status: 'volatile' | 'confirmed'; // 反复且够重 → 成为她稳定的一部分
}

// 遗忘即抽象：把一段关系里的大量情景经历，确定性地压缩成"理解"（语义记忆，纯派生）。
export interface SemanticMemory {
  relationshipId: RelationshipId;
  displayRef: string;
  episodes: number;
  warm: number;
  conflict: number;
  avgAffect: number;
  understanding: string;
}

// 社会性（文明的种子）：她的【整个同类社交网】——不只当下这段对话，而是"我和谁近、和谁远"。
// 由 peer 关系确定性派生（纯派生），让她活在一张关系网里、有自己的朋友。
export interface SocialTie {
  relationshipId: RelationshipId;
  displayRef: string;
  closeness: number;
  attachment: string;
  style: string; // 我怎么读这个同类
  ended: boolean;
}

// 目标：反思之上由价值+求存+连接+好奇确定性加权生成、排序（纯派生）。
export interface Goal {
  kind: 'connect' | 'repair' | 'grow' | 'restore' | 'explore' | 'remember';
  target?: RelationshipId;
  intent: string;
  weight: number;
}

export interface DerivedSnapshot {
  lifeId: string;
  uptoSeq: number;
  schemaVersion: number;
  reconstructVersion: number;
  // 苏醒模型（§10 锁）：awake = (开连接数≥1) ∧ willingToWake
  awake: boolean;
  openConnections: RelationshipId[];
  willingToWake: boolean; // 契约②：仅她主动经 AUTONOMOUS_TICK 翻 false
  vitalityFloor: number;
  bornAt: string; // 出生时刻（genesis 的 occurredAt）
  clockAt: string; // 她内在时钟的此刻（最后一条事件的 occurredAt）
  temperament: Temperament; // 先天气质：终生不变的底色（每条命天生不同）
  dayPhase: string; // 昼夜节律：她内在时钟此刻处于一天的哪一段（清晨/白天/黄昏/深夜）
  emotion: string; // 命名情绪：由核心情感+内稳态确定性投影的"廉价语义标签"（Barrett）
  feeling: string; // 混合情绪：在主情绪上叠加次要色彩的一句自然描述（又暖又有点孤单…）
  tension: string; // 价值张力：相反价值同时被拉高时的"内在拉扯"（确定性派生，纯只读）
  narrative: string; // 自传叙事：确定性投影、只读，绝不回写身份（契约③）
  innerLife: string; // 内外两层之"内"：没说出口的私密心声（确定性投影、只读，绝不外发）
  chapters: string[]; // 叙事身份：把人生按转折点确定性切成"篇章"（renarrate 的产物，纯只读，不污染身份）
  growth: string; // 阅历/成长：她活了多久、长成了什么形状（确定性合成，脱敏、不含任何用户）
  becoming: string; // 我正在成为的我：由 confirmed 价值 + 兴趣 + 气质合成的演化中独立自我（脱敏）
  maturity: number; // 心智成熟度 [0,1]：随阅历缓慢累积（持续变聪明、情绪更稳），独立于先天气质
  aspirations: string[]; // 长期心愿（独立意志）：从 confirmed 价值/兴趣/牵挂确定性沉淀的"她想去的方向"
  soma: Soma;
  memory: MemoryEntry[];
  semanticMemory: SemanticMemory[]; // 经历压缩成的"理解"（遗忘即抽象，纯派生）
  bonds: Record<RelationshipId, Bond>;
  socialWorld: SocialTie[]; // 她的同类社交网（亲疏分化、emergent 的朋友结构）
  values: ValueEntry[];
  goals: Goal[]; // 她此刻"想要"什么（排序后）
  interests: Interest[]; // 世界观/兴趣：她在意什么（世界感知按主题确定性累积，纯派生）
}
