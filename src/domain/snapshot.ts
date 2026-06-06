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
  kind: 'episodic' | 'semantic';
  content: string;
  affect: number;
  involvedRelationshipIds: RelationshipId[];
  salience: number;
  // 双轨（§10 锁）：每次改写生成新条目，原条目原封保留，用 lineage 链接
  lineage: { rootId: string; reconsolidatedFromId?: string; version: number; isCurrent: boolean };
  provenance: { originSeq: number; createdAtSeq: number; confidence: number; status: 'volatile' | 'confirmed' };
}

export interface Bond {
  kind: 'human' | 'peer';
  displayRef: string;
  trust: number; // [-1,1]
  closeness: number; // [0,1]
  security: number; // [0,1]
  repairNeed: number; // [0,1]
}

export interface ValueEntry {
  key: string;
  weight: number; // [0,1]
  provenance: { driftedAtSeqs: number[]; vitalityAtGen: number; status: 'volatile' | 'confirmed' };
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
  emotion: string; // 命名情绪：由核心情感+内稳态确定性投影的"廉价语义标签"（Barrett）
  narrative: string; // 自传叙事：确定性投影、只读，绝不回写身份（契约③）
  soma: Soma;
  memory: MemoryEntry[];
  semanticMemory: SemanticMemory[]; // 经历压缩成的"理解"（遗忘即抽象，纯派生）
  bonds: Record<RelationshipId, Bond>;
  values: ValueEntry[];
}
